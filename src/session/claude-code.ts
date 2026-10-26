/**
 * Claude Code transcript support. Claude Code writes one JSON object per line: {type: "user"|"assistant"|..., cwd, message: {role, content: [...]}}
 * where assistant content blocks are {type:"text"}, {type:"thinking"} or {type:"tool_use", id, name, input}, and tool results come back in a later
 * user line as {type:"tool_result", tool_use_id, is_error?, content}. Edit tools: Write {file_path, content}, Edit {file_path, old_string,
 * new_string, replace_all?}, MultiEdit {file_path, edits:[{old_string,new_string,replace_all?}]}; Read {file_path, offset?, limit?} returns
 * `cat -n` style text.
 *
 * The engine's provenance and tree replay read the internal (Cursor-style) record shape. This module converts a Claude Code file into that shape
 * with exactly ONE output line per input line, so every transcript line number the engine reports is the line number in the original file.
 * File states are tracked while converting so each edit becomes a real unified diff of the file it changed. Edits whose tool_result is an error
 * are not applied. Edits to files whose prior content is unknown (never written or fully read in the session) are emitted without a diff and
 * reported by tree replay as "edit to a file not created in the transcript", the same as for Cursor transcripts.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Block = { type?: string; text?: string; thinking?: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; is_error?: boolean; content?: unknown };

export function isClaudeCodeLine(o: unknown): boolean {
  const x = o as { type?: unknown; message?: { content?: unknown }; role?: unknown };
  return !!x && typeof x === "object" && typeof x.type === "string" && x.role === undefined && !!x.message && typeof x.message === "object";
}

/** True when the first parseable records look like Claude Code. */
export function isClaudeCodeTranscript(path: string): boolean {
  const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim()).slice(0, 50);
  let cc = 0, other = 0;
  for (const l of lines) { try { const o = JSON.parse(l); if (o && typeof o === "object" && "role" in o) other++; else if (o?.message && typeof o.type === "string") cc++; } catch { /* skip */ } }
  return cc > 0 && other === 0;
}

const blocks = (o: { message?: { content?: unknown } }): Block[] => {
  const c = o.message?.content;
  return Array.isArray(c) ? (c as Block[]) : typeof c === "string" ? [{ type: "text", text: c }] : [];
};
const resultText = (c: unknown): string => (typeof c === "string" ? c : Array.isArray(c) ? c.map((b) => (typeof b === "string" ? b : (b as Block)?.text ?? "")).join("\n") : "");

/** Strip `cat -n` prefixes ("     12\t" or "    12→") from a Read result. Returns undefined if any non-empty line lacks one. */
export function stripCatN(s: string): string | undefined {
  const out: string[] = [];
  for (const l of s.replace(/\n$/, "").split("\n")) {
    const m = /^\s*\d+(?:\t|→)(.*)$/.exec(l);
    if (!m) { if (l.trim() === "") { out.push(""); continue; } return undefined; }
    out.push(m[1]);
  }
  return out.join("\n");
}

