/**
 * The "explain why" reasoner: one generic structured-output LLM call (plus at most one bounded repair re-ask)
 * over the deterministic context from context.ts. Uses the shared provider interface (src/llm/providers.ts).
 * Default provider is NVIDIA Nemotron (NVIDIA_API_KEY); Anthropic (ANTHROPIC_API_KEY, model from ANTHROPIC_MODEL,
 * default claude-sonnet-4-5) is an opt-in alternative. No per-case hints in the prompt or schema.
 */
import { llmJson, obj, str, type LlmCall } from "../engine/llm.js";
import { extractJsonObject } from "../llm/providers.js";
import type { LlmProvider } from "../llm/providers.js";
import type { ExplainContext } from "./context.js";
import type { RawAnswer } from "./verify.js";

export type ExplainProvider = Extract<LlmProvider, "nemotron" | "anthropic">;

export function selectExplainProvider(): ExplainProvider {
  const p = (process.env.WCE_EXPLAIN_PROVIDER || "").trim().toLowerCase();
  if (p === "anthropic" || p === "nemotron") return p;
  return "nemotron";
}

/** True when the selected (or named) provider has credentials configured; the caller must report missing credentials, never fake success. */
export function hasCredentials(provider: ExplainProvider): boolean {
  if (provider === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
  return !!process.env.NVIDIA_API_KEY;
}

const EVIDENCE_SCHEMA = {
  type: "array",
  items: obj({ kind: { type: "string", enum: ["transcript", "code"] }, file: str, line: { type: "integer" }, quote: str }),
};

export const ANSWER_SCHEMA = obj({
  overlooked_assumption: str,
  evidence: EVIDENCE_SCHEMA,
  why_it_breaks: str,
  confidence: { type: "string", enum: ["high", "medium", "low"] },
});

/** Parse a raw model reply (text) into a RawAnswer, tolerating <think> blocks / code fences (extractJsonObject). Throws with a clear message on anything else. */
export function parseAnswer(raw: string): RawAnswer {
  let obj_: unknown;
  try {
    obj_ = JSON.parse(extractJsonObject(raw));
  } catch (e) {
    throw new Error(`explain-why: model reply is not valid JSON (${(e as Error).message}): ${raw.slice(0, 200)}`);
  }
  return validateAnswerShape(obj_);
}

/** Validate an already-parsed object against the answer shape. Throws with a clear message — never silently coerces. */
export function validateAnswerShape(obj_: unknown): RawAnswer {
  if (typeof obj_ !== "object" || obj_ === null) throw new Error("explain-why: model reply is not a JSON object");
  const o = obj_ as Record<string, unknown>;
  if (typeof o.overlooked_assumption !== "string" || !o.overlooked_assumption.trim()) throw new Error("explain-why: missing overlooked_assumption");
  if (typeof o.why_it_breaks !== "string" || !o.why_it_breaks.trim()) throw new Error("explain-why: missing why_it_breaks");
  if (!["high", "medium", "low"].includes(o.confidence as string)) throw new Error(`explain-why: invalid confidence ${JSON.stringify(o.confidence)}`);
  if (!Array.isArray(o.evidence)) throw new Error("explain-why: evidence must be an array");
  const evidence = o.evidence.map((e, i) => {
    if (typeof e !== "object" || e === null) throw new Error(`explain-why: evidence[${i}] is not an object`);
    const ev = e as Record<string, unknown>;
    if (ev.kind !== "transcript" && ev.kind !== "code") throw new Error(`explain-why: evidence[${i}].kind must be "transcript" or "code"`);
    if (typeof ev.line !== "number" || !Number.isFinite(ev.line)) throw new Error(`explain-why: evidence[${i}].line must be a number`);
    if (typeof ev.quote !== "string") throw new Error(`explain-why: evidence[${i}].quote must be a string`);
    return { kind: ev.kind as "transcript" | "code", file: typeof ev.file === "string" ? ev.file : undefined, line: ev.line, quote: ev.quote };
  });
  return { overlooked_assumption: o.overlooked_assumption, why_it_breaks: o.why_it_breaks, confidence: o.confidence as RawAnswer["confidence"], evidence };
}

/** One live call to the reasoner. Throws (via llmJson/LlmError) on any failure — no canned fallback, no fake success. */
export async function askReasoner(ctx: ExplainContext, provider: ExplainProvider, label: string, calls: LlmCall[], extraSystemNote?: string): Promise<RawAnswer> {
  const system = extraSystemNote ? `${ctx.prompt.system}\n\n${extraSystemNote}` : ctx.prompt.system;
  const parsed = await llmJson<Record<string, unknown>>({ provider, label, system, user: ctx.prompt.user, schema: ANSWER_SCHEMA, maxTokens: 2000 }, calls, fetch);
  return validateAnswerShape(parsed);
}
