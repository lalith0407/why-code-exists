/**
 * Before-merge review of a coding-agent PR. Generic: no per-repo / per-PR logic.
 * PR -> local base/head checkout -> agent detection + agent text (github.ts) -> stated (verbatim, string-checked) + implied assumptions
 * -> deterministic consumer map (Python ast / TS compiler API) -> per-site model judgement (gpt-4.1-mini, Nemotron second check)
 * -> flags only when cited change lines AND cited site lines validate against the shown code.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { githubProvenance, type GithubProvenance } from "../session/github.js";
import { llmJson, obj, str, type LlmCall } from "../engine/llm.js";
import { tsConsumers } from "./ts-consumers.js";

const REPOS = process.env.WCE_PREMERGE_REPOS || "/workspace/open-agent/premerge-repos";
const git = (dir: string, args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
const ghJ = (p: string) => JSON.parse(execFileSync("gh", ["api", p], { encoding: "utf8", maxBuffer: 1 << 28 }));
const SKIP_FILE = /(^|\/)(tests?|__tests__|e2e|docs?)\/|\.(test|spec)\.|(^|\/)test_[^/]*\.py$|\.(md|json|ya?ml|lock|txt|snap|d\.ts|svg|png|css)$/i;
const CODE = /\.(py|ts|tsx|mts|cts|js|jsx|mjs)$/;

export interface Assumption { id: string; kind: "stated" | "implied"; text: string; quote?: string; segment_id?: string; url?: string; match?: "exact" | "normalized" | "not_found"; diff_lines?: string[] }
export interface Judgement { new_at_site?: any[]; breaks: boolean; assumption_id: string; site_assumption: string; explanation: string; change_lines: string[]; site_lines: string[]; confidence: "high" | "medium" | "low" }
export interface SiteResult { site: any; openai?: Judgement & { citations_ok: boolean; citation_problems: string[] }; nemotron?: (Judgement & { citations_ok: boolean; citation_problems: string[] }) | { error: string }; flag: "flag_both" | "flag_openai_only" | "none"; error?: string }
export interface PremergeReport {
  repo: string; pr: number; url: string; title: string; base: string; head: string; agent: GithubProvenance["agent"]; segments: number;
  changed_files: { file: string; ranges: [number, number][] }[]; skipped_files: string[];
  assumptions: Assumption[]; consumer_map: { python?: any; ts?: any }; results: SiteResult[]; flags: SiteResult[]; calls: LlmCall[]; narrative?: string; at: string; elapsed_s: number;
}

export function checkout(repo: string, pr: number) {
  const p = ghJ(`repos/${repo}/pulls/${pr}`);
  const dir = path.join(REPOS, repo.replace("/", "__"));
  if (!existsSync(dir)) { mkdirSync(REPOS, { recursive: true }); execFileSync("git", ["clone", "-q", "--filter=blob:none", "--no-checkout", `https://github.com/${repo}.git`, dir]); }
  try { git(dir, ["cat-file", "-t", p.head.sha]); } catch { git(dir, ["fetch", "-q", "origin", `pull/${pr}/head`]); }
  try { git(dir, ["cat-file", "-t", p.base.sha]); } catch { git(dir, ["fetch", "-q", "origin", p.base.sha]); }
  const mb = git(dir, ["merge-base", p.base.sha, p.head.sha]).trim();
  git(dir, ["-c", "advice.detachedHead=false", "checkout", "-q", "-f", p.head.sha]);
  return { p, dir, base: mb, head: p.head.sha as string };
}

/** head-side changed line ranges per code file (tests/docs excluded) + a numbered diff for the model */
export function changedRanges(dir: string, base: string, head: string) {
  const raw = git(dir, ["diff", "-U0", "--no-color", base, head]);
  const ranges: Record<string, [number, number][]> = {}; const skipped: string[] = []; let cur: string | null = null;
  for (const l of raw.split("\n")) {
    const f = l.match(/^\+\+\+ b\/(.*)$/); if (f) { cur = CODE.test(f[1]) && !SKIP_FILE.test(f[1]) ? f[1] : (skipped.push(f[1]), null); continue; }
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (h && cur) { const s = +h[1], n = h[2] === undefined ? 1 : +h[2]; (ranges[cur] ??= []).push(n === 0 ? [Math.max(1, s), Math.max(1, s)] : [s, s + n - 1]); }
  }
  // numbered diff: head line numbers on + and context lines
  const full = git(dir, ["diff", "-U3", "--no-color", base, head, "--", ...Object.keys(ranges)]);
  const out: string[] = []; let file = ""; let ln = 0; const shown = new Set<string>();
  for (const l of full.split("\n")) {
    const f = l.match(/^\+\+\+ b\/(.*)$/); if (f) { file = f[1]; out.push(`=== ${file}`); continue; }
    if (/^(diff |index |--- |\+\+\+ )/.test(l)) continue;
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/); if (h) { ln = +h[1]; out.push(l.slice(0, 80)); continue; }
    if (l.startsWith("-")) { out.push(`      - ${l.slice(1)}`); continue; }
    if (l.startsWith("+") || l.startsWith(" ")) { out.push(`${String(ln).padStart(5)} ${l[0]} ${l.slice(1)}`); shown.add(`${file}:${ln}`); ln++; }
  }
  return { ranges, skipped, numberedDiff: out, shownChange: shown };
}

