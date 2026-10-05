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
  Activity
} from "lucide-react";

export default function ProctorDashboard() {
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryLog[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [activeSessionDetail, setActiveSessionDetail] = useState<ExamSession | null>(null);

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

  // Mount effect: load initial state & wire real-time channels
  useEffect(() => {
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
  }, []);

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
      alert(`Failed to unlock session: ${msg}`);
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
      alert("No student session records available to export.");
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
              REAL-TIME INTEGRITY & HIDDEN GRADING ENGINE
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
        </div>
      </header>

      {/* Top Stats Bar */}
      <div className="bg-slate-900/40 border-b border-slate-800 px-6 py-3.5 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
          <span className="text-slate-400">TOTAL CANDIDATES</span>
          <span className="text-base font-bold text-white">{sessions.length}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
          <span className="text-emerald-400">ACTIVE IN-PROGRESS</span>
          <span className="text-base font-bold text-emerald-400">{activeCount}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
          <span className="text-red-400">FLAGGED / LOCKED</span>
          <span className="text-base font-bold text-red-400">{lockedCount}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
          <span className="text-blue-400">COMPLETED</span>
          <span className="text-base font-bold text-blue-400">{submittedCount}</span>
        </div>
      </div>

      {/* Main Dashboard Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Candidates Live Grid */}
        <section className="flex-1 flex flex-col border-r border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search candidate name or ID..."
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
                <option value="ALL">ALL CLASSES</option>
                {classList.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredSessions.length === 0 ? (
              <div className="col-span-full h-64 flex flex-col items-center justify-center text-slate-500 font-mono text-xs">
                <Users className="w-8 h-8 mb-2 opacity-40" />
                <span>No candidate sessions found.</span>
              </div>
            ) : (
              filteredSessions.map((s) => {
                const isStudentLocked = s.status === "locked";
                const isSubmitted = s.status === "submitted";

                return (
                  <div
                    key={s.id}
                    className={`rounded-xl border p-4.5 flex flex-col justify-between transition-all ${
                      isStudentLocked
                        ? "bg-red-950/20 border-red-800/80 shadow-lg shadow-red-950/20"
                        : isSubmitted
                        ? "bg-slate-900/40 border-slate-800/80 opacity-75"
                        : "bg-slate-900/80 border-slate-800/90 hover:border-slate-700"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <h3 className="font-semibold text-sm text-slate-100 leading-tight">
                            {s.student_name}
                          </h3>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                            ID: {s.student_id} · {s.class_code}
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border uppercase ${
                            isStudentLocked
                              ? "bg-red-950 text-red-400 border-red-800 animate-pulse"
                              : isSubmitted
                              ? "bg-blue-950 text-blue-400 border-blue-800"
                              : "bg-emerald-950 text-emerald-400 border-emerald-800"
                          }`}
                        >
                          {s.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono my-3 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
                        <div>
                          <span className="text-slate-500 block">CURRENT TASK</span>
                          <span className="text-slate-200 font-medium">
                            Problem #{(s.current_question_index ?? 0) + 1}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">CONFIDENTIAL SCORE</span>
                          <span className="text-emerald-400 font-bold">
                            {s.total_score ?? 0} pts
                          </span>
                        </div>
                      </div>

                      {isStudentLocked && (
                        <div className="p-2.5 rounded bg-red-950/40 border border-red-900/60 text-red-300 text-xs mb-3 flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                          <span className="leading-snug">
                            {s.lock_reason || "Candidate placed exam in background."}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveSessionDetail(s)}
                        className="text-xs text-slate-400 hover:text-slate-200 font-mono transition"
                      >
                        Inspect Log →
                      </button>

                      {isStudentLocked && (
                        <button
                          type="button"
                          onClick={() => handleUnlock(s.id)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-mono text-xs rounded-md flex items-center gap-1.5 transition shadow"
                        >
                          <Unlock className="w-3 h-3" />
                          <span>Unlock</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Right: Live Telemetry & Incident Audit Feed */}
        <section className="w-80 lg:w-96 flex flex-col bg-slate-900/30 overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <h2 className="font-mono text-xs font-bold tracking-wider text-slate-200">
                LIVE AUDIT STREAM
              </h2>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {telemetry.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-slate-600 font-mono text-xs">
                Awaiting client telemetry...
              </div>
            ) : (
              telemetry.map((t) => {
                const isCheat = t.category === "cheat_suspect";
                return (
                  <div
                    key={t.id}
                    className={`p-2.5 rounded-lg border text-xs font-mono transition ${
                      isCheat
                        ? "bg-red-950/20 border-red-900/60 text-red-200"
                        : "bg-slate-900/80 border-slate-800 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                      <span className="font-bold text-slate-400">{t.event_type}</span>
                      <span>{new Date(t.occurred_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed wrap-break-word">{t.details}</p>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Candidate Inspect Modal */}
      {activeSessionDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">
                  {activeSessionDetail.student_name}
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  ID: {activeSessionDetail.student_id} · Class: {activeSessionDetail.class_code}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveSessionDetail(null)}
                className="text-slate-400 hover:text-white font-mono text-xs"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-slate-950 p-3 rounded border border-slate-800">
                <span className="text-slate-500 block">Session Status</span>
                <span className="text-white font-bold uppercase">
                  {activeSessionDetail.status}
                </span>
              </div>
              <div className="bg-slate-950 p-3 rounded border border-slate-800">
                <span className="text-slate-500 block">Total Score</span>
                <span className="text-emerald-400 font-bold">
                  {activeSessionDetail.total_score ?? 0} pts
                </span>
              </div>
            </div>

            {activeSessionDetail.status === "locked" && (
              <div className="p-3 bg-red-950/40 border border-red-800 rounded text-xs text-red-300">
                <strong>Incident:</strong>
                <p className="mt-0.5">{activeSessionDetail.lock_reason}</p>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              {activeSessionDetail.status === "locked" && (
                <button
                  type="button"
                  onClick={() => {
                    void handleUnlock(activeSessionDetail.id);
                    setActiveSessionDetail(null);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs rounded transition flex items-center gap-1.5"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Authorize & Unlock</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveSessionDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs rounded transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}