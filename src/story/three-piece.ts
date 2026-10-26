/**
 * Three-piece explanation (deterministic, no LLM): for a production error, show side by side
 *   1. ASKED      – the human instruction in force when the agent wrote the code (last real user message before the edit),
 *   2. UNDERSTOOD – the agent's own words right before the edit, verbatim,
 *   3. HAPPENED   – the error and the frame file:line it points at, the code the edit added there, and any later edit of that code.
 * Every piece carries a citation (transcript line or URL) and a validity check computed from the source text itself.
 * Generic: no per-case or per-repo rules. Machine notifications injected into the user channel are not counted as instructions.
 */
import type { ProdError, SessionMessage } from "../types.js";
import type { TranscriptIndex } from "../session/transcript.js";
import { findProvenance, parseDiffs, type Provenance } from "../session/provenance.js";
import type { GithubProvenance } from "../session/github.js";

export interface Piece { text: string; citation: string; valid: boolean; why_invalid?: string; full_length?: number }
export interface ThreePiece {
  schema: "why-code-exists/three-piece@1";
  error_id: string;
  frame?: { file: string; line: number; function?: string };
  asked?: Piece; understood?: Piece; happened?: Piece & { later_edits: number[] };
  complete: boolean;
  notes: string[];
}

/** User-channel text written by tooling, not by a person (task notifications, timestamps-only wrappers, tool results). */
export function isMachineUserText(t: string): boolean {
  return /<system_notification>|<task_notification>|^\s*<(?:timestamp|system-reminder|command-name|local-command-stdout)>[\s\S]*<\/(?:timestamp|system-reminder|command-name|local-command-stdout)>\s*$/i.test(t) || /<system_notification>/i.test(t);
}
const textOf = (m: SessionMessage) => `${m.thinking ?? ""}${m.thinking && m.text ? "\n" : ""}${m.text ?? ""}`.trim();
const stemsOf = (s: string) => new Set((s.toLowerCase().match(/[a-z_][a-z0-9_]{3,}/g) ?? []).flatMap((w) => w.split("_")).filter((w) => w.length > 3));

/** Paragraph of `text` with the most identifier overlap with `code` (ties: earliest). Returned verbatim. */
export function mostRelevantParagraph(text: string, code: string): string {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length <= 1) return text.trim();
  const cs = stemsOf(code);
  let best = paras[0], score = -1;
  for (const p of paras) { const s = [...stemsOf(p)].filter((w) => cs.has(w)).length; if (s > score) { best = p; score = s; } }
  return best;
}

