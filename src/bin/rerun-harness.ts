/**
 * No-LLM re-run of a recorded harness: tsx src/bin/rerun-harness.ts --report <report.json> [--tree app|app-patched] [--both]
 * Re-executes the report's frozen tests + recorded setup/stubs against the recorded app tree, with the SAME engine-built
 * framework boundary shims the investigation used (rebuilt from the app's real package exports), and prints raw results.
 * --both runs the original and patched trees and checks the recorded verdict's test pattern. Never calls a model; never changes a report.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { prepareWorkspace } from "../engine/workspace.js";
import { runRealTests } from "../engine/sandbox.js";
import { codeContext } from "../engine/context.js";
import { frameworkShims } from "../engine/frameworks.js";
const a = process.argv.slice(2); const opt = (k: string) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
const rp = opt("report")!; const r = JSON.parse(readFileSync(rp, "utf8"));
const trees = a.includes("--both") ? ["app", "app-patched"] : [opt("tree") ?? "app"];
const out: Record<string, Array<{ role: string; pass: boolean }>> = {};
for (const tree of trees) {
  const root = r.tree.origin === "repo" && tree === "app" ? r.tree.root : join(dirname(rp), tree);
  if (!existsSync(root)) throw new Error(`no tree at ${root}`);
  const ws = prepareWorkspace(root, r.tree.origin, r.language);
  if (r.language !== "python" && ws.nodeModules) {
    const ctx = codeContext(ws.root, r.frame.file, r.language, ws.aliasAt ? (ws.aliasBase ?? "") : false);
    const fw = frameworkShims(ws.root, ctx.reachable_external_packages.map((p) => p.package));
    ws.shims = fw.shims;
    const recorded = (r.workspace?.framework_shims ?? []).map((s: { module: string }) => s.module).sort().join(",");
    const now = fw.shims.map((s) => s.module).sort().join(",");
    console.log(`[${tree}] framework shims: ${now || "(none)"}${recorded !== now ? `  (WARNING: report recorded ${recorded || "(none)"})` : ""}`);
  }
  const res = runRealTests(r.language, ws, { setup: r.tests.setup, stubs: r.tests.stubs, tests: r.tests.tests });
  out[tree] = res.results.map((t) => ({ role: t.role, pass: t.pass }));
  for (const t of res.results) console.log(`[${tree}] ${t.role} "${t.name}" pass=${t.pass} ${t.error ?? ""}`);
  if (!res.ok || a.includes("--stderr")) console.log(`[${tree}] STDERR:\n` + res.stderr.slice(0, 6000));
}
if (out.app && out["app-patched"]) {
  const rep = (k: string) => out[k].find((x) => x.role === "reproduction")?.pass;
  const decoysOk = [...out.app, ...out["app-patched"]].filter((x) => x.role === "decoy").every((x) => x.pass);
  const reproduced = rep("app") === true && rep("app-patched") === false && decoysOk;
  console.log(`\nre-run: reproduction original=${rep("app")} patched=${rep("app-patched")} decoys_all_pass=${decoysOk} => counterfactual ${reproduced ? "REPRODUCED" : "NOT reproduced"} (recorded verdict: ${r.verdict})`);
}
