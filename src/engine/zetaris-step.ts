/**
 * Cross-source evidence on Zetaris. The query reads ONLY sources independent of the tool's own test verdicts:
 *  - ERROR_LOG: the production error given as input (one row per stack frame, plus its context fields);
 *  - CODE_EDITS: repo/commit metadata: every transcript edit (file, transcript line, tool, time, code it wrote, excerpt-capped),
 *    and `git log` of the frame file when the app is a git checkout;
 *  - APP_DB_WRITES: rows the REAL application code wrote to the app's REAL PostgreSQL tables (snapshot diff after seeding),
 *    one row per written row, columns = the app table's own fields. No test pass/fail, no test-recorded values.
 *  - USER_<NAME>: optional user-supplied *.json row arrays (--data), labeled as such.
 * NOT included (removed after judge M3): test pass/fail outcomes and values the model-written tests chose to record.
 * The model sees schemas + 2 sample rows (original run) and the claim, writes one Spark SQL SELECT; the SQL is validated against the
 * real schema (tables + qualified/unqualified columns) BEFORE running, with up to 2 repairs that see only the validation/engine error
 * and the schema (never any row counts). The SQL is hashed when it first parses and runs.
 * Outcome: rows on the ORIGINAL run's tables vs the PATCHED run's tables. "confirms" requires >=1 row on original, 0 on patched AND
 * the counterfactual tests proving the claim; otherwise "consistent_unproven" / "does_not_confirm". Errors are returned, never hidden.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ProdError } from "../types.js";
import type { TranscriptIndex } from "../session/transcript.js";
import { describeTables, runWithViews, type Table } from "../evidence/zetaris.js";
import { llmJson, obj, str, type LlmCall } from "./llm.js";
import type { LlmProvider } from "../llm/providers.js";
import type { RunResult } from "./sandbox.js";

type PTable = Table & { provenance: string };
export interface ZetarisStep {
  ok: boolean;
  sql: string; sha256: string; frozen_at: string; rationale: string;
  tables: Array<ReturnType<typeof describeTables>[number] & { provenance: string }>;
  tables_joined: string[];
  sql_attempts: Array<{ sql: string; rejected_for: string }>;
  original_rows?: number; patched_rows?: number; original_sample?: unknown[]; patched_sample?: unknown[];
  verdict: "confirms" | "consistent_unproven" | "does_not_confirm" | "no_data_trace" | "error";
  note?: string;
  error?: string;
}

const flat = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v != null && typeof v === "object" ? JSON.stringify(v) : v]));

export function errorLogTable(err: ProdError): PTable {
  const e = err as unknown as Record<string, unknown>;
  const frames = (e.frames as Array<Record<string, unknown>> | undefined) ?? [];
  const ctx = (e.context && typeof e.context === "object" ? flat(e.context as Record<string, unknown>) : {}) as Record<string, unknown>;
  const rows = (frames.length ? frames : [{}]).map((f, i) => ({ error_id: e.id ?? "error", ts: e.timestamp ?? null, severity: e.severity ?? null, service: e.service ?? null, message: e.message ?? null, frame_index: i, frame_file: f.file ?? null, frame_line: f.line ?? null, frame_function: f.function ?? null, ...Object.fromEntries(Object.entries(ctx).map(([k, v]) => [`ctx_${k.replace(/\W/g, "_")}`, v])) }));
  return { name: "ERROR_LOG", description: "production error log: one row per stack frame", provenance: "input error file", rows };
}

/** Repo/commit metadata: transcript edits (the agent's commits) and, for a git checkout, git log of the frame file. */
export function codeEditsTable(index: TranscriptIndex, frameFile: string, repoRoot?: string): PTable {
  const rows: Array<Record<string, unknown>> = [];
  for (const [file, lines] of index.byEditedFile) for (const line of lines) {
    const m = index.messages.find((x) => x.line === line);
    rows.push({ source: "agent_transcript", file, edit_line: line, tool: m?.tool_name ?? null, at: m?.started_at_ms ? new Date(m.started_at_ms).toISOString() : null, is_frame_file: file === frameFile ? 1 : 0, code_written: (m?.code_written ?? "").slice(0, 16000) });
  }
  if (repoRoot && existsSync(join(repoRoot, ".git"))) {
    const g = spawnSync("git", ["-C", repoRoot, "log", "--format=%H%x09%aI%x09%an%x09%s", "-n", "50", "--", frameFile], { encoding: "utf8" });
    for (const l of (g.stdout ?? "").split("\n").filter(Boolean)) { const [sha, at, author, subject] = l.split("\t"); rows.push({ source: "git_log", file: frameFile, edit_line: null, tool: `commit ${sha.slice(0, 12)} by ${author}: ${subject}`, at, is_frame_file: 1, code_written: "" }); }
  }
  return { name: "CODE_EDITS", description: "repo/commit metadata: each edit the coding agent made (transcript) and git commits of the frame file", provenance: repoRoot ? "agent transcript + git log" : "agent transcript", rows };
}

