/**
 * Layer 2 (optional, model-assisted): a bounded loop of at most N tool steps over the provider interface in
 * src/llm/providers.ts (via the shared llmJson transport). Tools are read-only and sandboxed to the case
 * directory: grep(pattern), read(file, start, end), list_edits(). The model proposes a culprit file:line; a
 * deterministic check (wasWrittenByAgent) confirms the line exists and was written by an agent edit before it
 * is trusted — the model's say-so alone is never enough. Every tool call is recorded for auditability. No live
 * model calls are made in tests; without credentials this reports "no credentials" plainly and layer 1's
 * output is used instead.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { llmJson, obj, str, type LlmCall } from "../engine/llm.js";
import type { LlmProvider } from "../llm/providers.js";
import type { EditedHunk } from "./edits.js";
import { wasWrittenByAgent } from "./edits.js";
import { neighbourWindow, projectHunksForConfirmation } from "./remap.js";
import { classifyFileRole } from "./roles.js";
import { listSourceFiles } from "./symbols.js";
import type { Candidate } from "./types.js";

export type LocateProvider = Extract<LlmProvider, "nemotron" | "anthropic">;

export function selectLocateProvider(): LocateProvider {
  const p = (process.env.WCE_LOCATE_PROVIDER || "").trim().toLowerCase();
  if (p === "anthropic" || p === "nemotron") return p;
  return "nemotron";
}

/** True when the selected provider has credentials configured. Missing credentials are reported plainly, never faked. */
export function hasLocateCredentials(provider: LocateProvider): boolean {
  return provider === "anthropic" ? !!process.env.ANTHROPIC_API_KEY : !!process.env.NVIDIA_API_KEY;
}

export interface ToolCallRecord {
  step: number;
  action: "grep" | "read" | "list_edits" | "answer" | "unknown";
  args: Record<string, unknown>;
  result: string;
}

export interface AgenticLocateResult {
  attempted: boolean;
  ran: boolean;
  provider: LocateProvider;
  reason?: string;
  steps: ToolCallRecord[];
  candidate?: Candidate;
  calls: LlmCall[];
}

const LOCATE_SYSTEM =
  "You are localizing a plain-language bug report (no stack trace) to the file:line in the source tree that the " +
  "coding agent's own edit most likely caused. You can only see code the agent wrote in this session and the " +
  "surrounding repository tree; you cannot run the app or see production data. This is a generic task: do not " +
  "assume anything about the specific project or bug beyond what the report and the code show you.\n\n" +
  "At every step you have exactly one move. Reply with ONE JSON object:\n" +
  '  {"action":"grep","pattern":"<regex>"} to search the source tree,\n' +
  '  {"action":"read","file":"<path>","start":<line>,"end":<line>} to read a window of a file,\n' +
  '  {"action":"list_edits"} to list the hunks the agent edited this session,\n' +
  '  {"action":"answer","file":"<path>","line":<line>,"reason":"<why>"} to name the culprit line once you are confident.\n' +
  "An answer is only accepted if that exact line exists and was written by an agent edit; if rejected, try again " +
  "with the remaining steps. Fill every schema field; use empty string/0 for fields the chosen action does not need.";

const STEP_SCHEMA = obj({
  action: { type: "string", enum: ["grep", "read", "list_edits", "answer"] },
  pattern: str,
  file: str,
  start: { type: "integer" },
  end: { type: "integer" },
  line: { type: "integer" },
  reason: str,
});

interface StepAction {
  action: "grep" | "read" | "list_edits" | "answer";
  pattern: string;
  file: string;
  start: number;
  end: number;
  line: number;
  reason: string;
}

function validateStep(raw: unknown): StepAction {
  if (typeof raw !== "object" || raw === null) throw new Error("locate step: model reply is not a JSON object");
  const o = raw as Record<string, unknown>;
  if (!["grep", "read", "list_edits", "answer"].includes(o.action as string)) throw new Error(`locate step: invalid action ${JSON.stringify(o.action)}`);
  return {
    action: o.action as StepAction["action"],
    pattern: typeof o.pattern === "string" ? o.pattern : "",
    file: typeof o.file === "string" ? o.file : "",
    start: typeof o.start === "number" ? o.start : 0,
    end: typeof o.end === "number" ? o.end : 0,
    line: typeof o.line === "number" ? o.line : 0,
    reason: typeof o.reason === "string" ? o.reason : "",
  };
}

/** Resolve a repo-relative path and refuse anything that escapes `root` (read-only sandbox). */
function sandboxedPath(root: string, file: string): string | undefined {
  const p = resolve(root, file.replace(/^\/+/, ""));
  const rel = relative(root, p);
  if (rel === "" || rel.startsWith("..") || rel.startsWith("/")) return undefined;
  return existsSync(p) && statSync(p).isFile() ? p : undefined;
}

