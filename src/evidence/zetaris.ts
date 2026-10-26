/**
 * Zetaris evidence client.
 *
 * Prefers the UI-proxy REST path (HTTPS) because Hive JDBC port 10000 is often
 * blocked from sandboxed / cloud boxes. Credentials load from secrets/ or env.
 * Never log or return the password.
 *
 * Generic loader: any case-supplied tables (error log, app DB snapshot / repro rows, event log, harness observations)
 * are registered as session TEMP VIEWs (CREATE + SELECT in one auth session). Durable File Source on S3 is not wired
 * (needs a bucket the cluster can read) — see docs/zetaris-federation.md.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SECRETS = resolve(ROOT, "secrets");

export type ZetarisConnection = {
  signInUrl: string;
  hostname: string;
  jdbc: string;
  adminEmail: string;
  clusterIdHint?: string;
  orgId?: number | string;
  /** UI origin derived from signInUrl (no path). */
  baseUrl: string;
  /** Direct REST API base ending in /api/v1.0, if known. */
  restUrl?: string;
};

export type ZetarisQueryResult = {
  ok: boolean;
  rowCount: number;
  headers: string[];
  rows: unknown[][];
  timeUsedMs?: number;
  total?: number;
  via: "ui-proxy" | "jdbc" | "none";
  error?: string;
};

export type ZetarisPingResult = {
  ok: boolean;
  rowCount: number;
  via: string;
  error?: string;
  detail?: string;
};


function readPassword(): string {
  const fromEnv = process.env.ZETARIS_PASSWORD || process.env.WCE_ZETARIS_PASSWORD;
  if (fromEnv) return fromEnv;
  const path = resolve(SECRETS, "zetaris-admin-password.txt");
  if (!existsSync(path)) {
    throw new Error("Missing secrets/zetaris-admin-password.txt (and no ZETARIS_PASSWORD env)");
  }
  return readFileSync(path, "utf8").trim();
}

function loadConnectionFile(): Record<string, unknown> {
  const path = resolve(SECRETS, "zetaris-connection.json");
  if (!existsSync(path)) {
    throw new Error("Missing secrets/zetaris-connection.json");
  }
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

export function loadConnection(): ZetarisConnection {
  const file = loadConnectionFile();
  const signInUrl =
    (process.env.ZETARIS_SIGNIN_URL as string) ||
    String(file.signInUrl || "");
  const hostname =
    (process.env.ZETARIS_HOSTNAME as string) ||
    String(file.hostname || "");
  const jdbc =
    (process.env.ZETARIS_JDBC_URL as string) ||
    String(file.jdbc || "");
  const adminEmail =
    (process.env.ZETARIS_USERNAME as string) ||
    (process.env.ZETARIS_ADMIN_EMAIL as string) ||
    String(file.adminEmail || "");
  if (!signInUrl || !adminEmail) {
    throw new Error("zetaris connection needs signInUrl and adminEmail");
  }
  let baseUrl =
    (process.env.ZETARIS_BASE_URL as string) ||
    signInUrl.replace(/\/login\/?$/, "").replace(/\/$/, "");
  try {
    const u = new URL(baseUrl);
    baseUrl = `${u.protocol}//${u.host}`;
  } catch {
    /* keep as-is */
  }
  const orgId =
    process.env.ZETARIS_ORG_ID ||
    (file.orgId as string | number | undefined) ||
    1;
  return {
    signInUrl,
    hostname,
    jdbc,
    adminEmail,
    clusterIdHint: file.clusterIdHint as string | undefined,
    orgId,
    baseUrl,
    restUrl: process.env.ZETARIS_REST_URL,
  };
}

type Auth = { token: string; orgId: string };

// Transient-failure policy (generic): the hosted service returns HTTP 5xx or drops
// connections while warming up or under concurrent logins. Retry 5xx / network errors
// with exponential backoff; never retry 4xx. Logins are serialized and cached per process.
const RETRY_DELAYS_MS = [1000, 3000, 8000, 15000];
async function fetchRetry(url: string, init: RequestInit): Promise<Response> {
  let last: unknown;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(Number(process.env.ZETARIS_TIMEOUT_MS || 120_000)) });
      if (res.status < 500 || i === RETRY_DELAYS_MS.length) return res;
      last = new Error(`HTTP ${res.status}`);
    } catch (e) {
      last = e;
      if (i === RETRY_DELAYS_MS.length) throw e;
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
  }
  throw last as Error;
}
let cachedAuth: { at: number; p: Promise<Auth> } | undefined;
async function uiLogin(conn: ZetarisConnection): Promise<Auth> {
  if (cachedAuth && Date.now() - cachedAuth.at < 10 * 60_000) {
    try { return await cachedAuth.p; } catch { /* fall through and retry */ }
  }
  const p = uiLoginOnce(conn);
  cachedAuth = { at: Date.now(), p };
  p.catch(() => { cachedAuth = undefined; });
  return p;
}
async function uiLoginOnce(conn: ZetarisConnection): Promise<Auth> {
  const password = readPassword();
  const res = await fetchRetry(`${conn.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": randomUUID(),
    },
    body: JSON.stringify({ username: conn.adminEmail, password }),
  });
  if (!res.ok) {
    throw new Error(`Zetaris login failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    idToken?: string;
    token?: string;
    accessToken?: string;
    orgId?: number | string;
  };
  const token = body.idToken || body.token || body.accessToken;
  if (!token) throw new Error("Zetaris login did not return an access token");
  const orgId = String(body.orgId ?? conn.orgId ?? 1);
  return { token, orgId };
}

