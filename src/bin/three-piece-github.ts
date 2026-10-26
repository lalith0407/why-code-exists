/** usage: tsx src/bin/three-piece-github.ts --report <reframe report.json> [--fix-url u --fix-cause "..."]  (uses the provenance saved in the report; no LLM) */
import { readFileSync } from "node:fs";
import { threePieceFromGithub } from "../story/three-piece.js";
const opt = (k: string) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : undefined; };
const r = JSON.parse(readFileSync(opt("report")!, "utf8"));
const fix = opt("fix-url") ? { url: opt("fix-url")!, stated_cause: opt("fix-cause") } : undefined;
console.log(JSON.stringify(threePieceFromGithub(r.error, r.provenance, r.localization?.edit ? { file: r.localization.edit.file, lines: r.localization.edit.lines } : undefined, fix), null, 2));