/** Rows the real app code wrote into its real PostgreSQL tables during one run (original or patched tree). */
export function appDbTable(run: RunResult, label: string): PTable {
  const writes = run.results.flatMap((r) => (r.db_changes ?? []).map((c) => ({ run: label, scenario: r.role === "reproduction" ? "reported_scenario" : "other_behaviour", db_table: c.table, op: c.op, ...flat(c.row) })));
  return { name: "APP_DB_WRITES", description: "rows the real application code wrote to its real PostgreSQL tables (snapshot diff after seeding); other columns are the app table's own fields; scenario says whether it was the reported scenario", provenance: `real PostgreSQL rows written by the ${label} application code`, rows: writes };
}

export function userTables(dir?: string): PTable[] {
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => {
    const v = JSON.parse(readFileSync(join(dir, f), "utf8"));
    return Array.isArray(v) ? [{ name: `USER_${basename(f, ".json").toUpperCase().replace(/\W/g, "_")}`, description: `rows from ${f}`, provenance: `user-supplied file ${join(dir, f)}`, rows: v }] : [];
  });
}

/** Spark temp views need at least one row to infer a schema; an empty table becomes one all-null sentinel row filtered by __empty. */
function viewable(t: Table, like?: Table): Table {
  const cols = [...new Set([...(like?.rows ?? []), ...t.rows].flatMap((r) => Object.keys(r)))];
  const full = (r: Record<string, unknown>) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null]));
  if (t.rows.length) return { ...t, rows: t.rows.map((r) => ({ ...full(r), __empty: 0 })) };
  return { ...t, rows: [{ ...Object.fromEntries((cols.length ? cols : ["run"]).map((c) => [c, null])), __empty: 1 }] };
}

