/**
 * Deterministic context builder for the "explain why" stage (no LLM, no per-case logic).
 * From the existing linker output (a `ThreePiece`, its frame, and the transcript edit that wrote the frame line),
 * assembles: the symptom, the edited hunk with ±N lines of its file, the files the edit's function calls or is
 * called by (plain static search over the checked-out/reconstructed tree), the three pieces, and transcript
 * windows around the edit and around any later agent reasoning that mentions the touched identifiers.
 * Respects a character budget (a cheap proxy for a token budget): lowest-priority sections are dropped first,
 * and `budget.truncated`/`dropped_sections` record exactly what happened. Ground-truth lookup maps
 * (`ground_truth.code_lines` / `ground_truth.transcript_lines`) are built from the FULL file / FULL transcript,
 * independent of what made it into the (budgeted) prompt, so the verifier can check any citation the model makes,
 * not only the lines it happened to be shown.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { ProdError, SessionMessage } from "../types.js";
import type { TranscriptIndex } from "../session/transcript.js";
import type { ThreePiece } from "../story/three-piece.js";
import { defRegex } from "../engine/lang.js";

export const EXPLAIN_SYSTEM_PROMPT =
  "You are investigating a bug in an application that was written by an AI coding agent. You are given: the symptom " +
  "(the error or bug report), the agent's edit (a diff hunk) and the surrounding code, files the edited function calls " +
  "or is called by, three linked pieces (what the agent was asked, what it said right before the edit, and what " +
  "happened), and windows of the agent's session transcript (each physical line labelled Lnnn; a message with internal " +
  "newlines shows the same Lnnn on every continuation line).\n\n" +
  "Task: work out what the coding agent overlooked - the specific wrong assumption or missed case in its thinking that " +
  "led to this error. Use the transcript to find what the agent believed, and the code to confirm how that belief " +
  "produces the error. This is a generic task: do not rely on anything specific to one project or bug.\n\n" +
  'Answer with ONLY one JSON object: {"overlooked_assumption": "<one sentence>", "evidence": [{"kind": "transcript"|"code", ' +
  '"file": "<path under the code window, empty for transcript evidence>", "line": <Lnnn number or source line number>, ' +
  '"quote": "<verbatim text copied from that line>"}], "why_it_breaks": "<how that assumption leads to the observed error>", ' +
  '"confidence": "high"|"medium"|"low"}.\n' +
  "Every quote must be copied EXACTLY (it is checked as a substring of the cited line). Include at least one transcript " +
  "quote and at least one code quote. If the user payload contains candidate_locations, each entry is a labelled place " +
  "the bug might live; you may ground the code quote on any one of them, copying that entry's file and current line. " +
  "If you cannot ground it, say so honestly with confidence \"low\"; never guess silently.";

export interface FileWindow {
  path: string;
  start: number;
  end: number;
  /** Rendered as "123: <text>" per line, for the prompt. */
  text: string;
}

export interface TranscriptWindow {
  label: string;
  start_line: number;
  end_line: number;
  /** Rendered "Lnnn [...] ..." blocks, for the prompt. */
  text: string;
}

export interface RelatedFile extends FileWindow {
  relation: "calls" | "called_by";
}

export interface ExplainContext {
  schema: "why-code-exists/explain-context@1";
  symptom: string;
  edit: { file: string; line: number; edit_line: number; tool: string; hunk: string };
  edit_window: FileWindow;
  related: RelatedFile[];
  three_piece: { asked?: string; understood?: string; happened?: string };
  transcript_windows: TranscriptWindow[];
  prompt: { system: string; user: Record<string, unknown> };
  budget: { max_chars: number; used_chars: number; truncated: boolean; dropped_sections: string[] };
  /** Ground truth for the verifier: FULL file lines (frame file + any related file actually read) and the FULL transcript, keyed the same way citations are. Independent of prompt trimming. */
  ground_truth: {
    code_lines: Record<string, Record<number, string>>;
    transcript_lines: Record<number, string>;
  };
}

