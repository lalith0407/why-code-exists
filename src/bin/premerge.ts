/** usage: tsx src/bin/premerge.ts owner/repo PR [--out dir] [--max-sites N] [--no-second] */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { review } from "../premerge/review.js";
import { renderPremerge } from "../report/premerge.js";
const [repo, prS, ...rest] = process.argv.slice(2);
const arg = (k: string) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
const out = arg("--out") ?? `artifacts/premerge/${repo.replace("/", "__")}-${prS}`;
mkdirSync(out, { recursive: true });
const r = await review(repo, Number(prS), { maxSites: Number(arg("--max-sites") ?? 24), second: !rest.includes("--no-second"), log: (s) => console.error(s) });
writeFileSync(path.join(out, "report.json"), JSON.stringify(r, null, 1));
writeFileSync(path.join(out, "report.html"), renderPremerge(r));
console.log(JSON.stringify({ repo, pr: r.pr, agent: r.agent.name, assumptions: r.assumptions.length, sites: r.results.length, flags: r.flags.map((f) => ({ flag: f.flag, site: `${f.site.file}:${f.site.line}`, fn: f.site.function, why: f.openai?.explanation.slice(0, 200) })), calls: r.calls.length, elapsed_s: r.elapsed_s, out }, null, 1));
