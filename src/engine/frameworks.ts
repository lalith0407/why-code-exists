/**
 * Framework boundary shims (generic, framework-level; no app or case knowledge).
 *
 * Some framework APIs only work inside the framework's live request (Next.js headers()/cookies() read a per-request
 * AsyncLocalStorage store; revalidatePath() needs the render store; Auth.js auth() decrypts the request's session cookie).
 * Calling REAL app code outside a running server therefore throws ("`headers` was called outside a request scope").
 *
 * Instead of letting the test writer hand-write fake packages (which was the main harness failure in M2), the engine builds a
 * shim for each such package from the package's REAL export list (probed in the app's own node_modules):
 *   - every real export is re-exported unchanged (NextRequest, NextResponse, redirect, notFound, AuthError, ... stay real);
 *   - only the request-scoped exports listed in BOUNDARY below are replaced, and only if the real package exports them;
 *   - replacements read the test's request/session from set_request()/set_session() and record every call (framework_calls).
 * Each shim is labeled in the report (module, version, replaced exports, why). Model-written stubs for a shimmed package are
 * dropped (the shim is the single, audited stand-in for that boundary).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface ProbedExports { spec: string; url?: string; keys?: string[]; error?: string }
export interface BoundaryShim { module: string; code: string; why: string; replaced: string[]; passthrough: string[]; version?: string }

const REQ = "globalThis.__wce_req()";
const CALL = (name: string) => `globalThis.__wce_fw_call(${JSON.stringify(name)}, args)`;

/** Request-scoped exports per framework package: export name -> replacement (an expression evaluating to the export). */
export const BOUNDARY: Record<string, { why: string; exports: Record<string, string> }> = {
  "next/headers": {
    why: "Next.js request APIs read the live request store (AsyncLocalStorage) that only exists inside a running Next server; the test supplies the request with set_request()",
    exports: {
      headers: `(...args) => { ${CALL("headers")}; return __thenable(new Headers(${REQ}.headers)); }`,
      cookies: `(...args) => { ${CALL("cookies")}; return __thenable(__cookieStore(${REQ}.cookies)); }`,
      draftMode: `(...args) => { ${CALL("draftMode")}; const s = { isEnabled: false, enable() { s.isEnabled = true }, disable() { s.isEnabled = false } }; return __thenable(s); }`,
    },
  },
  "next/cache": {
    why: "Next.js cache invalidation needs the render/work store of a running Next server; calls are recorded (framework_calls) instead",
    exports: {
      revalidatePath: `(...args) => { ${CALL("revalidatePath")}; }`,
      revalidateTag: `(...args) => { ${CALL("revalidateTag")}; }`,
      updateTag: `(...args) => { ${CALL("updateTag")}; }`,
      refresh: `(...args) => { ${CALL("refresh")}; }`,
      unstable_noStore: `(...args) => { ${CALL("unstable_noStore")}; }`,
      cacheLife: `(...args) => { ${CALL("cacheLife")}; }`,
      cacheTag: `(...args) => { ${CALL("cacheTag")}; }`,
      unstable_cacheLife: `(...args) => { ${CALL("unstable_cacheLife")}; }`,
      unstable_cacheTag: `(...args) => { ${CALL("unstable_cacheTag")}; }`,
      unstable_cache: `(fn, ...rest) => { const args = [String(fn?.name ?? "fn"), ...rest]; ${CALL("unstable_cache")}; return (...a) => fn(...a); }`,
    },
  },
  "next/server": {
    why: "after()/connection() need the request store of a running Next server; after() callbacks run immediately and are awaited by the harness",
    exports: {
      after: `(...args) => { ${CALL("after")}; const t = args[0]; const p = Promise.resolve(typeof t === "function" ? t() : t); globalThis.__wce_after.push(p.catch((e) => { globalThis.__wce_after_errors.push(String(e?.stack ?? e)) })); }`,
      connection: `(...args) => { ${CALL("connection")}; return Promise.resolve(); }`,
    },
  },
  "next-auth": {
    why: "Auth.js reads the signed-in user from the encrypted session cookie of the live request; auth() returns the session given with set_session() (everything else in the package stays real)",
    exports: {
      // v5: NextAuth(config) -> { handlers, auth, signIn, signOut, ... }; only auth is replaced, the rest is the real result.
      default: `(config) => { const real = __real.default(config); const auth = (...args) => { ${CALL("auth")}; if (typeof args[0] === "function") { const h = args[0]; return (req, ctx) => { req.auth = globalThis.__wce_session ?? null; return h(req, ctx); }; } return Promise.resolve(globalThis.__wce_session ?? null); }; return { ...real, auth }; }`,
      // v4
      getServerSession: `(...args) => { ${CALL("getServerSession")}; return Promise.resolve(globalThis.__wce_session ?? null); }`,
    },
  },
  "next-auth/next": {
    why: "next-auth v4 getServerSession reads the session cookie of the live request; returns the session given with set_session()",
    exports: { getServerSession: `(...args) => { ${CALL("getServerSession")}; return Promise.resolve(globalThis.__wce_session ?? null); }` },
  },
};