/** Code citations are normalized by stripping one leading "src/" (and a leading "./"), matching the verifier. */
export function normalizeCodePath(p: string): string {
  return p.replace(/^\.\//, "").replace(/^src\//, "");
}

const SKIP_DIRS = new Set([".git", "node_modules", ".venv", "venv", "dist", "build", ".next", "vendor", "coverage", ".turbo", "__pycache__", ".cache", "artifacts", "data"]);
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py)$/;

function listSourceFiles(root: string, maxFiles = 4000): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length && out.length < maxFiles) {
    const dir = stack.pop()!;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      if (out.length >= maxFiles) break;
      const p = join(dir, name);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) { if (!SKIP_DIRS.has(name) && !name.startsWith(".")) stack.push(p); continue; }
      if (SOURCE_EXT.test(name)) out.push(p);
    }
  }
  return out.map((p) => relative(root, p));
}

const KEYWORDS = new Set(["if", "for", "while", "switch", "return", "catch", "function", "typeof", "await", "new", "def", "elif", "print", "len", "str", "int", "isinstance", "super", "not", "and", "or", "in", "lambda", "with", "assert", "yield", "async", "const", "let", "var", "class", "export", "import", "from", "this", "self", "true", "false", "null", "none", "undefined"]);

/** Names called in the lines an edit ADDED (generic approximation: `name(`), from a unified-diff-style hunk excerpt. */
export function callIdentifiersInHunk(hunk: string): string[] {
  const out: string[] = [];
  for (const line of hunk.split("\n")) {
    if (!line.startsWith("+")) continue;
    for (const m of line.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]{3,})\s*\(/g)) {
      const name = m[1];
      if (!KEYWORDS.has(name.toLowerCase()) && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

/** Plain identifiers (>=4 chars) mentioned anywhere in free text, for matching transcript reasoning to the touched code. */
function identifiersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z_][A-Za-z0-9_]{3,}/g)) {
    const w = m[0];
    if (!KEYWORDS.has(w.toLowerCase())) out.add(w);
  }
  return out;
}

function clipWindow(total: number, center: number, n: number): [number, number] {
  return [Math.max(1, center - n), Math.min(total, center + n)];
}

function renderFileWindow(path: string, lines: string[], start: number, end: number): FileWindow {
  const text = lines.slice(start - 1, end).map((t, i) => `${start + i}: ${t}`).join("\n");
  return { path, start, end, text };
}

function findDefiningFile(root: string, files: string[], name: string, excludeFile: string): { path: string; line: number; lines: string[] } | undefined {
  const re = defRegex(name, "unknown");
  for (const f of files) {
    if (f === excludeFile) continue;
    let src: string; try { src = readFileSync(join(root, f), "utf8"); } catch { continue; }
    const lines = src.split("\n");
    const i = lines.findIndex((l) => re.test(l));
    if (i >= 0) return { path: f, line: i + 1, lines };
  }
  return undefined;
}

