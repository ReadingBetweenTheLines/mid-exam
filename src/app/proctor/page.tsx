"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ExamSession, TelemetryLog } from "@/lib/types";
import { EXAM_QUESTIONS } from "@/lib/questions";
import { 
  Users, 
  ShieldAlert, 
  Unlock, 
  RefreshCw, 
  Filter, 
  Search, 
  AlertTriangle, 
  Download, 
  Activity, 
  LogOut, 
  KeyRound, 
  FileCode, 
  Clock 
} from "lucide-react";

interface SubmissionItem {
  id?: string;
  question_id: string;
  code: string;
  dwell_time_seconds?: number;
  created_at?: string;
}

export default function ProctorDashboard() {
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passcodeInput, setPasscodeInput] = useState<string>("");
  const [passcodeError, setPasscodeError] = useState<string | null>(null);

  // Dashboard states
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryLog[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [activeSessionDetail, setActiveSessionDetail] = useState<ExamSession | null>(null);

  // Submissions inspect modal state
  const [inspectSubmissions, setInspectSubmissions] = useState<SubmissionItem[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState<boolean>(false);

  // Check existing session authorization on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const auth = sessionStorage.getItem("proctor_authorized");
      if (auth === "true") {
        setIsAuthenticated(true);
      }
    }
  }, []);

  const handleVerifyPasscode = (e: React.FormEvent) => {
    e.preventDefault();
    const INSTRUCTOR_SECRET = "proctor2026";

    if (passcodeInput.trim() === INSTRUCTOR_SECRET) {
      sessionStorage.setItem("proctor_authorized", "true");
      setIsAuthenticated(true);
      setPasscodeError(null);
    } else {
      setPasscodeError("Passcode salah. Akses ditolak.");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("proctor_authorized");
    setIsAuthenticated(false);
    setPasscodeInput("");
  };

  // Manual sync triggered by button click
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const { data: sessionRows } = await supabase
        .from("exam_sessions")
        .select("*")
        .order("created_at", { ascending: false });

      if (sessionRows) setSessions(sessionRows);

      const { data: telemetryRows } = await supabase
        .from("telemetry_logs")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(40);

      if (telemetryRows) setTelemetry(telemetryRows);
    } catch (err) {
      console.error("Proctor fetch failed:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Mount effect: load initial state & wire real-time channels once authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    let isMounted = true;

    const loadInitialData = async () => {
      try {
        const [sessionRes, telemetryRes] = await Promise.all([
          supabase.from("exam_sessions").select("*").order("created_at", { ascending: false }),
          supabase.from("telemetry_logs").select("*").order("occurred_at", { ascending: false }).limit(40)
        ]);

        if (isMounted) {
          if (sessionRes.data) setSessions(sessionRes.data);
          if (telemetryRes.data) setTelemetry(telemetryRes.data);
        }
      } catch (err) {
        console.error("Initial load failed:", err);
      }
    };

    void loadInitialData();

    const sessionChannel = supabase
      .channel("proctor_exam_sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exam_sessions" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setSessions((prev) => [payload.new as ExamSession, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setSessions((prev) =>
              prev.map((s) => (s.id === payload.new.id ? (payload.new as ExamSession) : s))
            );
            setActiveSessionDetail((current) =>
              current && current.id === payload.new.id ? (payload.new as ExamSession) : current
            );
          } else if (payload.eventType === "DELETE") {
            setSessions((prev) => prev.filter((s) => s.id === payload.old.id));
          }
        }
      )
      .subscribe();

    const telemetryChannel = supabase
      .channel("proctor_telemetry_logs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "telemetry_logs" },
        (payload) => {
          setTelemetry((prev) => [payload.new as TelemetryLog, ...prev.slice(0, 39)]);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(telemetryChannel);
    };
  }, [isAuthenticated]);

  const handleUnlock = async (sessionId: string) => {
    try {
      await supabase
        .from("exam_sessions")
        .update({
          status: "in_progress",
          lock_reason: null,
        })
        .eq("id", sessionId);

      await supabase.from("telemetry_logs").insert({
        session_id: sessionId,
        category: "network_hardware",
        event_type: "OPERATOR_OVERRIDE_UNLOCK",
        details: "Proctor manually cleared security lock.",
        occurred_at: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Gagal membuka kunci sesi: ${msg}`);
    }
  };

  // Open inspection modal and retrieve submitted answers from both potential tables
  const handleOpenInspect = async (studentSession: ExamSession) => {
    setActiveSessionDetail(studentSession);
    setIsLoadingSubmissions(true);
    setInspectSubmissions([]);

    try {
      // 1. Try student_submissions table first
      const { data: studentData, error: err1 } = await supabase
        .from("student_submissions")
        .select("id, question_id, code, dwell_time_seconds, created_at")
        .eq("session_id", studentSession.id)
        .order("created_at", { ascending: true });

      if (!err1 && studentData && studentData.length > 0) {
        setInspectSubmissions(studentData);
        setIsLoadingSubmissions(false);
        return;
      }

      // 2. Fallback to submissions table
      const { data: legacyData, error: err2 } = await supabase
        .from("submissions")
        .select("id, question_id, submitted_code, dwell_time_seconds, created_at")
        .eq("session_id", studentSession.id)
        .order("created_at", { ascending: true });

      if (!err2 && legacyData && legacyData.length > 0) {
        const mapped = legacyData.map((row: any) => ({
          id: row.id,
          question_id: row.question_id,
          code: row.submitted_code || "",
          dwell_time_seconds: row.dwell_time_seconds,
          created_at: row.created_at,
        }));
        setInspectSubmissions(mapped);
      }
    } catch (err) {
      console.error("Gagal memuat jawaban siswa:", err);
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  const classList = Array.from(new Set(sessions.map((s) => s.class_code))).filter(Boolean);

  const filteredSessions = sessions.filter((s) => {
    const matchesClass = selectedClass === "ALL" || s.class_code === selectedClass;
    const matchesQuery =
      s.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.student_id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesClass && matchesQuery;
  });

  const handleExportCSV = () => {
    if (sessions.length === 0) {
      alert("Belum ada data ujian siswa untuk diekspor.");
      return;
    }

    const headers = [
      "Student Name",
      "Student ID",
      "Class Code",
      "Status",
      "Current Question",
      "Total Score (pts)",
      "Cheat Flags Count",
      "Network Drops Count",
      "Session Created At",
      "Last Heartbeat",
    ];

    const rows = filteredSessions.map((s) => {
      const studentLogs = telemetry.filter((t) => t.session_id === s.id);
      const cheatCount = studentLogs.filter((t) => t.category === "cheat_suspect").length;
      const networkCount = studentLogs.filter((t) => t.category === "network_hardware").length;

      return [
        `"${s.student_name.replace(/"/g, '""')}"`,
        `"${s.student_id}"`,
        `"${s.class_code}"`,
        `"${s.status}"`,
        `"Question ${(s.current_question_index ?? 0) + 1} of ${EXAM_QUESTIONS.length}"`,
        s.total_score ?? 0,
        cheatCount,
        networkCount,
        `"${s.created_at || ""}"`,
        `"${s.last_heartbeat || ""}"`,
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    link.href = url;
    link.download = `exam-report-${selectedClass}-${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const lockedCount = sessions.filter((s) => s.status === "locked").length;
  const activeCount = sessions.filter((s) => s.status === "in_progress").length;
  const submittedCount = sessions.filter((s) => s.status === "submitted").length;

  // PASSCODE CHALLENGE MODAL
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-5 text-center">
          <div className="w-12 h-12 rounded-xl bg-red-950/60 border border-red-800/80 flex items-center justify-center mx-auto text-red-400">
            <KeyRound className="w-6 h-6" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-white tracking-wide">
              RESTRICTED OPERATOR CONSOLE
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Hanya untuk pengawas dan guru terotorisasi.
            </p>
          </div>

          {passcodeError && (
            <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center justify-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span>{passcodeError}</span>
            </div>
          )}

          <form onSubmit={handleVerifyPasscode} className="space-y-4 text-left">
            <div>
              <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1.5">
                Passcode Guru Pengawas
              </label>
              <input
                type="password"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-red-500 font-mono tracking-widest text-center"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-mono text-xs font-semibold rounded-lg transition shadow-lg shadow-red-950/40"
            >
              Verifikasi & Masuk Konsol
            </button>
          </form>
        </div>
      </div>
    );
  }

  // MAIN OPERATOR DASHBOARD
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      {/* Header Bar */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-mono text-sm font-bold tracking-wider text-slate-100">
              OPERATOR COMMAND CONSOLE
            </h1>
            <p className="text-[10px] font-mono text-slate-400">
              REAL-TIME INTEGRITY & PSEUDOCODE AUDIT
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-medium flex items-center gap-2 transition active:scale-95 shadow-md shadow-emerald-950/30"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-mono text-xs flex items-center gap-2 transition active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-blue-400" : ""}`} />
            <span>{isSyncing ? "Syncing..." : "Sync"}</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-red-950/40 hover:text-red-400 border border-slate-700 text-slate-400 font-mono text-xs flex items-center gap-1.5 transition active:scale-95"
            title="Kunci Konsol Pengawas"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Kunci</span>
          </button>
        </div>
      </header>

      {/* Top Stats Bar */}
      <div className="bg-slate-900/40 border-b border-slate-800 px-6 py-3.5 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
          <span className="text-slate-400">TOTAL SISWA</span>
          <span className="text-base font-bold text-white">{sessions.length}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
          <span className="text-emerald-400">SEDANG MENGERJAKAN</span>
          <span className="text-base font-bold text-emerald-400">{activeCount}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
          <span className="text-red-400">TERKUNCI / PELANGGARAN</span>
          <span className="text-base font-bold text-red-400">{lockedCount}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
          <span className="text-blue-400">SELESAI KUMPUL</span>
          <span className="text-base font-bold text-blue-400">{submittedCount}</span>
        </div>
      </div>

      {/* Main Dashboard Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Candidates Square Grid */}
        <section className="flex-1 flex flex-col border-r border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nama atau ID siswa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">SEMUA KELAS</option>
                {classList.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cards Grid: Square layout via aspect-square */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
            {filteredSessions.length === 0 ? (
              <div className="col-span-full h-64 flex flex-col items-center justify-center text-slate-500 font-mono text-xs">
                <Users className="w-8 h-8 mb-2 opacity-40" />
                <span>Belum ada sesi siswa yang terhubung.</span>
              </div>
            ) : (
              filteredSessions.map((s) => {
                const isStudentLocked = s.status === "locked";
                const isSubmitted = s.status === "submitted";

                return (
                  <div
                    key={s.id}
                    className={`aspect-square rounded-xl border p-3.5 flex flex-col justify-between transition-all select-none ${
                      isStudentLocked
                        ? "bg-red-950/20 border-red-800/80 shadow-lg shadow-red-950/30 ring-1 ring-red-500/40"
                        : isSubmitted
                        ? "bg-slate-900/40 border-slate-800/80 opacity-75"
                        : "bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:shadow-md"
                    }`}
                  >
                    {/* Top Row: Name, Class, Status Badge */}
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-1">
                        <h3 
                          className="font-bold text-xs text-slate-100 truncate flex-1 leading-snug" 
                          title={s.student_name}
                        >
                          {s.student_name}
                        </h3>
                        <span
                          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                            isStudentLocked
                              ? "bg-red-950 text-red-400 border-red-800 animate-pulse"
                              : isSubmitted
                              ? "bg-blue-950 text-blue-400 border-blue-800"
                              : "bg-emerald-950 text-emerald-400 border-emerald-800"
                          }`}
                        >
                          {s.status === "in_progress" ? "AKTIF" : s.status}
                        </span>
                      </div>

                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        {s.class_code} · {s.student_id}
                      </div>
                    </div>

                    {/* Middle: Compact Progress Indicator & Reason */}
                    <div className="my-auto py-1 space-y-1.5">
                      <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-400 text-[10px]">PROGRES</span>
                        <span className="font-semibold text-slate-200">
                          #{(s.current_question_index ?? 0) + 1} / {EXAM_QUESTIONS.length}
                        </span>
                      </div>

                      {isStudentLocked && (
                        <div className="bg-red-950/40 border border-red-900/60 p-1.5 rounded text-[10px] text-red-300 leading-tight truncate flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                          <span className="truncate">{s.lock_reason || "Keluar layar"}</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom: Action Buttons */}
                    <div className="pt-2 border-t border-slate-800/60 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenInspect(s)}
                        className="flex-1 py-1.5 px-2 bg-slate-800/80 hover:bg-slate-800 text-blue-400 hover:text-blue-300 rounded text-[11px] font-mono font-medium transition text-center truncate flex items-center justify-center gap-1"
                        title="Lihat Jawaban & Log"
                      >
                        <FileCode className="w-3 h-3 shrink-0" />
                        <span>Jawaban</span>
                      </button>

                      {isStudentLocked && (
                        <button
                          type="button"
                          onClick={() => handleUnlock(s.id)}
                          className="py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-mono text-[11px] rounded transition shadow flex items-center justify-center"
                          title="Buka Kunci Sesi"
                        >
                          <Unlock className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Live Audit Stream */}
        <section className="w-72 lg:w-80 flex flex-col bg-slate-900/30 overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <h2 className="font-mono text-xs font-bold tracking-wider text-slate-200">
                AUDIT TELEMETRI
              </h2>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {telemetry.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-slate-600 font-mono text-xs">
                Menunggu aktivitas klien...
              </div>
            ) : (
              telemetry.map((t) => {
                const isCheat = t.category === "cheat_suspect";
                return (
                  <div
                    key={t.id}
                    className={`p-2 rounded-lg border text-xs font-mono transition ${
                      isCheat
                        ? "bg-red-950/20 border-red-900/60 text-red-200"
                        : "bg-slate-900/80 border-slate-800 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                      <span className="font-bold text-slate-400">{t.event_type}</span>
                      <span>{new Date(t.occurred_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-[11px] leading-tight break-words">{t.details}</p>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Inspect Modal with Live Answers */}
      {activeSessionDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-2xl w-full max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col space-y-4 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div>
                <h3 className="text-base font-bold text-white">
                  {activeSessionDetail.student_name}
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  ID: {activeSessionDetail.student_id} · Kelas: {activeSessionDetail.class_code}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveSessionDetail(null)}
                className="text-slate-400 hover:text-white font-mono text-xs px-2.5 py-1 rounded bg-slate-800"
              >
                ✕ Tutup
              </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs font-mono shrink-0">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">STATUS SESI</span>
                <span className={`font-bold uppercase ${activeSessionDetail.status === "locked" ? "text-red-400" : activeSessionDetail.status === "submitted" ? "text-blue-400" : "text-emerald-400"}`}>
                  {activeSessionDetail.status}
                </span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">PROGRES SOAL</span>
                <span className="text-slate-200 font-bold">
                  {(activeSessionDetail.current_question_index ?? 0) + 1} dari {EXAM_QUESTIONS.length} Selesai
                </span>
              </div>
            </div>

            {activeSessionDetail.status === "locked" && (
              <div className="p-3 bg-red-950/40 border border-red-800 rounded-lg text-xs text-red-300 shrink-0">
                <strong>Pelanggaran Terdeteksi:</strong>
                <p className="mt-0.5">{activeSessionDetail.lock_reason}</p>
              </div>
            )}

            {/* Answers Section */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80 text-xs font-mono text-slate-400">
                <span className="uppercase tracking-wider font-semibold flex items-center gap-1.5 text-slate-300">
                  <FileCode className="w-3.5 h-3.5 text-blue-400" />
                  Jawaban Pseudocode Terkumpul:
                </span>
                <span className="text-[11px] text-slate-500">
                  {inspectSubmissions.length} Soal Tersimpan
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {isLoadingSubmissions ? (
                  <div className="h-40 flex items-center justify-center text-xs font-mono text-slate-500 gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                    <span>Mengambil jawaban dari database...</span>
                  </div>
                ) : inspectSubmissions.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-xs font-mono text-slate-500">
                    Siswa belum menekan tombol submit pada soal manapun.
                  </div>
                ) : (
                  inspectSubmissions.map((sub, idx) => {
                    const matchedQuestion = EXAM_QUESTIONS.find((q) => q.id === sub.question_id);
                    return (
                      <div
                        key={sub.id || idx}
                        className="rounded-xl bg-slate-950 border border-slate-800/80 p-3.5 font-mono text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span className="font-semibold text-blue-400">
                            {matchedQuestion ? matchedQuestion.title : `Soal ID: ${sub.question_id}`}
                          </span>
                          {sub.dwell_time_seconds !== undefined && (
                            <span className="flex items-center gap-1 text-slate-500 text-[10px]">
                              <Clock className="w-3 h-3" />
                              {sub.dwell_time_seconds}s pengerjaan
                            </span>
                          )}
                        </div>

                        <pre className="bg-[#18181b] border border-slate-800 p-3 rounded-lg text-slate-200 text-xs whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto selection:bg-blue-600/40">
                          {sub.code.trim() ? sub.code : "(Jawaban dikirim kosong)"}
                        </pre>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2 shrink-0">
              {activeSessionDetail.status === "locked" && (
                <button
                  type="button"
                  onClick={() => {
                    void handleUnlock(activeSessionDetail.id);
                    setActiveSessionDetail(null);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs rounded-lg transition flex items-center gap-1.5 shadow"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Buka Kunci Sesi</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveSessionDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs rounded-lg transition"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}