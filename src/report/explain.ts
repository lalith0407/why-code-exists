/**
 * Self-contained HTML report for the "explain why" stage: the three pieces (asked/understood/happened), then
 * the tool's own "Why it broke" section with verified status, then the Meterless lesson status (pending until
 * approval, stored, or not created). Zetaris stays an optional pointer and does not gate this output.
 */
import { writeFileSync } from "node:fs";
import type { ExplainWhyResult } from "../explain/pipeline.js";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pre = (s: unknown) => `<pre>${esc(s)}</pre>`;

const STAGE_MEANING: Record<string, string> = {
  no_frame: "No stack frame points at a file the agent edited in this transcript, and the LOCATE stage (see below, when the report had no frame at all) found no usable candidate either — nothing to explain.",
  no_edit: "The frame line was not written by any edit in this transcript — nothing to explain.",
  no_credentials: "The reasoner stage needs a model call and no API key is configured for the selected provider.",
  model_error: "The model call or its JSON failed. Reported honestly; not shown as an explanation.",
  ok: "The reasoner ran; see verified status below.",
};

function piece(label: string, p?: { text: string; citation: string; valid: boolean; why_invalid?: string }): string {
  if (!p) return `<div class="box"><p><b>${esc(label)}:</b> <i>missing</i></p></div>`;
  return `<div class="box ${p.valid ? "ok" : "bad"}"><p><b>${esc(label)}</b> <span class="tag">${p.valid ? "valid" : "INVALID"}</span> — <small>${esc(p.citation)}</small></p>${pre(p.text)}${p.why_invalid ? `<p><small>${esc(p.why_invalid)}</small></p>` : ""}</div>`;
}

