/**
 * Candidate lessons for explain-why reports.
 * A lesson is built only from fields the report already marks verified. Nothing is written here:
 * explain-why records a pending lesson, and `npm run approve` stores it after a person accepts it.
 * Recall uses the vendored H-MEM engine. A failure is returned on the status; it is not replaced with empty success.
 */
import { randomUUID } from "node:crypto";
import type { ExplainWhyResult } from "../explain/pipeline.js";

/** Report body before lesson status is attached. Avoids a required field the builder itself fills. */
export type ExplainLessonSource = Omit<ExplainWhyResult, "lesson_status" | "approval">;
import type { Lesson } from "../types.js";
import {
  lessonKey,
  normalizeLessonToken,
  recallLessonsFromMeterless,
  writeLessonToMeterless,
  type MeterlessRecallHit,
  type MeterlessWriteResult,
} from "./meterless.js";

export const EXPLAIN_WHY_SCHEMA = "why-code-exists/explain-why@1";

export interface ExplainRecallHit {
  id: string;
  relevance?: number;
  shares_file: boolean;
  shares_key: boolean;
  concept?: string;
  language_framework?: string;
  file?: string;
  wrong_assumption?: string;
  correct_rule?: string;
  lesson_key?: string;
}

export interface ExplainRecallState {
  ran: boolean;
  ok: boolean;
  error?: string;
  query?: string;
  tags?: string[];
  hits: ExplainRecallHit[];
}

export interface ExplainLessonWrite {
  memory_id: string;
  detail: string;
  dir: string;
}

export interface ExplainLessonStatus {
  disposition: "pending" | "stored" | "not_created" | "rejected";
  /** Why no lesson was built, or why recall did not produce a stored lesson. Absent once stored. */
  reason?: string;
  lesson?: Lesson;
  recall: ExplainRecallState;
  write?: ExplainLessonWrite;
}

type PieceLike = { text: string; citation: string; valid: boolean };

/** File extension, lowercased. Explain reports have no language field; the extension is the generic stand-in. */
export function languageFromFile(file: string | undefined): string {
  if (!file) return "unknown";
  const base = file.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "unknown";
  const ext = base.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]+$/.test(ext) ? ext : "unknown";
}

/** Concept text is the verified overlooked assumption, whitespace-collapsed. The key is this plus the extension. */
export function conceptFromVerifiedAssumption(assumption: string): string {
  return assumption.replace(/\s+/g, " ").trim();
}

export function isExplainWhyReport(r: { schema?: unknown }): r is ExplainLessonSource {
  return r.schema === EXPLAIN_WHY_SCHEMA;
}

/** Human-readable reason approve must refuse, or undefined when a lesson may be stored. */
export function explainStoreRefusal(r: Partial<ExplainLessonSource>): string | undefined {
  if (r.stage !== "ok") return `not created because stage is ${r.stage ?? "missing"}`;
  if (!r.answer || r.answer.status !== "verified") return "not created because unverified";
  if (!r.answer.overlooked_assumption?.trim() || !r.answer.why_it_breaks?.trim()) return "not created because the verified answer text is empty";
  if (!r.three_piece) return "not created because the report has no three-piece section";
  return undefined;
}

function locatedSource(r: ExplainLessonSource): { file: string; line: number; via: "frame" | "locate" } | undefined {
  const frame = r.three_piece?.frame;
  if (frame?.file) return { file: frame.file, line: frame.line, via: "frame" };
  const picked = r.locate?.picked;
  if (picked?.file) return { file: picked.file, line: picked.line, via: "locate" };
  return undefined;
}

function validPiece(p?: PieceLike): { text: string; citation: string } | undefined {
  if (!p?.valid) return undefined;
  return { text: p.text, citation: p.citation };
}

function verifiedCitations(r: ExplainLessonSource): Array<{ kind: string; ref: string }> {
  const citations: Array<{ kind: string; ref: string }> = [];
  for (const e of r.answer?.evidence ?? []) {
    if (!e.verified) continue;
    if (e.kind === "code") {
      if (!e.file) continue;
      citations.push({ kind: "code", ref: `code:${e.file}:${e.line}` });
    } else if (e.kind === "transcript") {
      citations.push({ kind: "transcript", ref: `transcript#L${e.line}` });
    }
  }
  return citations;
}

