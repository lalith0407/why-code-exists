/** Self-contained HTML report for one investigation; everything shown comes from the report JSON. Answer first, then evidence. */
import { writeFileSync } from "node:fs";
import type { InvestigationReportV2 } from "../engine/investigate.js";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pre = (s: unknown) => `<pre>${esc(s)}</pre>`;

const MEANING: Record<string, string> = {
  proven_false: "The stated assumption is false, shown on the real code: the reproduction test passes on the original, fails on the patch, and decoys pass on both.",
  not_reproduced: "The claimed bug did not reproduce on the real code, so the claim is unproven (it may be the wrong claim).",
  patch_ineffective: "The bug reproduced, but the proposed fix did not remove it.",
  decoy_failed: "A test of unrelated behaviour failed, so the result is not trustworthy.",
  patch_not_minimal: "The fix changed too much to count as correcting one belief.",
  patch_uses_test_fakes: "The fix relies on names that exist only in the test harness.",
  mechanism_mismatch: "An independent model found the claimed mechanism is not what the code does.",
  harness_error: "The tests could not run against the real code (details below). Nothing was proven.",
  no_provenance: "No transcript edit wrote the failing function, so there is nothing to explain.",
};

export function renderGenericReport(r: InvestigationReportV2 & { approval?: any }, reportPath = "report.json"): string {
  const ok = r.verdict === "proven_false";
  const z: any = r.zetaris;
  const m = r.meterless;
  const runs = r.runs ? (["original", "patched"] as const).map((k) => `<tr><th>${k}</th>${r.runs![k].results.map((t) => `<td class="${t.pass ? "pass" : "fail"}">${esc(t.role)}: ${esc(t.name)}<br><b>${t.pass ? "PASS" : "FAIL"}</b>${t.error ? ` — ${esc(String(t.error).slice(0, 200))}` : ""}${t.db_changes ? `<br><small>${t.db_changes.length} DB row change(s)</small>` : ""}</td>`).join("")}</tr>`).join("") : "";
  const writes = r.runs ? (["original", "patched"] as const).flatMap((k) => r.runs![k].results.filter((t) => t.role === "reproduction").map((t) => `<p><b>${k}</b> reproduction: ${t.db_changes ? `${t.db_changes.length} row change(s) in real PostgreSQL` : "no database"}; recorded ${esc(JSON.stringify(t.recorded ?? []).slice(0, 400))}</p>${t.db_changes?.length ? pre(t.db_changes.slice(0, 8).map((c) => `${c.op} ${c.table} ${JSON.stringify(c.row)}`).join("\n")) : ""}`)).join("") : "";
  return `<!doctype html><meta charset="utf-8"><title>why-code-exists: ${esc(r.verdict)}</title>
<style>body{font:14px system-ui;max-width:1050px;margin:2em auto;padding:0 1em}pre{background:#f5f5f5;padding:.7em;overflow:auto;white-space:pre-wrap}
.v{font-size:1.3em;padding:.4em .7em;border-radius:6px;display:inline-block;background:${ok ? "#d9f7d9" : "#fde2c8"}}td,th{border:1px solid #ccc;padding:.4em;vertical-align:top}table{border-collapse:collapse}.pass{background:#e8f8e8}.fail{background:#fbe5e5}.box{border:1px solid #bbb;border-radius:6px;padding:.6em 1em;margin:.8em 0}</style>
<h1>Why does this code exist?</h1>
<div class="box"><p class="v">${esc(r.verdict)}</p><p>${esc(MEANING[r.verdict] ?? "")}</p>
${r.claim ? `<p><b>Answer:</b> ${esc(r.claim.claim)}</p><p><b>Correct rule:</b> ${esc(r.claim.correct_rule)}</p>` : ""}
<p><b>${esc(({ introduced_by_edit: "Written by the agent at", callee_introduced_by_edit: "Agent-written callee on the call path, introduced at", last_modified_by_edit: "Last modified by an agent edit at" } as Record<string, string>)[r.provenance.attribution ?? ""] ?? "Written by the agent at")}</b> transcript line ${esc(r.provenance.written_at?.edit_line ?? "none")}${r.provenance.attribution ? ` · <b>attribution</b> <code>${esc(r.provenance.attribution)}</code>` : ""}${r.provenance.call_path && r.provenance.call_path.length > 1 ? ` · <b>call path</b> <code>${esc(r.provenance.call_path.map((c: any) => c.function).join(" → "))}</code>` : ""} · <b>file</b> <code>${esc(r.frame.file)}:${r.frame.line}</code> ${esc(r.frame.function ?? "")}</p>
<p><b>Sources joined:</b> ${z?.tables_joined?.length ? `Zetaris query over ${z.tables_joined.map((n: string) => `<code>${esc(n)}</code> (${esc(z.tables.find((t: any) => t.name === n)?.provenance ?? "")})`).join(" + ")} → <b>${esc(z.verdict)}</b> (original ${esc(z.original_rows)} row(s), patched ${esc(z.patched_rows)})` : z ? `<b>Zetaris failed:</b> ${esc(z.error)}` : "Zetaris not run (no tests executed)"}
 · transcript ${esc(r.provenance.written_at ? `L${r.provenance.written_at.edit_line}` : "-")} · code ${esc(r.code_under_test.source)}</p>
<p><b>Meterless memory:</b> ${m ? (m.ok ? `recalled ${m.hits.length} prior lesson(s) for “${esc(m.query_concept)}” (${m.hits.filter((h) => h.same_concept).length} same concept)` : `<b>recall failed:</b> ${esc(m.error)}`) : "-"} · ${r.approval?.lesson ? `stored: ${esc(r.approval.lesson)}` : "store: pending human approval"}</p></div>
<h2>1. Error (input)</h2>${pre((r.error as any).message)}<p>Frames: ${r.error.frames.map((f) => `<code>${esc(f.file)}:${f.line} ${esc(f.function ?? "")}</code>`).join(" ← ")}</p>
<h2>2. Code under test (real code)</h2><p>${esc(r.code_under_test.source)} · tree: ${esc(r.tree.origin)}${r.tree.files != null ? ` (${r.tree.files} files rebuilt from ${r.tree.applied_edits} transcript edits; ${r.tree.failed_edits?.length ?? 0} edits did not apply)` : ""}</p>
${r.workspace ? `<ul>${r.workspace.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}${pre(r.code_under_test.text)}
${r.provenance.reasoning_before ? `<p>Agent reasoning before the edit (L${r.provenance.reasoning_before.line}, ${r.provenance.reasoning_before.silent ? "silent" : `${r.provenance.reasoning_before.words} words`})</p>` : ""}
${r.claim ? `<h2>3. Claim</h2><p>Mechanism: ${esc(r.claim.mechanism)}</p><p>Belief quote (${r.claim.belief_quote_verified ? "verified verbatim" : "NOT verified"} in ${esc(r.claim.belief_quote_source)}):</p>${pre(r.claim.belief_quote)}<p>concept: <i>${esc(r.claim.concept)}</i> · ${esc(r.claim.language_framework)}</p>` : ""}
${r.tests ? `<h2>4. Frozen tests</h2><p>tests sha256 ${esc(r.tests.tests_sha256.slice(0, 16))}… frozen ${esc(r.tests.frozen_at)} before any run · setup/stub repairs: ${r.tests.harness_repairs.length} (test bodies never change)</p>
${r.tests.tests.map((t) => `<details><summary>${esc(t.role)}: ${esc(t.name)} — ${esc(t.asserts ?? "")}</summary>${pre(t.body)}</details>`).join("")}
<details><summary>setup (seeding via the app's own modules)</summary>${pre(r.tests.setup)}</details>
<details><summary>boundary stubs (${r.tests.stubs.length}): ${esc(r.tests.stubs.map((s) => s.module).join(", ") || "none")}</summary>${r.tests.stubs.map((s) => `<p><code>${esc(s.module)}</code> — ${esc(s.why)}</p>${pre(s.code)}`).join("")}</details>` : ""}
${r.patch ? `<h2>5. Patch (written without seeing the tests; ${r.patch.changed_lines} changed lines)</h2>${pre(r.patch.diff)}<p>${esc(r.patch.rationale)}</p>` : ""}
${runs ? `<h2>6. Counterfactual runs on the real code</h2><table>${runs}</table>${writes}` : ""}
<h2>7. Gates</h2><ul>${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
${z?.sql ? `<h2>8. Zetaris SQL (sha256 ${esc(z.sha256.slice(0, 16))}…, frozen before it ran)</h2>${pre(z.sql)}<p>${esc(z.rationale)}</p><details><summary>tables offered (${z.tables.length})</summary>${pre(z.tables.map((t: any) => `${t.name} [${t.row_count} rows] — ${t.provenance}`).join("\n"))}</details>${z.original_sample ? `<details><summary>rows returned on original</summary>${pre(JSON.stringify(z.original_sample, null, 1))}</details>` : ""}` : ""}
<h2>Human review</h2><p>${r.approval ? `Decision: <b>${esc(r.approval.decision)}</b> by ${esc(r.approval.by)} at ${esc(r.approval.at)}${r.approval.lesson ? ` · lesson ${esc(r.approval.lesson)}` : ""}` : "Pending. A lesson is stored in Meterless only after approval:"}</p>${r.approval ? "" : pre(`npx tsx src/bin/approve.ts --report ${reportPath} --decision approve|reject --by <name>`)}
<h2>LLM calls (${r.calls.length})</h2><ul>${r.calls.map((c) => `<li>${esc(c.label)} · ${esc(c.model)} · ${c.ok ? "ok" : "FAILED"}</li>`).join("")}</ul>`;
}

export function writeGenericReport(r: InvestigationReportV2, path: string, reportPath?: string): void {
  writeFileSync(path, renderGenericReport(r, reportPath));
}