function renderLocateSection(loc: ExplainWhyResult["locate"]): string {
  if (!loc) return "";
  const cand = (c: { file: string; line: number; score: number; matched_terms: string[]; tool: string; edit_line: number; method: string }, i: number) =>
    `<tr><td>${i + 1}</td><td><code>${esc(c.file)}:${c.line}</code></td><td>${c.score}</td><td>${esc(c.matched_terms.slice(0, 8).join(", "))}</td><td>${esc(c.method)}</td><td>edit L${c.edit_line} (${esc(c.tool)})</td></tr>`;
  const layer2 = loc.layer2;
  return `<h2>How the location was found (LOCATE stage, no stack frame in the report)</h2>
<div class="box"><p>Terms extracted from the report: <code>${esc(loc.terms.slice(0, 30).join(", ") || "none")}</code></p>
<p>Layer 1 (deterministic symbol search): ${loc.layer1.symbols_indexed} symbols indexed, ${loc.layer1.edited_hunks_indexed} agent-edited hunks scored, ${loc.layer1.candidates.length} candidate(s) found.</p>
${loc.layer1.candidates.length ? `<table border="1" cellpadding="4" cellspacing="0"><tr><th>#</th><th>file:line</th><th>score</th><th>matched terms</th><th>method</th><th>edit</th></tr>${loc.layer1.candidates.map(cand).join("")}</table>` : "<p><i>no candidates — no agent edit in this session overlapped the report's terms</i></p>"}
${layer2 ? `<p>Layer 2 (model-assisted search, provider <code>${esc(layer2.provider)}</code>): ${layer2.ran ? `ran ${layer2.steps.length} tool step(s)${layer2.candidate ? ", found a confirmed candidate" : `, ${esc(layer2.reason ?? "no confirmed candidate")}`}` : esc(layer2.reason ?? "did not run")}</p>
${layer2.steps.length ? `<details><summary>tool calls (${layer2.steps.length})</summary><ul>${layer2.steps.map((s) => `<li><code>${esc(s.action)}(${esc(JSON.stringify(s.args))})</code> → ${pre(s.result)}</li>`).join("")}</ul></details>` : ""}` : ""}
<p><b>Picked:</b> ${loc.picked ? `<code>${esc(loc.picked.file)}:${esc(String(loc.picked.line))}</code> via ${esc(loc.method)}` : "<i>none — stage stayed at no_frame</i>"}</p>
</div>`;
}

function renderLessonSection(r: ExplainWhyResult, reportPath: string): string {
  const s = r.lesson_status;
  if (!s) return `<h2>Lesson</h2><div class="box bad"><p><b>lesson status missing from this report</b></p></div>`;
  const badge = s.disposition === "pending" ? "pending"
    : s.disposition === "stored" ? "stored"
    : s.disposition === "rejected" ? "rejected"
    : "unverified";
  const label = s.disposition === "pending" ? "pending approval"
    : s.disposition === "stored" ? "stored"
    : s.disposition === "rejected" ? "rejected"
    : (s.reason ?? "not created");
  const write = s.write;
  const writeLine = s.disposition === "stored" && write
    ? `<p>Memory id: <code>${esc(write.memory_id)}</code> · <b>${esc(write.detail)}</b> · dir <code>${esc(write.dir)}</code></p>`
    : "";
  const lesson = s.lesson;
  const ctx = lesson?.verified_context;
  const lessonBody = lesson ? `<p><b>Key:</b> <code>${esc(ctx?.lesson_key ?? "")}</code> · <b>language:</b> <code>${esc(lesson.language_framework)}</code> · <b>file:</b> <code>${esc(lesson.file || "-")}${ctx?.location ? `:${ctx.location.line}` : ""}</code> · <b>located by:</b> <code>${esc(ctx?.located_by ?? "-")}</code></p>
<p><b>Wrong assumption:</b> ${esc(lesson.wrong_assumption)}</p>
<p><b>Why it breaks:</b> ${esc(lesson.correct_rule)}</p>
<p><b>Provider:</b> <code>${esc(ctx?.provider ?? "-")}</code>${ctx?.confidence_cap ? ` · <b>confidence cap:</b> ${esc(ctx.confidence_cap.capped)} (model ${esc(ctx.confidence_cap.model)})` : ""}</p>
<p><b>Citations:</b> ${lesson.citations.length ? lesson.citations.map((c) => `<code>${esc(c.ref)}</code>`).join(", ") : "<i>none</i>"}</p>
${ctx?.pieces.asked || ctx?.pieces.understood || ctx?.pieces.happened ? `<p><b>Valid pieces:</b> ${["asked", "understood", "happened"].filter((k) => ctx.pieces[k as "asked" | "understood" | "happened"]).map((k) => esc(k)).join(", ")}</p>` : ""}`
    : `<p>${esc(s.reason ?? "No lesson was built.")}</p>`;
  const recall = s.recall;
  const recallBody = !recall ? ""
    : !recall.ran ? `<p><b>Recall not run:</b> ${esc(recall.error ?? "no verified assumption text")}</p>`
    : !recall.ok ? `<p><b>Recall failed:</b> ${esc(recall.error ?? "unknown error")}</p>`
    : `<p><b>Related lessons</b> (${recall.hits.length})${recall.query ? ` for <code>${esc(recall.query.slice(0, 240))}</code>` : ""}</p>
${recall.hits.length ? `<ul>${recall.hits.map((h) => `<li><code>${esc(h.id)}</code> · relevance ${esc(h.relevance ?? "-")} · shares file: <b>${h.shares_file ? "yes" : "no"}</b> · shares key: <b>${h.shares_key ? "yes" : "no"}</b><br><small>${esc(h.wrong_assumption ?? h.concept ?? "")}${h.file ? ` · ${esc(h.file)}` : ""}</small></li>`).join("")}</ul>` : "<p><i>no related lessons</i></p>"}`;
  const pendingCmd = s.disposition === "pending"
    ? `<p>Stored only after approval: <code>npm run approve -- --report ${esc(reportPath)} --decision approve|reject --by &lt;name&gt;</code></p>`
    : "";
  const approval = r.approval ? `<p>Decision: <b>${esc(r.approval.decision)}</b> by ${esc(r.approval.by)} at ${esc(r.approval.at)}${r.approval.lesson ? ` · ${esc(r.approval.lesson)}` : ""}</p>` : "";
  return `<h2>Lesson</h2>
<div class="box ${s.disposition === "not_created" || (recall?.ran && !recall.ok) ? "bad" : "ok"}">
<p class="v ${badge}">${esc(label)}</p>
${writeLine}${lessonBody}${recallBody}${pendingCmd}${approval}
</div>`;
}

export function renderExplainReport(r: ExplainWhyResult, reportPath = "report.json"): string {
  const tp = r.three_piece;
  const a = r.answer;
  const verified = a?.status === "verified";
  return `<!doctype html><meta charset="utf-8"><title>why-code-exists: explain why — ${esc(tp.error_id)}</title>
<style>body{font:14px system-ui;max-width:1050px;margin:2em auto;padding:0 1em}pre{background:#f5f5f5;padding:.7em;overflow:auto;white-space:pre-wrap}
.box{border:1px solid #bbb;border-radius:6px;padding:.6em 1em;margin:.8em 0}.box.ok{background:#f3fbf3}.box.bad{background:#fdf2f2}
.v{font-size:1.2em;padding:.4em .7em;border-radius:6px;display:inline-block}.v.verified{background:#d9f7d9}.v.unverified{background:#fde2c8}.v.stage{background:#eee}
.v.pending{background:#fff3c4}.v.stored{background:#d9f7d9}.v.rejected{background:#eee}
.tag{font-size:.8em;padding:.1em .5em;border-radius:4px;background:#e3ecff}.quote.ok{background:#e8f8e8}.quote.bad{background:#fbe5e5}
blockquote{margin:.4em 0;padding:.3em .6em;border-left:3px solid #999}</style>
<h1>Why does this code exist?</h1>
<h2>The three pieces (deterministic, no LLM)</h2>
${piece("1. Asked", tp.asked)}${piece("2. Understood", tp.understood)}${piece("3. Happened", tp.happened ? { text: tp.happened.text, citation: tp.happened.citation, valid: tp.happened.valid } : undefined)}

${renderLocateSection(r.locate)}
<h2>Why it broke (the tool's own account, verified against the code and the transcript)</h2>
<div class="box"><p class="v ${r.stage === "ok" ? (verified ? "verified" : "unverified") : "stage"}">${r.stage === "ok" ? (verified ? "VERIFIED" : "UNVERIFIED") : esc(r.stage)}</p>
<p>${esc(STAGE_MEANING[r.stage] ?? "")}</p>
<p>Provider: <code>${esc(r.provider)}</code>${r.reason ? `</p><p><b>${esc(r.reason)}</b>` : ""}</p></div>
${a ? `<div class="box ${verified ? "ok" : "bad"}">
<p><b>Overlooked assumption:</b> ${esc(a.overlooked_assumption)}</p>
<p><b>Why it breaks:</b> ${esc(a.why_it_breaks)}</p>
<p><b>Confidence (model-stated):</b> ${esc(a.confidence)} · <b>verified code quotes:</b> ${a.verified_code_quotes} · <b>verified transcript quotes:</b> ${a.verified_transcript_quotes}</p>
<h3>Evidence</h3>
${a.evidence.map((e) => `<blockquote class="quote ${e.verified ? "ok" : "bad"}">“${esc(e.quote)}”<br><small>${esc(e.kind)} ${e.kind === "code" ? `<code>${esc(e.file)}:${e.line}</code>` : `<code>L${e.line}</code>`} — <b>${e.verified ? "verified" : `NOT verified${e.reason ? ` (${esc(e.reason)})` : ""}`}</b></small></blockquote>`).join("") || "<p>none</p>"}
</div>` : ""}
${r.repair.attempted ? `<h3>Repair (one bounded re-ask)</h3><p>Attempted: yes · outcome: <b>${esc(r.repair.outcome)}</b></p><p>Quotes that failed before the repair:</p><ul>${r.repair.failed_quotes.map((f) => `<li>${esc(f.kind)} ${f.kind === "code" ? `${esc(f.file)}:${f.line}` : `L${f.line}`} — “${esc(f.quote)}” ${f.reason ? `(${esc(f.reason)})` : ""}</li>`).join("")}</ul>` : ""}
${r.context ? `<h3>Context given to the model</h3><p>Char budget: ${r.context.budget.used_chars} / ${r.context.budget.max_chars}${r.context.budget.truncated ? " (truncated)" : ""}</p>${r.context.budget.dropped_sections.length ? `<details><summary>dropped sections (${r.context.budget.dropped_sections.length})</summary><ul>${r.context.budget.dropped_sections.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></details>` : ""}<details><summary>full prompt payload</summary>${pre(JSON.stringify(r.context.prompt_user, null, 1))}</details>` : ""}
${renderLessonSection(r, reportPath)}
<h2>LLM calls (${r.calls.length})</h2><ul>${r.calls.map((c) => `<li>${esc(c.label)} · ${esc(c.model)} · ${c.ok ? "ok" : "FAILED"}${c.reason ? ` (${esc(c.reason)})` : ""}</li>`).join("") || "<li>none</li>"}</ul>
<h2>Optional corroboration (never gates this output)</h2>
<p>The lesson section above is the Meterless record for this report. It is written only by <code>npm run approve</code> after a person accepts a verified explanation. Reject records the decision and stores nothing.</p>
<ul>
<li><b>Zetaris evidence</b> — <code>npm run zetaris:ping</code> checks connectivity; the cross-source SQL check (error log + code edits + app DB writes) that already backs the investigate pipeline can be run the same way against this case.</li>
</ul>`;
}

export function writeExplainReport(r: ExplainWhyResult, path: string): void {
  writeFileSync(path, renderExplainReport(r, path));
}
