/**
 * Run frozen tests against the REAL app code (post-freeze rewrite; the frozen gen-v5 harness that pasted the function next to
 * model-written fakes is in git history at tag generalize-frozen).
 *
 * Each test is its own process: <app root>/.wce/t<i>.(mts|py), so imports resolve exactly as in the app. Tests reach app code only
 * through app("<path relative to app root>"), which imports the real module. Allowed stand-ins are BOUNDARY STUBS for bare
 * external packages (validated in validateStubs; app modules and the database client can never be stubbed). When the app has a
 * real database (workspace.ts) each test gets a fresh clone of it; the DB is snapshotted when the test calls arranged() and when it
 * ends, and the difference is the set of rows the real code wrote. Isolation: unshare -rn (no network; Postgres via unix socket),
 * hard timeout, minimal env (no API keys).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Lang } from "./lang.js";
import { createRequire } from "node:module";
const esbuild = createRequire(import.meta.url)("esbuild") as typeof import("esbuild");
const JSDOM_URL = pathToFileURL(createRequire(import.meta.url).resolve("jsdom")).href;
import { cloneDb, dbUrl, dropDb, type AppWorkspace } from "./workspace.js";

export interface Stub { module: string; code: string; why: string }
export interface TestSpec { name: string; role: "reproduction" | "decoy"; asserts?: string; body: string }
export interface HarnessSpec { setup: string; stubs: Stub[]; tests: TestSpec[]; /** attributed function whose execution is observed (Python) */ trace?: { file: string; function: string } }
export interface DbChange { table: string; op: "insert" | "delete" | "update"; row: Record<string, unknown> }
export interface TestResult { name: string; role: string; pass: boolean; error?: string; stack?: string; db_changes?: DbChange[]; db_baseline?: "arranged" | "empty"; recorded?: Array<Record<string, unknown>>; target_ran?: boolean }
export interface RunResult { ok: boolean; results: TestResult[]; stderr: string; isolated: boolean; ms: number; error?: string; tree: string }

const MARK = "__WCE_RESULTS__";
const HOOKS = resolve("src/engine/runtime/register.mjs");

function hasUnshare(): boolean { return spawnSync("unshare", ["-rn", "true"]).status === 0; }

/** Textwrap-style dedent of a whole block (common leading whitespace of non-blank lines), then re-indent. */
export function dedentBlock(s: string): string {
  const ls = s.replace(/\t/g, "    ").split("\n");
  while (ls.length && !ls[0].trim()) ls.shift();
  while (ls.length && !ls.at(-1)!.trim()) ls.pop();
  const ind = Math.min(...ls.filter((l) => l.trim()).map((l) => /^ */.exec(l)![0].length));
  return ls.map((l) => l.slice(Math.min(ind, /^ */.exec(l)![0].length))).join("\n");
}
const indent = (s: string, n: number) => s.split("\n").map((l) => (l.trim() ? " ".repeat(n) + l : l)).join("\n");

