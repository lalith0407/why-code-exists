/**
 * Single generic CLI:
 *   tsx src/bin/investigate.ts --error <error.json> --transcript <t.jsonl> [--repo <dir>] [--out <dir>]
 *       [--claim-provider openai|nemotron] [--checker-provider openai|nemotron] [--gate-provider p] [--data <dir of *.json>]
 * Zetaris and Meterless run on every investigation. Exit 0 = report written and both sponsors ran; 3 = report written but a sponsor
 * step failed (printed, and recorded in report.json); 1 = investigation failed.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { investigate } from "../engine/investigate.js";
import { callsUsed } from "../engine/llm.js";
import { writeGenericReport } from "../report/generic.js";
import type { LlmProvider } from "../llm/providers.js";

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const errorPath = opt("error"), transcript = opt("transcript");
if (!errorPath || !transcript) { console.error("usage: --error <error.json> --transcript <t.jsonl> [--repo dir] [--out dir] [--claim-provider p] [--checker-provider p] [--gate-provider p] [--data dir]"); process.exit(2); }
const out = resolve(opt("out") ?? join("artifacts", "runs", new Date().toISOString().replace(/[:.]/g, "-")));
mkdirSync(out, { recursive: true });
const before = callsUsed();
try {
  const r = await investigate({
    error: JSON.parse(readFileSync(errorPath, "utf8")), transcript, repo: opt("repo"),
    claimProvider: (opt("claim-provider") as LlmProvider) ?? "openai",
    checkerProvider: (opt("checker-provider") as LlmProvider) ?? "openai",
    gateProvider: opt("gate-provider") as LlmProvider | undefined,
    artifactsDir: out, dataDir: opt("data"),
  });
  writeFileSync(join(out, "report.json"), JSON.stringify(r, null, 2));
  writeGenericReport(r, join(out, "report.html"), join(out, "report.json"));
  console.log(`verdict: ${r.verdict}`);
  if (r.claim) console.log(`claim: ${r.claim.claim}\nconcept: ${r.claim.concept}\nquote verified: ${r.claim.belief_quote_verified}`);
  for (const x of r.reasons) console.log(` - ${x}`);
  console.log(`attribution: ${r.provenance.attribution ?? "none"}${r.provenance.call_path && r.provenance.call_path.length > 1 ? ` (call path ${r.provenance.call_path.map((c) => c.function).join(" -> ")})` : ""}; transcript L${r.provenance.written_at?.edit_line ?? "?"}; code under test: ${r.code_under_test.source}`);
  let sponsorFail = false;
  const z = r.zetaris;
  if (!z) { if (r.runs) { sponsorFail = true; console.log("ZETARIS: did not run"); } else console.log("zetaris: not run (no tests executed: " + r.verdict + ")"); }
  else if (!z.ok) { sponsorFail = true; console.log(`ZETARIS FAILED: ${z.error}`); }
  else console.log(`zetaris: ${z.verdict} (original rows ${z.original_rows}, patched rows ${z.patched_rows}); joined ${z.tables_joined.join(" + ")}; sql attempts rejected: ${z.sql_attempts?.length ?? 0}${z.note ? `; ${z.note}` : ""}`);
  const m = r.meterless;
  if (m && !m.ok) { sponsorFail = true; console.log(`METERLESS RECALL FAILED: ${m.error}`); }
  else if (m) console.log(`meterless recall (${m.query_concept}): ${m.hits.length} hit(s), ${m.hits.filter((h) => h.same_concept).length} same concept`);
  console.log(`LLM calls this run: ${callsUsed() - before}; report: ${out}/report.html`);
  if (sponsorFail) process.exit(3);
} catch (e) {
  console.error(`FAILED (visible): ${(e as Error).stack ?? (e as Error).message}`);
  console.log(`LLM calls this run: ${callsUsed() - before}`);
  process.exit(1);
}
