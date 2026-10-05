import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import vm from "node:vm";

// Initialize server-side Supabase client using Service Role or Anon key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";
const supabase = createClient(supabaseUrl, supabaseKey);

// Private test assertions hidden from candidates
interface TestCase {
  input: unknown[];
  expected: unknown;
}

const HIDDEN_TEST_SUITES: Record<string, TestCase[]> = {
  q1: [
    { input: ["hello"], expected: "olleh" },
    { input: ["racecar"], expected: "racecar" },
    { input: ["12345"], expected: "54321" },
    { input: ["Informatics"], expected: "scitamrofnI" },
    { input: [""], expected: "" },
  ],
  q2: [
    { input: ["Informatics"], expected: 4 },
    { input: ["hello world"], expected: 3 },
    { input: ["rhythm"], expected: 0 },
    { input: ["AEIOUaeiou"], expected: 10 },
    { input: ["NextJS"], expected: 1 },
  ],
  q3: [
    { input: [[3, 0, 1]], expected: 2 },
    { input: [[0, 1]], expected: 2 },
    { input: [[9, 6, 4, 2, 3, 5, 7, 0, 1]], expected: 8 },
    { input: [[0]], expected: 1 },
    { input: [[1]], expected: 0 },
  ],
};

// Safe sandbox evaluator using Node.js vm
function evaluateSolution(code: string, testCases: TestCase[]): { passedCount: number; totalCount: number } {
  let passedCount = 0;

  for (const test of testCases) {
    try {
      // Create a fresh isolated context with no access to Node globals
      const sandbox = {
        result: undefined,
        args: test.input,
      };

      const context = vm.createContext(sandbox);

      // Wrapper script executing the student's solution
      const scriptCode = `
        "use strict";
        ${code}
        if (typeof solution === "function") {
          result = solution(...args);
        }
      `;

      const script = new vm.Script(scriptCode);
      // Hard timeout of 1500ms per test case to catch infinite loops
      script.runInContext(context, { timeout: 1500 });

      // Compare output with expected result
      if (JSON.stringify(sandbox.result) === JSON.stringify(test.expected)) {
        passedCount++;
      }
    } catch {
      // Syntax error, runtime exception, or execution timeout
    }
  }

  return { passedCount, totalCount: testCases.length };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, questionId, code, dwellTimeSeconds } = body;

    if (!sessionId || !questionId || typeof code !== "string") {
      return NextResponse.json(
        { error: "Invalid submission payload." },
        { status: 400 }
      );
    }

    const testSuite = HIDDEN_TEST_SUITES[questionId] || [];
    const { passedCount, totalCount } = evaluateSolution(code, testSuite);

    // Calculate score (0 - 100)
    const earnedScore = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;

    // 1. Record submission to database
    try {
      await supabase.from("submissions").insert({
        session_id: sessionId,
        question_id: questionId,
        submitted_code: code,
        dwell_time_seconds: dwellTimeSeconds || 0,
        hidden_score: earnedScore,
        test_cases_passed: passedCount,
        total_test_cases: totalCount,
      });

      // 2. Fetch current session total score and increment confidentially
      const { data: currentSession } = await supabase
        .from("exam_sessions")
        .select("total_score")
        .eq("id", sessionId)
        .single();

      const updatedTotal = (currentSession?.total_score || 0) + earnedScore;

      await supabase
        .from("exam_sessions")
        .update({
          total_score: updatedTotal,
        })
        .eq("id", sessionId);
    } catch (dbErr) {
      console.warn("DB write bypassed (local preview or unseeded table):", dbErr);
    }

    // 3. Return sanitized response to candidate (scores & tests strictly withheld)
    return NextResponse.json({
      success: true,
      message: "Solution received and recorded successfully.",
    });
  } catch (error) {
    console.error("Grading execution error:", error);
    return NextResponse.json(
      { error: "Internal grading engine exception." },
      { status: 500 }
    );
  }
}