/**
 * Index of the agent's own edits from the session transcript (deterministic, no LLM): every ADDED line from
 * every edit-tool diff, grouped into hunks. This is the candidate universe for LOCATE layer 1 — only code the
 * agent actually wrote, since that's the strongest prior for "what the agent's edit caused".
 */
import type { TranscriptIndex } from "../session/transcript.js";
import { parseDiffs } from "../session/provenance.js";

export interface EditedHunk {
  id: string;
  file: string;
  /** Transcript line of the edit tool call that produced this hunk. */
  edit_line: number;
  tool: string;
  start: number;
  end: number;
  added: Array<{ line: number; text: string }>;
}

export function buildEditIndex(index: TranscriptIndex): EditedHunk[] {
  const out: EditedHunk[] = [];
  let n = 0;
  for (const m of index.messages) {
    if (!m.code_written) continue;
    for (const h of parseDiffs(m.code_written)) {
      const added = h.lines.filter((l) => l.kind === "+" && l.newLine !== undefined).map((l) => ({ line: l.newLine!, text: l.text }));
      if (!added.length) continue;
      out.push({ id: `L${m.line}#${n++}`, file: h.file, edit_line: m.line, tool: m.tool_name ?? "edit", start: added[0].line, end: added[added.length - 1].line, added });
    }
  }
  return out;
}

const sameFile = (a: string, b: string) => a === b || a.endsWith("/" + b) || b.endsWith("/" + a);

/**
 * The deterministic "agent wrote this" check: was (file, line[, text]) added verbatim by some edit in the index?
 * Returns the hunk that wrote it, or undefined. Used both to gate layer-1 candidates by construction and to
 * confirm a layer-2 model answer before it is trusted.
 * `line` is compared to each hunk's added-line numbers as they stand. Layer 2 projects those numbers onto
 * the current file (see `projectHunksForConfirmation`) before calling this, so a stale edit-time line does not confirm.
 */
export function wasWrittenByAgent(hunks: EditedHunk[], file: string, line: number, text?: string): EditedHunk | undefined {
  return hunks.find((h) => sameFile(h.file, file) && h.added.some((a) => a.line === line && (text === undefined || a.text.trim() === text.trim())));
}
