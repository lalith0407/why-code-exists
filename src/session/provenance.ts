/**
 * Edit provenance (deterministic, no LLM): which transcript edit WROTE the code at the error frame.
 * Scans edit tool diffs for the frame file, finds the edit whose ADDED lines define the frame function
 * (and cover the frame line when computable), then lists later edits that touch that function.
 */
import type { SessionMessage } from "../types.js";
import type { TranscriptIndex } from "./transcript.js";
import { scrubText } from "../scrub.js";
import { defRegex, functionEnd, langOf } from "../engine/lang.js";

export const SILENT_MAX_WORDS = 15;

export interface DiffHunk {
  file: string;
  newStart: number;
  /** Lines with their new-file line number (undefined for removed lines). */
  lines: Array<{ kind: "+" | "-" | " "; text: string; newLine?: number }>;
}

export interface EditTouch {
  edit_line: number;
  tool: string;
  kind: "introduced" | "modified";
  hunk_excerpt: string;
}

export interface Provenance {
  file: string;
  function?: string;
  frame_line: number;
  written_at?: {
    edit_line: number;
    tool: string;
    /** New-file line range of the function as introduced. */
    fn_range?: [number, number];
    frame_line_in_range?: boolean;
    hunk_excerpt: string;
    /** Function body exactly as introduced by this edit (added lines, scrubbed), for claim grounding. */
    fn_text: string;
  };
  reasoning_before?: { line: number; words: number; silent: boolean; excerpt: string };
  later_edits: EditTouch[];
  method: string;
  /** How the code under test was attributed to the agent session (always set when written_at is set). */
  attribution?: Attribution;
  /** Function the claim and patch target, when it differs from the frame function or comes from a fallback. */
  target?: { file: string; function: string };
  call_path?: Array<{ file: string; function: string; agent_introduced_at?: number }>;
  /** callee fallback: how the target was chosen among agent-written candidates. */
  target_choice?: { default: string; chosen: string; by: "deepest_default" | "claim_step" | "claim_step_agrees_default" | "deepest_default_pick_evidence_unverified"; candidates: string[]; evidence?: string; evidence_verified?: boolean; review?: unknown; wrong_value?: unknown };
}