function findCallSites(root: string, files: string[], name: string, excludeFile: string, max: number): Array<{ path: string; line: number; lines: string[] }> {
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(`);
  const out: Array<{ path: string; line: number; lines: string[] }> = [];
  for (const f of files) {
    if (f === excludeFile || out.length >= max) continue;
    let src: string; try { src = readFileSync(join(root, f), "utf8"); } catch { continue; }
    const lines = src.split("\n");
    const i = lines.findIndex((l) => re.test(l));
    if (i >= 0) out.push({ path: f, line: i + 1, lines });
  }
  return out;
}

/** The rendered Lnnn block for one transcript message, and the plain (unmarked) body text used for citation checks. */
function renderMessage(m: SessionMessage): { rendered: string; body: string } {
  const parts: string[] = [];
  if (m.thinking) parts.push(`THINKING: ${m.thinking}`);
  if (m.text) parts.push(m.text);
  if (m.tool_name) parts.push(`TOOL: ${m.tool_name}${m.tool_args !== undefined ? " " + safeJson(m.tool_args) : ""}`);
  if (m.code_written) parts.push(`CODE_WRITTEN: ${m.code_written.slice(0, 1500)}`);
  const body = parts.join("\n") || "(empty message)";
  const rendered = `L${m.line} [${m.role}] ${body.split("\n").join(`\nL${m.line}| `)}`;
  return { rendered, body };
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v).slice(0, 500); } catch { return String(v).slice(0, 500); }
}

function renderMessages(ms: SessionMessage[], label: string): TranscriptWindow {
  return { label, start_line: ms[0]?.line ?? 0, end_line: ms.at(-1)?.line ?? 0, text: ms.map((m) => renderMessage(m).rendered).join("\n") };
}

export interface BuildContextOpts {
  fileWindowLines?: number;
  relatedWindowLines?: number;
  maxRelatedFiles?: number;
  editMessageWindow?: number;
  reasoningMessageWindow?: number;
  maxTranscriptWindows?: number;
  maxChars?: number;
}

/** One labelled LOCATE candidate included in the explain prompt. The reasoner may quote any of them. */
export interface ExplainLocation {
  label: string;
  file: string;
  line: number;
  function?: string;
  score?: number;
  role?: string;
  role_weight?: number;
  anchor?: string;
  method?: string;
  text?: string;
  snippet?: string;
}

export interface BuildContextInput {
  error: Pick<ProdError, "message" | "severity" | "service">;
  frame: { file: string; line: number; function?: string };
  wrote: { edit_line: number; tool: string; hunk: string };
  index: TranscriptIndex;
  piece: ThreePiece;
  readSource: (file: string) => string | undefined;
  root?: string;
  opts?: BuildContextOpts;
  /** Top LOCATE candidates, already remapped. Omitted for a normal stack-frame explain. */
  locations?: ExplainLocation[];
}

export function buildExplainContext(input: BuildContextInput): ExplainContext {
  const { error, frame, wrote, index, piece, readSource, root } = input;
  const o = {
    fileWindowLines: input.opts?.fileWindowLines ?? Number(process.env.WCE_EXPLAIN_WINDOW_LINES || 20),
    relatedWindowLines: input.opts?.relatedWindowLines ?? 12,
    maxRelatedFiles: input.opts?.maxRelatedFiles ?? 4,
    editMessageWindow: input.opts?.editMessageWindow ?? 3,
    reasoningMessageWindow: input.opts?.reasoningMessageWindow ?? 1,
    maxTranscriptWindows: input.opts?.maxTranscriptWindows ?? Number(process.env.WCE_EXPLAIN_MAX_WINDOWS || 6),
    maxChars: input.opts?.maxChars ?? Number(process.env.WCE_EXPLAIN_CONTEXT_MAX_CHARS || 16000),
  };
  const dropped: string[] = [];
  const codeLines: Record<string, Record<number, string>> = {};
  const file = normalizeCodePath(frame.file);

  // 1. symptom
  const symptom = (error.message ?? "").trim().slice(0, 4000);

  // 2. the edited hunk ± N lines of its file
  const source = readSource(frame.file);
  const srcLines = source !== undefined ? source.split("\n") : [];
  if (source !== undefined) codeLines[file] = Object.fromEntries(srcLines.map((t, i) => [i + 1, t]));
  const [ws, we] = source !== undefined ? clipWindow(srcLines.length, frame.line, o.fileWindowLines) : [frame.line, frame.line];
  const editWindow = source !== undefined ? renderFileWindow(file, srcLines, ws, we) : { path: file, start: frame.line, end: frame.line, text: "(source not available)" };

  // Alternate LOCATE candidates: full file lines go into ground truth so a quote on any of them can verify.
  const locations = input.locations ?? [];
  for (const loc of locations) {
    const path = normalizeCodePath(loc.file);
    if (codeLines[path]) continue;
    const raw = readSource(loc.file);
    if (raw === undefined) continue;
    const ls = raw.split("\n");
    codeLines[path] = Object.fromEntries(ls.map((t, i) => [i + 1, t]));
  }
  const candidateLocations = locations.map((loc) => {
    const path = normalizeCodePath(loc.file);
    const raw = readSource(loc.file);
    const ls = raw?.split("\n") ?? [];
    let text = loc.snippet ?? loc.text ?? "";
    // A few lines around the labelled line is enough to copy a quote; the primary edit window stays larger.
    const candidateWindowLines = 5;
    if (raw && loc.line > 0) {
      const [a, b] = clipWindow(ls.length, loc.line, candidateWindowLines);
      text = renderFileWindow(path, ls, a, b).text;
    } else if (loc.anchor === "unanchored") {
      text = "(unanchored)";
    }
    return {
      label: loc.label,
      file: path,
      line: loc.line,
      function: loc.function,
      role: loc.role,
      role_weight: loc.role_weight,
      anchor: loc.anchor,
      score: loc.score,
      method: loc.method,
      text,
    };
  });

  // 3. related files: what the edit's function calls, and who calls it (simple static search; generic, no per-case rules)
  const related: RelatedFile[] = [];
  const hunkIdentifiers = callIdentifiersInHunk(wrote.hunk);
  // The definition line itself ("function NAME(" / "NAME(" at top of a method) can match a bare call pattern too;
  // exclude the frame's own function name from "what it calls" so it is not treated as calling itself.
  const callTargets = hunkIdentifiers.filter((n) => n !== frame.function);
  if (root) {
    const files = listSourceFiles(root);
    for (const name of callTargets) {
      if (related.length >= o.maxRelatedFiles) break;
      const hit = findDefiningFile(root, files, name, file);
      if (!hit || related.some((r) => r.path === hit.path)) continue;
      const [a, b] = clipWindow(hit.lines.length, hit.line, o.relatedWindowLines);
      codeLines[normalizeCodePath(hit.path)] = Object.fromEntries(hit.lines.map((t, i) => [i + 1, t]));
      related.push({ ...renderFileWindow(hit.path, hit.lines, a, b), relation: "calls" });
    }
    if (frame.function) {
      for (const hit of findCallSites(root, files, frame.function, file, o.maxRelatedFiles)) {
        if (related.length >= o.maxRelatedFiles || related.some((r) => r.path === hit.path)) continue;
        const [a, b] = clipWindow(hit.lines.length, hit.line, o.relatedWindowLines);
        codeLines[normalizeCodePath(hit.path)] = Object.fromEntries(hit.lines.map((t, i) => [i + 1, t]));
        related.push({ ...renderFileWindow(hit.path, hit.lines, a, b), relation: "called_by" });
      }
    }
  } else {
    dropped.push("related_files (no repo root available for static search)");
  }

  // 4. the three pieces, verbatim but bounded
  const cap = (s?: string) => (s ? s.slice(0, 2500) : undefined);
  const threePiece = { asked: cap(piece.asked?.text), understood: cap(piece.understood?.text), happened: cap(piece.happened?.text) };

  // 5. transcript windows: around the edit, and around any later reasoning that mentions touched identifiers
  const byLine = new Map(index.messages.map((m) => [m.line, m]));
  const inRange = (a: number, b: number) => index.messages.filter((m) => m.line >= a && m.line <= b);
  const [es, ee] = [wrote.edit_line - o.editMessageWindow, wrote.edit_line + o.editMessageWindow];
  const editW = { start: Math.max(1, es), end: ee, label: `around the edit (L${wrote.edit_line})`, mandatory: true };
  const windows: Array<{ start: number; end: number; label: string; mandatory: boolean }> = [editW];

  const mentionTargets = new Set([...hunkIdentifiers, ...(frame.function ? [frame.function] : [])]);
  for (const name of mentionTargets) {
    if (windows.length >= o.maxTranscriptWindows) break;
    for (const m of index.messages) {
      if (windows.length >= o.maxTranscriptWindows) break;
      if (m.role === "tool") continue;
      const blob = `${m.thinking ?? ""}\n${m.text ?? ""}`;
      if (!identifiersIn(blob).has(name)) continue;
      if (windows.some((w) => m.line >= w.start && m.line <= w.end)) continue; // the reasoning message itself is already shown in an existing window
      const a = Math.max(1, m.line - o.reasoningMessageWindow), b = m.line + o.reasoningMessageWindow;
      windows.push({ start: a, end: b, label: `reasoning mentioning "${name}" (L${m.line})`, mandatory: false });
    }
  }
  windows.sort((a, b) => a.start - b.start); // chronological, for display

  // Ground truth for the verifier: the FULL transcript (every message), independent of what was trimmed into the prompt.
  const transcriptLines: Record<number, string> = {};
  for (const m of index.messages) transcriptLines[m.line] = renderMessage(m).body;
  void byLine; // kept for clarity of intent; not otherwise needed

  // 6. token budget (char proxy): drop lowest-priority sections first — related files, then reasoning transcript windows
  // farthest from the edit — until under budget. The mandatory "around the edit" window and the code window are never dropped.
  let relatedLive = related.slice();
  let windowsLive = windows.slice();
  const renderUser = () => ({
    symptom,
    edit: { file, line: frame.line, hunk: wrote.hunk },
    code_window: editWindow.text,
    ...(candidateLocations.length ? { candidate_locations: candidateLocations } : {}),
    related_files: relatedLive.map((r) => ({ path: r.path, relation: r.relation, text: r.text })),
    three_piece: threePiece,
    transcript_windows: windowsLive.map((w) => ({ label: w.label, text: renderMessages(inRange(w.start, w.end), w.label).text })),
  });
  let used = JSON.stringify(renderUser()).length + EXPLAIN_SYSTEM_PROMPT.length;
  let truncated = false;
  while (used > o.maxChars && relatedLive.length > 0) {
    const removed = relatedLive.pop()!; // related files carry no mandatory element; drop lowest search priority first
    dropped.push(`related_file:${removed.path} (over budget)`);
    truncated = true;
    used = JSON.stringify(renderUser()).length + EXPLAIN_SYSTEM_PROMPT.length;
  }
  while (used > o.maxChars && windowsLive.length > 1) {
    let worst = -1, worstDist = -1;
    for (let i = 0; i < windowsLive.length; i++) {
      if (windowsLive[i].mandatory) continue;
      const d = Math.abs(windowsLive[i].start - wrote.edit_line);
      if (d > worstDist) { worstDist = d; worst = i; }
    }
    if (worst < 0) break;
    const [removed] = windowsLive.splice(worst, 1);
    dropped.push(`transcript_window:${removed.label} (over budget)`);
    truncated = true;
    used = JSON.stringify(renderUser()).length + EXPLAIN_SYSTEM_PROMPT.length;
  }
  const transcriptWindows: TranscriptWindow[] = windowsLive.map((w) => renderMessages(inRange(w.start, w.end), w.label));
  const user = renderUser();

  return {
    schema: "why-code-exists/explain-context@1",
    symptom,
    edit: { file, line: frame.line, edit_line: wrote.edit_line, tool: wrote.tool, hunk: wrote.hunk },
    edit_window: editWindow,
    related: relatedLive,
    three_piece: threePiece,
    transcript_windows: transcriptWindows,
    prompt: { system: EXPLAIN_SYSTEM_PROMPT, user },
    budget: { max_chars: o.maxChars, used_chars: used, truncated, dropped_sections: dropped },
    ground_truth: { code_lines: codeLines, transcript_lines: transcriptLines },
  };
}

/** Whether a repo/tree root looks usable for the related-files static search (exists and is a directory). */
export function usableRoot(root?: string): boolean {
  return !!root && existsSync(root) && statSync(root).isDirectory();
}