async function uiProxyQuery(
  conn: ZetarisConnection,
  sql: string,
  limit = 5,
  auth?: Auth,
): Promise<ZetarisQueryResult> {
  const { token, orgId } = auth ?? (await uiLogin(conn));
  const res = await fetchRetry(`${conn.baseUrl}/api/proxy/sql-editor/sqls/run-query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Org-ID": orgId,
      "X-Request-ID": randomUUID(),
    },
    body: JSON.stringify({ sql, limit }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    return {
      ok: false,
      rowCount: 0,
      headers: [],
      rows: [],
      via: "ui-proxy",
      error: `HTTP ${res.status}: ${detail}`,
    };
  }
  const body = (await res.json()) as {
    data?: unknown[][];
    headers?: string[];
    timeUsed?: number;
    total?: number;
    msg?: string;
  };
  if (body.msg) {
    return {
      ok: false,
      rowCount: 0,
      headers: [],
      rows: [],
      via: "ui-proxy",
      error: String(body.msg).slice(0, 400),
    };
  }
  const rows = Array.isArray(body.data) ? body.data : [];
  return {
    ok: true,
    rowCount: rows.length,
    headers: Array.isArray(body.headers) ? body.headers.map(String) : [],
    rows,
    timeUsedMs: body.timeUsed,
    total: body.total,
    via: "ui-proxy",
  };
}

/** Soft JDBC probe — reports blocked without attempting a driver install. */
export async function probeJdbcPort(conn: ZetarisConnection): Promise<{
  open: boolean;
  host?: string;
  port?: number;
  detail: string;
}> {
  try {
    const m = conn.jdbc.match(/jdbc:hive2:\/\/([^:/]+):(\d+)/i);
    if (!m) return { open: false, detail: "Could not parse host:port from JDBC URL" };
    const host = m[1];
    const port = Number(m[2]);
    const { connect } = await import("node:net");
    const open = await new Promise<boolean>((resolveProbe) => {
      const socket = connect({ host, port, timeout: 4000 }, () => {
        socket.destroy();
        resolveProbe(true);
      });
      socket.on("error", () => resolveProbe(false));
      socket.on("timeout", () => {
        socket.destroy();
        resolveProbe(false);
      });
    });
    return {
      open,
      host,
      port,
      detail: open
        ? `TCP ${host}:${port} reachable (Hive JDBC driver not wired in this package)`
        : `TCP ${host}:${port} blocked/unreachable from this box; using UI-proxy REST instead`,
    };
  } catch (e) {
    return { open: false, detail: `JDBC probe failed: ${(e as Error).message}` };
  }
}

export async function runSql(
  sql: string,
  limit = 5,
): Promise<ZetarisQueryResult> {
  const conn = loadConnection();
  try {
    return await uiProxyQuery(conn, sql, limit);
  } catch (e) {
    return {
      ok: false,
      rowCount: 0,
      headers: [],
      rows: [],
      via: "ui-proxy",
      error: (e as Error).message,
    };
  }
}

/** Goal ping: SELECT * FROM NY_TAXI.taxi_zones LIMIT 5 */
export async function ping(): Promise<ZetarisPingResult> {
  const sql = "SELECT * FROM NY_TAXI.taxi_zones LIMIT 5";
  const result = await runSql(sql, 5);
  if (!result.ok) {
    return {
      ok: false,
      rowCount: 0,
      via: result.via,
      error: result.error || "query failed",
    };
  }
  return {
    ok: result.rowCount === 5,
    rowCount: result.rowCount,
    via: result.via,
    detail:
      result.rowCount === 5
        ? "NY_TAXI.taxi_zones returned 5 rows"
        : `Expected 5 rows, got ${result.rowCount}`,
    error: result.rowCount === 5 ? undefined : `rowCount=${result.rowCount}`,
  };
}

// ---------------------------------------------------------------------------
// Generic TEMP VIEW loader: tables described by schema, built from whatever the case supplies. No app-specific names.
// ---------------------------------------------------------------------------
export type Table = { name: string; description?: string; rows: Array<Record<string, unknown>> };

const ident = (n: string) => n.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1");

/** Column schema: union of keys; a column is numeric only if every non-null value is a finite number. */
export function schemaOf(t: Table): Array<{ name: string; type: "DOUBLE" | "STRING" }> {
  const cols = new Map<string, boolean>();
  for (const r of t.rows) for (const [k, v] of Object.entries(r)) cols.set(ident(k), (cols.get(ident(k)) ?? true) && (v == null || (typeof v === "number" && Number.isFinite(v))));
  return [...cols.entries()].map(([name, num]) => ({ name, type: num ? "DOUBLE" : "STRING" }));
}

function lit(v: unknown, type: "DOUBLE" | "STRING"): string {
  if (v == null) return `CAST(NULL AS ${type})`;
  if (type === "DOUBLE") return `CAST(${Number(v)} AS DOUBLE)`;
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // Plain tokens stay readable. Anything else (code, SQL text, quotes, newlines) is shipped as base64 and decoded server-side:
  // the Zetaris catalog parser sniffs SQL keywords inside literals (e.g. agent code containing "CREATE TABLE … OR …").
  if (/^[\w .:\/@+-]*$/.test(s)) return `'${s}'`;
  return `CAST(unbase64('${Buffer.from(s, "utf8").toString("base64")}') AS STRING)`;
}

/** Views larger than this are created as part-views joined by UNION ALL (one request per part). */
const VIEW_CHUNK_BYTES = Number(process.env.ZETARIS_VIEW_CHUNK_BYTES || 60_000);
export function tempViewSqls(t: Table): string[] {
  const one = tempViewSql(t);
  if (one.length <= VIEW_CHUNK_BYTES || t.rows.length < 2) return [one];
  const parts: Table[] = []; let cur: Table["rows"] = []; let size = 0;
  for (const r of t.rows) { const n = JSON.stringify(r).length * 1.4 + 64; if (cur.length && size + n > VIEW_CHUNK_BYTES) { parts.push({ ...t, rows: cur }); cur = []; size = 0; } cur.push(r); size += n; }
  if (cur.length) parts.push({ ...t, rows: cur });
  const name = ident(t.name); const cols = schemaOf(t);
  // every part must carry the full column list (a part may lack a column some other row has)
  const full = (p: Table) => ({ ...p, rows: p.rows.map((r) => Object.fromEntries(cols.map((c) => [c.name, Object.entries(r).find(([k]) => ident(k) === c.name)?.[1] ?? null]))) });
  const sqls = parts.map((p, i) => tempViewSql({ ...full(p), name: `${name}__P${i}` }));
  sqls.push(`CREATE OR REPLACE TEMP VIEW ${name} AS ${parts.map((_, i) => `SELECT * FROM ${name}__P${i}`).join(" UNION ALL ")}`);
  return sqls;
}

export function tempViewSql(t: Table): string {
  const cols = schemaOf(t);
  const name = ident(t.name);
  if (!t.rows.length || !cols.length) return `CREATE OR REPLACE TEMP VIEW ${name} AS SELECT CAST(NULL AS STRING) AS empty WHERE 1 = 0`;
  const byIdent = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [ident(k), v]));
  const tuples = t.rows.map((r0) => { const r = byIdent(r0); return `(${cols.map((c) => lit(r[c.name], c.type)).join(", ")})`; });
  return `CREATE OR REPLACE TEMP VIEW ${name} AS SELECT * FROM (VALUES ${tuples.join(", ")}) AS t(${cols.map((c) => c.name).join(", ")})`;
}

/** Schema description handed to a model: names, types, row count and up to 2 sample rows. */
export function describeTables(ts: Table[]): Array<{ name: string; description?: string; columns: string[]; row_count: number; sample: unknown[] }> {
  return ts.map((t) => ({ name: ident(t.name), description: t.description, columns: schemaOf(t).map((c) => `${c.name} ${c.type}`), row_count: t.rows.length, sample: t.rows.slice(0, 2) }));
}

export type SessionResult = { ok: boolean; via: string; results: ZetarisQueryResult[]; error?: string };

/** Live: register views then run selects in ONE auth session. Fails visibly (ok=false + error), never fakes rows. */
/** Replace whole-word table identifiers (case-insensitive) outside string literals. */
export function renameTables(sql: string, map: Record<string, string>): string {
  return sql.split(/('(?:[^'\\]|\\.)*')/).map((seg, i) => (i % 2 ? seg : Object.entries(map).reduce((s, [a, b]) => s.replace(new RegExp(`(?<![\\w.])${a}(?!\\w)`, "gi"), b), seg))).join("");
}

export async function runWithViews(tables0: Table[], selects0: string[], limit = 50): Promise<SessionResult> {
  const conn = loadConnection();
  // TEMP VIEW names are global on the shared proxy session: concurrent runs overwrote each other's views. Every call uses
  // run-unique names and the SELECTs are rewritten to them (the frozen SQL text itself is unchanged in the report).
  const tag = `r${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const map = Object.fromEntries(tables0.map((t) => [ident(t.name), `${ident(t.name)}_${tag}`]));
  const tables = tables0.map((t) => ({ ...t, name: map[ident(t.name)] }));
  const selects = selects0.map((q) => renameTables(q, map));
  let auth: Auth;
  try { auth = await uiLogin(conn); } catch (e) { return { ok: false, via: "none", results: [], error: (e as Error).message.slice(0, 200) }; }
  for (const t of tables) {
    let r: ZetarisQueryResult | undefined;
    for (const q of tempViewSqls(t)) { r = await uiProxyQuery(conn, q, 5, auth); if (!r.ok) break; }
    if (r && !r.ok) return { ok: false, via: r.via, results: [], error: `TEMP VIEW ${t.name}: ${(r.error ?? "").slice(0, 400)}` };
  }
  const results: ZetarisQueryResult[] = [];
  for (const q of selects) results.push(await uiProxyQuery(conn, q, limit, auth));
  return { ok: results.every((r) => r.ok), via: "ui-proxy", results, error: results.find((r) => !r.ok)?.error };
}
