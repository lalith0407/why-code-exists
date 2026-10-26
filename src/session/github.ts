/**
 * GitHub provenance source (read-only, generic). Given a local clone and a commit, find the PR that merged it (gh api), detect agent authorship
 * from PR / commit metadata, and collect the agent's own text (PR title+body, commit messages, the agent's review/issue replies) as numbered
 * "session segments" from which beliefs are quoted. No per-repo or per-PR logic.
 */
import { execFileSync } from "node:child_process";

export interface Segment { id: string; kind: "pr_title" | "pr_body" | "commit_message" | "agent_comment"; url: string; author: string; text: string }
export interface AgentEvidence { signal: string; detail: string }
export interface GithubProvenance {
  repo: string; pr?: { number: number; url: string; title: string; author: string; author_is_bot: boolean; merged_at?: string; merge_commit?: string };
  commit: string; agent: { is_agent: boolean; name?: string; evidence: AgentEvidence[] }; segments: Segment[]; method: string;
}

const gh = (args: string[]) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 1 << 28 });
const ghJson = <T>(path: string, paginate = false): T => {
  const out = gh(["api", ...(paginate ? ["--paginate", "--slurp"] : []), "-H", "Accept: application/vnd.github+json", path]);
  const j = JSON.parse(out); return (paginate ? (j as unknown[][]).flat() : j) as T;
};

/** Known coding-agent identities (bots and trailer names). Generic: applies to any repo. */
const AGENT_LOGIN = /^(copilot-swe-agent|Copilot|devin-ai-integration|openhands-agent|codex|chatgpt-codex-connector|claude|cursor|cursoragent|google-labs-jules|sweep-ai|factory-droid|amazon-q-developer)(\[bot\])?$/i;
const AGENT_TRAILER = /^Co-Authored-By:\s*(.*?(Devin|Claude|Copilot|Cursor|Codex|OpenHands|Jules|Aider|Amp|Factory)[^<\n]*)<[^>\n]*>/gim;
const AGENT_NAME = (s: string) => /devin/i.test(s) ? "Devin" : /copilot/i.test(s) ? "GitHub Copilot coding agent" : /claude/i.test(s) ? "Claude Code" : /cursor/i.test(s) ? "Cursor agent" : /codex/i.test(s) ? "OpenAI Codex" : /openhands/i.test(s) ? "OpenHands" : /jules/i.test(s) ? "Jules" : s;

export function repoSlug(url: string): string { return url.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, ""); }

export function githubProvenance(repo: string, commit: string, opts: { commentsBefore?: string } = {}): GithubProvenance {
  const evidence: AgentEvidence[] = []; const segments: Segment[] = [];
  const pulls = ghJson<any[]>(`repos/${repo}/commits/${commit}/pulls`);
  const pr = pulls.find((p) => p.merged_at) ?? pulls[0];
  const res: GithubProvenance = { repo, commit, agent: { is_agent: false, evidence }, segments, method: "gh api repos/{repo}/commits/{sha}/pulls -> PR; PR author, commit authors and Co-Authored-By trailers -> agent; PR title/body, commit messages, agent-authored comments -> segments" };
  if (!pr) { res.method += " (no PR found for commit)"; return res; }
  const p = ghJson<any>(`repos/${repo}/pulls/${pr.number}`);
  res.pr = { number: p.number, url: p.html_url, title: p.title, author: p.user.login, author_is_bot: p.user.type === "Bot", merged_at: p.merged_at ?? undefined, merge_commit: p.merge_commit_sha ?? undefined };
  if (AGENT_LOGIN.test(p.user.login)) evidence.push({ signal: "pr_author", detail: `PR opened by ${p.user.login} (type ${p.user.type})` });
  segments.push({ id: "S0", kind: "pr_title", url: p.html_url, author: p.user.login, text: p.title });
  segments.push({ id: "S1", kind: "pr_body", url: p.html_url, author: p.user.login, text: p.body ?? "" });
  const commits = ghJson<any[]>(`repos/${repo}/pulls/${pr.number}/commits?per_page=100`, true);
  const agentLogins = new Set<string>(AGENT_LOGIN.test(p.user.login) ? [p.user.login] : []);
  for (const c of commits) {
    const login = c.author?.login ?? c.commit.author?.name ?? "";
    if (AGENT_LOGIN.test(login) || AGENT_LOGIN.test((c.commit.author?.name ?? "").replace(/\s/g, ""))) { evidence.push({ signal: "commit_author", detail: `${c.sha.slice(0, 10)} authored by ${c.commit.author?.name} <${c.commit.author?.email}>` }); agentLogins.add(login); }
    for (const m of (c.commit.message as string).matchAll(AGENT_TRAILER)) evidence.push({ signal: "co_authored_by_trailer", detail: `${c.sha.slice(0, 10)}: Co-Authored-By: ${m[1].trim()}` });
    segments.push({ id: `S${segments.length}`, kind: "commit_message", url: c.html_url, author: c.commit.author?.name ?? "", text: c.commit.message });
  }
  const comments = [...ghJson<any[]>(`repos/${repo}/issues/${pr.number}/comments?per_page=100`, true), ...ghJson<any[]>(`repos/${repo}/pulls/${pr.number}/comments?per_page=100`, true)];
  for (const c of comments) if (!(opts.commentsBefore && c.created_at && c.created_at > opts.commentsBefore) && (agentLogins.has(c.user?.login) || AGENT_LOGIN.test(c.user?.login ?? ""))) segments.push({ id: `S${segments.length}`, kind: "agent_comment", url: c.html_url, author: c.user.login, text: c.body ?? "" });
  const names = evidence.map((e) => e.detail);
  res.agent = { is_agent: evidence.length > 0, name: evidence.length ? AGENT_NAME(names.join(" ")) : undefined, evidence: dedupe(evidence) };
  return res;
}
function dedupe(e: AgentEvidence[]): AgentEvidence[] { const s = new Set<string>(); return e.filter((x) => { const k = x.signal + x.detail.replace(/^\w+: /, ""); if (s.has(k)) return false; s.add(k); return true; }); }

/** Code diff of a PR's merge (vs its first parent) restricted to non-test code files, for belief extraction. */
export function mergeDiff(localRepo: string, mergeCommit: string, maxLines = 400): string {
  const out = execFileSync("git", ["-C", localRepo, "diff", "-U3", `${mergeCommit}^1`, mergeCommit, "--", ".", ":(exclude)tests/**", ":(exclude)**/test_*", ":(exclude)**/*.test.*", ":(exclude)**/*.md", ":(exclude)**/*.d.ts", ":(exclude)**/*.yaml", ":(exclude)**/*.json"], { encoding: "utf8", maxBuffer: 1 << 28 });
  const lines = out.split("\n"); return lines.length > maxLines ? lines.slice(0, maxLines).join("\n") + `\n... (${lines.length - maxLines} more diff lines truncated)` : out;
}
