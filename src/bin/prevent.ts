/** tsx src/bin/prevent.ts --change <file with new code/diff> --lang "<language/framework>" [--provider openai|nemotron] */
import { readFileSync } from "node:fs";
import { preventCheck } from "../engine/lesson.js";
import { callsUsed } from "../engine/llm.js";
const a = process.argv.slice(2); const opt = (k: string) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
const change = opt("change"); if (!change) { console.error("usage: --change <file> --lang <language/framework>"); process.exit(2); }
const before = callsUsed();
try {
  const r = await preventCheck({ change: readFileSync(change, "utf8"), language_framework: opt("lang") ?? "unknown", provider: (opt("provider") as "openai") ?? "openai" }, []);
  console.log(JSON.stringify(r, null, 2));
  const hit = r.findings.filter((f) => f.repeats);
  console.log(hit.length ? `WARN: change repeats ${hit.length} proven lesson(s): ${hit.map((h) => h.concept).join("; ")}` : "no recalled lesson is repeated");
} catch (e) { console.error(`FAILED (visible): ${(e as Error).message}`); process.exitCode = 1; }
console.log(`LLM calls this run: ${callsUsed() - before}`);
