"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Shield, ArrowRight, AlertCircle, BookOpen } from "lucide-react";

// List of active valid class passcodes
const VALID_CLASS_CODES: Record<string, string> = {
  "CS-8A": "Informatics Grade 8 - Class A",
  "CS-8B": "Informatics Grade 8 - Class B",
  "CS-8C": "Informatics Grade 8 - Class C",
  "DEMO": "General Pseudocode Practice",
};

export default function StudentLoginPage() {
  const router = useRouter();
  const [studentName, setStudentName] = useState("");
  const [classCode, setClassCode] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = studentName.trim();
    const formattedClass = classCode.trim().toUpperCase();

    if (!trimmedName) {
      setErrorMsg("Please enter your full name.");
      return;
    }

    if (!formattedClass) {
      setErrorMsg("Please enter your class code.");
      return;
    }

    // Validate if the class code exists
    if (!VALID_CLASS_CODES[formattedClass]) {
      setErrorMsg(`Class code "${formattedClass}" is invalid or not active. Please ask your instructor.`);
      return;
    }

    setIsLoading(true);

    try {
      // 1. Check if the candidate already has an existing active session (reconnection scenario)
      const { data: existingSession } = await supabase
        .from("exam_sessions")
        .select("*")
        .eq("class_code", formattedClass)
        .ilike("student_name", trimmedName)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSession) {
        // Resume their existing exam session
        router.push(`/exam/${existingSession.id}`);
        return;
      }

      // 2. Otherwise generate a clean internal student ID
      const nameInitials = trimmedName
        .split(" ")
        .map((w) => w[0]?.toUpperCase() || "")
        .join("")
        .slice(0, 4);
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const generatedStudentId = `${formattedClass}-${nameInitials}-${randomSuffix}`;

      // 3. Create fresh exam session record
      const { data: newSession, error: insertError } = await supabase
        .from("exam_sessions")
        .insert({
          class_code: formattedClass,
          student_name: trimmedName,
          student_id: generatedStudentId,
          status: "in_progress",
          current_question_index: 0,
          question_encounter_at: new Date().toISOString(),
          is_online: true,
          last_heartbeat: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError || !newSession) {
        throw new Error(insertError?.message || "Failed to initialize exam session.");
      }

      router.push(`/exam/${newSession.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to join examination.";
      setErrorMsg(msg);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 font-sans select-none">
      <div className="max-w-md w-full space-y-6">
        {/* Brand / Title Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center mx-auto text-blue-400 shadow-lg shadow-blue-950/40">
            <BookOpen className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Examination Portal
          </h1>
          <p className="text-xs text-slate-400">
            Enter your full name and class code provided by your instructor.
          </p>
        </div>

        {/* Login Box */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur">
          {errorMsg && (
            <div className="mb-5 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span className="leading-snug">{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleStartExam} className="space-y-4">
            <div>
              <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1.5 font-medium">
                Full Name
              </label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="nama"
                required
                autoComplete="name"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1.5 font-medium">
                Class Code
              </label>
              <input
                type="text"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value)}
                placeholder="e.g. CS-7A"
                required
                autoCapitalize="characters"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono tracking-wider transition uppercase"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-98 disabled:opacity-50 text-white font-medium text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-blue-950/50"
              >
                {isLoading ? (
                  <span>Preparing Workspace...</span>
                ) : (
                  <>
                    <span>Enter Examination</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Device & Security Guidance */}
          <div className="mt-6 pt-5 border-t border-slate-800 text-[11px] text-slate-500 space-y-1.5">
            <div className="flex items-center gap-2 text-slate-400 font-medium">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Exam Integrity Active</span>
            </div>
            <p className="leading-relaxed">
              Once you enter, do not switch tabs or minimize the browser. Tapping the home button will trigger a proctor lockout.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}