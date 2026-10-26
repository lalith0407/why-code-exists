/** Shared types for the why-code-exists pipeline. */

export interface ProdError {
  id: string;
  timestamp: string;
  severity: string;
  service: string;
  message: string;
  /** Stack-like frames pointing at app code */
  frames: Array<{ file: string; line: number; column?: number; function?: string }>;
  /** Optional structured context (request meta, rows) — no secrets */
  context?: Record<string, unknown>;
  labels?: string[];
}

export interface SessionMessage {
  line: number;
  role: string;
  thinking?: string;
  text?: string;
  tool_name?: string;
  tool_args?: unknown;
  edited_files?: string[];
  /** Scrubbed code written by an edit tool (search_replace / write), truncated. */
  code_written?: string;
  started_at_ms?: number;
  completed_at_ms?: number;
}

export interface Assumption {
  id: string;
  text: string;
  /** Citation into the transcript */
  citation: { transcript_line: number; quote: string };
  score: number;
  rationale: string;
  /** heuristic | nemotron | openai | fixture_boost */
  source: string;
  /** Model-selected proof check id (enum of available checks, or "none"). Absent → keyword match. */
  check_id?: string;
}

export interface ProofResult {
  assumption_id: string;
  status: "proven_false" | "inconclusive" | "holds" | "mechanism_mismatch";
  check_id: string;
  evidence_summary: string;
  details: Record<string, unknown>;
  /** tested = executable fixture check ran; mocked = placeholder */
  fidelity: "tested" | "mocked";
}

export interface Lesson {
  id: string;
  created_at: string;
  /** Model-named concept (e.g. "webhook retry idempotency"); with language_framework this is the lesson key. */
  concept: string;
  language_framework: string;
  file: string;
  error_id: string;
  wrong_assumption: string;
  correct_rule: string;
  suggested_fix: string;
  /** Verdict of the investigation that produced it; only proven_false lessons are written. */
  verdict: string;
  citations: Array<{ kind: string; ref: string }>;
  backend?: "local_json" | "meterless_hmem";
  meterless_memory_id?: string;
  /**
   * Explain-report lessons only. Investigate lessons leave this unset, so their stored record stays the same.
   * Copied from verified report fields (assumption text is already `wrong_assumption` / `correct_rule`).
   */
  verified_context?: {
    provider: string;
    lesson_key: string;
    /** `frame` when the report had a stack frame. Otherwise the LOCATE result's `method`. */
    located_by?: "frame" | "layer1_deterministic" | "layer2_agentic" | "none";
    location?: { file: string; line: number; via: "frame" | "locate" };
    confidence_cap?: {
      model: string;
      computed: string;
      capped: string;
      margin: number;
      layer2_confirmed: boolean;
      anchor?: string;
      quotes_verified: boolean;
    };
    /** Valid asked / understood / happened pieces only. Invalid pieces are omitted. */
    pieces: {
      asked?: { text: string; citation: string };
      understood?: { text: string; citation: string };
      happened?: { text: string; citation: string };
    };
  };
}

