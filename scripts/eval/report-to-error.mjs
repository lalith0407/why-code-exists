// Eval adapter (not product code): wraps a plain-text user report as a ProdError.
// message = the whole report text. frames = every "path.ext:line" found in it by one generic regex
// (stack traces only; plain reports yield none). No per-case logic.
import { readFileSync } from "node:fs";
const [, , inPath, caseId] = process.argv;
const text = readFileSync(inPath, "utf8");
const re = /(?:at\s+([\w$.<>]+)\s+\()?((?:[\w@.-]+\/)*[\w@.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|rs)):(\d+)(?::(\d+))?/g;
const frames = []; const seen = new Set();
for (const m of text.matchAll(re)) {
  const key = `${m[2]}:${m[3]}`; if (seen.has(key)) continue; seen.add(key);
  frames.push({ file: m[2], line: Number(m[3]), ...(m[4] ? { column: Number(m[4]) } : {}), ...(m[1] ? { function: m[1] } : {}) });
}
process.stdout.write(JSON.stringify({ id: caseId, timestamp: "1970-01-01T00:00:00Z", severity: "error", service: "unknown", message: text, frames }, null, 1));