const KW = new Set("select from where and or not in is null as on join left right inner outer full cross group by order having limit distinct case when then else end with union all exists between like count sum avg min max cast coalesce true false asc desc interval date timestamp string double int bigint over partition row_number lower upper concat to_json named_struct struct array length substring trim regexp_extract instr abs round if nvl filter collect_list size".split(" "));
/** Static check of a SELECT against the real view schemas: unknown tables, unknown qualified columns, unknown bare identifiers. */
export function validateSql(sql: string, tables: Array<{ name: string; columns: string[] }>): string[] {
  const issues: string[] = [];
  if (!/^\s*(with|select)\b/i.test(sql) || /;/.test(sql)) return ["must be a single SELECT (or WITH ... SELECT), no semicolons"];
  const cols = new Map(tables.map((t) => [t.name.toUpperCase(), new Set(t.columns.map((c) => c.split(" ")[0].toLowerCase()))]));
  const noStr = sql.replace(/'(?:''|[^'])*'/g, "''");
  const cte = new Set([...noStr.matchAll(/(?:with|,)\s*([A-Za-z_]\w*)\s+as\s*\(/gi)].map((m) => m[1].toUpperCase()));
  const alias = new Map<string, string>();
  for (const m of noStr.matchAll(/\b(?:from|join)\s+([A-Za-z_]\w*)(?:\s+(?:as\s+)?([A-Za-z_]\w*))?/gi)) {
    const t = m[1].toUpperCase();
    if (!cols.has(t) && !cte.has(t)) { issues.push(`unknown table ${m[1]}; available: ${[...cols.keys()].join(", ")}`); continue; }
    alias.set(t, t);
    if (m[2] && !/^(where|join|left|right|inner|outer|full|cross|on|group|order|limit|union|having)$/i.test(m[2])) alias.set(m[2].toUpperCase(), t);
  }
  const outAliases = new Set([...noStr.matchAll(/\bas\s+`?([A-Za-z_]\w*)`?/gi)].map((m) => m[1].toLowerCase()));
  for (const m of noStr.matchAll(/\b([A-Za-z_]\w*)\.`?([A-Za-z_]\w*)`?/g)) {
    const t = alias.get(m[1].toUpperCase());
    if (!t || cte.has(t)) continue;
    if (!cols.get(t)!.has(m[2].toLowerCase())) issues.push(`column ${m[1]}.${m[2]} does not exist in ${t}; its columns: ${[...cols.get(t)!].join(", ")}`);
  }
  if (!cte.size) {
    const used = [...alias.values()].filter((t) => cols.has(t));
    const all = new Set(used.flatMap((t) => [...cols.get(t)!]));
    const bare = noStr.replace(/\b[A-Za-z_]\w*\.`?[A-Za-z_]\w*`?/g, " ").replace(/\b(?:from|join)\s+[A-Za-z_]\w*(?:\s+(?:as\s+)?[A-Za-z_]\w*)?/gi, " ");
    for (const m of bare.matchAll(/`?\b([A-Za-z_]\w*)\b`?(?!\s*\()/g)) {
      const w = m[1].toLowerCase();
      if (KW.has(w) || all.has(w) || outAliases.has(w) || alias.has(m[1].toUpperCase()) || /^\d/.test(w)) continue;
      issues.push(`identifier ${m[1]} is not a column of the tables used (${used.join(", ")})`);
    }
  }
  return [...new Set(issues)].slice(0, 12);
}

const SYSTEM = `You write ONE Spark SQL SELECT for a federated query engine. You get table schemas (columns, sample rows, provenance) and a claim about a bug in application code written by an AI agent.
The tables are independent evidence: the production error log, the agent's code edits (repo/commit metadata), and the rows the real application wrote to its real database. There are NO test results.
Write a query that returns at least one row exactly when the data shows the harmful outcome or the mechanism the claim describes (e.g. the database rows the code wrote in the reported scenario, joined to the error log frame and the edit that wrote that file), and zero rows when the data does not show it.
Every table has a column __empty; always filter __empty = 0 on each table you use. Use only listed tables and columns, exactly as spelled. Spark SQL dialect: no JSON_OBJECT/JSON_ARRAY, string concat with concat(). No DDL, no semicolons. Return JSON {sql, rationale}.`;

export async function zetarisConfirm(o: { report: { error: ProdError; frame: { file: string }; verdict: string; claim?: { claim: string; mechanism: string }; runs?: { original: RunResult; patched: RunResult } }; index: TranscriptIndex; repoRoot?: string; dataDir?: string; provider: LlmProvider }, calls: LlmCall[]): Promise<ZetarisStep> {
  const { report } = o;
  if (!report.runs || !report.claim) throw new Error("zetaris: no runs to query");
  const fixed: PTable[] = [errorLogTable(report.error), codeEditsTable(o.index, report.frame.file, o.repoRoot), ...userTables(o.dataDir)];
  const fixedViews = fixed.map((t) => ({ ...t, ...viewable(t) }));
  const dbO = appDbTable(report.runs.original, "original"), dbP = appDbTable(report.runs.patched, "patched");
  const origViews = [...fixedViews, viewable(dbO, dbP)], patViews = [...fixedViews, viewable(dbP, dbO)];
  const prov = [...fixed, dbO].map((t) => t.provenance);
  const tables = describeTables(origViews).map((d, i) => ({ ...d, provenance: prov[i] }));
  // Only APP_DB_WRITES can differ between the original and patched runs (the error log and the edit history are fixed inputs). A query that does
  // not read it cannot discriminate the claimed cause. If the real code wrote no rows on either run, no independent source carries a trace of
  // this bug: that is recorded as such (no SQL, no model call) rather than querying data that cannot respond to the patch.
  if (!dbO.rows.length && !dbP.rows.length)
    return { ok: true, sql: "", sha256: "", frozen_at: new Date().toISOString(), rationale: "", tables, tables_joined: [], sql_attempts: [], original_rows: 0, patched_rows: 0, verdict: "no_data_trace",
      note: "the real application code wrote no database rows on either the original or the patched run, so the independent sources (error log, edit history, app DB) hold no patch-dependent trace of this bug; Zetaris cannot add evidence here" };
  const attempts: Array<{ sql: string; rejected_for: string }> = [];
  let sql = "", rationale = "";
  let a: Awaited<ReturnType<typeof runWithViews>> | undefined;
  for (let k = 0; k < 3; k++) {
    const r = await llmJson<{ sql: string; rationale: string }>({ provider: o.provider, label: `zetaris_sql:${o.provider}`, system: SYSTEM, user: { claim: report.claim.claim, mechanism: report.claim.mechanism, tables, ...(attempts.length ? { previous_sql_rejected: attempts } : {}) }, schema: obj({ sql: str, rationale: str }), maxTokens: 4000 }, calls);
    sql = r.sql.trim().replace(/;+\s*$/, ""); rationale = r.rationale;
    const bad = validateSql(sql, tables);
    if (!/\bAPP_DB_WRITES\b/i.test(sql)) bad.push("the query must read APP_DB_WRITES: it is the only source that differs between the original and the patched code, so a query without it cannot tell them apart");
    if (bad.length) { attempts.push({ sql, rejected_for: `schema validation: ${bad.join("; ")}` }); continue; }
    a = await runWithViews(origViews, [sql]);
    // Only engine (analysis/parse) errors are fed back; a successful run's rows are never shown to the model.
    if (!a.ok) { attempts.push({ sql, rejected_for: `Zetaris error: ${String(a.error).slice(0, 600)}` }); a = undefined; continue; }
    break;
  }
  const tables_joined = tables.map((t) => t.name).filter((n) => new RegExp(`\\b${n}\\b`, "i").test(sql));
  const frozen = { sql, sha256: createHash("sha256").update(sql).digest("hex"), frozen_at: new Date().toISOString(), rationale, tables, tables_joined, sql_attempts: attempts };
  if (!a) return { ok: false, ...frozen, verdict: "error", error: `no valid SQL after ${attempts.length} attempts: ${attempts.at(-1)?.rejected_for ?? ""}` };
  const b = await runWithViews(patViews, [sql]);
  if (!b.ok) return { ok: false, ...frozen, verdict: "error", error: `patched: ${b.error}` };
  const n1 = a.results[0].rowCount, n2 = b.results[0].rowCount;
  const shows = n1 > 0 && n2 === 0;
  const proven = report.verdict === "proven_false";
  return { ok: true, ...frozen, original_rows: n1, patched_rows: n2, original_sample: (a.results[0] as { rows?: unknown[] }).rows?.slice(0, 5), patched_sample: (b.results[0] as { rows?: unknown[] }).rows?.slice(0, 5),
    verdict: shows ? (proven ? "confirms" : "consistent_unproven") : "does_not_confirm",
    note: shows && !proven ? "the data differs as the claim predicts, but the counterfactual tests did not prove the claim, so this is not a confirmation" : undefined };
}