export function relPath(p: string, cwd?: string): string {
  let r = p;
  if (cwd && r.startsWith(cwd.replace(/\/+$/, "") + "/")) r = r.slice(cwd.replace(/\/+$/, "").length + 1);
  return r.replace(/^\.\//, "");
}

export function wholeFileDiff(file: string, before: string | undefined, after: string): string {
  const neu = after.split("\n");
  if (before === undefined) return [`--- /dev/null`, `+++ b/${file}`, `@@ -0,0 +1,${neu.length} @@`, ...neu.map((l) => "+" + l)].join("\n");
  const old = before.split("\n");
  return [`--- a/${file}`, `+++ b/${file}`, `@@ -1,${old.length} +1,${neu.length} @@`, ...old.map((l) => "-" + l), ...neu.map((l) => "+" + l)].join("\n");
}

function applyEdit(text: string, oldS: string, newS: string, all?: boolean): string | undefined {
  if (!oldS) return undefined;
  const n = text.split(oldS).length - 1;
  if (n === 0 || (n > 1 && !all)) return undefined;
  return all ? text.split(oldS).join(newS) : text.replace(oldS, () => newS);
}

/** Convert Claude Code JSONL text to internal-shape JSONL text, one output line per input line. */
export function convertClaudeCode(src: string): string {
  const raw = src.split("\n");
  const parsed = raw.map((l) => { try { return l.trim() ? JSON.parse(l) : undefined; } catch { return undefined; } });
  const errored = new Set<string>(), results = new Map<string, string>();
  for (const o of parsed) if (o) for (const b of blocks(o)) if (b.type === "tool_result" && b.tool_use_id) { if (b.is_error) errored.add(b.tool_use_id); results.set(b.tool_use_id, resultText(b.content)); }
  const state = new Map<string, string>();
  return parsed.map((o) => {
    if (!o || !isClaudeCodeLine(o)) return "{}";
    const bs = blocks(o);
    const text = bs.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n") || undefined;
    const thinking = bs.filter((b) => b.type === "thinking").map((b) => b.thinking ?? "").join("\n") || undefined;
    const tools = bs.filter((b) => b.type === "tool_use");
    const at = typeof o.timestamp === "string" ? Date.parse(o.timestamp) : undefined;
    const base: Record<string, unknown> = { role: o.type === "assistant" ? "assistant" : o.type === "user" ? "user" : String(o.type), text, thinking, started_at_ms: at, source_format: "claude-code" };
    if (!tools.length) return JSON.stringify(base);
    const chunks: Array<{ diffString: string }> = [];
    let readSeed: { target_file: string; contents: string } | undefined;
    for (const t of tools) {
      const inp = t.input ?? {};
      const fp = typeof inp.file_path === "string" ? relPath(inp.file_path, o.cwd) : undefined;
      if (!fp || (t.id && errored.has(t.id))) continue;
      if (t.name === "Read" && inp.offset == null && inp.limit == null && !state.has(fp)) {
        const c = stripCatN(results.get(t.id ?? "") ?? "");
        if (c !== undefined) { state.set(fp, c); readSeed = { target_file: fp, contents: c }; }
        continue;
      }
      const before = state.get(fp);
      let after: string | undefined;
      if (t.name === "Write" && typeof inp.content === "string") after = inp.content;
      else if (t.name === "Edit" && before !== undefined) after = applyEdit(before, String(inp.old_string ?? ""), String(inp.new_string ?? ""), Boolean(inp.replace_all));
      else if (t.name === "MultiEdit" && before !== undefined && Array.isArray(inp.edits)) {
        after = before;
        for (const e of inp.edits as Array<Record<string, unknown>>) { after = after === undefined ? undefined : applyEdit(after, String(e.old_string ?? ""), String(e.new_string ?? ""), Boolean(e.replace_all)); }
      }
      if (after === undefined) continue;
      chunks.push({ diffString: wholeFileDiff(fp, t.name === "Write" && before === undefined ? undefined : before, after) });
      state.set(fp, after);
    }
    const first = tools[0];
    const name = first.name === "Write" ? "write" : first.name === "Edit" ? "search_replace" : first.name === "MultiEdit" ? "multiedit" : first.name === "Read" ? "read_file" : String(first.name);
    const args = { ...(first.input ?? {}), ...(typeof first.input?.file_path === "string" ? { target_file: relPath(first.input.file_path as string, o.cwd) } : {}) };
    if (readSeed && !chunks.length) return JSON.stringify({ ...base, role: "tool", tool_name: "read_file", tool_args: { target_file: readSeed.target_file }, tool_result: { value: { contents: readSeed.contents } } });
    return JSON.stringify({ ...base, role: "tool", tool_name: name, tool_args: args, tool_calls: tools.slice(1).map((t) => ({ tool_name: t.name, tool_args: t.input })), tool_result: chunks.length ? { value: { diff: { chunks } } } : undefined });
  }).join("\n");
}

/** Path the engine should read: the file itself, or (for Claude Code) a converted copy with identical line numbering, cached by content hash. */
export function resolveTranscript(path: string): string {
  if (!existsSync(path) || !isClaudeCodeTranscript(path)) return path;
  const src = readFileSync(path, "utf8");
  const dir = join(tmpdir(), "wce-claude-code");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, createHash("sha256").update(src).digest("hex").slice(0, 16) + ".jsonl");
  if (!existsSync(out)) writeFileSync(out, convertClaudeCode(src));
  return out;
}
