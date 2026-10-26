/**
 *   tsx src/bin/explain.ts --error <error.json> --repo <local clone at error.repo.commit> [--out dir] [--provider openai|nemotron]
 *       [--corroboration <json>] [--ground-truth <json>]
 * Engine input = the error file + the repo only. --corroboration (optional, labelled) and --ground-truth (the real fix, for comparison) are
 * attached only AFTER the engine output is frozen and hashed; neither is ever shown to a model.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { explain, type RealError } from "../reframe/explain.js";
import { writeReframeReport } from "../report/reframe.js";
import type { LlmProvider } from "../llm/providers.js";

const a = process.argv.slice(2); const opt = (k: string) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
const errorPath = opt("error"), repo = opt("repo");
if (!errorPath || !repo) { console.error("usage: --error <error.json> --repo <dir> [--out dir] [--corroboration f] [--ground-truth f]"); process.exit(2); }
const out = resolve(opt("out") ?? join("artifacts", "reframe", new Date().toISOString().replace(/[:.]/g, "-"))); mkdirSync(out, { recursive: true });
const error = JSON.parse(readFileSync(errorPath, "utf8")) as RealError;
const engineInput = { id: error.id, message: error.message, behaviour: (error as any).behaviour, frames: error.frames, observed_at: error.observed_at, source_url: error.source_url, source_note: error.source_note, repo: error.repo };
const r = await explain({ error: engineInput, repoDir: resolve(repo), provider: (opt("provider") as LlmProvider) ?? "openai", oracleEdit: opt("oracle-edit") ? { commit: opt("oracle-edit")!.split(":")[0], file: opt("oracle-edit")!.split(":")[1] } : undefined });
writeFileSync(join(out, "engine-output.frozen.json"), JSON.stringify(r, null, 1));
if (opt("corroboration")) r.corroboration = JSON.parse(readFileSync(opt("corroboration")!, "utf8"));
if (opt("ground-truth")) {
  const gt = JSON.parse(readFileSync(opt("ground-truth")!, "utf8"));
  const pr = r.provenance?.pr?.url;
  const editFile = r.localization.edit?.file ?? "";
  r.ground_truth_comparison = { ground_truth: gt, introducing_pr_match: !!pr && pr === gt.introducing_pr, edit_file_match: !!editFile && String(gt.introducing_edit).startsWith(editFile),
    note: "Deterministic match on PR and file only. Whether the extracted belief matches the fix's stated cause is a human judgement shown side by side." };
}
writeFileSync(join(out, "report.json"), JSON.stringify(r, null, 1));
writeReframeReport(r, join(out, "report.html"));
console.log(`verdict: ${r.verdict}\nedit: ${r.localization.edit?.file}:${r.localization.edit?.lines?.join("-")} @ ${r.localization.edit?.commit?.slice(0, 10)} PR ${r.provenance?.pr?.url ?? "-"} agent=${r.provenance?.agent.name ?? "no"}\nbelief: ${r.belief?.statement}\nquotes: ${r.belief?.quotes.map((q) => q.match).join(",")} code:${r.belief?.code_quote.match}\nchecks: ${r.evidence.filter((e) => e.result).map((e) => e.result!.outcome).join(", ")}\nfrozen ${r.frozen.sha256.slice(0, 16)} · LLM calls ${r.calls.length} · ${out}/report.html`);
if (r.ground_truth_comparison) console.log("ground truth:", JSON.stringify({ pr: (r.ground_truth_comparison as any).introducing_pr_match, file: (r.ground_truth_comparison as any).edit_file_match }));
