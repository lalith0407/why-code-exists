/**
 * Lessons from proven_false investigations, keyed by model-named concept + language/framework (Meterless H-MEM).
 * Prevention = recall lessons against a NEW change and ask a checker model whether the change repeats a recalled
 * wrong assumption. Every "repeats" finding must quote the change verbatim (quote-verified) or it is dropped.
 */
import { randomUUID } from "node:crypto";
import type { Lesson } from "../types.js";
import type { InvestigationReportV2 } from "./investigate.js";
import { recallLessonsFromMeterless, writeLessonToMeterless, type MeterlessWriteResult } from "../lesson/meterless.js";
import { llmJson, obj, str, type LlmCall } from "./llm.js";
import type { LlmProvider } from "../llm/providers.js";

export function lessonFromReport(r: InvestigationReportV2): Lesson | undefined {
  if (r.verdict !== "proven_false" || !r.claim) return undefined;
  return {
    id: randomUUID(), created_at: new Date().toISOString(),
    concept: r.claim.concept, language_framework: r.claim.language_framework,
    file: r.frame.file, error_id: String((r.error as unknown as { id?: string }).id ?? "error"),
    wrong_assumption: r.claim.claim, correct_rule: r.claim.correct_rule,
    suggested_fix: r.patch?.diff ?? "", verdict: r.verdict,
    citations: [{ kind: "transcript", ref: `transcript#L${r.provenance.written_at?.edit_line ?? "?"}` }, { kind: "frozen_tests_sha256", ref: r.tests?.tests_sha256 ?? "" }],
  };
}

export async function saveLesson(r: InvestigationReportV2): Promise<{ lesson?: Lesson; write?: MeterlessWriteResult }> {
  const lesson = lessonFromReport(r);
  return lesson ? { lesson, write: writeLessonToMeterless(lesson) } : {};
}

export interface PreventFinding { lesson_id: string; concept: string; repeats: boolean; quote: string; quote_verified: boolean; reason: string }

const SYSTEM = `You review a NEW code change against previously proven lessons (each: a wrong assumption an agent made and the correct rule).
For each lesson decide whether the new change repeats the same wrong assumption. Judge by mechanism, not by shared words.
If it repeats, quote the exact offending line(s) from the change verbatim. Return JSON {findings:[{lesson_id, repeats, quote, reason}]}.`;

export async function preventCheck(o: { change: string; language_framework: string; provider: LlmProvider; topN?: number }, calls: LlmCall[]): Promise<{ recalled: number; findings: PreventFinding[]; backend: string }> {
  const rec = recallLessonsFromMeterless(`${o.language_framework} ${o.change.slice(0, 1500)}`, { topN: o.topN ?? 5, tags: ["kind:lesson"] });
  if (!rec.ok) throw new Error(`lesson recall failed visibly: ${rec.detail}`);
  const lessons = rec.hits.filter((h) => h.record?.concept).map((h) => ({ lesson_id: h.id, concept: String(h.record!.concept), language_framework: String(h.record!.language_framework ?? ""), wrong_assumption: String(h.record!.wrong_assumption ?? ""), correct_rule: String(h.record!.lesson ?? "") }));
  if (!lessons.length) return { recalled: 0, findings: [], backend: rec.backend };
  const r = await llmJson<{ findings: Array<{ lesson_id: string; repeats: boolean; quote: string; reason: string }> }>({
    provider: o.provider, label: `prevent:${o.provider}`, system: SYSTEM, user: { change: o.change, language_framework: o.language_framework, lessons },
    schema: obj({ findings: { type: "array", items: obj({ lesson_id: str, repeats: { type: "boolean" }, quote: str, reason: str }) } }), maxTokens: 2000,
  }, calls);
  const squash = (s: string) => s.replace(/\s+/g, " ").trim();
  const findings = r.findings.map((f) => {
    const verified = !!f.quote.trim() && squash(o.change).includes(squash(f.quote));
    return { lesson_id: f.lesson_id, concept: lessons.find((l) => l.lesson_id === f.lesson_id)?.concept ?? "?", repeats: f.repeats && verified, quote: f.quote, quote_verified: verified, reason: f.repeats && !verified ? `dropped: quote not found in change (${f.reason})` : f.reason };
  });
  return { recalled: lessons.length, findings, backend: rec.backend };
}
