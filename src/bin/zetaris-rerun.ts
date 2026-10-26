/**
 * Re-run ONLY the Zetaris evidence step on a recorded report (same claim, same recorded real runs), writing <out>.
 * tsx src/bin/zetaris-rerun.ts --report <report.json> --transcript <t.jsonl> --out <zetaris.json> [--data dir]
 * Uses one model call per SQL attempt; never changes the tests' verdict.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadTranscript } from "../session/transcript.js";
import { zetarisConfirm } from "../engine/zetaris-step.js";
import type { LlmCall } from "../engine/llm.js";
const a = process.argv.slice(2); const opt = (k: string) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
const r = JSON.parse(readFileSync(opt("report")!, "utf8"));
const index = await loadTranscript(opt("transcript")!);
const calls: LlmCall[] = [];
const z = await zetarisConfirm({ report: r, index, repoRoot: r.tree.origin === "repo" ? r.tree.root : undefined, dataDir: opt("data"), provider: "openai" }, calls).catch((e: Error) => ({ ok: false, verdict: "error", error: e.message }));
writeFileSync(opt("out")!, JSON.stringify({ report: opt("report"), tests_verdict: r.verdict, zetaris: z, calls }, null, 2));
const zz = z as { verdict: string; original_rows?: number; patched_rows?: number; sql?: string; error?: string; sql_attempts?: unknown[]; tables_joined?: string[] };
console.log(`zetaris: ${zz.verdict} original_rows=${zz.original_rows} patched_rows=${zz.patched_rows} joined=${zz.tables_joined?.join("+")} rejected_attempts=${zz.sql_attempts?.length ?? 0} ${zz.error ?? ""}\nSQL: ${zz.sql ?? ""}`);