function toolGrep(root: string, files: string[], pattern: string, max = 25): string {
  let re: RegExp;
  try { re = new RegExp(pattern); } catch (e) { return `invalid regex: ${(e as Error).message}`; }
  const hits: string[] = [];
  for (const f of files) {
    if (hits.length >= max) break;
    let text: string;
    try { text = readFileSync(join(root, f), "utf8"); } catch { continue; }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length && hits.length < max; i++) if (re.test(lines[i])) hits.push(`${f}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
  }
  return hits.length ? hits.join("\n") : "no matches";
}

function toolRead(root: string, file: string, start: number, end: number): string {
  const p = sandboxedPath(root, file);
  if (!p) return `file not found or outside the sandboxed tree: ${file}`;
  const lines = readFileSync(p, "utf8").split("\n");
  const a = Math.max(1, start || 1);
  const b = Math.min(lines.length, end && end >= a ? end : a + 40);
  return lines.slice(a - 1, b).map((t, i) => `${a + i}: ${t}`).join("\n");
}

function toolListEdits(root: string, hunks: EditedHunk[], max = 40): string {
  if (!hunks.length) return "no edits found in this session";
  // Show current-file lines. Unanchored hunks are labelled, not printed at the stale edit-time number.
  const { hunks: projected } = projectHunksForConfirmation(root, hunks);
  return projected
    .slice(0, max)
    .map((h) => {
      if (!h.added.length) return `${h.file}: unanchored (edit at L${h.edit_line}, ${h.tool})`;
      const start = h.added[0].line;
      const end = h.added[h.added.length - 1].line;
      return `${h.file}:${start}-${end} (edit at L${h.edit_line}, ${h.tool})\n${h.added.slice(0, 4).map((a) => `  ${a.line}: ${a.text}`).join("\n")}`;
    })
    .join("\n\n");
}

export interface AgenticLocateInput {
  report: string;
  root: string;
  hunks: EditedHunk[];
  provider?: LocateProvider;
  maxSteps?: number;
  fetchImpl?: typeof fetch;
}

export async function agenticLocate(input: AgenticLocateInput): Promise<AgenticLocateResult> {
  const provider = input.provider ?? selectLocateProvider();
  const calls: LlmCall[] = [];
  if (!hasLocateCredentials(provider)) {
    const envVar = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "NVIDIA_API_KEY";
    return { attempted: true, ran: false, provider, reason: `no credentials: ${envVar} is not set; layer 2 (model-assisted search) did not run`, steps: [], calls };
  }

  const maxSteps = input.maxSteps ?? Number(process.env.WCE_LOCATE_MAX_STEPS || 6);
  const files = listSourceFiles(input.root);
  const steps: ToolCallRecord[] = [];
  let history = "";

  for (let step = 1; step <= maxSteps; step++) {
    const user = {
      report: input.report,
      step: `${step} of at most ${maxSteps}`,
      history: history || "(no tool calls yet)",
    };
    let action: StepAction;
    try {
      const raw = await llmJson<unknown>({ provider, label: "locate_step", system: LOCATE_SYSTEM, user, schema: STEP_SCHEMA, maxTokens: 500 }, calls, input.fetchImpl ?? fetch);
      action = validateStep(raw);
    } catch (e) {
      return { attempted: true, ran: true, provider, reason: `model_error: ${(e as Error).message}`, steps, calls };
    }

    if (action.action === "grep") {
      const result = toolGrep(input.root, files, action.pattern);
      steps.push({ step, action: "grep", args: { pattern: action.pattern }, result });
      history += `\nstep ${step}: grep(${JSON.stringify(action.pattern)}) ->\n${result}\n`;
    } else if (action.action === "read") {
      const result = toolRead(input.root, action.file, action.start, action.end);
      steps.push({ step, action: "read", args: { file: action.file, start: action.start, end: action.end }, result });
      history += `\nstep ${step}: read(${action.file}, ${action.start}, ${action.end}) ->\n${result}\n`;
    } else if (action.action === "list_edits") {
      const result = toolListEdits(input.root, input.hunks);
      steps.push({ step, action: "list_edits", args: {}, result });
      history += `\nstep ${step}: list_edits() ->\n${result}\n`;
    } else {
      // Project edit-time lines onto the current file BEFORE confirming, so a shifted line still matches
      // and a deleted line cannot confirm at its old number.
      const { hunks: projected, meta } = projectHunksForConfirmation(input.root, input.hunks);
      const hit = wasWrittenByAgent(projected, action.file, action.line);
      const info = hit ? meta.get(`${hit.id}:${action.line}`) : undefined;
      const result = hit && info ? "confirmed: the line exists and was written by an agent edit" : "rejected: no agent edit wrote that exact file:line";
      steps.push({ step, action: "answer", args: { file: action.file, line: action.line, reason: action.reason }, result });
      if (hit && info) {
        const original = input.hunks.find((h) => h.id === hit.id) ?? hit;
        const role = classifyFileRole(action.file);
        const text = info.text;
        return {
          attempted: true, ran: true, provider, steps, calls,
          candidate: {
            file: action.file, line: action.line, end_line: original.end, text,
            score: 0, matched_terms: [], edit_line: hit.edit_line, tool: hit.tool, hunk_id: hit.id,
            snippet: `${action.line}: ${text}`, method: "agentic_model",
            role: role.role, role_weight: role.weight,
            edit_time_line: info.editTimeLine, hunk_start: original.start, anchor: info.anchor,
            context_lines: neighbourWindow(original.added, info.editTimeLine),
          },
        };
      }
      history += `\nstep ${step}: answer(${action.file}:${action.line}) -> REJECTED (${result}); try again with the remaining steps.\n`;
    }
  }
  return { attempted: true, ran: true, provider, reason: `exhausted ${maxSteps} tool steps without a confirmed answer`, steps, calls };
}