/** First frame whose file the transcript edited (app code), else undefined. */
export function pickFrame(err: Pick<ProdError, "frames">, index: TranscriptIndex) {
  const edited = [...index.byEditedFile.keys()];
  const same = (a: string, b: string) => a === b || a.endsWith("/" + b) || b.endsWith("/" + a);
  return err.frames.find((f) => edited.some((e) => same(e, f.file.replace(/^\.\//, ""))));
}

/** Last transcript edit whose ADDED lines contain the frame line's exact text (trimmed), in the frame file. Deterministic. */
export function editThatWroteLine(index: TranscriptIndex, file: string, lineText: string): { edit_line: number; tool: string; hunk: string } | undefined {
  const want = lineText.trim(); if (!want) return undefined;
  const same = (a: string, b: string) => a === b || a.endsWith("/" + b) || b.endsWith("/" + a);
  let hit: { edit_line: number; tool: string; hunk: string } | undefined;
  for (const e of index.messages.filter((m) => m.code_written)) for (const h of parseDiffs(e.code_written!).filter((h) => same(h.file, file))) {
    const i = h.lines.findIndex((l) => l.kind === "+" && l.text.trim() === want);
    if (i >= 0) hit = { edit_line: e.line, tool: e.tool_name ?? "edit", hunk: h.lines.slice(Math.max(0, i - 6), i + 7).map((l) => l.kind + l.text).join("\n") };
  }
  return hit;
}

/**
 * `readSource(file)` returns the file as deployed when the error happened (repo checkout, or the tree replayed from the transcript).
 * The anchor edit is the one that wrote the exact frame line (by text), so later edits that shift line numbers do not break the link.
 */
export function threePieceFromTranscript(err: ProdError, index: TranscriptIndex, transcriptName: string, readSource: (file: string) => string | undefined): ThreePiece {
  const frame = pickFrame(err, index);
  if (!frame) {
    const res: ThreePiece = { schema: "why-code-exists/three-piece@1", error_id: err.id, complete: false, notes: [] };
    res.notes.push("no stack frame points at a file the agent edited in this transcript");
    return res;
  }
  return threePieceFromFrame(err, index, transcriptName, readSource, frame);
}

/**
 * Same linking as `threePieceFromTranscript`, but for an explicit `frame` rather than one picked from `err.frames`
 * (used by the LOCATE stage, src/locate/, when the report had no stack frame at all and a candidate file:line was
 * found instead). The rest of the logic — ASKED/UNDERSTOOD/HAPPENED, validity, notes — is identical either way.
 */
export function threePieceFromFrame(err: ProdError, index: TranscriptIndex, transcriptName: string, readSource: (file: string) => string | undefined, frame: { file: string; line: number; function?: string }): ThreePiece {
  const res: ThreePiece = { schema: "why-code-exists/three-piece@1", error_id: err.id, complete: false, notes: [] };
  res.frame = frame;
  const src = readSource(frame.file);
  const lineText = src?.split("\n")[frame.line - 1];
  if (lineText === undefined) { res.notes.push(`source for ${frame.file}:${frame.line} not available`); return res; }
  const wrote = editThatWroteLine(index, frame.file, lineText);
  if (!wrote) { res.notes.push(`frame line ${frame.file}:${frame.line} ("${lineText.trim().slice(0, 80)}") was not written by any edit in this transcript`); return res; }
  const prov: Provenance = findProvenance(index, frame);
  const byLine = new Map(index.messages.map((m) => [m.line, m]));
  const words = (m: SessionMessage) => textOf(m).split(/\s+/).filter(Boolean).length;

  // 1. ASKED: latest human-written user message before the edit; the paragraph most related to the written code, verbatim.
  const users = index.messages.filter((m) => m.role === "user" && m.line < wrote.edit_line && (m.text ?? "").trim() && !isMachineUserText(m.text!));
  const ask = users[users.length - 1];
  if (ask) {
    const para = mostRelevantParagraph(ask.text!, wrote.hunk + "\n" + (prov.written_at?.fn_text ?? ""));
    res.asked = { text: para, citation: `${transcriptName}#L${ask.line} (user message${users.length > 1 ? `, latest of ${users.length} before the edit` : ""})`, valid: ask.text!.includes(para), full_length: ask.text!.length };
    if (!res.asked.valid) res.asked.why_invalid = "quoted paragraph not found in the cited message";
  } else res.notes.push("no human-written user message before the edit");

  // 2. UNDERSTOOD: last assistant message with text before the edit, quoted in full.
  const prior = index.messages.filter((m) => m.role === "assistant" && m.line < wrote.edit_line && words(m) > 0);
  const last = prior[prior.length - 1];
  if (last) {
    const t = textOf(last); const n = words(last);
    res.understood = { text: t, citation: `${transcriptName}#L${last.line} (assistant, ${n} words, ${wrote.edit_line - last.line} line(s) before the edit at L${wrote.edit_line})`, valid: n >= 15, full_length: t.length };
    if (n < 15) res.understood.why_invalid = "agent wrote fewer than 15 words before the edit (silent edit)";
  } else res.notes.push("no assistant text before the edit");

  // 3. HAPPENED: the error, the frame, the exact line, and the hunk that wrote it.
  const later = index.messages.filter((m) => m.code_written && m.line > wrote.edit_line && parseDiffs(m.code_written).some((h) => (h.file === frame.file || h.file.endsWith("/" + frame.file) || frame.file.endsWith("/" + h.file)) && h.lines.some((l) => l.kind === "-" && l.text.trim() === lineText.trim()))).map((m) => m.line);
  res.happened = {
    text: `${err.message.split("\n").slice(0, 6).join("\n")}\n  at ${frame.function ?? "?"} (${frame.file}:${frame.line})\n  ${frame.line}: ${lineText.trim()}\n\nWritten by transcript edit L${wrote.edit_line} (${wrote.tool}):\n${wrote.hunk}`,
    citation: `error ${err.id} frame ${frame.file}:${frame.line}; ${transcriptName}#L${wrote.edit_line}`,
    valid: true, later_edits: later,
  };
  if (prov.written_at && prov.written_at.edit_line !== wrote.edit_line) res.notes.push(`function ${frame.function} was introduced at L${prov.written_at.edit_line}; the frame line itself was written at L${wrote.edit_line}`);
  if (later.length) res.notes.push(`later transcript edits removed this exact line: ${later.map((l) => "L" + l).join(", ")} (the deployed code still has it)`);
  res.complete = !!(res.asked?.valid && res.understood?.valid && res.happened.valid);
  return res;
}

/** GitHub variant: the PR body is the only public record of the request (Devin/Copilot put the requester and task there). */
export function threePieceFromGithub(err: { id: string; message: string; source_url: string }, prov: GithubProvenance, edit?: { file: string; lines: [number, number] }, fix?: { url: string; stated_cause?: string }): ThreePiece {
  const res: ThreePiece = { schema: "why-code-exists/three-piece@1", error_id: err.id, complete: false, notes: [] };
  const body = prov.segments.find((s) => s.kind === "pr_body");
  if (body?.text.trim()) {
    const para = body.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).slice(0, 3).join("\n\n");
    res.asked = { text: para, citation: `${body.url} (PR description by ${body.author})`, valid: true, full_length: body.text.length };
    res.notes.push("ASKED comes from the PR description, which the agent wrote: it restates the request; the human's original prompt is not public");
  }
  const commit = prov.segments.find((s) => s.kind === "commit_message" && s.text.trim());
  if (commit) res.understood = { text: commit.text.trim(), citation: commit.url, valid: true, full_length: commit.text.length };
  res.happened = { text: `${err.message}${edit ? `\n  localized to ${edit.file}:${edit.lines.join("-")} (from PR ${prov.pr?.number})` : ""}${fix ? `\n  later fix: ${fix.url}${fix.stated_cause ? ` — ${fix.stated_cause}` : ""}` : ""}`,
    citation: err.source_url, valid: !!edit, later_edits: [] };
  if (!edit) res.happened.why_invalid = "text-only error (no stack trace): no file:line localization";
  else res.notes.push("text-only error: file:line comes from the engine's ranked-commit pick, not from a stack frame");
  res.complete = !!(res.asked?.valid && res.understood?.valid && res.happened.valid);
  return res;
}