const PRELUDE = `
function __thenable(v) { const p = Promise.resolve(v); return new Proxy(v, { get(t, k) { if (k === "then" || k === "catch" || k === "finally") return p[k].bind(p); const x = Reflect.get(t, k, t); return typeof x === "function" ? x.bind(t) : x; } }); }
function __cookieStore(init) {
  const m = new Map(Object.entries(init ?? {}).map(([k, v]) => [k, { name: k, value: String(v) }]));
  const store = { get: (n) => m.get(typeof n === "string" ? n : n?.name), getAll: (n) => n ? [...m.values()].filter((c) => c.name === n) : [...m.values()], has: (n) => m.has(n),
    set: (n, v) => { const c = typeof n === "object" ? n : { name: n, value: String(v) }; m.set(c.name, c); return store; }, delete: (n) => { m.delete(n); return store; }, get size() { return m.size }, toString: () => [...m.values()].map((c) => c.name + "=" + c.value).join("; "), [Symbol.iterator]: () => m.entries() };
  return store;
}
globalThis.__wce_req ??= () => globalThis.__wce_request ?? { headers: {}, cookies: {} };
globalThis.__wce_fw_calls ??= [];
globalThis.__wce_after ??= []; globalThis.__wce_after_errors ??= [];
globalThis.__wce_fw_call ??= (name, args) => { try { globalThis.__wce_fw_calls.push({ name, args: JSON.parse(JSON.stringify(args ?? [], (k, v) => typeof v === "function" ? "[function]" : v)) }); } catch { globalThis.__wce_fw_calls.push({ name, args: "[unserializable]" }); } };
`;

const ident = /^[A-Za-z_$][\w$]*$/;

/** Shim source for one package from its real export list. Returns undefined when no request-scoped export exists in the real package. */
export function buildShim(p: ProbedExports, version?: string): BoundaryShim | undefined {
  const prof = BOUNDARY[p.spec];
  if (!prof || !p.url || !p.keys) return undefined;
  const replaced = Object.keys(prof.exports).filter((k) => p.keys!.includes(k));
  if (!replaced.length) return undefined;
  const passthrough = p.keys.filter((k) => !replaced.includes(k) && k !== "default" && ident.test(k) && k !== "__esModule");
  const lines = [`// WCE framework boundary shim for "${p.spec}"${version ? ` (${version})` : ""}. Real module: ${p.url}`, `import * as __real from ${JSON.stringify(p.url)};`, PRELUDE,
    // CJS packages expose members on the default export (module.exports); ESM ones on the namespace. Namespace wins.
    `const __d0 = __real.default; const __src = Object.assign({}, __d0 && (typeof __d0 === "object" || typeof __d0 === "function") ? __d0 : {}, __real);`];
  for (const k of passthrough) lines.push(`export const ${k} = __src[${JSON.stringify(k)}];`);
  for (const k of replaced.filter((k) => k !== "default")) lines.push(`export const ${k} = ${prof.exports[k]};`);
  if (replaced.includes("default")) lines.push(`export default ${prof.exports.default};`);
  else if (p.keys.includes("default")) {
    // CJS default: the real exports object with the replaced members swapped in.
    lines.push(`const __d = __real.default; export default (__d && typeof __d === "object") ? { ...__d, ${replaced.map((k) => `${k}`).join(", ")} } : __d;`);
  }
  return { module: p.spec, code: lines.join("\n"), why: prof.why, replaced, passthrough, version };
}

/** Probe the real exports of the given specifiers inside the app (tsx loader, same resolution as the tests). */
export function probeExports(root: string, specs: string[]): ProbedExports[] {
  if (!specs.length) return [];
  const tsx = pathToFileURL(join(resolve("node_modules"), "tsx", "dist", "loader.mjs")).href;
  const r = spawnSync(process.execPath, ["--import", tsx, resolve("src/engine/runtime/probe-exports.mjs"), ...specs], { cwd: root, encoding: "utf8", timeout: 60000, env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_NO_WARNINGS: "1" } });
  return (r.stdout ?? "").split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l) as ProbedExports);
}

function pkgVersion(root: string, spec: string): string | undefined {
  const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
  const f = join(root, "node_modules", name, "package.json");
  return existsSync(f) ? `${name}@${JSON.parse(readFileSync(f, "utf8")).version}` : undefined;
}

/** Shims for every request-scoped framework package the app can reach (and next/server's after(), which apps call via next/server). */
export function frameworkShims(root: string, reachable: string[]): { shims: BoundaryShim[]; probe_errors: string[] } {
  const want = Object.keys(BOUNDARY).filter((s) => reachable.includes(s) || (reachable.some((r) => r === "next" || r.startsWith("next/") || r.startsWith("next-auth")) && s.startsWith("next/")));
  const probed = probeExports(root, want);
  const shims: BoundaryShim[] = [], probe_errors: string[] = [];
  for (const p of probed) {
    if (p.error) { if (reachable.includes(p.spec)) probe_errors.push(`${p.spec}: ${p.error}`); continue; }
    const s = buildShim(p, pkgVersion(root, p.spec));
    if (s) shims.push(s);
  }
  return { shims, probe_errors };
}