/** Python module name for a file under the app root (src/ layout aware). */
export function pyModuleName(rel: string): string {
  return rel.replace(/^src\//, "").replace(/\.py$/, "").replace(/\/__init__$/, "").split("/").join(".");
}

/**
 * Boundary-stub policy (mechanical): a stub may replace only a bare EXTERNAL package. Rejected: relative/absolute paths, app
 * aliases ("@/", "~/"), anything that exists as a file or package inside the app tree, the database client
 * (@prisma/client, .prisma/*), and node builtins.
 */
export function validateStubs(stubs: Stub[], ws: AppWorkspace, lang: Lang): string[] {
  const bad: string[] = [];
  for (const s of stubs) {
    const m = s.module.trim();
    if (!m || /^[./~]/.test(m) || m.startsWith("@/") || m.startsWith("node:")) { bad.push(`${m}: not a bare external package`); continue; }
    if (lang === "python") {
      const p = m.split(".").join("/");
      if ([`${p}.py`, `${p}/__init__.py`, `src/${p}.py`, `src/${p}/__init__.py`, p.split("/")[0]].some((x) => existsSync(join(ws.root, x)) && !/^(\.venv|venv)$/.test(x)))
        bad.push(`${m}: resolves into the app tree (code under test cannot be stubbed)`);
    } else {
      if (/^(@prisma\/client|\.prisma\/|prisma$)/.test(m)) bad.push(`${m}: the database client is real, it cannot be stubbed`);
      if (existsSync(join(ws.root, m)) || existsSync(join(ws.root, m + ".ts"))) bad.push(`${m}: resolves into the app tree`);
      if (/^(fs|path|crypto|http|https|net|url|util|events|stream|child_process|os)(\/|$)/.test(m)) bad.push(`${m}: node builtin`);
    }
  }
  return bad;
}

function tsTest(ws: AppWorkspace, spec: HarnessSpec, t: TestSpec): string {
  return `// @ts-nocheck
import { execFileSync as __x } from "node:child_process";
import { pathToFileURL as __u } from "node:url";
const __root = ${JSON.stringify(ws.root)};
const __rec = [];
const __snap = () => process.env.WCE_DB_NAME ? JSON.parse(__x(process.env.WCE_PSQL, ["-h", process.env.WCE_PG_SOCKET, "-p", process.env.WCE_PG_PORT, "-U", "wce", "-d", process.env.WCE_DB_NAME, "-At", "-c", "select wce_meta.snapshot()"], { encoding: "utf8" })) : null;
let __arranged = null;
globalThis.check = (cond, msg = "check failed") => { if (!cond) throw new Error(msg); };
globalThis.harm_observed = (cond, msg = "harmful outcome not observed") => { if (!cond) throw new Error("harmful outcome not observed: " + msg); };
globalThis.record = (name, value) => { __rec.push({ name, value: JSON.parse(JSON.stringify(value ?? null)) }); };
globalThis.arranged = () => { __arranged = __snap(); };
globalThis.__wce_session = null; globalThis.__wce_request = { headers: {}, cookies: {} };
globalThis.set_session = (s) => { globalThis.__wce_session = s && typeof s === "object" && !("expires" in s) ? { ...s, expires: new Date(Date.now() + 864e5).toISOString() } : (s ?? null); };
globalThis.set_request = (r = {}) => { globalThis.__wce_request = { headers: r.headers ?? {}, cookies: r.cookies ?? {} }; };
// Framework control flow: Next.js redirect()/notFound()/forbidden() throw errors whose digest the framework turns into a response.
globalThis.settle = async (p) => { try { return { ok: true, value: await (typeof p === "function" ? p() : p) }; } catch (e) {
  const d = String(e?.digest ?? "");
  if (d.startsWith("NEXT_REDIRECT")) return { ok: true, redirect: d.split(";")[2] ?? d.split(";")[1] ?? "" };
  if (d.startsWith("NEXT_HTTP_ERROR_FALLBACK") || d === "NEXT_NOT_FOUND") return { ok: true, http_status: Number(d.split(";")[1] ?? 404) };
  return { ok: false, error: e }; } };
globalThis.framework_calls = (name) => (globalThis.__wce_fw_calls ?? []).filter((c) => !name || c.name === name);
globalThis.app = (p) => import(__u(__root + "/" + p.replace(/^\\/+/, "")).href);
// Browser rendering for client UI code: dom() installs a jsdom window as the global DOM; console_errors() returns what the code logged via console.error (e.g. React dev warnings).
const { format: __fmt } = await import("node:util");
const __cerr = []; { const __ce = console.error; console.error = (...a) => { __cerr.push(__fmt(...a)); __ce(...a); }; }
globalThis.console_errors = () => __cerr.slice();
globalThis.dom = async (url = "http://localhost/") => { const { JSDOM } = await import(${JSON.stringify(JSDOM_URL)}); const d = new JSDOM("<!doctype html><html><body></body></html>", { url, pretendToBeVisual: true });
  const w = d.window; globalThis.window = w; globalThis.self = w; globalThis.document = w.document;
  for (const k of Object.getOwnPropertyNames(w)) { if (!(k in globalThis)) { try { globalThis[k] = w[k]; } catch {} } }
  if (!w.matchMedia) w.matchMedia = globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true; return w; };
let __pass = true, __err, __stack;
try {
${indent(dedentBlock(spec.setup || "// no setup"), 2)}
  await (async () => {
${indent(dedentBlock(t.body), 4)}
  })();
  if (globalThis.__wce_after?.length) await Promise.all(globalThis.__wce_after);
} catch (e) { __pass = false; __stack = String(e?.stack ?? e); __err = __stack.split("\\n").slice(0, 3).join(" | ").slice(0, 400); }
const __after = __snap();
console.log(${JSON.stringify(MARK)} + JSON.stringify({ pass: __pass, error: __err, stack: __stack, arranged: __arranged, after: __after, recorded: __rec }));
process.exit(0);
`;
}

function pyTest(ws: AppWorkspace, spec: HarnessSpec, t: TestSpec): string {
  const stubs = spec.stubs.map((s) => `_wce_stub(${JSON.stringify(s.module)}, ${JSON.stringify(s.code)})`).join("\n");
  return `import asyncio, importlib, json, os, sys, types, traceback
_root = ${JSON.stringify(ws.root)}
sys.path[:0] = [p for p in (os.path.join(_root, "src"), _root) if os.path.isdir(p)]
_rec = []
def _wce_stub(name, code):
    m = types.ModuleType(name); exec(compile(code, "<stub " + name + ">", "exec"), m.__dict__); sys.modules[name] = m
${stubs}
def harm_observed(cond, msg="harmful outcome not observed"):
    if not cond:
        raise AssertionError("harmful outcome not observed: " + msg)

def check(cond, msg="check failed"):
    if not cond: raise AssertionError(msg)
def record(name, value):
    _rec.append(dict(name=name, value=value))
def arranged():
    pass
def app(rel):
    rel = rel.lstrip("/")
    return importlib.import_module((rel[4:] if rel.startswith("src/") else rel).removesuffix(".py").removesuffix("/__init__").replace("/", "."))
_wce_trace = ${spec.trace ? JSON.stringify([spec.trace.file, spec.trace.function.split(".").pop()]) : "None"}
_wce_hits = [0]
if _wce_trace:
    def _wce_prof(fr, ev, arg):
        if ev == "call" and fr.f_code.co_name == _wce_trace[1] and fr.f_code.co_filename.replace(os.sep, "/").endswith(_wce_trace[0]):
            _wce_hits[0] += 1
    sys.setprofile(_wce_prof)
    import threading; threading.setprofile(_wce_prof)
async def _wce_main():
${indent(dedentBlock(spec.setup || "pass"), 4)}
${indent(dedentBlock(t.body), 4)}
_pass, _err, _stack = True, None, None
try:
    asyncio.run(_wce_main())
except BaseException as e:
    _stack = "".join(traceback.format_exception(e))
    _pass, _err = False, (type(e).__name__ + ": " + str(e))[:300] + " | " + "".join(traceback.format_tb(e.__traceback__)[-1:]).strip().replace(chr(10), " ")[:200]
sys.setprofile(None)
print(${JSON.stringify(MARK)} + json.dumps(dict(pass_=_pass, error=_err, stack=_stack, recorded=_rec, target_ran=(_wce_hits[0] > 0) if _wce_trace else None), default=repr))
`;
}

/**
 * The informative part of a crashed process's stderr: the first error line(s) and the first non-runtime stack frames.
 * (M2 showed only the stderr TAIL, which for a load/transform error is Node-internal frames, so repairs were blind.)
 */
export function errorExcerpt(stderr: string, max = 900): string {
  const ls = stderr.split("\n");
  const noise = /^\s*at .*(node:internal|node:events|node_modules\/esbuild|node_modules\/tsx|\(node:)|^\s*\^\s*$|^Node\.js v|^\s*triggerUncaughtException|^node:internal\/modules\/run_main/;
  const first = ls.findIndex((l) => /(Error|Exception|error:|ERROR:|Traceback|SyntaxError)/.test(l));
  const pick = (first >= 0 ? ls.slice(first) : ls).filter((l) => l.trim() && !noise.test(l));
  return pick.slice(0, 14).join("\n").slice(0, max);
}

/**
 * Syntax check of every model-written section BEFORE anything runs (static; cannot fit results). Each section is compiled
 * on its own, wrapped the way the harness wraps it (async function body), so the error names the section and its own line.
 */
export function syntaxErrors(spec: HarnessSpec, lang: Lang): string[] {
  const parts: Array<[string, string]> = [["setup", spec.setup || ""], ...spec.tests.map((t) => [`test ${t.name}`, t.body] as [string, string])];
  const out: string[] = [];
  if (lang === "python") {
    const prog = "import ast, json, sys\nfor where, src in json.load(sys.stdin):\n    body = '\\n'.join('    ' + l for l in (src or 'pass').split('\\n'))\n    try:\n        ast.parse('async def _f():\\n' + body + '\\n    pass\\n')\n    except SyntaxError as e:\n        print(json.dumps(f'{where}: Python syntax error at line {(e.lineno or 2) - 1}: {e.msg}: {(e.text or \"\").strip()}'))\n";
    const r = spawnSync("python3", ["-c", prog], { input: JSON.stringify(parts.map(([w, src]) => [w, dedentBlock(src || "pass")])), encoding: "utf8" });
    for (const l of (r.stdout ?? "").split("\n")) if (l.trim()) out.push(JSON.parse(l));
    return out;
  }
  for (const [where, src] of parts) {
    try { esbuild.transformSync(`(async () => {\n${src}\n})`, { loader: "ts", format: "esm" }); }
    catch (e) {
      const m = ((e as { errors?: Array<{ text: string; location?: { line: number; lineText: string } }> }).errors ?? [])[0];
      out.push(`${where}: syntax error${m?.location ? ` at line ${m.location.line - 1}` : ""}: ${m?.text ?? String(e)}${m?.location ? ` in: ${m.location.lineText.trim().slice(0, 160)}` : ""}`);
    }
  }
  return out;
}

type Rows = Record<string, Array<Record<string, unknown>>>;
export function diffSnapshots(before: Rows | null, after: Rows | null): DbChange[] {
  if (!after) return [];
  const out: DbChange[] = [];
  const key = (r: Record<string, unknown>) => ("id" in r ? `id:${String(r.id)}` : JSON.stringify(r));
  for (const [table, rows] of Object.entries(after)) {
    const prev = new Map((before?.[table] ?? []).map((r) => [key(r), r]));
    const seen = new Set<string>();
    for (const r of rows) {
      const k = key(r); seen.add(k);
      const p = prev.get(k);
      if (!p) out.push({ table, op: "insert", row: r });
      else if (JSON.stringify(p) !== JSON.stringify(r)) out.push({ table, op: "update", row: r });
    }
    for (const [k, r] of prev) if (!seen.has(k)) out.push({ table, op: "delete", row: r });
  }
  return out;
}

/** True when V8 coverage in covDir shows `fn` (last dotted segment) in <root>/<file> called at least once. */
export function coverageHit(covDir: string, root: string, file: string, fn: string): boolean {
  if (!existsSync(covDir)) return false;
  const dec = (u: string) => { try { return decodeURIComponent(u.split("?")[0]); } catch { return u.split("?")[0]; } };
  const want = dec(pathToFileURL(join(root, file)).href), name = fn.split(".").pop()!;
  for (const f of readdirSync(covDir)) {
    try {
      const j = JSON.parse(readFileSync(join(covDir, f), "utf8")) as { result: Array<{ url: string; functions: Array<{ functionName: string; ranges: Array<{ count: number }> }> }> };
      for (const sc of j.result) if (dec(sc.url) === want) for (const x of sc.functions) if (x.functionName === name && (x.ranges[0]?.count ?? 0) > 0) return true;
    } catch { /* partial file */ }
  }
  return false;
}

/** Run every test of a frozen spec against the tree at ws.root (original or patched copy). */
export function runRealTests(lang: Lang, ws: AppWorkspace, spec: HarnessSpec, keepDir?: string): RunResult {
  const isolated = hasUnshare();
  // Per-run subdirectory so concurrent investigations of the same repo never overwrite each other's harness files.
  const dir = join(ws.root, ".wce", `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  const stubFiles: Record<string, string> = {};
  if (lang !== "python") {
    // Model stubs first, then the engine's framework boundary shims (a shim always wins for its package; see frameworks.ts).
    spec.stubs.forEach((s, i) => { const f = join(dir, `stub${i}.mjs`); writeFileSync(f, s.code); stubFiles[s.module] = f; });
    (ws.shims ?? []).forEach((s, i) => { const f = join(dir, `shim${i}.mjs`); writeFileSync(f, s.code); stubFiles[s.module] = f; });
  }
  const results: TestResult[] = [];
  let stderr = "";
  const t0 = Date.now();
  for (const [i, t] of spec.tests.entries()) {
    const file = join(dir, `t${i}.${lang === "python" ? "py" : "mts"}`);
    writeFileSync(file, lang === "python" ? pyTest(ws, spec, t) : tsTest(ws, spec, t));
    if (keepDir) { mkdirSync(keepDir, { recursive: true }); writeFileSync(join(keepDir, `t${i}.${lang === "python" ? "py" : "mts"}`), readFileSync(file, "utf8")); }
    const dbName = ws.db ? cloneDb(ws.db) : undefined;
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: dir, TMPDIR: dir, NODE_NO_WARNINGS: "1", NODE_ENV: "test", PRISMA_HIDE_UPDATE_MESSAGE: "1",
      WCE_APP_ROOT: ws.root, WCE_STUBS: JSON.stringify(stubFiles), WCE_ALIAS_AT: ws.aliasAt ? "1" : "0", WCE_ALIAS_BASE: ws.aliasBase ?? "" };
    // A reconstructed tree can lack the scaffold's tsconfig (written by a CLI, not an edit); compile JSX with the automatic runtime
    // that every React 17+ toolchain (Next, Vite) defaults to, instead of the classic React.createElement transform.
    if (lang !== "python" && !existsSync(join(ws.root, "tsconfig.json"))) { const tc = join(dir, "tsconfig.fallback.json"); writeFileSync(tc, JSON.stringify({ compilerOptions: { jsx: "react-jsx", target: "es2022", module: "esnext", moduleResolution: "bundler", esModuleInterop: true }, include: [join(ws.root, "**/*")] })); env.TSX_TSCONFIG_PATH = tc; }
    // TS/JS attribution check: V8 block coverage of the process; the attributed function counts as executed when V8 reports a
    // function of that name in that file with a non-zero call count (no instrumentation of app code).
    const covDir = lang !== "python" && spec.trace ? join(dir, `cov${i}`) : undefined;
    if (covDir) env.NODE_V8_COVERAGE = covDir;
    if (ws.db && dbName) Object.assign(env, { DATABASE_URL: dbUrl(ws.db, dbName), WCE_DB_NAME: dbName, WCE_PSQL: ws.db.psql, WCE_PG_SOCKET: ws.db.socketDir, WCE_PG_PORT: String(ws.db.port) });
    const tsx = pathToFileURL(join(resolve("node_modules"), "tsx", "dist", "loader.mjs")).href;
    const cmd = lang === "python" ? [ws.python ?? "python3", "-I", file] : [process.execPath, "--import", tsx, "--import", HOOKS, file];
    // Own network namespace: loopback only (brought up so tests can run local servers), no route to any other host.
    const argv = isolated ? ["unshare", "-rn", "sh", "-c", "ip link set lo up 2>/dev/null; exec \"$@\"", "sh", ...cmd] : cmd;
    const r = spawnSync(argv[0], argv.slice(1), { cwd: ws.root, timeout: Number(process.env.WCE_HARNESS_TIMEOUT_MS || 60000), encoding: "utf8", env });
    if (ws.db && dbName) dropDb(ws.db, dbName);
    const se = r.stderr ?? "";
    if (se.trim()) stderr += `[${t.name}] ${se.length > 1200 ? se.slice(0, 600) + "\n...\n" + se.slice(-500) : se}\n`;
    const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith(MARK));
    if (!line) { results.push({ name: t.name, role: t.role, pass: false, error: `HARNESS: no result (exit ${r.status}${r.signal ? ", " + r.signal : ""}${r.error ? ", " + String(r.error) : ""}) ${errorExcerpt(se)}` }); continue; }
    const j = JSON.parse(line.slice(MARK.length));
    if (covDir && spec.trace) j.target_ran = coverageHit(covDir, ws.root, spec.trace.file, spec.trace.function);
    results.push({ name: t.name, role: t.role, pass: Boolean(j.pass ?? j.pass_), error: j.error ?? undefined, stack: j.stack ? String(j.stack).slice(0, 4000) : undefined, recorded: j.recorded, ...(typeof j.target_ran === "boolean" ? { target_ran: j.target_ran } : {}),
      ...(ws.db ? { db_changes: diffSnapshots(j.arranged, j.after), db_baseline: j.arranged ? "arranged" as const : "empty" as const } : {}) });
  }
  rmSync(dir, { recursive: true, force: true });
  const loadFail = results.filter((x) => x.error?.startsWith("HARNESS:"));
  return { ok: loadFail.length === 0, results, stderr, isolated, ms: Date.now() - t0, tree: ws.root, error: loadFail.length ? `${loadFail.length} test process(es) produced no result` : undefined };
}

/**
 * Mechanical repair of Python "unexpected indent" errors (a model-formatting slip, e.g. one stray leading space): the offending line
 * takes the indentation of the previous non-blank line, unless that line opens a block (ends with ':'). Each step is re-verified with
 * the real parser; anything else (or no progress) returns the best source so far, and the normal syntax check still reports it.
 */
export function repairPythonIndent(src: string): { src: string; fixed: number[] } {
  let cur = dedentBlock(src || "");
  const fixed: number[] = [];
  for (let i = 0; i < 20; i++) {
    const err = syntaxErrors({ setup: cur, stubs: [], tests: [] } as unknown as HarnessSpec, "python")[0];
    const m = err && /line (\d+): unexpected indent/.exec(err);
    if (!m) break;
    const lines = cur.split("\n"); const n = Number(m[1]) - 1;
    if (n <= 0 || n >= lines.length) break;
    let p = n - 1; while (p >= 0 && !lines[p].trim()) p--;
    if (p < 0 || /:\s*(#.*)?$/.test(lines[p])) break;
    const indent = /^\s*/.exec(lines[p])![0];
    const next = lines.slice(); next[n] = indent + lines[n].trimStart();
    if (next[n] === lines[n]) break;
    cur = next.join("\n"); fixed.push(n + 1);
  }
  return fixed.length ? { src: cur, fixed } : { src, fixed };
}
