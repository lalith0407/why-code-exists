import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { scrubObject, scrubText } from "../scrub.js";
import type { SessionMessage } from "../types.js";
import { defRegex } from "../engine/lang.js";
import { resolveTranscript } from "./claude-code.js";

export interface TranscriptIndex {
  path: string;
  messages: SessionMessage[];
  /** file path (normalized) → message lines that edited it */
  byEditedFile: Map<string, number[]>;
  scrubReplacements: number;
}

const DEFAULT_TRANSCRIPT =
  "/workspace/cloud-agent-transcripts/bc-25dab342-ff3b-5916-ae3f-7b0214f24784.jsonl";

export function defaultTranscriptPath(): string {
  return process.env.WCE_TRANSCRIPT || DEFAULT_TRANSCRIPT;
}

function normalizePath(p: string): string {
  return p
    .replace(/^\/*workspace\/+/, "")
    .replace(/^\.\//, "")
    .replace(/\\/g, "/");
}

function filesFromToolArgs(args: unknown): string[] {
  if (!args || typeof args !== "object") return [];
  const a = args as Record<string, unknown>;
  const out: string[] = [];
  for (const key of ["path", "file_path", "target_file", "file"]) {
    if (typeof a[key] === "string") out.push(normalizePath(a[key] as string));
  }
  // Write / search_replace sometimes nest under contents-only; ignore.
  return out;
}

function filesFromDiffResult(result: unknown): string[] {
  // tool_result for search_replace often embeds +++ b//workspace/...
  const s = typeof result === "string" ? result : JSON.stringify(result ?? "");
  const files = new Set<string>();
  const re = /\+\+\+ b\/+([^\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    // In a JSON-stringified result the newline is the two characters backslash + n; the path ends there (or at a quote/space).
    const path = m[1].split(/\\n|\\r|["\s]/)[0];
    if (path) files.add(normalizePath(path));
  }
  // also "path":"..."
  const pathRe = /"(?:path|file_path|target_file)"\s*:\s*"([^"]+)"/g;
  while ((m = pathRe.exec(s))) {
    files.add(normalizePath(m[1]));
  }
  return [...files];
}

const EDIT_TOOLS = /^(search_replace|edit|write|edit_file|str_replace|apply_patch|multiedit)/i;

function codeFromToolMessage(toolName: string | undefined, m: Record<string, unknown>): string | undefined {
  if (!toolName || !EDIT_TOOLS.test(toolName)) return undefined;
  const parts = [m.tool_args, m.tool_result].map((x) => (typeof x === "string" ? x : x ? JSON.stringify(x) : ""));
  const blob = parts.join("\n").replace(/\\n/g, "\n").replace(/\\"/g, '"');
  return blob.trim() ? blob.slice(0, 20000) : undefined;
}

export async function loadTranscript(path = defaultTranscriptPath()): Promise<TranscriptIndex> {
  const original = path;
  if (existsSync(path)) path = resolveTranscript(path);
  if (!existsSync(path)) {
    throw new Error(`Transcript not found: ${path}`);
  }
  const messages: SessionMessage[] = [];
  const byEditedFile = new Map<string, number[]>();
  let scrubReplacements = 0;
  let lineNo = 0;

  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const rawLine of rl) {
    lineNo += 1;
    if (!rawLine.trim()) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawLine) as Record<string, unknown>;
    } catch {
      continue;
    }
    const scrubbed = scrubObject(parsed);
    // count replacements on the raw line (cheaper than deep stats)
    scrubReplacements += scrubText(rawLine).stats.replacements;

    const role = String(scrubbed.role ?? "unknown");
    const thinking = typeof scrubbed.thinking === "string" ? scrubbed.thinking : undefined;
    const text = typeof scrubbed.text === "string" ? scrubbed.text : undefined;
    const tool_name = typeof scrubbed.tool_name === "string" ? scrubbed.tool_name : undefined;
    const tool_args = scrubbed.tool_args ?? scrubbed.tool_calls;
    const edited = new Set<string>([
      ...filesFromToolArgs(tool_args),
      ...filesFromDiffResult(scrubbed.tool_result),
    ]);
    // Also scan nested tool_calls
    if (Array.isArray(scrubbed.tool_calls)) {
      for (const tc of scrubbed.tool_calls as Array<Record<string, unknown>>) {
        for (const f of filesFromToolArgs(tc.tool_args ?? tc.arguments)) edited.add(f);
      }
    }

    const msg: SessionMessage = {
      line: lineNo,
      role,
      thinking,
      text,
      tool_name,
      tool_args,
      edited_files: [...edited],
      code_written: codeFromToolMessage(tool_name, scrubbed),
      started_at_ms: typeof scrubbed.started_at_ms === "number" ? scrubbed.started_at_ms : undefined,
      completed_at_ms: typeof scrubbed.completed_at_ms === "number" ? scrubbed.completed_at_ms : undefined,
    };
    messages.push(msg);
    for (const f of edited) {
      const list = byEditedFile.get(f) ?? [];
      list.push(lineNo);
      byEditedFile.set(f, list);
    }
  }

  return { path: original, messages, byEditedFile, scrubReplacements };
}

export function getMessage(index: TranscriptIndex, line: number): SessionMessage | undefined {
  return index.messages.find((m) => m.line === line);
}
