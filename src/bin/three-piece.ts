/** usage: tsx src/bin/three-piece.ts --error <error.json> --transcript <t.jsonl>   (deterministic; no LLM, no network) */
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconstructTree } from "../engine/tree.js";
import { basename } from "node:path";
import { loadTranscript } from "../session/transcript.js";
import { threePieceFromTranscript } from "../story/three-piece.js";
const opt = (k: string) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : undefined; };
const e = opt("error"), t = opt("transcript");
if (!e || !t) { console.error("usage: --error <error.json> --transcript <t.jsonl> [--repo dir]"); process.exit(2); }
const idx = await loadTranscript(t);
const repo = opt("repo");
let root = repo;
if (!root) { const d = mkdtempSync(join(tmpdir(), "wce-3p-")); reconstructTree(t, d); root = d; }
const read = (f: string) => { const p = join(root!, f); return existsSync(p) && statSync(p).isFile() ? readFileSync(p, "utf8") : undefined; };
console.log(JSON.stringify(threePieceFromTranscript(JSON.parse(readFileSync(e, "utf8")), idx, basename(t), read), null, 2));
