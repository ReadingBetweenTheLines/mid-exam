export interface Question {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  description: string;
  starterCode: string;
  timeLimitMinutes?: number;
  hiddenTests?: {
    input: unknown[];
    expected: unknown;
  }[];
}

export interface ExamSession {
  id: string;
  class_code: string;
  student_name: string;
  student_id: string;
  current_question_index?: number;
  question_encounter_at?: string;
  status: "in_progress" | "locked" | "submitted";
  is_online?: boolean;
  last_heartbeat?: string;
  total_score?: number;
  lock_reason?: string | null;
  created_at?: string;
}

export interface TelemetryLog {
  id: string;
  session_id: string;
  category: "cheat_suspect" | "network_hardware";
  event_type: string;
  details: string;
  occurred_at: string;
}