"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { 
  Code2, 
  ShieldCheck, 
  ArrowRight, 
  KeyRound, 
  User, 
  Hash, 
  AlertCircle,
  ExternalLink
} from "lucide-react";
import Link from "next/link";

export default function StudentLoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [classCode, setClassCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleStartExam = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanName = name.trim();
    const cleanId = studentId.trim();
    const cleanCode = classCode.trim().toUpperCase();

    if (!cleanName || !cleanId || !cleanCode) {
      setErrorMessage("Please complete all fields before starting.");
      return;
    }

    startTransition(async () => {
      try {
        // 1. Check if candidate already has an existing active session
        const { data: existing, error: fetchErr } = await supabase
          .from("exam_sessions")
          .select("id, status")
          .eq("student_id", cleanId)
          .eq("class_code", cleanCode)
          .maybeSingle();

        if (fetchErr) {
          console.warn("Lookup warning:", fetchErr.message);
        }

        if (existing?.id) {
          router.push(`/exam/${existing.id}`);
          return;
        }

        // 2. Insert new session row into Supabase
        const { data: created, error: insertErr } = await supabase
          .from("exam_sessions")
          .insert({
            student_name: cleanName,
            student_id: cleanId,
            class_code: cleanCode,
            current_question_index: 0,
            question_encounter_at: new Date().toISOString(),
            status: "in_progress",
            is_online: true,
            last_heartbeat: new Date().toISOString(),
            total_score: 0,
          })
          .select("id")
          .single();

        if (insertErr || !created) {
          console.error("Supabase insert error:", insertErr);
          setErrorMessage(`Database insert failed: ${insertErr?.message || "Unknown error"}`);
          return;
        }

        // 3. Navigate directly to the newly created session
        router.push(`/exam/${created.id}`);
      } catch (err: unknown) {
        console.error("Runtime error during sign-in:", err);
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(`Runtime Error: ${msg}`);
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 font-sans">
      {/* Header */}
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <Code2 className="w-4 h-4" />
          </div>
          <span className="font-mono text-sm font-semibold tracking-wider text-slate-200">
            CODE_EXAM // PORTAL
          </span>
        </div>

        <Link
          href="/proctor"
          target="_blank"
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-md"
        >
          <span>Operator Console</span>
          <ExternalLink className="w-3 h-3 text-slate-500" />
        </Link>
      </header>

      {/* Login Card */}
      <main className="max-w-md mx-auto w-full bg-slate-900/80 border border-slate-800/90 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Candidate Entrance</h1>
          <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
            Enter your credentials and the class exam key provided by your supervisor.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-5 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleStartExam} className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bayo H."
                disabled={isPending}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
              Student / Candidate ID
            </label>
            <div className="relative">
              <Hash className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="e.g. STU-001"
                disabled={isPending}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
              Class Code Key
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value)}
                placeholder="e.g. CS101"
                disabled={isPending}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-3.5 py-2.5 text-sm font-mono uppercase text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium text-sm rounded-lg flex items-center justify-center gap-2 transition active:scale-[0.99] shadow-lg shadow-blue-950/30"
            >
              <span>{isPending ? "Connecting to Runtime..." : "Begin Exam"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-start gap-2.5 text-slate-400 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px]">
            Entering the exam locks browser focus. Switching tabs, un-focusing the window, or launching external tools will trigger an immediate proctor lockout.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-600 py-3 font-mono">
        SECURE INFORMATICS TESTING ENVIRONMENT // ACTIVE TELEMETRY
      </footer>
    </div>
  );
}