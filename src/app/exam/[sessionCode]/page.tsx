"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { EXAM_QUESTIONS } from "@/lib/questions";
import { ExamSession, Question } from "@/lib/types";
import { useAntiCheat } from "@/hooks/useAntiCheat";
import CodeEditor from "@/components/CodeEditor";
import {
  Clock,
  Send,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Wifi,
  WifiOff,
  RefreshCw,
  FileText,
  Code
} from "lucide-react";

export default function StudentExamPage() {
  const params = useParams();
  const sessionCode = params.sessionCode as string;

  // Session & Question state
  const [session, setSession] = useState<ExamSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [lockReason, setLockReason] = useState<string>("");
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [hasCompleted, setHasCompleted] = useState<boolean>(false);

  // Mobile Viewport Tab State ('problem' | 'code')
  const [mobileTab, setMobileTab] = useState<"problem" | "code">("problem");

  // Dwell tracking
  const [dwellSeconds, setDwellSeconds] = useState<number>(0);

  // Submission UI state
  const [isPending, startTransition] = useTransition();
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const currentQuestion: Question = EXAM_QUESTIONS[currentIndex] || EXAM_QUESTIONS[0];

  // Code state initialized lazily to avoid synchronous effect setState
  const [code, setCode] = useState<string>(() => {
    if (typeof window !== "undefined" && sessionCode) {
      const q = EXAM_QUESTIONS[0];
      return localStorage.getItem(`draft_${sessionCode}_${q?.id}`) || q?.starterCode || "";
    }
    return EXAM_QUESTIONS[0]?.starterCode || "";
  });

  // 1. Initial Session Hydration (REST only, 0 WebSockets)
  useEffect(() => {
    if (!sessionCode) return;

    let isMounted = true;

    const fetchSession = async () => {
      try {
        const { data, error } = await supabase
          .from("exam_sessions")
          .select("*")
          .eq("id", sessionCode)
          .single();

        if (!isMounted) return;

        if (error || !data) {
          setSession({
            id: sessionCode,
            class_code: "CS-8A",
            student_name: "Student Candidate",
            student_id: "STU-001",
            current_question_index: 0,
            question_encounter_at: new Date().toISOString(),
            status: "in_progress",
            is_online: true,
            last_heartbeat: new Date().toISOString(),
          });
          return;
        }

        setSession(data);
        if (data.status === "locked") {
          setIsLocked(true);
          setLockReason(data.lock_reason || "Proctor intervention required.");
        } else if (data.status === "submitted") {
          setHasCompleted(true);
        }

        const targetIdx = data.current_question_index || 0;
        setCurrentIndex(targetIdx);

        const q = EXAM_QUESTIONS[targetIdx] || EXAM_QUESTIONS[0];
        const saved = localStorage.getItem(`draft_${sessionCode}_${q.id}`);
        setCode(saved !== null ? saved : q.starterCode);
      } catch (err) {
        console.error("Session load error:", err);
      }
    };

    void fetchSession();

    return () => {
      isMounted = false;
    };
  }, [sessionCode]);

  // -------------------------------------------------------------
  // ON-DEMAND REST POLLER (Active ONLY during lockout)
  // -------------------------------------------------------------
  const [isCheckingUnlock, setIsCheckingUnlock] = useState(false);

  useEffect(() => {
    if (!sessionCode || !isLocked) return;

    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from("exam_sessions")
          .select("status, lock_reason")
          .eq("id", sessionCode)
          .single();

        if (!error && data && data.status === "in_progress") {
          setIsLocked(false);
          setLockReason("");
        }
      } catch {
        // Silently retry on next tick
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [sessionCode, isLocked]);

  // Manual unlock verification button
  const handleManualUnlockCheck = async () => {
    if (isCheckingUnlock) return;
    setIsCheckingUnlock(true);

    try {
      const { data, error } = await supabase
        .from("exam_sessions")
        .select("status, lock_reason")
        .eq("id", sessionCode)
        .single();

      if (error) {
        alert("Gagal menghubungi server. Periksa koneksi internet Anda.");
        return;
      }

      if (data?.status === "in_progress") {
        setIsLocked(false);
        setLockReason("");
      } else {
        alert("Sesi ujian masih terkunci oleh pengawas. Silakan angkat tangan.");
      }
    } catch {
      alert("Terjadi kesalahan jaringan.");
    } finally {
      setIsCheckingUnlock(false);
    }
  };

  // -------------------------------------------------------------
  // SILENT HISTORY TRAP (Blocks Android Back Button & Swipe)
  // -------------------------------------------------------------
  useEffect(() => {
    window.history.pushState({ examLock: true }, "", window.location.href);
    window.history.pushState({ examLock: true }, "", window.location.href);

    const handlePopState = () => {
      window.history.pushState({ examLock: true }, "", window.location.href);
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // 2. Anti-cheat hook bindings
  useAntiCheat({
    sessionId: session?.id || sessionCode,
    isLocked,
    onLock: (reason: string) => {
      setIsLocked(true);
      setLockReason(reason);
    },
  });

  // 3. Online/Offline Network Status
  useEffect(() => {
    const handleUp = () => setIsOnline(true);
    const handleDown = () => setIsOnline(false);

    window.addEventListener("online", handleUp);
    window.addEventListener("offline", handleDown);
    return () => {
      window.removeEventListener("online", handleUp);
      window.removeEventListener("offline", handleDown);
    };
  }, []);

  // 4. Per-Question Dwell Stopwatch
  useEffect(() => {
    const interval = setInterval(() => {
      setDwellSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentIndex]);

  const handleCodeChange = (newVal: string) => {
    setCode(newVal);
    if (sessionCode && currentQuestion) {
      localStorage.setItem(`draft_${sessionCode}_${currentQuestion.id}`, newVal);
    }
  };

  // 5. Submit solution and progress to next question
  const handleSubmitSolution = () => {
    if (isPending) return;

    startTransition(async () => {
      setSubmitMessage(null);
      try {
        const response = await fetch("/api/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session?.id || sessionCode,
            questionId: currentQuestion.id,
            code,
            dwellTimeSeconds: dwellSeconds,
          }),
        });

        const result = await response.json();

        if (response.ok) {
          setSubmitMessage("Jawaban pseudocode berhasil disimpan!");

          setTimeout(async () => {
            setSubmitMessage(null);
            if (currentIndex + 1 < EXAM_QUESTIONS.length) {
              const nextIdx = currentIndex + 1;
              const nextQ = EXAM_QUESTIONS[nextIdx];

              const savedNext = localStorage.getItem(`draft_${sessionCode}_${nextQ.id}`);
              setCode(savedNext !== null ? savedNext : nextQ.starterCode);
              setCurrentIndex(nextIdx);
              setDwellSeconds(0);
              setMobileTab("problem");

              await supabase
                .from("exam_sessions")
                .update({
                  current_question_index: nextIdx,
                  question_encounter_at: new Date().toISOString(),
                })
                .eq("id", session?.id || sessionCode);
            } else {
              setHasCompleted(true);
              await supabase
                .from("exam_sessions")
                .update({ status: "submitted" })
                .eq("id", session?.id || sessionCode);
            }
          }, 800);
        } else {
          setSubmitMessage(result.error || "Gagal menyimpan jawaban. Coba kembali.");
        }
      } catch {
        setSubmitMessage("Gangguan koneksi sementara. Jawaban tetap tersimpan di memori HP.");
      }
    });
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (hasCompleted) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-8 text-center shadow-2xl">
          <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold">Ujian Pseudocode Selesai</h2>
          <p className="text-slate-400 mt-2 text-sm leading-relaxed">
            Seluruh algoritma pseudocode dan catatan audit keamanan Anda telah tersimpan dengan aman di server.
          </p>
          <div className="mt-6 p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-400">
            Nama Siswa: <span className="text-slate-200 font-semibold">{session?.student_name}</span>
            <br />
            Kelas: <span className="text-slate-200 font-semibold">{session?.class_code}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 1. Header Bar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/60 backdrop-blur px-4 md:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-mono text-xs md:text-sm font-semibold tracking-wider text-slate-200">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden sm:inline">PSEUDOCODE RUNTIME (KELAS 8)</span>
            <span className="sm:hidden">PSEUDOCODE</span>
          </div>
          <span className="text-[11px] md:text-xs bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-slate-300 font-mono">
            {session?.class_code || "CLASS"}
          </span>
        </div>

        <div className="flex items-center gap-3 md:gap-6 text-xs">
          {/* Question Dwell Time */}
          <div className="flex items-center gap-1.5 md:gap-2 bg-slate-800/80 px-2.5 md:px-3 py-1 md:py-1.5 rounded-md border border-slate-700 font-mono text-[11px] md:text-xs">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline text-slate-400">Waktu:</span>
            <span className="text-white font-semibold">{formatTimer(dwellSeconds)}</span>
          </div>

          {/* Network Connection Status */}
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] md:text-xs">
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Terhubung</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-400">Menghubungkan ulang...</span>
              </>
            )}
          </div>

          <div className="hidden md:block text-slate-400">
            Siswa: <span className="text-slate-200 font-medium">{session?.student_name || "Peserta"}</span>
          </div>
        </div>
      </header>

      {/* Mobile Tab Selector */}
      <div className="md:hidden flex border-b border-slate-800 bg-slate-900/90 text-xs font-mono">
        <button
          type="button"
          onClick={() => setMobileTab("problem")}
          className={`flex-1 py-2.5 flex items-center justify-center gap-2 font-semibold transition border-b-2 ${
            mobileTab === "problem"
              ? "border-blue-500 text-blue-400 bg-blue-950/20"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>1. Soal & Kasus</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("code")}
          className={`flex-1 py-2.5 flex items-center justify-center gap-2 font-semibold transition border-b-2 ${
            mobileTab === "code"
              ? "border-blue-500 text-blue-400 bg-blue-950/20"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Code className="w-3.5 h-3.5" />
          <span>2. Editor Pseudocode</span>
        </button>
      </div>

      {/* 2. Main Workspace Layout */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Problem Statement Panel */}
        <section
          className={`w-full md:w-1/2 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col bg-slate-900/30 overflow-y-auto ${
            mobileTab === "problem" ? "flex flex-1" : "hidden md:flex"
          }`}
        >
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-blue-400 font-semibold">
                Soal {currentIndex + 1} dari {EXAM_QUESTIONS.length}
              </span>
              <h1 className="text-lg md:text-xl font-bold text-slate-100 mt-0.5">{currentQuestion.title}</h1>
            </div>
            <span
              className={`text-[10px] md:text-xs px-2.5 py-1 rounded font-medium border ${
                currentQuestion.difficulty === "Easy"
                  ? "bg-emerald-950/40 text-emerald-400 border-emerald-800"
                  : currentQuestion.difficulty === "Medium"
                  ? "bg-amber-950/40 text-amber-400 border-amber-800"
                  : "bg-red-950/40 text-red-400 border-red-800"
              }`}
            >
              {currentQuestion.difficulty}
            </span>
          </div>

          <div className="flex-1 p-4 md:p-6 prose prose-invert prose-sm max-w-none">
            <div className="whitespace-pre-line text-slate-200 leading-relaxed font-sans text-xs md:text-sm bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
              {currentQuestion.description}
            </div>

            <div className="mt-5 p-3.5 md:p-4 rounded-lg bg-slate-950 border border-slate-800/80">
              <h4 className="text-[11px] md:text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">
                Aturan Penulisan Algoritma
              </h4>
              <ul className="text-xs space-y-1.5 text-slate-400 list-disc list-inside">
                <li>Gunakan blok <code className="text-blue-300 font-mono">DEKLARASI</code> untuk mendeklarasikan nama dan tipe data variabel.</li>
                <li>Tuliskan langkah-langkah logika pemecahan masalah pada bagian <code className="text-blue-300 font-mono">DESKRIPSI</code>.</li>
                <li>Gunakan instruksi terstruktur seperti <code className="text-blue-300 font-mono">READ</code>, <code className="text-blue-300 font-mono">WRITE</code>, <code className="text-blue-300 font-mono">IF - ELSE</code>, atau <code className="text-blue-300 font-mono">WHILE/FOR</code>.</li>
              </ul>
            </div>
          </div>

          {/* Quick Tab Switcher Button on Mobile */}
          <div className="p-4 md:hidden border-t border-slate-800 bg-slate-900/50">
            <button
              type="button"
              onClick={() => setMobileTab("code")}
              className="w-full py-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 rounded-lg text-xs font-mono font-medium flex items-center justify-center gap-2"
            >
              <span>Lanjut ke Editor Pseudocode →</span>
            </button>
          </div>

          {submitMessage && (
            <div className="p-3 bg-blue-950/60 border-t border-blue-800/60 text-blue-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0" />
              <span>{submitMessage}</span>
            </div>
          )}
        </section>

        {/* Monaco Code Editor Panel */}
        <section
          className={`w-full md:w-1/2 flex flex-col bg-[#1e1e1e] select-text ${
            mobileTab === "code" ? "flex flex-1" : "hidden md:flex"
          }`}
        >
          <div className="h-10 border-b border-slate-800 bg-slate-900 px-4 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2 font-mono text-[11px] md:text-xs">
              <Code className="w-3.5 h-3.5 text-blue-400" />
              <span>algoritma.pseudo</span>
            </div>
            <span className="text-[10px] md:text-[11px] text-slate-500">Draft tersimpan otomatis</span>
          </div>

          <div className="flex-1 relative min-h-[320px]">
            <CodeEditor
              value={code}
              onChange={handleCodeChange}
              readOnly={isLocked || isPending}
            />
          </div>

          <div className="p-3 md:p-4 border-t border-slate-800 bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="hidden sm:block text-xs text-slate-500">
              Membuka aplikasi lain akan langsung mengunci lembar ujian.
            </div>
            <button
              onClick={handleSubmitSolution}
              disabled={isPending || isLocked}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
              {isPending
                ? "Menyimpan..."
                : currentIndex + 1 === EXAM_QUESTIONS.length
                ? "Selesai & Kumpulkan Ujian"
                : "Simpan & Soal Berikutnya"}
            </button>
          </div>
        </section>
      </main>

      {/* 3. Anti-Cheat Lockout Overlay */}
      {isLocked && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200 select-none">
          <div className="max-w-md w-full bg-slate-900 border-2 border-red-600 rounded-2xl p-6 sm:p-8 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-red-950 border border-red-500/50 flex items-center justify-center mx-auto text-red-500">
              <Lock className="w-7 h-7 animate-pulse" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">
                SESI UJIAN TERKUNCI
              </h2>
              <p className="text-[11px] font-mono uppercase text-red-400 mt-1">
                Peringatan Keamanan
              </p>
            </div>

            <div className="bg-red-950/30 border border-red-900/60 rounded-lg p-3.5 text-xs text-red-300 leading-relaxed text-left">
              <strong>Keterangan Pelanggaran:</strong>
              <p className="mt-1">{lockReason || "Layar diminimalkan atau berpindah tab/aplikasi."}</p>
            </div>

            <p className="text-slate-400 text-xs leading-relaxed">
              Waktu ujian Anda dijeda. Harap angkat tangan dan beri tahu guru pengawas untuk membuka kembali sesi ujian Anda.
            </p>

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleManualUnlockCheck}
                disabled={isCheckingUnlock}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 transition flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isCheckingUnlock ? "animate-spin" : ""}`} />
                <span>{isCheckingUnlock ? "Memverifikasi..." : "Cek Buka Kunci"}</span>
              </button>
              <div className="text-[11px] font-mono text-slate-500 flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                <span>Pengecekan otomatis aktif (tiap 3 detik)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}