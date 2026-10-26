/** HTML for the reframed report: error -> agent edit -> quoted belief -> labelled contradicting evidence; corroboration and real fix separate. */
import { writeFileSync } from "node:fs";
import type { ReframeReport } from "../reframe/explain.js";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pre = (s: unknown) => `<pre>${esc(s)}</pre>`;
const link = (u?: string, t?: string) => (u ? `<a href="${esc(u)}">${esc(t ?? u)}</a>` : "-");
const VERDICT: Record<string, string> = {
  belief_contradicted_independent: "Belief contradicted by independent evidence (not only by the error)",
  belief_contradicted_error_only: "Belief contradicted by the production error itself only (no independent evidence found)",
  belief_unverified: "Belief not established: quotes did not match the agent's text/code, or the belief shares no identifier with the error — nothing claimed",
  no_agent_edit: "The edit that introduced this code was not made by a coding agent — nothing to explain",
  no_candidate: "No edit could be localized for this error",
};

export function renderReframe(r: ReframeReport): string {
  const e = r.error, ed = r.localization.edit, p = r.provenance, b = r.belief;
  const strong = r.verdict === "belief_contradicted_independent";
  const gt: any = r.ground_truth_comparison; const co: any = r.corroboration;
  return `<!doctype html><meta charset="utf-8"><title>why-code-exists: ${esc(e.id)}</title>
<style>body{font:14px system-ui;max-width:1050px;margin:2em auto;padding:0 1em}pre{background:#f5f5f5;padding:.7em;overflow:auto;white-space:pre-wrap}.box{border:1px solid #bbb;border-radius:6px;padding:.6em 1em;margin:.8em 0}
.v{font-size:1.2em;padding:.4em .7em;border-radius:6px;display:inline-block;background:${strong ? "#d9f7d9" : r.verdict.startsWith("belief_contradicted") ? "#fff3c4" : "#eee"}}.tag{font-size:.8em;padding:.1em .5em;border-radius:4px;background:#e3ecff}.bad{background:#fbe5e5}.ok{background:#e8f8e8}td,th{border:1px solid #ccc;padding:.4em;vertical-align:top}table{border-collapse:collapse}</style>
<h1>Why does this code exist?</h1>
<div class="box"><p class="v">${esc(VERDICT[r.verdict])}</p>
${b ? `<p><b>The agent believed:</b> ${esc(b.statement)} <span class="tag">${esc(b.grounding_type)}</span> <span class="tag">${esc(b.kind)}</span></p>` : ""}
${ed ? `<p><b>Edit:</b> <code>${esc(ed.file)}:${ed.lines.join("-")}</code> in ${p?.pr ? link(p.pr.url, `PR #${p.pr.number}: ${p.pr.title}`) : esc(ed.commit.slice(0, 10))}${p?.agent.is_agent ? ` · <b>by ${esc(p.agent.name)}</b>` : ""}</p>` : ""}
<p><small>This report does not claim a proof. It shows the agent's own words next to evidence that contradicts them, labelled by kind. Engine output frozen sha256 ${esc(r.frozen.sha256.slice(0, 16))}… at ${esc(r.frozen.at)}; corroboration and the real fix were attached after.</small></p></div>
<h2>1. Real error (the only input besides the repo)</h2>${pre(e.message)}${e.behaviour ? `<p>Observed behaviour:</p>${pre(e.behaviour)}` : ""}<p>Source: ${link(e.source_url)} · observed ${esc(e.observed_at)}</p>${e.source_note ? `<p><small>${esc(e.source_note)}</small></p>` : ""}
<p>Repo ${link(e.repo.url)} at <code>${esc(e.repo.commit.slice(0, 12))}</code></p>
${r.oracle_localization ? `<p class="bad box"><b>${esc(r.oracle_localization)}</b></p>` : ""}<h2>2. The agent's edit</h2><p>Localization: ${esc(r.localization.method)}</p>
${r.localization.pick ? `<p>Pick: <code>${esc(r.localization.pick.hunk_id)}</code> — ${esc(r.localization.pick.reason)}</p>` : ""}
${r.localization.shortlist ? `<details><summary>shortlist (${r.localization.shortlist.length} commits; window ${esc(JSON.stringify(r.localization.window))}; stems ${esc(r.localization.stems?.join(", "))})</summary><table>${r.localization.shortlist.map((c) => `<tr><td>${c.score}</td><td><code>${esc(c.commit.slice(0, 10))}</code></td><td>${esc(c.subject)}</td></tr>`).join("")}</table></details>` : ""}
${ed ? `${pre(ed.added)}<p>Still present at the error commit: <b>${ed.still_present_at_head ? "yes" : "no"}</b>${ed.blamed_to?.length ? ` (git blame → ${esc(ed.blamed_to.join(", "))})` : ""}</p>` : ""}
${p ? `<h2>3. Agent authorship evidence</h2><ul>${p.agent.evidence.map((x) => `<li><code>${esc(x.signal)}</code> ${esc(x.detail)}</li>`).join("") || "<li>none</li>"}</ul><p><small>${esc(p.method)}</small></p>` : ""}
${b ? `<h2>4. The belief, in the agent's own words</h2><p>${esc(b.statement)}</p>${b.quotes.map((q) => `<blockquote class="${q.match === "not_found" ? "bad" : "ok"}">“${esc(q.quote)}”<br><small>${esc(q.segment_id)} ${link(q.url, "source")} · string match: <b>${esc(q.match)}</b></small></blockquote>`).join("")}
<p>Error link (identifier stems shared with the error): <b>${esc(b.error_link_stems?.join(", ") || "none")}</b></p><p>Code line (${esc(b.code_quote.match)}): <code>${esc(b.code_quote.quote)}</code></p>` : ""}
${r.evidence.length ? `<h2>5. Evidence that contradicts it</h2>${r.independent ? `<p>Independent checks: ${r.independent.contradicting} of ${r.independent.valid_checks} valid checks contradict the belief, ${r.independent.consistent} consistent. Counted as independent only when all valid checks contradict.</p>` : ""}${r.evidence.map((x) => `<div class="box"><p><span class="tag">${esc(x.label)}</span></p><p>${esc(x.detail)}</p><p><small>${link(x.source, "source")}</small></p>${x.result ? `<p>check <code>${esc(x.result.file)}</code>: anchor <code>${esc(x.result.anchor_regex)}</code> ${x.result.anchor_found ? "found" : "NOT found"}; test <code>${esc(x.result.test_regex)}</code> → ${x.result.test_matched === undefined ? "-" : x.result.test_matched ? "matched" : "no match"} (belief predicts ${esc(x.result.expect_if_belief_true)}) → <b>${esc(x.result.outcome)}</b>${x.result.note ? ` (${esc(x.result.note)})` : ""}</p>${x.result.excerpt ? pre(x.result.excerpt) : ""}` : ""}</div>`).join("")}` : ""}
<h2>6. Optional corroboration (never a gate)</h2>${co ? `<p><b>${esc(co.result)}</b> — ${esc(co.summary)}</p><p><small>${esc(co.labels)}</small></p>${co.details ? pre(co.details) : ""}` : "<p>Not run.</p>"}
<h2>7. Real fix, for comparison (not shown to the engine)</h2>${gt ? `<p>Introducing PR: ${link(gt.ground_truth.introducing_pr)} — match: <b>${gt.introducing_pr_match ? "yes" : "no"}</b> · edit file match: <b>${gt.edit_file_match ? "yes" : "no"}</b></p><p>Introducing edit (truth): ${esc(gt.ground_truth.introducing_edit)}</p><p>Fix: ${link(gt.ground_truth.fix_pr)} at ${esc(gt.ground_truth.fix_location)}</p><p>Fix's stated cause: ${esc(gt.ground_truth.fix_stated_cause)}</p><p><small>${esc(gt.note)}</small></p>${gt.human_judgement ? `<p><b>Belief vs real cause (human judgement):</b> ${esc(gt.human_judgement)}</p>` : ""}` : "<p>Unknown.</p>"}
<h2>LLM calls (${r.calls.length})</h2><ul>${r.calls.map((c) => `<li>${esc(c.label)} · ${esc(c.model)} · ${c.ok ? "ok" : "FAILED"}</li>`).join("")}</ul>`;
}
export function writeReframeReport(r: ReframeReport, path: string): void { writeFileSync(path, renderReframe(r)); }
