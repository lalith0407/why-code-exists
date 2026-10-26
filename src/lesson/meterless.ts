/**
 * Meterless H-MEM, in-process. The engine is vendored unmodified from github.com/Meterless/Meterless
 * (vendor/meterless-hmem, Apache-2.0) and persisted under data/meterless (WCE_METERLESS_DIR overrides).
 * No HTTP bridge, no local-JSON fallback: any failure throws and the caller reports it.
 */
import { resolve } from "node:path";
import { HMEM } from "../../vendor/meterless-hmem/src/index.ts";
import type { Lesson } from "../types.js";

const SEP = "\n#record ";

export interface MeterlessWriteResult { ok: true; backend: "meterless_hmem"; memory_id: string; detail: string; dir: string }
export interface MeterlessRecallHit { id: string; content: string; tags: string[]; relevance?: number; timestamp?: number; record?: Record<string, unknown>; supersedes?: string }
export interface MeterlessRecallResult { ok: true; backend: "meterless_hmem"; hits: MeterlessRecallHit[]; dir: string; detail?: string }

export function meterlessDir(): string { return resolve(process.env.WCE_METERLESS_DIR || "data/meterless"); }
let inst: { dir: string; h: HMEM } | undefined;
function hmem(): HMEM {
  const dir = meterlessDir();
  if (!inst || inst.dir !== dir) inst = { dir, h: new HMEM({ persistDir: dir, actor: "why-code-exists" }) };
  return inst.h;
}

export function lessonToHmemContent(lesson: Lesson): string {
  const prose = `lesson on ${lesson.concept} (${lesson.language_framework}): wrong="${lesson.wrong_assumption}" rule="${lesson.correct_rule}"`;
  const record = { kind: "lesson", lesson: lesson.correct_rule, wrong_assumption: lesson.wrong_assumption, suggested_fix: lesson.suggested_fix,
    concept: lesson.concept, language_framework: lesson.language_framework, error_id: lesson.error_id, verdict: lesson.verdict,
    file: lesson.file, citations: lesson.citations, id: lesson.id, created_at: lesson.created_at, source: "why-code-exists",
    ...(lesson.verified_context ? { verified_context: lesson.verified_context } : {}) };
  return prose + SEP + JSON.stringify(record);
}

/** Lowercase token used in lesson keys and H-MEM tags. Not a case rule: any string collapses the same way. */
export function normalizeLessonToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
const norm = normalizeLessonToken;
/** One lesson per concept + language/framework (not per bug, file or check). */
export function lessonKey(l: { concept: string; language_framework: string }): string {
  return `${norm(l.concept)}|${norm(l.language_framework)}`;
}

// MOCK: Meterless boundary
let boundaryOverride: Pick<HMEM, "add" | "query"> | undefined;

/** Tests that need a failed engine replace add/query here. Production leaves this unset and uses vendored HMEM. */
export function setMeterlessBoundaryForTests(boundary: Pick<HMEM, "add" | "query"> | undefined): void {
  boundaryOverride = boundary;
}

function engine(): Pick<HMEM, "add" | "query"> {
  if (boundaryOverride) return boundaryOverride;
  return hmem();
}

function parseRecord(content: string): Record<string, unknown> | undefined {
  const i = content.indexOf("#record ");
  if (i < 0) return undefined;
  try { return JSON.parse(content.slice(i + 8).trim()); } catch { return undefined; }
}

/** Recall from H-MEM; `tags` filters hits that carry every tag. Throws on engine failure. */
export function recallLessonsFromMeterless(query: string, opts: { topN?: number; tags?: string[]; threshold?: number } = {}): MeterlessRecallResult {
  const r = engine().query(query, { topN: opts.topN ?? 5, threshold: opts.threshold ?? 0 });
  const hits = r.memories.filter((m) => !m.memory.supersededBy && (opts.tags ?? []).every((t) => m.memory.tags.includes(t)))
    .map((m) => ({ id: m.memory.id, content: m.memory.content, tags: m.memory.tags, relevance: m.relevance, timestamp: m.memory.timestamp, record: parseRecord(m.memory.content), supersedes: m.memory.supersedes }));
  return { ok: true, backend: "meterless_hmem", hits, dir: meterlessDir(), detail: r.trace.retrievalReason };
}

export interface LessonWriteOptions {
  /** Defaults to the investigate label so existing callers store the same provenance text. */
  provenanceLabel?: string;
  /** Explain lessons also carry a file tag. Investigate writes omit it. */
  tagFile?: boolean;
  /**
   * Explain writes set this. Records named by another hit's `supersedes` are skipped so a
   * replacement is the dedup target. Investigate writes leave it unset and still take the first hit.
   */
  currentOnly?: boolean;
}

export function writeLessonToMeterless(lesson: Lesson, opts: LessonWriteOptions = {}): MeterlessWriteResult {
  const key = lessonKey(lesson);
  const hits = recallLessonsFromMeterless(`lesson on ${lesson.concept} ${lesson.language_framework}`, { topN: 50, tags: [`lesson_key:${key}`] }).hits;
  const replaced = new Set(hits.map((h) => h.supersedes).filter((id): id is string => !!id));
  const prev = (opts.currentOnly ? hits.filter((h) => !replaced.has(h.id)) : hits)[0];
  if (prev && prev.record?.lesson === lesson.correct_rule && prev.record?.suggested_fix === lesson.suggested_fix)
    return { ok: true, backend: "meterless_hmem", memory_id: prev.id, detail: "dedup_existing", dir: meterlessDir() };
  const tags = ["kind:lesson", `concept:${norm(lesson.concept)}`, `lang:${norm(lesson.language_framework)}`, `lesson_key:${key}`];
  if (opts.tagFile && lesson.file) tags.push(`file:${norm(lesson.file)}`);
  const m = engine().add({
    content: lessonToHmemContent(lesson), source: "why-code-exists", layer: "long_term", type: "factual", confidence: 0.9,
    tags,
    provenance: { origin: "manual", learnedAt: Date.now(), label: opts.provenanceLabel ?? "approved investigation", refs: lesson.citations.map((c) => `${c.kind}:${c.ref}`) },
    supersedes: prev?.id,
  });
  return { ok: true, backend: "meterless_hmem", memory_id: m.id, detail: prev ? `supersedes_${prev.id}` : "new", dir: meterlessDir() };
}