const norm = (p: string) => p.replace(/^\/+/, "").replace(/^workspace\/+/, "").replace(/^\.\//, "");

/** Parse unified-diff text (as embedded in edit tool results) into hunks with new-file line numbers. */
export function parseDiffs(code: string): DiffHunk[] {
  const out: DiffHunk[] = [];
  const fileRe = /\+\+\+ b\/+([^\n"]+)\n([\s\S]*?)(?=","oldStart"|\n--- |\n\+\+\+ b\/|$)/g;
  let m: RegExpExecArray | null;
  while ((m = fileRe.exec(code))) {
    const file = norm(m[1].trim());
    const body = m[2];
    const parts = body.split(/^(?=@@ )/m);
    for (const part of parts) {
      const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@[^\n]*\n?/.exec(part);
      if (!h) continue;
      let n = Number(h[1]);
      const hunk: DiffHunk = { file, newStart: n, lines: [] };
      for (const raw of part.slice(h[0].length).split("\n")) {
        if (raw === "") continue;
        const k = raw[0];
        if (k === "+") hunk.lines.push({ kind: "+", text: raw.slice(1), newLine: n++ });
        else if (k === "-") hunk.lines.push({ kind: "-", text: raw.slice(1) });
        else if (k === " ") hunk.lines.push({ kind: " ", text: raw.slice(1), newLine: n++ });
        else if (k === "\\") continue;
      }
      out.push(hunk);
    }
  }
  return out;
}

function words(m: SessionMessage): number {
  return `${m.thinking ?? ""} ${m.text ?? ""}`.trim().split(/\s+/).filter(Boolean).length;
}

function excerpt(lines: DiffHunk["lines"], from: number, n = 14): string {
  return scrubText(
    lines
      .slice(Math.max(0, from - 2), from + n)
      .map((l) => `${l.kind}${l.text}`)
      .join("\n"),
  ).text.slice(0, 1200);
}

export function findProvenance(
  index: TranscriptIndex,
  frame: { file: string; line: number; function?: string },
): Provenance {
  const target = norm(frame.file);
  const fn = frame.function;
  const res: Provenance = { file: frame.file, function: fn, frame_line: frame.line, later_edits: [], method: "diff_scan" };
  const edits = index.messages.filter((m) => m.code_written);
  let introducedRange: [number, number] | undefined;

  for (const e of edits) {
    const hunks = parseDiffs(e.code_written!).filter((h) => h.file === target || h.file.endsWith("/" + target) || target.endsWith(h.file));
    if (!hunks.length) continue;
    for (const h of hunks) {
      const lang = langOf(target);
      const defIdx = fn ? h.lines.findIndex((l) => defRegex(fn, lang).test(l.text)) : -1;
      if (!res.written_at && defIdx >= 0 && h.lines[defIdx].kind === "+") {
        // Function body = from definition to the next top-level export/function or hunk end.
        const start = h.lines[defIdx].newLine!;
        // End of function in the new-file view (removed lines ignored), language-aware (braces / indentation).
        const view = h.lines.map((l, i) => ({ l, i })).filter((x) => x.l.kind !== "-");
        const vDef = view.findIndex((x) => x.i === defIdx);
        const vEnd = functionEnd(view.map((x) => x.l.text), vDef, lang);
        const endIdx = view[vEnd]?.i ?? h.lines.length - 1;
        const end = h.lines.slice(defIdx, endIdx + 1).reduce((a, l) => (l.newLine ? Math.max(a, l.newLine) : a), start);
        introducedRange = [start, end];
        res.attribution = "introduced_by_edit";
        res.written_at = {
          edit_line: e.line,
          tool: e.tool_name ?? "edit",
          fn_range: introducedRange,
          frame_line_in_range: frame.line >= start && frame.line <= end,
          hunk_excerpt: excerpt(h.lines, defIdx),
          fn_text: scrubText(
            h.lines
              .slice(defIdx, endIdx + 1)
              .filter((l) => l.kind !== "-")
              .map((l) => l.text)
              .join("\n"),
          ).text.slice(0, 4000),
        };
        const prior = index.messages.filter((m) => m.line < e.line && m.role === "assistant" && words(m) > 0);
        const last = prior[prior.length - 1];
        if (last) {
          const w = words(last);
          res.reasoning_before = {
            line: last.line,
            words: w,
            silent: w < SILENT_MAX_WORDS,
            excerpt: scrubText(`${last.thinking ?? ""} ${last.text ?? ""}`.trim()).text.slice(0, 240),
          };
        }
        continue;
      }
      if (res.written_at && e.line > res.written_at.edit_line && fn) {
        const touchesName = h.lines.some((l) => l.kind !== " " && l.text.includes(fn));
        const changed = h.lines.filter((l) => l.kind !== " ");
        const overlaps =
          introducedRange &&
          h.lines.some((l) => l.kind !== " " && l.newLine !== undefined && l.newLine >= introducedRange![0] && l.newLine <= introducedRange![1] + 5);
        if (touchesName || overlaps) {
          const at = Math.max(0, h.lines.findIndex((l) => l.kind !== " "));
          res.later_edits.push({ edit_line: e.line, tool: e.tool_name ?? "edit", kind: "modified", hunk_excerpt: excerpt(h.lines, at, Math.min(12, changed.length + 4)) });
          break;
        }
      }
    }
  }
  if (!res.written_at) res.method = "diff_scan(no_introducing_edit_found)";
  return res;
}

/**
 * "Why" candidates (generic): assistant messages that mention the frame function/file, or sit right before/after
 * (±3 lines) an edit that touches it (introducing edit, later edits, edits referencing it), plus keyword top-N.
 */
export function whyCandidates(
  index: TranscriptIndex,
  frame: { file: string; function?: string },
  prov: Provenance,
  keywordTop: SessionMessage[],
  max = Number(process.env.WCE_WHY_MAX || 8),
): Array<{ message: SessionMessage; reasons: string[] }> {
  const base = norm(frame.file).split("/").pop() ?? frame.file;
  const fn = frame.function;
  const reasons = new Map<number, Set<string>>();
  const add = (line: number, r: string) => (reasons.get(line) ?? reasons.set(line, new Set()).get(line)!).add(r);
  const assistant = index.messages.filter((m) => m.role === "assistant" && `${m.thinking ?? ""}${m.text ?? ""}`.trim());
  const editLines = new Set<number>([
    ...(prov.written_at ? [prov.written_at.edit_line] : []),
    ...prov.later_edits.map((e) => e.edit_line),
    ...(fn ? index.messages.filter((m) => m.code_written?.includes(fn)).map((m) => m.line) : []),
  ]);
  for (const m of assistant) {
    const blob = `${m.thinking ?? ""}\n${m.text ?? ""}`;
    if (fn && blob.includes(fn)) add(m.line, `mentions ${fn}`);
    if (blob.includes(base)) add(m.line, `mentions ${base}`);
    for (const el of editLines) {
      if (m.line < el && el - m.line <= 3) add(m.line, `right before an edit touching ${fn ?? base}`);
      if (m.line > el && m.line - el <= 3) add(m.line, `right after an edit touching ${fn ?? base}`);
    }
  }
  for (const k of keywordTop) add(k.line, "keyword match");
  const byLine = new Map(index.messages.map((m) => [m.line, m]));
  const scored = [...reasons.entries()]
    .map(([line, r]) => ({ message: byLine.get(line)!, reasons: [...r] }))
    .filter((c) => c.message)
    // Prefer more independent reasons; then substantive messages; then transcript order. No line-specific tuning.
    .sort(
      (a, b) =>
        b.reasons.length - a.reasons.length ||
        Number(words(b.message) >= SILENT_MAX_WORDS) - Number(words(a.message) >= SILENT_MAX_WORDS) ||
        a.message.line - b.message.line,
    )
    .slice(0, max);
  return scored.sort((a, b) => a.message.line - b.message.line);
}

// ---------------------------------------------------------------------------------------------------------------
// Fallback attribution (generic, deterministic, TS/JS + Python). Used when no transcript edit INTRODUCED the frame function.
//  1. callee_introduced_by_edit: walk the call path from the frame function into local functions that a transcript edit
//     introduced (any file in the tree), depth-bounded; pick the DEEPEST agent-written function on that path.
//  2. last_modified_by_edit: otherwise, the last transcript edit whose changed lines touch the frame function.
// The attribution type is always recorded so reports never present a fallback as "the agent wrote this function".
// ---------------------------------------------------------------------------------------------------------------

export type Attribution = "introduced_by_edit" | "callee_introduced_by_edit" | "last_modified_by_edit";

export interface FallbackResult {
  attribution: Exclude<Attribution, "introduced_by_edit">;
  /** The function the claim and patch target (the frame function itself for last_modified_by_edit). */
  target: { file: string; function: string };
  /** Frame function → … → target, as function names with files. */
  call_path: Array<{ file: string; function: string; agent_introduced_at?: number }>;
  edit_line: number;
  tool: string;
  hunk_excerpt: string;
  /** Every agent-introduced function reached on the call tree (depth-bounded), deepest first; the claim step may pick one. */
  candidates: Array<{ file: string; function: string; depth: number; edit_line: number; tool: string; hunk_excerpt: string; path: string[] }>;
}

const KEYWORDS = new Set(["if", "for", "while", "switch", "return", "catch", "function", "typeof", "await", "new", "def", "elif", "print", "len", "str", "int", "isinstance", "super", "not", "and", "or", "in", "lambda", "with", "assert", "yield", "async"]);

/** Names called inside a function body: `name(`, `obj.name(`, `self.name(` (generic, language-agnostic approximation). */
export function calledNames(body: string): string[] {
  const out: string[] = [];
  const lines = body.split("\n").slice(1); // skip the definition line itself
  for (const m of lines.join("\n").matchAll(/(?:^|[^\w$])([A-Za-z_$][\w$]*)\s*\(/g)) if (!KEYWORDS.has(m[1]) && !out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Every function a transcript edit introduced (its definition line is an added line): name → {file, edit}. First introduction wins. */
export function introducedFunctions(index: TranscriptIndex): Map<string, Array<{ file: string; edit_line: number; tool: string; hunk_excerpt: string }>> {
  const res = new Map<string, Array<{ file: string; edit_line: number; tool: string; hunk_excerpt: string }>>();
  for (const e of index.messages.filter((m) => m.code_written)) {
    for (const h of parseDiffs(e.code_written!)) {
      const lang = langOf(h.file);
      h.lines.forEach((l, i) => {
        if (l.kind !== "+") return;
        const m = lang === "python" ? /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(l.text)
          : /(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function|[A-Za-z_$][\w$]*\s*=>)|^\s*(?:export\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{]*)?\{\s*$)/.exec(l.text);
        const name = m && (m[1] ?? m[2] ?? m[3]);
        if (!name || KEYWORDS.has(name)) return;
        const arr = res.get(name) ?? res.set(name, []).get(name)!;
        if (!arr.some((x) => x.file === h.file)) arr.push({ file: h.file, edit_line: e.line, tool: e.tool_name ?? "edit", hunk_excerpt: excerpt(h.lines, i) });
      });
    }
  }
  return res;
}

/**
 * Deterministic fallback. `readTree(file)` returns a tree file's text (or undefined); `localFiles` are candidate files for callee
 * resolution (frame file first, then its local imports). No LLM.
 */
export function fallbackAttribution(
  index: TranscriptIndex,
  frame: { file: string; line: number; function?: string },
  readTree: (file: string) => string | undefined,
  localFiles: string[],
  extract: (src: string, fn: string, lang: ReturnType<typeof langOf>) => { text: string; range: [number, number] } | undefined,
  maxDepth = 3,
): FallbackResult | undefined {
  const fn = frame.function;
  if (!fn) return undefined;
  const frameSrc = readTree(frame.file);
  const frameEx = frameSrc ? extract(frameSrc, fn, langOf(frame.file)) : undefined;
  if (!frameEx) return undefined;
  const intro = introducedFunctions(index);
  const files = [frame.file, ...localFiles.filter((f) => f !== frame.file)];
  const sameFile = (a: string, b: string) => a === b || a.endsWith("/" + b) || b.endsWith("/" + a);

  // DFS over agent-introduced callees; keep the deepest path (ties: first found, i.e. call order).
  let best: FallbackResult["call_path"] = [];
  const cands: FallbackResult["candidates"] = [];
  const walk = (path: FallbackResult["call_path"], body: string, depth: number, seen: Set<string>) => {
    if (path.length > best.length && path.length > 1) best = [...path];
    if (path.length > 1) {
      const t = path[path.length - 1];
      if (!cands.some((c) => c.file === t.file && c.function === t.function)) {
        const h = (intro.get(t.function) ?? []).find((x) => sameFile(x.file, t.file)) ?? intro.get(t.function)![0];
        cands.push({ file: t.file, function: t.function, depth: path.length - 1, edit_line: h.edit_line, tool: h.tool, hunk_excerpt: h.hunk_excerpt, path: path.map((p) => p.function) });
      }
    }
    if (depth >= maxDepth) return;
    for (const name of calledNames(body)) {
      const hits = intro.get(name);
      if (!hits || seen.has(name)) continue;
      // Resolve to a local file that defines it in the current tree (prefer the file the edit introduced it in).
      for (const f of [...hits.map((h) => h.file), ...files]) {
        const src = readTree(f);
        const ex = src ? extract(src, name, langOf(f)) : undefined;
        if (!ex) continue;
        const h = hits.find((x) => sameFile(x.file, f)) ?? hits[0];
        walk([...path, { file: f, function: name, agent_introduced_at: h.edit_line }], ex.text, depth + 1, new Set([...seen, name]));
        break;
      }
    }
  };
  walk([{ file: frame.file, function: fn }], frameEx.text, 0, new Set([fn]));
  if (best.length > 1) {
    const t = best[best.length - 1];
    const h = (intro.get(t.function) ?? []).find((x) => sameFile(x.file, t.file)) ?? intro.get(t.function)![0];
    return { attribution: "callee_introduced_by_edit", target: { file: t.file, function: t.function }, call_path: best, edit_line: h.edit_line, tool: h.tool, hunk_excerpt: h.hunk_excerpt,
      candidates: [...cands].sort((a, b) => b.depth - a.depth).slice(0, 8) };
  }

  // last_modified_by_edit: last edit on the frame file whose changed lines name the function or fall inside its current range.
  let last: FallbackResult | undefined;
  for (const e of index.messages.filter((m) => m.code_written)) {
    for (const h of parseDiffs(e.code_written!).filter((h) => sameFile(h.file, norm(frame.file)))) {
      const at = h.lines.findIndex((l) => l.kind !== " " && (l.text.includes(fn) || (l.newLine !== undefined && l.newLine >= frameEx.range[0] && l.newLine <= frameEx.range[1])));
      if (at >= 0) { last = { attribution: "last_modified_by_edit", target: { file: frame.file, function: fn }, call_path: [{ file: frame.file, function: fn }], edit_line: e.line, tool: e.tool_name ?? "edit", hunk_excerpt: excerpt(h.lines, at), candidates: [] }; break; }
    }
  }
  return last;
}
