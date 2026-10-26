/**
 * Deterministic verifier for the "explain why" stage's model answer. No LLM, no per-case logic.
 * Every quote must be a substring of its cited line:
 *   - "code" evidence: the cited line of the cited (normalized) file, from `ground_truth.code_lines`.
 *   - "transcript" evidence: the cited Lnnn message's full body text, from `ground_truth.transcript_lines`
 *     (a message with internal newlines carries the same Lnnn on every continuation line; this checks the
 *     whole message body, so that case is handled without any special-casing).
 * An answer needs >=1 verified code quote AND >=1 verified transcript quote, or its status is "unverified" —
 * never shown as an explanation. One bounded re-ask (the repair) may be attempted by the caller; this module
 * only computes which quotes failed and what the resulting status is, before and after a repair attempt.
 */
import { normalizeCodePath, type ExplainContext } from "./context.js";
import { remapEditLine, splitSourceLines } from "../locate/remap.js";
import type { LineAnchor } from "../locate/types.js";

export interface EvidenceItem {
  kind: "transcript" | "code";
  file?: string;
  line: number;
  quote: string;
}

export interface RawAnswer {
  overlooked_assumption: string;
  evidence: EvidenceItem[];
  why_it_breaks: string;
  confidence: "high" | "medium" | "low";
}

export interface VerifiedEvidence extends EvidenceItem {
  verified: boolean;
  reason?: string;
}

export interface VerifiedAnswer extends Omit<RawAnswer, "evidence"> {
  evidence: VerifiedEvidence[];
  status: "verified" | "unverified";
  verified_code_quotes: number;
  verified_transcript_quotes: number;
}

const ws = (s: string) => s.replace(/\s+/g, " ").trim();

/** Normalize whitespace in addition to the exact substring check, since a model may re-wrap a quote across its own output. */
function substringOf(haystack: string | undefined, quote: string): { ok: boolean; reason?: string } {
  if (haystack === undefined) return { ok: false, reason: "cited line does not exist" };
  if (!quote.trim()) return { ok: false, reason: "empty quote" };
  if (haystack.includes(quote)) return { ok: true };
  if (ws(haystack).includes(ws(quote))) return { ok: true };
  return { ok: false, reason: "quote is not a substring of the cited line" };
}

/**
 * Place an edit-time line in the current file, then check `quote` against that line.
 * Shared with layer 1 and layer 2 via `remapEditLine`. An unanchored line does not verify,
 * and the stale edit-time number is not returned.
 */
export function verifyAnchoredLine(
  source: string | undefined,
  editTimeLine: number,
  addedText: string,
  neighbours: Array<{ line: number; text: string }> | undefined,
  quote: string,
): { anchor: LineAnchor; line: number; verified: boolean; reason?: string } {
  const mapped = remapEditLine(source, editTimeLine, addedText, neighbours);
  if (mapped.anchor === "unanchored") {
    return { anchor: "unanchored", line: 0, verified: false, reason: "added line is not in the current file" };
  }
  const hay = splitSourceLines(source ?? "")[mapped.line - 1];
  const check = substringOf(hay, quote);
  return { anchor: mapped.anchor, line: mapped.line, verified: check.ok, reason: check.ok ? undefined : check.reason };
}

export function verifyEvidence(item: EvidenceItem, ctx: ExplainContext["ground_truth"]): VerifiedEvidence {
  if (item.kind === "code") {
    const path = normalizeCodePath(item.file ?? "");
    const lines = ctx.code_lines[path];
    const check = substringOf(lines?.[item.line], item.quote);
    return { ...item, verified: check.ok, reason: check.ok ? undefined : lines === undefined ? `file "${path}" not in context` : check.reason };
  }
  const check = substringOf(ctx.transcript_lines[item.line], item.quote);
  return { ...item, verified: check.ok, reason: check.ok ? undefined : check.reason };
}

export function verifyAnswer(answer: RawAnswer, ctx: ExplainContext["ground_truth"]): VerifiedAnswer {
  const evidence = answer.evidence.map((e) => verifyEvidence(e, ctx));
  const verified_code_quotes = evidence.filter((e) => e.kind === "code" && e.verified).length;
  const verified_transcript_quotes = evidence.filter((e) => e.kind === "transcript" && e.verified).length;
  const status: VerifiedAnswer["status"] = verified_code_quotes >= 1 && verified_transcript_quotes >= 1 ? "verified" : "unverified";
  return { overlooked_assumption: answer.overlooked_assumption, why_it_breaks: answer.why_it_breaks, confidence: answer.confidence, evidence, status, verified_code_quotes, verified_transcript_quotes };
}

export interface RepairRequest {
  /** What to tell the model: which quotes failed and why, so the re-ask is bounded and specific. */
  message: string;
  failed: VerifiedEvidence[];
}

/** Built only when verification failed; one bounded re-ask, never more than the failed items. */
export function buildRepairRequest(verified: VerifiedAnswer): RepairRequest | undefined {
  const failed = verified.evidence.filter((e) => !e.verified);
  if (verified.status === "verified" || !failed.length) return undefined;
  const lines = failed.map((f) => `- ${f.kind} evidence at ${f.kind === "code" ? `${f.file}:${f.line}` : `L${f.line}`}: quote "${f.quote}" ${f.reason ?? "did not verify"}`);
  const needs: string[] = [];
  if (verified.verified_code_quotes < 1) needs.push("at least one verified code quote");
  if (verified.verified_transcript_quotes < 1) needs.push("at least one verified transcript quote");
  const message = `Your previous answer's quotes did not verify:\n${lines.join("\n")}\nAnswer again with the SAME JSON shape. Every quote must be an exact substring of the line you cite (file:line for code, Lnnn for transcript). You still need ${needs.join(" and ")}. If you cannot find one, lower confidence to "low" rather than guessing.`;
  return { message, failed };
}

export interface RepairRecord {
  attempted: boolean;
  failed_quotes: Array<{ kind: "transcript" | "code"; file?: string; line: number; quote: string; reason?: string }>;
  outcome: "verified" | "still_unverified" | "not_attempted";
}

export function noRepair(): RepairRecord {
  return { attempted: false, failed_quotes: [], outcome: "not_attempted" };
}
