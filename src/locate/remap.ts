/**
 * Map an edit-time line onto the current file by content. Later edits shift line numbers, so an
 * edit-time line must not be reported as the current line unless the added text is still there.
 * Shared by layer 1, layer 2 (before `wasWrittenByAgent`), and the explain-stage verifier.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { EditedHunk } from "./edits.js";
import type { LineAnchor } from "./types.js";

/**
 * How many adjacent added lines form a window anchor.
 * Generic: three lines identify a shifted hunk, and stay short enough not to glue unrelated copies together.
 */
export const REMAP_WINDOW = 3;

export interface RemapHit {
  /** 1-based line in the current file, or 0 when unanchored (the stale number is not returned). */
  line: number;
  anchor: LineAnchor;
}

const normWs = (s: string) => s.replace(/\s+/g, " ").trim();

export function splitSourceLines(source: string): string[] {
  return source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/** Closest current line to the edit-time line. Ties break toward the earlier line, which is stable. */
function nearest(positions: number[], origin: number): number {
  let best = positions[0];
  let bestD = Math.abs(best - origin);
  for (const p of positions) {
    const d = Math.abs(p - origin);
    if (d < bestD || (d === bestD && p < best)) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

function exactPositions(lines: string[], text: string): number[] {
  const hits: number[] = [];
  for (let i = 0; i < lines.length; i++) if (lines[i] === text) hits.push(i + 1);
  return hits;
}

/** The added lines centered on `editTimeLine`, at most `REMAP_WINDOW` long. */
export function neighbourWindow(
  added: Array<{ line: number; text: string }>,
  editTimeLine: number,
): Array<{ line: number; text: string }> {
  const sorted = [...added].sort((a, b) => a.line - b.line);
  let idx = sorted.findIndex((a) => a.line === editTimeLine);
  if (idx < 0) idx = 0;
  const radius = Math.floor((REMAP_WINDOW - 1) / 2);
  return sorted.slice(Math.max(0, idx - radius), Math.min(sorted.length, idx + radius + 1));
}

function windowPositions(
  lines: string[],
  editTimeLine: number,
  neighbours: Array<{ line: number; text: string }>,
  targetText: string,
): number[] {
  const window = neighbourWindow(neighbours.length ? neighbours : [{ line: editTimeLine, text: targetText }], editTimeLine);
  if (!window.length) return [];
  const norms = window.map((w) => normWs(w.text));
  if (norms.some((n) => !n)) return [];
  let targetOffset = window.findIndex((w) => w.line === editTimeLine);
  if (targetOffset < 0) targetOffset = window.findIndex((w) => w.text === targetText);
  if (targetOffset < 0) return [];
  const hits: number[] = [];
  const n = norms.length;
  for (let start = 0; start + n <= lines.length; start++) {
    let ok = true;
    for (let j = 0; j < n; j++) {
      if (normWs(lines[start + j]) !== norms[j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(start + targetOffset + 1);
  }
  return hits;
}

/**
 * Exact match of `addedText` (nearest occurrence to `editTimeLine`), then a whitespace-normalised
 * window of neighbouring added lines. No match → `{ line: 0, anchor: "unanchored" }`.
 */
export function remapEditLine(
  source: string | undefined,
  editTimeLine: number,
  addedText: string,
  neighbours?: Array<{ line: number; text: string }>,
): RemapHit {
  if (source === undefined || !addedText.trim()) return { line: 0, anchor: "unanchored" };
  const lines = splitSourceLines(source);
  const exact = exactPositions(lines, addedText);
  if (exact.length) return { line: nearest(exact, editTimeLine), anchor: "exact" };
  const around = neighbours && neighbours.length ? neighbours : [{ line: editTimeLine, text: addedText }];
  const win = windowPositions(lines, editTimeLine, around, addedText);
  if (win.length) return { line: nearest(win, editTimeLine), anchor: "window" };
  return { line: 0, anchor: "unanchored" };
}

/** Read a repo-relative file. Undefined when `file` escapes `root` or is missing — never a stale stand-in. */
export function readRepoFile(root: string, file: string): string | undefined {
  const p = resolve(root, file.replace(/^\/+/, ""));
  const rel = relative(root, p);
  if (rel === "" || rel.startsWith("..") || rel.startsWith("/")) return undefined;
  try {
    if (!existsSync(p) || !statSync(p).isFile()) return undefined;
    return readFileSync(p, "utf8");
  } catch {
    return undefined;
  }
}

export interface ProjectedHunks {
  hunks: EditedHunk[];
  /** Keyed by `${hunkId}:${currentLine}` for lines that anchored. */
  meta: Map<string, { editTimeLine: number; anchor: Exclude<LineAnchor, "unanchored">; text: string }>;
}

/**
 * Assign each added line its own current line. Most-constrained exact matches go first so two copies
 * of the same text do not both claim the occurrence nearest a single origin.
 */
function assignAddedLines(
  source: string,
  added: Array<{ line: number; text: string }>,
): Map<number, { line: number; anchor: Exclude<LineAnchor, "unanchored"> }> {
  const lines = splitSourceLines(source);
  const used = new Set<number>();
  const result = new Map<number, { line: number; anchor: Exclude<LineAnchor, "unanchored"> }>();
  const exactOpts = added.map((a, i) => ({
    i,
    origin: a.line,
    opts: a.text.trim() ? exactPositions(lines, a.text) : [],
  }));
  exactOpts.sort((a, b) => a.opts.length - b.opts.length || a.origin - b.origin);
  for (const item of exactOpts) {
    const free = item.opts.filter((p) => !used.has(p));
    if (!free.length) continue;
    const line = nearest(free, item.origin);
    used.add(line);
    result.set(item.i, { line, anchor: "exact" });
  }
  const pending = added.map((a, i) => ({ a, i })).filter(({ i }) => !result.has(i));
  pending.sort((x, y) => x.a.line - y.a.line);
  for (const { a, i } of pending) {
    if (!a.text.trim()) continue;
    const opts = windowPositions(lines, a.line, added, a.text).filter((p) => !used.has(p));
    if (!opts.length) continue;
    const line = nearest(opts, a.line);
    used.add(line);
    result.set(i, { line, anchor: "window" });
  }
  return result;
}

/**
 * Project every hunk's added lines onto the current tree before `wasWrittenByAgent`.
 * Lines that no longer match are dropped, so a stale edit-time number cannot confirm.
 */
export function projectHunksForConfirmation(root: string, hunks: EditedHunk[]): ProjectedHunks {
  const meta: ProjectedHunks["meta"] = new Map();
  const projected = hunks.map((h) => {
    const source = readRepoFile(root, h.file);
    if (source === undefined) return { ...h, added: [] as EditedHunk["added"] };
    const assigned = assignAddedLines(source, h.added);
    const added: EditedHunk["added"] = [];
    for (let i = 0; i < h.added.length; i++) {
      const hit = assigned.get(i);
      if (!hit) continue;
      added.push({ line: hit.line, text: h.added[i].text });
      meta.set(`${h.id}:${hit.line}`, { editTimeLine: h.added[i].line, anchor: hit.anchor, text: h.added[i].text });
    }
    added.sort((a, b) => a.line - b.line);
    return { ...h, added };
  });
  return { hunks: projected, meta };
}
