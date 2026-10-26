/**
 * Reframed pipeline: error -> exact agent edit -> the agent's belief at that edit (verbatim-quoted, string-match checked) -> evidence that
 * contradicts it, labelled by evidence kind. Sandbox/real-code reproduction is optional corroboration supplied separately and never gates or
 * downgrades the report. Ground truth (a real fix) is read only AFTER the engine's output is frozen and hashed, for comparison.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { blameFrame, rankCommits, stems, type Candidate, type Hunk } from "./localize.js";
import { githubProvenance, mergeDiff, repoSlug, type GithubProvenance } from "../session/github.js";
import { llmJson, obj, str, type LlmCall } from "../engine/llm.js";
import type { LlmProvider } from "../llm/providers.js";

const git = (repo: string, args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 1 << 30 });
const sha = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const ws = (s: string) => s.replace(/\s+/g, " ").trim();

export interface RealError { id: string; message: string; behaviour?: string; frames: Array<{ file: string; line: number; function?: string }>; observed_at: string; source_url: string; source_note?: string; repo: { url: string; commit: string } }
export interface Quote { segment_id: string; quote: string; match: "exact" | "whitespace_normalized" | "not_found"; url?: string }
export interface Check { id: string; file: string; anchor_regex: string; test_regex: string; expect_if_belief_true: "match" | "no_match"; meaning: string }
export interface CheckResult extends Check { anchor_found: boolean; test_matched?: boolean; outcome: "contradicts_belief" | "consistent_with_belief" | "invalid"; excerpt?: string; note?: string }

export interface ReframeReport {
  schema: "why-code-exists/reframe@1";
  error: RealError;
  localization: { method: string; stems?: string[]; window?: unknown; shortlist?: Array<{ commit: string; subject: string; score: number; hunks: string[] }>; pick?: { hunk_id: string; reason: string } | null; edit?: { commit: string; file: string; lines: [number, number]; added: string; still_present_at_head: boolean; blamed_to?: string[] } };
  provenance?: GithubProvenance;
  belief?: { statement: string; kind: string; grounding_type: "stated" | "enacted"; quotes: Quote[]; code_quote: { file: string; quote: string; match: Quote["match"] }; how_error_contradicts: string; verified: boolean; error_link_stems?: string[] };
  evidence: Array<{ kind: "production_error" | "independent_repo_code"; label: string; detail: string; source: string; result?: CheckResult }>;
  verdict: "belief_contradicted_independent" | "belief_contradicted_error_only" | "belief_unverified" | "no_agent_edit" | "no_candidate";
  frozen: { sha256: string; at: string };
  corroboration?: unknown;
  ground_truth_comparison?: unknown;
  calls: LlmCall[];
  independent?: { valid_checks: number; contradicting: number; consistent: number };
  oracle_localization?: string;
}

function enclosingSymbol(repo: string, file: string, line: number): string | undefined {
  const src = readFileSync(join(repo, file), "utf8").split("\n");
  for (let i = Math.min(line - 1, src.length - 1); i >= 0; i--) { const m = /^\s*(?:export\s+)?(?:async\s+)?(?:class|def|function|interface|enum|type)\s+(\w+)/.exec(src[i]); if (m) return m[1]; }
}
function definedNames(added: string): string[] {
  return [...new Set([...added.matchAll(/^\s*(?:(?:async\s+)?def\s+|class\s+|(?:export\s+)?(?:const|let|function)\s+)?([A-Za-z_]\w{3,})\s*(?:=|\(|:)/gm)].map((m) => m[1]))].slice(0, 6);
}
/** Usage sites of the edited symbol(s), ranked by co-occurrence with error stems nearby. Generic code context for the evidence step. */
function usageSites(repo: string, symbols: string[], errStems: string[], editFile: string, max = 14): string {
  const hits: Array<{ file: string; line: number; score: number }> = [];
  for (const s of symbols) {
    let out = ""; try { out = git(repo, ["grep", "-n", "-w", s, "--", "*.py", "*.ts", "*.js", "*.go", ":(exclude)tests/**", ":(exclude)**/test_*", ":(exclude)**/*.test.*"]); } catch { continue; }
    for (const l of out.split("\n").filter(Boolean).slice(0, 4000)) { const m = /^([^:]+):(\d+):/.exec(l); if (m) hits.push({ file: m[1], line: Number(m[2]), score: 0 }); }
  }
  const cache = new Map<string, string[]>();
  for (const h of hits) {
    if (!cache.has(h.file)) cache.set(h.file, readFileSync(join(repo, h.file), "utf8").split("\n"));
    const win = cache.get(h.file)!.slice(Math.max(0, h.line - 26), h.line + 25).join("\n");
    const ws2 = new Set(stems(win)); h.score = errStems.filter((s) => ws2.has(s)).length + (h.file === editFile ? -5 : 0);
  }
  const seen = new Set<string>();
  return hits.sort((a, b) => b.score - a.score).filter((h) => { const k = `${h.file}:${Math.floor(h.line / 10)}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, max)
    .map((h) => { const src = cache.get(h.file)!; const a = Math.max(0, h.line - 5), b = Math.min(src.length, h.line + 5); return `--- ${h.file}:${a + 1}-${b}\n` + src.slice(a, b).map((t, i) => `${a + 1 + i}: ${t}`).join("\n"); }).join("\n");
}

function verifyQuote(text: string, q: string): Quote["match"] { if (!q.trim()) return "not_found"; if (text.includes(q)) return "exact"; return ws(text).includes(ws(q)) ? "whitespace_normalized" : "not_found"; }

export function runCheck(repo: string, c: Check): CheckResult {
  const p = join(repo, c.file);
  if (!existsSync(p) || /(^|\/)tests?\//.test(c.file)) return { ...c, anchor_found: false, outcome: "invalid", note: "file missing or a test file" };
  let anchor: RegExp, test: RegExp;
  try { anchor = new RegExp(c.anchor_regex, "m"); test = new RegExp(c.test_regex, "ms"); } catch (e) { return { ...c, anchor_found: false, outcome: "invalid", note: `bad regex: ${(e as Error).message}` }; }
  const src = readFileSync(p, "utf8");
  const am = anchor.exec(src);
  if (!am) return { ...c, anchor_found: false, outcome: "invalid", note: "anchor not found: the check does not cover any code (empty scope)" };
  const tm = test.exec(src);
  const matched = !!tm;
  const believed = c.expect_if_belief_true === "match";
  const at = src.slice(0, am.index).split("\n").length;
  const lines = src.split("\n");
  const excerpt = lines.slice(at - 1, at + 14).map((t, i) => `${at + i}: ${t}`).join("\n");
  return { ...c, anchor_found: true, test_matched: matched, outcome: matched === believed ? "consistent_with_belief" : "contradicts_belief", excerpt };
}

export async function explain(o: { error: RealError; repoDir: string; provider?: LlmProvider; shortlist?: number; windowDays?: number; oracleEdit?: { commit: string; file: string } }): Promise<ReframeReport> {
  const { error, repoDir } = o; const provider = o.provider ?? "openai"; const calls: LlmCall[] = [];
  const head = git(repoDir, ["rev-parse", "HEAD"]).trim();
  if (!head.startsWith(error.repo.commit.slice(0, 12))) throw new Error(`repo HEAD ${head} != error.repo.commit ${error.repo.commit}`);
  const slug = repoSlug(error.repo.url);
  const errText = [error.message, error.behaviour ?? ""].join("\n");
  const rep: ReframeReport = { schema: "why-code-exists/reframe@1", error, localization: { method: "" }, evidence: [], verdict: "no_candidate", frozen: { sha256: "", at: "" }, calls };

  // 1. Localize to one edit.
  let edit: { commit: string; hunk: Hunk } | undefined;
  const frame = error.frames.find((f) => existsSync(join(repoDir, f.file)));
  if (o.oracleEdit) {
    // ORACLE (ablation only): edit commit+file supplied by a human from ground truth; tests the belief/evidence stages in isolation.
    const raw = git(repoDir, ["diff", "-U0", `${o.oracleEdit.commit}^1`, o.oracleEdit.commit, "--", o.oracleEdit.file]);
    const m = /@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw)!; let n = Number(m[1]);
    const added = raw.split("\n").slice(raw.split("\n").findIndex((l) => l.startsWith("@@")) + 1).filter((l) => l.startsWith("+")).map((l) => ({ line: n++, text: l.slice(1) }));
    rep.oracle_localization = `ORACLE: edit ${o.oracleEdit.commit.slice(0, 10)} ${o.oracleEdit.file} supplied from ground truth; localization NOT tested in this run`;
    rep.localization.method = rep.oracle_localization;
    edit = { commit: o.oracleEdit.commit, hunk: { id: "oracle", commit: o.oracleEdit.commit, file: o.oracleEdit.file, start: added[0].line, added } };
  } else if (frame) {
    const b = blameFrame(repoDir, frame.file, frame.line)!;
    rep.localization.method = `git blame ${frame.file}:${frame.line}`;
    const line = readFileSync(join(repoDir, frame.file), "utf8").split("\n")[frame.line - 1];
    edit = { commit: b.commit, hunk: { id: "frame", commit: b.commit, file: frame.file, start: frame.line, added: [{ line: frame.line, text: line }] } };
  } else {
    const r = rankCommits(repoDir, errText, error.message, error.observed_at, o.windowDays ?? 7, o.shortlist ?? 25);
    rep.localization = { method: `text-only error: IDF-ranked first-parent commits in the ${o.windowDays ?? 7} days before observed_at by error-stem matches in added code lines (best hunk), then one LLM pick from the shortlist`, stems: r.stems, window: r.window,
      shortlist: r.candidates.map((c) => ({ commit: c.commit, subject: c.subject, score: c.score, hunks: c.hunks.map((h) => h.id) })) };
    const shown = r.candidates.map((c: Candidate) => ({ commit: c.commit.slice(0, 10), subject: c.subject, date: c.date,
      hunks: c.hunks.slice(0, 4).map((h) => ({ id: h.id, file: h.file, added: h.added.slice(0, 14).map((a) => `${a.line}: ${a.text}`).join("\n") })) }));
    const pick = await llmJson<{ hunk_id: string; reason: string }>({ provider, label: "reframe_pick_edit", maxTokens: 600,
      system: "You localize a production error to the code change that introduced it. You get the error (message + observed behaviour, no stack trace) and a shortlist of recent commits with their added code hunks. Pick the ONE hunk whose change most plausibly made this error start happening (e.g. it newly routes data into code that cannot handle it, or changes behaviour on the failing path). Answer with its exact hunk id, or \"none\" if no hunk plausibly explains it. Reason in at most 3 sentences.",
      user: { error: errText, candidates: shown }, schema: obj({ hunk_id: str, reason: str }) }, calls);
    const all = r.candidates.flatMap((c) => c.hunks);
    const h = all.find((x) => x.id === pick.hunk_id);
    rep.localization.pick = pick;
    if (!h) { rep.verdict = "no_candidate"; return freeze(rep); }
    edit = { commit: h.commit, hunk: h };
  }
  const h = edit.hunk;
  const lines: [number, number] = [h.added[0].line, h.added[h.added.length - 1].line];
  // Still present at HEAD? Blame the added lines (by text) at HEAD.
  const headSrc = existsSync(join(repoDir, h.file)) ? readFileSync(join(repoDir, h.file), "utf8").split("\n") : [];
  const blamed = new Set<string>(); let present = 0;
  for (const a of h.added.filter((x) => x.text.trim())) { const i = headSrc.indexOf(a.text); if (i >= 0) { present++; const b = blameFrame(repoDir, h.file, i + 1); if (b) blamed.add(b.commit.slice(0, 10)); } }
  rep.localization.edit = { commit: edit.commit, file: h.file, lines, added: h.added.map((a) => a.text).join("\n"), still_present_at_head: present > 0, blamed_to: [...blamed] };

  // 2. Provenance: PR + agent authorship + agent text.
  const prov = githubProvenance(slug, edit.commit); rep.provenance = prov;
  if (!prov.agent.is_agent) { rep.verdict = "no_agent_edit"; return freeze(rep); }

  // 3. Belief, quoted verbatim from the agent's own text and the code.
  const diff = prov.pr?.merge_commit ? mergeDiff(repoDir, edit.commit) : git(repoDir, ["show", edit.commit]).slice(0, 20000);
  const segs = prov.segments.map((s) => ({ id: s.id, kind: s.kind, author: s.author, text: s.text.slice(0, 6000) }));
  const b = await llmJson<{ statement: string; kind: string; grounding_type: "stated" | "enacted"; quotes: Array<{ segment_id: string; quote: string }>; code_quote: { file: string; quote: string }; how_error_contradicts: string }>({ provider, label: "reframe_belief", maxTokens: 1200,
    system: "A coding agent made the edit below; later this production error happened. State the ONE belief the agent acted on at this edit that the error shows was wrong — a concrete, checkable statement about how the code/system behaves (not a restatement of the error, not a fix). Ground it: give 1-3 quotes copied CHARACTER-FOR-CHARACTER from the agent's text segments (use the segment id) that state or most directly show the belief, and one line copied exactly from the edit's added code. grounding_type='stated' if the agent's prose says it, 'enacted' if only the code implies it. how_error_contradicts: 1-2 sentences linking the error to the belief. Quotes that are not exact substrings are rejected.",
    user: { error: errText, edit_hunk: { file: h.file, lines, added: rep.localization.edit.added }, pr_code_diff: diff, agent_text_segments: segs },
    schema: obj({ statement: str, kind: { type: "string", enum: ["data_invariant", "input_domain", "ordering_concurrency", "external_response", "code_contract"] }, grounding_type: { type: "string", enum: ["stated", "enacted"] },
      quotes: { type: "array", items: obj({ segment_id: str, quote: str }) }, code_quote: obj({ file: str, quote: str }), how_error_contradicts: str }) }, calls);
  const quotes: Quote[] = b.quotes.map((q) => { const s = prov.segments.find((x) => x.id === q.segment_id); return { ...q, match: s ? verifyQuote(s.text, q.quote) : "not_found", url: s?.url }; });
  // Code quote is checked against the file as it was right after the edit's commit (multi-line quotes cannot match "+"-prefixed diff text).
  let fileAtEdit = ""; try { fileAtEdit = git(repoDir, ["show", `${edit.commit}:${b.code_quote.file}`]); } catch { /* file not in that commit */ }
  const codeMatch = verifyQuote(fileAtEdit + "\n" + rep.localization.edit.added, b.code_quote.quote);
  const verified = quotes.some((q) => q.match !== "not_found") && codeMatch !== "not_found";
  rep.belief = { statement: b.statement, kind: b.kind, grounding_type: quotes.some((q) => q.match !== "not_found") ? b.grounding_type : "enacted", quotes, code_quote: { ...b.code_quote, match: codeMatch }, how_error_contradicts: b.how_error_contradicts, verified };
  // Generic link guard: the belief must mention at least one identifier stem from the error; otherwise it is about something else.
  const linkStems = stems(b.statement + " " + b.code_quote.quote).filter((x) => stems(errText).includes(x));
  rep.belief.error_link_stems = linkStems;
  if (!verified || linkStems.length === 0) { rep.verdict = "belief_unverified"; return freeze(rep); }
  rep.evidence.push({ kind: "production_error", label: "Contradicted by the production error itself", detail: b.how_error_contradicts, source: error.source_url });

  // 4. Independent evidence: checks over the repo code at the error commit, written and frozen BEFORE they are evaluated.
  const errStems = stems(errText);
  const syms = [enclosingSymbol(repoDir, h.file, lines[0]), ...definedNames(rep.localization.edit.added)].filter((x): x is string => !!x);
  const ctx = usageSites(repoDir, [...new Set(syms)], errStems, h.file);
  const ck = await llmJson<{ checks: Check[] }>({ provider, label: "reframe_checks", maxTokens: 1500,
    system: "Write 1-3 deterministic checks over the repository's NON-TEST source code that would come out differently if the belief were true vs false. Each check: file (repo-relative path that appears in the code context), anchor_regex (JavaScript regex, multiline mode, that must match in that file so the check covers real code), test_regex (JavaScript regex, flags 'ms'), expect_if_belief_true ('match' or 'no_match'), meaning (one sentence). Checks must test the code's contracts/behaviour (types, guards, call sites, what a hook is declared to accept), not restate the error, and must not depend on any test file. You will NOT see results; they are run once, as written.",
    user: { belief: b.statement, edit: { file: h.file, lines, added: rep.localization.edit.added }, code_context: ctx },
    schema: obj({ checks: { type: "array", items: obj({ id: str, file: str, anchor_regex: str, test_regex: str, expect_if_belief_true: { type: "string", enum: ["match", "no_match"] }, meaning: str }) } }) }, calls);
  const checks = ck.checks.slice(0, 3);
  const checksHash = sha(checks);
  for (const c of checks) {
    const r = runCheck(repoDir, c);
    rep.evidence.push({ kind: "independent_repo_code", label: r.outcome === "contradicts_belief" ? "Contradicted by independent evidence (repository code)" : r.outcome === "consistent_with_belief" ? "Independent check consistent with the belief" : "Independent check invalid (not counted)",
      detail: `${c.meaning} [checks frozen sha256 ${checksHash.slice(0, 16)} before evaluation]`, source: `${error.repo.url}/blob/${error.repo.commit}/${c.file}`, result: r });
  }
  // Independent only if every valid check contradicts the belief; any consistent check makes the independent evidence mixed (not counted).
  const valid = rep.evidence.filter((e) => e.result && e.result.outcome !== "invalid");
  const contra = valid.filter((e) => e.result!.outcome === "contradicts_belief").length;
  rep.independent = { valid_checks: valid.length, contradicting: contra, consistent: valid.length - contra };
  rep.verdict = valid.length > 0 && contra === valid.length ? "belief_contradicted_independent" : "belief_contradicted_error_only";
  return freeze(rep);
}

function freeze(r: ReframeReport): ReframeReport { const { frozen, corroboration, ground_truth_comparison, ...core } = r; r.frozen = { sha256: sha(core), at: new Date().toISOString() }; return r; }
