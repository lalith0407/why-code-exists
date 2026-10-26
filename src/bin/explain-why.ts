/**
 * usage: tsx src/bin/explain-why.ts --error <error.json> --transcript <t.jsonl> [--repo dir] [--out dir]
 *          [--provider nemotron|anthropic] [--locate-provider nemotron|anthropic] [--no-locate-model]
 * Deterministic three-piece linking + context building; the reasoning step calls a model (Nemotron by default,
 * Anthropic with --provider anthropic) and is verified before being shown as an explanation. If no API key is
 * configured for the selected provider, this says so clearly in the report rather than faking a result.
 * When `error.frames` is empty (a plain symptom report, no stack trace), the LOCATE stage (src/locate/) runs
 * first to find a candidate file:line from the agent's own edits; `--no-locate-model` disables its optional
 * model-assisted layer 2 (layer 1, the deterministic symbol search, always runs).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { reconstructTree } from "../engine/tree.js";
import { loadTranscript } from "../session/transcript.js";
import { explainWhy } from "../explain/pipeline.js";
import { writeExplainReport } from "../report/explain.js";
import type { ProdError } from "../types.js";
import type { ExplainProvider } from "../explain/reasoner.js";
import type { LocateProvider } from "../locate/agentic.js";

const a = process.argv.slice(2);
const opt = (k: string) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
const errorPath = opt("error"), transcriptPath = opt("transcript");
if (!errorPath || !transcriptPath) {
  console.error("usage: --error <error.json> --transcript <t.jsonl> [--repo dir] [--out dir] [--provider nemotron|anthropic]");
  process.exit(2);
}

const index = await loadTranscript(transcriptPath);
let root = opt("repo");
if (!root) {
  const d = mkdtempSync(join(tmpdir(), "wce-explain-"));
  reconstructTree(transcriptPath, d);
  root = d;
}
const readSource = (f: string): string | undefined => {
  const p = join(root!, f);
  return existsSync(p) && statSync(p).isFile() ? readFileSync(p, "utf8") : undefined;
};

const error = JSON.parse(readFileSync(errorPath, "utf8")) as ProdError;
const providerFlag = opt("provider") as ExplainProvider | undefined;
const locateProviderFlag = opt("locate-provider") as LocateProvider | undefined;
const result = await explainWhy({
  error, index, transcriptName: basename(transcriptPath), readSource, root, provider: providerFlag,
  locate: { enableModel: !a.includes("--no-locate-model"), provider: locateProviderFlag },
});

const out = resolve(opt("out") ?? join("artifacts", "explain-why", new Date().toISOString().replace(/[:.]/g, "-")));
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "report.json"), JSON.stringify(result, null, 1));
writeExplainReport(result, join(out, "report.html"));

const locateLine = result.locate
  ? `locate: ${result.locate.method}${result.locate.picked ? ` -> ${result.locate.picked.file}:${result.locate.picked.line}` : " (no candidate)"}\n`
  : "";
const lessonLine = result.lesson_status.disposition === "pending"
  ? `lesson: pending approval (${result.lesson_status.lesson?.verified_context?.lesson_key ?? ""})`
  : `lesson: ${result.lesson_status.disposition}${result.lesson_status.reason ? ` (${result.lesson_status.reason})` : ""}`;
const recallLine = result.lesson_status.recall.ran
  ? (result.lesson_status.recall.ok ? `recall: ${result.lesson_status.recall.hits.length} related` : `recall failed: ${result.lesson_status.recall.error}`)
  : `recall: ${result.lesson_status.recall.error ?? "not run"}`;
console.log(`${locateLine}stage: ${result.stage}${result.reason ? ` (${result.reason})` : ""}\nprovider: ${result.provider}\nframe: ${result.three_piece.frame ? `${result.three_piece.frame.file}:${result.three_piece.frame.line}` : "-"}\n${result.answer ? `status: ${result.answer.status} (code quotes ${result.answer.verified_code_quotes}, transcript quotes ${result.answer.verified_transcript_quotes})\noverlooked_assumption: ${result.answer.overlooked_assumption}\n` : ""}${lessonLine}\n${recallLine}\nreport: ${out}/report.html`);
