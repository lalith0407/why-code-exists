import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { buildShim, frameworkShims, BOUNDARY } = await import("../src/engine/frameworks.js");
const { errorExcerpt, syntaxErrors, runRealTests } = await import("../src/engine/sandbox.js");
const { harnessViolations } = await import("../src/engine/investigate.js");

describe("framework boundary shims", () => {
  it("replaces only request-scoped exports the REAL package has; everything else passes through", () => {
    const s = buildShim({ spec: "next/cache", url: "file:///x/cache.js", keys: ["revalidatePath", "unstable_cache", "somethingNew", "default"] })!;
    assert.deepEqual(s.replaced.sort(), ["revalidatePath", "unstable_cache"]);
    assert.deepEqual(s.passthrough, ["somethingNew"]);
    assert.match(s.code, /export const somethingNew = __src\["somethingNew"\]/);
    assert.doesNotMatch(s.code, /export const revalidateTag/); // not in the real package -> not invented
  });
  it("no shim for packages without a boundary profile or without request-scoped exports", () => {
    assert.equal(buildShim({ spec: "zod", url: "file:///z.js", keys: ["z"] }), undefined);
    assert.equal(buildShim({ spec: "next/headers", url: "file:///h.js", keys: ["somethingElse"] }), undefined);
  });
  it("profiles name only framework packages (no app identifiers)", () => {
    for (const k of Object.keys(BOUNDARY)) assert.match(k, /^(next|next-auth)(\/|$)/);
  });

  it("end-to-end: real app code that calls headers()/cookies()/revalidatePath/auth() runs, with all other exports real", () => {
    const root = mkdtempSync(join(tmpdir(), "wce-fw-"));
    // A stand-in "framework" with the same failure mode as the real one: calling request APIs outside a request throws.
    const nm = join(root, "node_modules");
    mkdirSync(join(nm, "next"), { recursive: true }); mkdirSync(join(nm, "next-auth"), { recursive: true });
    writeFileSync(join(nm, "next/package.json"), JSON.stringify({ name: "next", version: "0.0.0-test" }));
    writeFileSync(join(nm, "next/headers.js"), "const out = () => { throw new Error('`headers` was called outside a request scope') };\nmodule.exports = { headers: out, cookies: out, draftMode: out };");
    writeFileSync(join(nm, "next/cache.js"), "module.exports = { revalidatePath(){ throw new Error('Invariant: static generation store missing') }, realHelper(){ return 'real' } };");
    writeFileSync(join(nm, "next-auth/package.json"), JSON.stringify({ name: "next-auth", version: "5.0.0-test", main: "index.js" }));
    writeFileSync(join(nm, "next-auth/index.js"), "module.exports = function NextAuth(c){ return { auth(){ throw new Error('no request') }, signIn(){ return 'real-signIn' }, handlers: { GET: 1 } } };\nmodule.exports.default = module.exports;");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "app", private: true }));
    mkdirSync(join(root, "lib"));
    writeFileSync(join(root, "lib/auth.ts"), "import NextAuth from 'next-auth';\nexport const { auth, signIn } = NextAuth({});\n");
    writeFileSync(join(root, "lib/act.ts"), "import { headers, cookies } from 'next/headers';\nimport { revalidatePath, realHelper } from 'next/cache';\nimport { auth, signIn } from './auth';\n" +
      "export async function act() { const h = await headers(); const c = await cookies(); const s = await auth(); revalidatePath('/x');\n  return { ua: h.get('user-agent'), theme: c.get('theme')?.value, user: s?.user?.id ?? null, helper: realHelper(), signIn: signIn() }; }\n");
    const { shims, probe_errors } = frameworkShims(root, ["next/headers", "next/cache", "next-auth"]);
    assert.deepEqual(probe_errors, []);
    assert.deepEqual(shims.map((s) => s.module).sort(), ["next-auth", "next/cache", "next/headers"]);
    const ws = { root, origin: "repo" as const, aliasAt: false, notes: [], shims };
    const res = runRealTests("ts", ws, { setup: "const { act } = await app(\"lib/act.ts\");", stubs: [], tests: [
      { name: "signed in", role: "reproduction", body: "set_request({ headers: { 'user-agent': 'UA1' }, cookies: { theme: 'dark' } }); set_session({ user: { id: 'u1' } }); const r = await act(); record('r', r); harm_observed(r.ua === 'UA1' && r.theme === 'dark' && r.user === 'u1' && r.helper === 'real' && r.signIn === 'real-signIn' && framework_calls('revalidatePath').length === 1, JSON.stringify(r))" },
      { name: "control flow", role: "decoy", body: "const r = await settle(async () => { const e = new Error('NEXT_REDIRECT'); e.digest = 'NEXT_REDIRECT;replace;/login;307;'; throw e }); check(r.ok && r.redirect === '/login', JSON.stringify(r)); const f = await settle(Promise.reject(new Error('boom'))); check(!f.ok, 'real errors stay errors')" },
      { name: "signed out", role: "decoy", body: "const r = await act(); check(r.user === null && r.ua === null, JSON.stringify(r))" },
    ] });
    assert.ok(res.ok, res.error + res.stderr);
    for (const t of res.results) assert.ok(t.pass, `${t.name}: ${t.error}`);
  });
});

describe("repair feedback and static checks", () => {
  it("errorExcerpt keeps the first error, not Node-internal tail frames", () => {
    const se = "node:internal/modules/run_main:123\n    triggerUncaughtException(\n    ^\nError [TransformError]: Transform failed with 1 error:\n/x/.wce/t0.ts:82:2: ERROR: Unexpected \"export\"\n    at failureErrorWithLog (/r/node_modules/esbuild/lib/main.js:1752:15)\n    at Socket.emit (node:events:524:28)\n\nNode.js v20.19.2\n";
    const ex = errorExcerpt(se);
    assert.match(ex, /Unexpected "export"/);
    assert.doesNotMatch(ex, /node:events|Node\.js v/);
  });
  it("syntaxErrors names the section and its own line (TS and Python)", () => {
    const ts = syntaxErrors({ setup: "const a = 1;\nexport const b = 2;", stubs: [], tests: [{ name: "t", role: "decoy", body: "check(true)" }] }, "ts");
    assert.equal(ts.length, 1); assert.match(ts[0], /^setup: syntax error at line 2/);
    const py = syntaxErrors({ setup: "x = 1", stubs: [], tests: [{ name: "p", role: "decoy", body: "if x:\nprint(x)" }] }, "python");
    assert.equal(py.length, 1); assert.match(py[0], /^test p: Python syntax error/);
  });
  it("harnessViolations flags import/export statements in sections", () => {
    const v = harnessViolations({ setup: 'import crypto from "node:crypto";\nconst { f } = await app("lib/f.ts");', stubs: [], tests: [{ name: "r", role: "reproduction", body: "harm_observed(true)" }] }, "lib/f.ts", "f", "ts");
    assert.ok(v.some((x) => /setup: contains an import\/export statement/.test(x)), v.join("; "));
  });
});