/** Lesson built from verified fields only. Undefined when the report must not be stored. Does not touch Meterless. */
export function lessonFromExplainReport(r: ExplainLessonSource): Lesson | undefined {
  if (explainStoreRefusal(r) || !r.answer || !r.three_piece) return undefined;
  const location = locatedSource(r);
  const concept = conceptFromVerifiedAssumption(r.answer.overlooked_assumption);
  const language_framework = languageFromFile(location?.file);
  const key = lessonKey({ concept, language_framework });
  const asked = validPiece(r.three_piece.asked);
  const understood = validPiece(r.three_piece.understood);
  const happened = validPiece(r.three_piece.happened);
  return {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    concept,
    language_framework,
    file: location?.file ?? "",
    error_id: r.three_piece.error_id,
    wrong_assumption: r.answer.overlooked_assumption,
    correct_rule: r.answer.why_it_breaks,
    suggested_fix: "",
    verdict: "verified",
    citations: verifiedCitations(r),
    verified_context: {
      provider: r.provider,
      lesson_key: key,
      located_by: r.locate ? r.locate.method : "frame",
      ...(location ? { location } : {}),
      ...(r.confidence_cap ? { confidence_cap: { ...r.confidence_cap } } : {}),
      pieces: {
        ...(asked ? { asked } : {}),
        ...(understood ? { understood } : {}),
        ...(happened ? { happened } : {}),
      },
    },
  };
}

function samePath(stored: unknown, current: string | undefined): boolean {
  if (typeof stored !== "string" || !current) return false;
  const normPath = (p: string) => p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/").toLowerCase();
  return normPath(stored) === normPath(current);
}

function keyOfHit(hit: MeterlessRecallHit): string | undefined {
  const tagged = hit.tags.find((t) => t.startsWith("lesson_key:"));
  if (tagged) return tagged.slice("lesson_key:".length);
  const concept = hit.record?.concept;
  const language = hit.record?.language_framework;
  if (typeof concept === "string" && typeof language === "string") return lessonKey({ concept, language_framework: language });
  return undefined;
}

function textField(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

const skippedRecall = (): ExplainRecallState => ({
  ran: false,
  ok: false,
  error: "not run: no verified assumption text to query",
  hits: [],
});

function recallRelated(lesson: Lesson): ExplainRecallState {
  const language = lesson.language_framework;
  const file = lesson.file;
  const key = lesson.verified_context?.lesson_key ?? lessonKey(lesson);
  const tags = ["kind:lesson"];
  if (language && language !== "unknown") tags.push(`lang:${normalizeLessonToken(language)}`);
  if (file) tags.push(`file:${normalizeLessonToken(file)}`);
  // Hard-filter kind + language so the hit list stays in one extension. The file tag is queried
  // and then reported as shares_file, so a lesson on a different file can still appear.
  const filterTags = tags.filter((t) => t === "kind:lesson" || t.startsWith("lang:"));
  const query = [lesson.wrong_assumption, file, ...tags.filter((t) => t.startsWith("lang:") || t.startsWith("file:"))].filter((s) => s.trim()).join(" ");
  try {
    const rec = recallLessonsFromMeterless(query, { topN: 5, tags: filterTags, threshold: 0 });
    const replaced = new Set(rec.hits.map((h) => h.supersedes).filter((id): id is string => !!id));
    const hits = rec.hits.filter((h) => !replaced.has(h.id)).map((h) => {
      const hitKey = keyOfHit(h);
      const storedFile = textField(h.record?.file);
      return {
        id: h.id,
        relevance: h.relevance,
        shares_file: samePath(storedFile, file || undefined),
        shares_key: hitKey === key,
        concept: textField(h.record?.concept),
        language_framework: textField(h.record?.language_framework),
        file: storedFile,
        wrong_assumption: textField(h.record?.wrong_assumption),
        correct_rule: textField(h.record?.lesson),
        lesson_key: hitKey,
      };
    });
    return { ran: true, ok: true, query, tags: filterTags, hits };
  } catch (e) {
    return { ran: true, ok: false, error: e instanceof Error ? e.message : String(e), query, tags: filterTags, hits: [] };
  }
}

/** Pending lesson plus recall. Does not write. Recall errors stay on the status with no invented hits. */
export function explainLessonStatus(r: ExplainLessonSource): ExplainLessonStatus {
  const reason = explainStoreRefusal(r);
  const lesson = reason ? undefined : lessonFromExplainReport(r);
  if (!lesson) return { disposition: "not_created", reason: reason ?? "not created because unverified", recall: skippedRecall() };
  return { disposition: "pending", lesson, recall: recallRelated(lesson) };
}

export function writeExplainLesson(lesson: Lesson): MeterlessWriteResult {
  return writeLessonToMeterless(lesson, { provenanceLabel: "approved explain report", tagFile: true, currentOnly: true });
}
