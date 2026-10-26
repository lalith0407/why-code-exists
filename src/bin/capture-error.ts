/**
 * Produce an error.json FROM A REAL RUN of the app code (never hand-written):
 *   tsx src/bin/capture-error.ts --scenario <scenario.json> (--repo <dir> | --transcript <t.jsonl>) --out <error.json>
 * scenario.json: { id, service, severity?, lang: "ts"|"python", setup, stubs?, body, symptom?: { message, frames } }
 *  - crash scenarios: the body lets the real code throw; message = the exception's own message, frames = parsed from its real stack.
 *  - symptom scenarios (no exception, wrong outcome): body checks the wrong outcome and record()s observed values; symptom.message
 *    is a reporter-style template whose {{name}} slots are filled ONLY from values recorded during the real run; symptom.frames are
 *    the entry points the reporter names. Capture fails if the outcome was not observed.
 * The output records how it was produced (context.captured_by) and contains nothing the scenario did not observe.
 */
import { frameworkShims } from "../engine/frameworks.js";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { extractFunction, langOf } from "../engine/lang.js";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { reconstructTree } from "../engine/tree.js";
import { prepareWorkspace } from "../engine/workspace.js";
import { runRealTests, type Stub } from "../engine/sandbox.js";
import { scrubText } from "../scrub.js";

import { parseFrames } from "../engine/frames.js";
const a = process.argv.slice(2);
const opt = (k: string) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
const scenarioPath = opt("scenario"), out = opt("out");
if (!scenarioPath || !out || (!opt("repo") && !opt("transcript"))) { console.error("usage: --scenario s.json (--repo dir | --transcript t.jsonl) --out error.json"); process.exit(2); }
const sc = JSON.parse(readFileSync(scenarioPath, "utf8")) as { id: string; service: string; severity?: string; lang: "ts" | "python"; setup: string; stubs?: Stub[]; body: string; symptom?: { message: string; frames: Array<{ file: string; line: number; function: string }> } };

let root = opt("repo") ? resolve(opt("repo")!) : "";
if (!root) { root = mkdtempSync(join(tmpdir(), "wce-cap-")); reconstructTree(opt("transcript")!, root); }
const ws = prepareWorkspace(root, opt("repo") ? "repo" : "transcript_replay", sc.lang);
if (sc.lang !== "python" && ws.nodeModules) ws.shims = frameworkShims(ws.root, ["next", "next-auth", "next/headers", "next/cache", "next/server"]).shims;
const run = runRealTests(sc.lang, ws, { setup: sc.setup, stubs: sc.stubs ?? [], tests: [{ name: "scenario", role: "reproduction", body: sc.body }] });
const r = run.results[0];
if (!r || r.error?.startsWith("HARNESS:")) { console.error(`scenario did not run: ${r?.error ?? run.error}\n${run.stderr}`); process.exit(1); }

let message: string, frames: Array<{ file: string; line: number; function?: string }>, kind: string;
if (sc.symptom) {
  if (!r.pass) { console.error(`symptom NOT observed on the real code: ${r.error}`); process.exit(1); }
  const vals = Object.fromEntries((r.recorded ?? []).map((x) => [String(x.name), x.value]));
  message = sc.symptom.message.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in vals)) throw new Error(`template slot {{${k}}} was not recorded by the run`); return typeof vals[k] === "string" ? (vals[k] as string) : JSON.stringify(vals[k]); });
  // A reporter names functions; the line is filled from the definition in the real tree (no line is invented).
  frames = sc.symptom.frames.map((f) => {
    if (f.line) return f;
    const p = join(ws.root, f.file);
    const ex = existsSync(p) ? extractFunction(readFileSync(p, "utf8"), f.function, langOf(f.file)) : undefined;
    if (!ex) throw new Error(`symptom frame ${f.file}:${f.function} not found in the tree`);
    return { ...f, line: ex.range[0] };
  });
  kind = "symptom report: values recorded from a real run; frames named by the reporter";
} else {
  if (r.pass || !r.stack) { console.error("crash scenario: the real code did not throw"); process.exit(1); }
  const first = r.stack.split(/\n\s+at |\nTraceback|\n  File /)[0];
  message = (sc.lang === "python" ? r.stack.trim().split("\n").at(-1)! : first).trim();
  frames = parseFrames(r.stack, ws.root); kind = "exception message and stack frames from a real run";
}
const err = { id: sc.id, timestamp: new Date().toISOString(), severity: sc.severity ?? "error", service: sc.service, message: scrubText(message.split(ws.root + "/").join("")).text, frames,
  context: { captured_by: `src/bin/capture-error.ts --scenario ${scenarioPath} (${kind})`, tree: ws.origin } };
writeFileSync(out, JSON.stringify(err, null, 2) + "\n");
console.log(JSON.stringify(err, null, 2));
