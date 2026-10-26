/**
 * Generic localization of an error to candidate edits in git history (deterministic, no LLM).
 * - With stack frames that resolve to repo files: git blame the frame line -> introducing commit.
 * - Text-only errors (no usable frames): extract identifier stems from the error text, score every first-parent commit in a
 *   time window before the error by IDF-weighted stem matches in its ADDED code lines (tests/docs excluded), return a ranked shortlist
 *   of hunks. Nothing here knows about any specific repo, PR or bug.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface Hunk { id: string; commit: string; file: string; start: number; added: Array<{ line: number; text: string }> }
export interface Candidate { commit: string; subject: string; author: string; date: string; score: number; matched: string[]; hunks: Hunk[] }

const git = (repo: string, args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 1 << 30 });

const STOP = new Set(("object attribute attributes error errors invalid request requests response format type types none null true false value values " +
  "with from that this have will when then there their what which into does doesn others other return returns code status http https json " +
  "message model data shows show same only queued provider dashboard prompt size seconds").split(" "));

/** Identifier stems from free text: quoted tokens, CamelCase, snake_case, path segments. */
export function stems(text: string): string[] {
  const words = text.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? [];
  const out = new Set<string>();
  for (const w of words) for (const part of w.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[\s_]+/)) {
    let s = part.toLowerCase(); if (s.length > 4 && s.endsWith("s")) s = s.slice(0, -1);
    if (s.length >= 4 && !STOP.has(s) && !STOP.has(s + "s")) out.add(s);
  }
  return [...out];
}
const lineStems = (t: string) => new Set(stems(t));

const CODE = /\.(py|ts|tsx|js|jsx|mjs|go|rb|java|cs|rs|kt|php)$/;
const NONCODE = /(^|\/)(tests?|__tests__|spec|e2e|docs?|fixtures?|dist|build|out|_next|node_modules|vendor)\/|\.min\.js$|(_test|\.test|\.spec|test_[^/]*)\.\w+$|^test_|\.d\.ts$/;

export function blameFrame(repo: string, file: string, line: number): { commit: string; author: string; summary: string } | undefined {
  if (!existsSync(join(repo, file))) return undefined;
  const out = git(repo, ["blame", "--porcelain", "-L", `${line},${line}`, "--", file]);
  const commit = out.split(" ")[0];
  return { commit, author: /\nauthor (.*)/.exec(out)?.[1] ?? "", summary: /\nsummary (.*)/.exec(out)?.[1] ?? "" };
}

export function rankCommits(repo: string, errorText: string, primaryText: string, until: string, windowDays = 7, top = 40): { stems: string[]; window: { since: string; until: string; commits: number }; candidates: Candidate[] } {
  const since = new Date(Date.parse(until) - windowDays * 864e5).toISOString();
  const raw = git(repo, ["log", "--first-parent", "--diff-merges=first-parent", `--since=${since}`, `--until=${until}`, "-p", "-U0", "--no-color",
    "--format=%x01%H%x09%an <%ae>%x09%cI%x09%s", "HEAD"]);
  const q = stems(errorText);
  const primary = new Set(stems(primaryText));
  const commits: Array<Candidate & { stemset: Set<string> }> = [];
  for (const block of raw.split("\x01").slice(1)) {
    const nl = block.indexOf("\n");
    const [commit, author, date, subject] = block.slice(0, nl).split("\t");
    const c = { commit, author, date, subject, score: 0, matched: [] as string[], hunks: [] as Hunk[], stemset: new Set<string>() };
    let file = "", cur: Hunk | undefined, n = 0;
    for (const l of block.slice(nl + 1).split("\n")) {
      if (l.startsWith("+++ ")) { file = l.slice(4).replace(/^b\//, ""); cur = undefined; continue; }
      const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
      if (h) { n = Number(h[1]); cur = CODE.test(file) && !NONCODE.test(file) ? { id: "", commit, file, start: n, added: [] } : undefined; if (cur) c.hunks.push(cur); continue; }
      if (l.startsWith("+") && !l.startsWith("+++") && cur) { cur.added.push({ line: n++, text: l.slice(1) }); for (const s of lineStems(l)) c.stemset.add(s); }
    }
    c.hunks = c.hunks.filter((x) => x.added.length);
    commits.push(c);
  }
  const N = commits.length || 1;
  const idf = new Map(q.map((s) => [s, Math.log((N + 1) / (1 + commits.filter((c) => c.stemset.has(s)).length))]));
  // Score = best single hunk (the cause is local): sum of IDF of query stems co-occurring in that hunk's added lines, message stems x2.
  const wt = (s: string) => idf.get(s)! * (primary.has(s) ? 2 : 1);
  for (const c of commits) {
    c.matched = q.filter((s) => c.stemset.has(s));
    let best = 0;
    for (const h of c.hunks) { const hs = new Set(h.added.flatMap((a) => [...lineStems(a.text)])); best = Math.max(best, q.filter((s) => hs.has(s)).reduce((a, s) => a + wt(s), 0)); }
    c.score = +best.toFixed(3);
  }
  const ranked = commits.filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, top);
  // keep only hunks that mention a matched stem; id them
  for (const c of ranked) {
    c.hunks = c.hunks.filter((h) => h.added.some((a) => [...lineStems(a.text)].some((s) => c.matched.includes(s))));
    c.hunks.forEach((h, i) => (h.id = `${c.commit.slice(0, 10)}#${i}`));
  }
  return { stems: q, window: { since, until, commits: commits.length }, candidates: ranked.map(({ stemset, ...c }) => c) };
}