const norm = (s: string) => s.replace(/[`*_>]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
function numbered(dir: string, file: string, span: [number, number], center: number, max = 70): { text: string; lines: Set<string> } {
  const L = readFileSync(path.join(dir, file), "utf8").split("\n");
  let [s, e] = span; if (e - s + 1 > max) { s = Math.max(span[0], center - Math.floor(max / 2)); e = Math.min(span[1], s + max - 1); }
  const lines = new Set<string>(); const out: string[] = [`=== ${file} (lines ${s}-${e} of ${span[0]}-${span[1]})`];
  for (let i = s; i <= e; i++) { out.push(`${String(i).padStart(5)}  ${L[i - 1] ?? ""}`); lines.add(`${file}:${i}`); }
  return { text: out.join("\n"), lines };
}
function citeCheck(cites: string[], allowed: Set<string>): string[] {
  const bad: string[] = [];
  for (const c of cites) { const m = c.match(/^(.+?):(\d+)(?:-(\d+))?$/); if (!m) { bad.push(`unparseable ${c}`); continue; } for (let i = +m[2]; i <= +(m[3] ?? m[2]); i++) if (!allowed.has(`${m[1]}:${i}`)) { bad.push(`${c} not in shown code`); break; } }
  return bad;
}

const ASSUME_SYS = `You review a pull request written by an AI coding agent, BEFORE merge. Extract the assumptions the change relies on.
"stated": assumptions the agent itself wrote. Each needs a VERBATIM quote (copied exactly, 5-40 words) from one of the given agent text segments, with its segment id.
"implied": assumptions not written down but required for the diff to be correct, especially about OTHER code that consumes what changed (e.g. "every consumer of enum X handles the new member", "callers of f() tolerate the new return value"). Cite diff lines as "path:line" using the head line numbers shown.
Max 6 stated, 6 implied. Be specific; no generic statements like "code is correct".`;
const ASSUME_SCHEMA = obj({ stated: { type: "array", items: obj({ text: str, quote: str, segment_id: str }) }, implied: { type: "array", items: obj({ text: str, diff_lines: { type: "array", items: str } }) } });

const JUDGE_SYS = `You are a pre-merge reviewer. A coding agent's PR changed some code. You are shown ONE site in the repository that consumes or contains what changed (found by static analysis), plus code it calls.
First work out WHAT IS NEW AT THIS SITE after the PR: which values, types or code paths now reach it that did not before (use any BEHAVIOUR DELTA given in why_selected; follow the data into the callees shown). Then decide whether, after this PR, this site will now misbehave (crash, wrong result, silent wrong behaviour, security hole, billing/side-effect duplication) BECAUSE of the change - i.e. the change breaks an assumption this site makes or the changed code itself breaks an assumption the agent stated/implied.
Fill new_at_site FIRST: for each value/type/path that newly reaches the site, give its concrete runtime type or shape (e.g. the object a newly-routed call actually returns, not what the PR description says), name the code that receives it (callee parameter types/annotations/casts, attribute accesses like .x, isinstance checks), and whether that code handles it. Do not trust the PR description's claims of correctness; check the code.
Rules: answer breaks=true ONLY for a concrete, specific failure path you can point to in the shown lines. Style issues, missing tests, hypothetical misuse, or "could be a problem if" are NOT breaks. If unsure, breaks=false.
Cite change_lines from the DIFF (format "path:line", head line numbers shown) and site_lines from the SITE/CALLEE code shown (format "path:line" or "path:start-end"). Both must be non-empty when breaks=true. assumption_id: id of the assumption broken (or "new" if none listed matches).`;
const JUDGE_SCHEMA = obj({ new_at_site: { type: "array", items: obj({ what: str, concrete_type_or_shape: str, handled_by: str, handled: { type: "string", enum: ["yes", "no", "unclear"] } }) }, breaks: { type: "boolean" }, assumption_id: str, site_assumption: str, explanation: str, change_lines: { type: "array", items: str }, site_lines: { type: "array", items: str }, confidence: { type: "string", enum: ["high", "medium", "low"] } });

export async function review(repo: string, pr: number, o: { maxSites?: number; second?: boolean; log?: (s: string) => void } = {}): Promise<PremergeReport> {
  const t0 = Date.now(); const log = o.log ?? (() => {}); const calls: LlmCall[] = [];
  const { p, dir, base, head } = checkout(repo, pr);
  log(`checked out ${repo}#${pr} head ${head.slice(0, 10)} base ${base.slice(0, 10)}`);
  const prov = githubProvenance(repo, p.merge_commit_sha || head, { commentsBefore: p.merged_at ?? undefined }); // pre-merge only: no post-merge agent text (leakage)
  if (prov.pr?.number !== pr) log(`warning: provenance resolved PR ${prov.pr?.number}`);
  const { ranges, skipped, numberedDiff, shownChange } = changedRanges(dir, base, head);
  const diffText = numberedDiff.slice(0, 600).join("\n") + (numberedDiff.length > 600 ? `\n... (${numberedDiff.length - 600} more diff lines truncated)` : "");
  const shownDiff = new Set([...shownChange].filter((k) => diffText.includes(`=== ${k.split(":")[0]}`)));
  // assumptions
  const segs = prov.segments.map((s) => ({ id: s.id, kind: s.kind, text: s.text.slice(0, 4000) }));
  const a = await llmJson<{ stated: { text: string; quote: string; segment_id: string }[]; implied: { text: string; diff_lines: string[] }[] }>({ provider: "openai", label: "premerge:assumptions", system: ASSUME_SYS, user: { pr_title: p.title, agent_text_segments: segs, diff: diffText }, schema: ASSUME_SCHEMA, maxTokens: 2500 }, calls);
  const assumptions: Assumption[] = [];
  a.stated.forEach((s, i) => { const seg = prov.segments.find((x) => x.id === s.segment_id); const match = seg && seg.text.includes(s.quote) ? "exact" : prov.segments.some((x) => norm(x.text).includes(norm(s.quote))) ? "normalized" : "not_found"; assumptions.push({ id: `A${i + 1}`, kind: "stated", text: s.text, quote: s.quote, segment_id: s.segment_id, url: seg?.url, match }); });
  a.implied.forEach((s, i) => assumptions.push({ id: `I${i + 1}`, kind: "implied", text: s.text, diff_lines: s.diff_lines }));
  const usable = assumptions.filter((x) => x.kind === "implied" || x.match !== "not_found");
  // consumer map
  const pyChanged = Object.fromEntries(Object.entries(ranges).filter(([f]) => f.endsWith(".py")));
  const tsChanged = Object.fromEntries(Object.entries(ranges).filter(([f]) => !f.endsWith(".py")));
  const maxSites = o.maxSites ?? 24; const cmap: PremergeReport["consumer_map"] = {}; let sites: any[] = [];
  if (Object.keys(pyChanged).length) { cmap.python = JSON.parse(execFileSync("python3", [path.join(import.meta.dirname, "py_consumers.py")], { input: JSON.stringify({ root: dir, changed: pyChanged, max_sites: maxSites }), encoding: "utf8", maxBuffer: 1 << 28 })); sites.push(...cmap.python.sites.map((s: any) => ({ ...s, lang: "python" }))); }
  if (Object.keys(tsChanged).length) { cmap.ts = tsConsumers(dir, tsChanged, maxSites); sites.push(...cmap.ts.sites.map((s: any) => ({ ...s, lang: "ts" }))); }
  // interleave: all non-self consumers first by rank, then self; overall bound
  const cons = sites.filter((s) => s.kind !== "self"), self = sites.filter((s) => s.kind === "self");
  sites = [...cons.slice(0, Math.ceil(maxSites * 2 / 3)), ...self.slice(0, Math.floor(maxSites / 3))]; sites = [...sites, ...[...cons, ...self].filter((s) => !sites.includes(s))].slice(0, maxSites);
  log(`assumptions ${assumptions.length} (${usable.length} usable); sites ${sites.length}`);
  const results: SiteResult[] = [];
  for (const s of sites) {
    const main = numbered(dir, s.file, s.span, s.line); const allowed = new Set(main.lines); const callee: string[] = [];
    for (const c of s.callees ?? []) { const n = numbered(dir, c.file, c.span, c.span[0], c.hop === 2 ? 45 : 40); callee.push(n.text); n.lines.forEach((x) => allowed.add(x)); }
    const user = { pr_title: p.title, assumptions: usable.map(({ id, kind, text, quote }) => ({ id, kind, text, quote })), diff: diffText, site: { why_selected: s.why, kind: s.kind, code: main.text }, callees: callee };
    const r: SiteResult = { site: s, flag: "none" };
    for (const prov2 of (o.second === false ? ["openai"] : ["openai", "nemotron"]) as ("openai" | "nemotron")[]) {
      if (prov2 === "nemotron" && !(r.openai?.breaks && r.openai.citations_ok)) break; // second check only on candidate flags
      try {
        const j = await llmJson<Judgement>({ provider: prov2, label: `premerge:judge:${prov2}`, system: JUDGE_SYS, user, schema: JUDGE_SCHEMA, maxTokens: 1200 }, calls);
        const probs = j.breaks ? [...(j.change_lines.length ? citeCheck(j.change_lines, shownDiff) : ["no change_lines"]), ...(j.site_lines.length ? citeCheck(j.site_lines, allowed) : ["no site_lines"])] : [];
        (r as any)[prov2] = { ...j, citations_ok: probs.length === 0, citation_problems: probs };
      } catch (e) { if (prov2 === "openai") r.error = String(e); else r.nemotron = { error: String(e).slice(0, 200) }; }
    }
    const nem: any = r.nemotron;
    if (r.openai?.breaks && r.openai.citations_ok) r.flag = nem && !nem.error && nem.breaks && nem.citations_ok ? "flag_both" : "flag_openai_only";
    results.push(r); log(`  ${s.kind} ${s.file}:${s.line} ${s.function} -> ${r.flag}${r.error ? " ERR" : ""}`);
  }
  const flags = results.filter((r) => r.flag !== "none");
  let narrative: string | undefined;
  if (flags.length) {
    try { narrative = (await llmJson<{ narrative: string }>({ provider: "openai", label: "premerge:narrative", system: "Write a short (<=120 words) plain-English 'explain why' note for the PR author: what the agent assumed (quote it if stated), which consuming code breaks that assumption, and what would happen in production. Only use the given flags; do not add new claims.", user: { title: p.title, assumptions: usable, flags: flags.map((f) => ({ site: `${f.site.file}:${f.site.line}`, ...f.openai })) }, schema: obj({ narrative: str }), maxTokens: 600 }, calls)).narrative; } catch { /* optional */ }
  }
  return { repo, pr, url: p.html_url, title: p.title, base, head, agent: prov.agent, segments: prov.segments.length, changed_files: Object.entries(ranges).map(([file, r]) => ({ file, ranges: r })), skipped_files: skipped, assumptions, consumer_map: cmap, results, flags, calls, narrative, at: new Date().toISOString(), elapsed_s: Math.round((Date.now() - t0) / 1000) };
}
