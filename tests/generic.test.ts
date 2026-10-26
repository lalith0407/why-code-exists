import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const TMP = mkdtempSync(join(tmpdir(), "wce-"));
process.env.WCE_CALL_LEDGER = join(TMP, "ledger.jsonl");
process.env.WCE_METERLESS_DIR = join(TMP, "meterless");
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key-not-real";
const { langOf, defRegex, extractFunction } = await import("../src/engine/lang.js");
const { dedentBlock, validateStubs, diffSnapshots, pyModuleName } = await import("../src/engine/sandbox.js");
const { prismaProvider } = await import("../src/engine/workspace.js");
const { parseFrames } = await import("../src/engine/frames.js");
const { findProvenance } = await import("../src/session/provenance.js");
const { tempViewSql, tempViewSqls, renameTables, schemaOf, describeTables } = await import("../src/evidence/zetaris.js");
const { errorLogTable, appDbTable, validateSql } = await import("../src/engine/zetaris-step.js");
const { lessonKey, writeLessonToMeterless, recallLessonsFromMeterless } = await import("../src/lesson/meterless.js");
const { llmJson, obj, str, LlmError, callsUsed } = await import("../src/engine/llm.js");
const { changedLines, fakeOnlyNames, appFrame, investigate, harnessViolations, stubExportGaps } = await import("../src/engine/investigate.js");
const { preventCheck } = await import("../src/engine/lesson.js");
const { renderGenericReport } = await import("../src/report/generic.js");

describe("lang", () => {
  it("detects languages and finds Python and TS functions", () => {
    assert.equal(langOf("a/b.py"), "python"); assert.equal(langOf("x.tsx"), "ts");
    const py = "import os\n\nclass A:\n    async def run(self, x):\n        y = x + 1\n        return y\n\n    def other(self):\n        pass\n";
    const f = extractFunction(py, "run", "python")!;
    assert.match(f.text, /return y/); assert.doesNotMatch(f.text, /other/);
    const ts = "export async function go(a: number) {\n  if (a) { return '}'; }\n  return 2;\n}\nexport function next() {}\n";
    const g = extractFunction(ts, "go", "ts")!;
    assert.match(g.text, /return 2/); assert.doesNotMatch(g.text, /next/);
    assert.ok(defRegex("run", "python").test("    def run(self):"));
  });
});

describe("python provenance (synthetic transcript)", () => {
  it("finds the edit that introduced a Python function by indentation", () => {
    const d = `{"diffString":"--- /dev/null\\n+++ b//workspace/svc/risk.py\\n@@ -0,0 +1,5 @@\\n+import math\\n+\\n+def size(qty, px):\\n+    n = qty * px\\n+    return math.floor(n)","oldStart":0}`;
    const msgs = [
      { line: 3, role: "assistant", thinking: "Size positions by notional." },
      { line: 4, role: "tool", tool_name: "write", code_written: JSON.parse(`"${d.replace(/"/g, '\\"')}"`) },
    ];
    const index = { path: "x", messages: msgs, byEditedFile: new Map(), scrubReplacements: 0 } as any;
    const p = findProvenance(index, { file: "svc/risk.py", line: 4, function: "size" });
    assert.equal(p.written_at?.edit_line, 4);
    assert.match(p.written_at!.fn_text, /math\.floor/);
  });
});

describe("real-code sandbox pieces", () => {
  it("dedents a whole block, keeping relative indentation", () => {
    assert.equal(dedentBlock("\n    a = 1\n    if a:\n        b = 2\n"), "a = 1\nif a:\n    b = 2");
  });
  it("python module names follow src/ layout", () => {
    assert.equal(pyModuleName("src/pkg/mod.py"), "pkg.mod");
    assert.equal(pyModuleName("pkg/__init__.py"), "pkg");
  });
  it("stub policy rejects app code, aliases, the DB client and builtins; allows bare packages", () => {
    const root = mkdtempSync(join(tmpdir(), "wce-ws-"));
    mkdirSync(join(root, "lib"));
    writeFileSync(join(root, "lib/x.ts"), "export const a = 1;");
    const ws = { root } as any;
    const bad = validateStubs(["@/lib/x", "./lib/x", "lib/x", "@prisma/client", "crypto", "next-auth"].map((module) => ({ module, code: "", why: "" })), ws, "ts");
    assert.equal(bad.length, 5);
    assert.ok(!bad.some((b) => b.startsWith("next-auth")));
  });
  it("diffs DB snapshots into inserts, updates and deletes", () => {
    const d = diffSnapshots({ T: [{ id: 1, v: "a" }, { id: 2, v: "b" }] }, { T: [{ id: 1, v: "A" }, { id: 3, v: "c" }] });
    assert.deepEqual(d.map((x) => x.op).sort(), ["delete", "insert", "update"]);
    assert.deepEqual(diffSnapshots(null, null), []);
  });
  it("reads the prisma datasource provider", () => {
    assert.equal(prismaProvider('datasource db {\n provider = "postgresql"\n url = env("X")\n}'), "postgresql");
    assert.equal(prismaProvider("model A { id Int }"), undefined);
  });
  it("parses JS and Python stack frames relative to the app root", () => {
    const js = parseFrames("Error: x\n    at f (/r/app/lib/a.ts:10:5)\n    at g (/r/app/node_modules/p/i.js:1:1)", "/r/app");
    assert.equal(js[0].file, "lib/a.ts"); assert.equal(js[0].line, 10);
    const py = parseFrames('Traceback (most recent call last):\n  File "/r/app/pkg/m.py", line 7, in h\n    x()\nValueError: y', "/r/app");
    assert.ok(py.some((f) => f.file === "pkg/m.py" && f.line === 7));
  });
});

describe("harness integrity (generic)", () => {
  it("flags monkeypatching, redefinition, missing frame load and reproduction polarity", () => {
    const spec = { setup: "const m = await app('lib/a.ts'); m.f = () => 1; function check() {}", stubs: [], tests: [{ name: "r", role: "reproduction", body: "check(true)" }, { name: "d", role: "decoy", body: "check(true)" }] } as any;
    const v = harnessViolations(spec, "lib/a.ts", "f", "ts").join("\n");
    assert.match(v, /assigns members|redefined/); assert.match(v, /harm_observed/);
    assert.match(harnessViolations({ ...spec, setup: "" }, "lib/a.ts", undefined, "ts").join("\n"), /never loaded/);
  });
  it("stub export coverage follows the app's import lines", () => {
    const gaps = stubExportGaps([{ module: "p", code: "export function a() {}", why: "" }], [{ package: "p", import_lines: ['import P, { a, b } from "p";'] }]);
    assert.equal(gaps.length, 2);
    assert.deepEqual(stubExportGaps([{ module: "p", code: "export default {}; export const b = 1; export function a() {}", why: "" }], [{ package: "p", import_lines: ['import P, { a, b } from "p";'] }]), []);
  });
});

describe("patch gates", () => {
  it("counts changed lines and flags fake-only names", () => {
    assert.equal(changedLines("a\nb\nc", "a\nB\nc").n, 2);
    assert.deepEqual(fakeOnlyNames("const __fakeStore = {};", "function f() { return 1; }", "function f() { return __fakeStore.x; }"), ["__fakeStore"]);
  });
  it("app frame skips dependency frames", () => {
    const f = appFrame({ message: "x", frames: [{ file: "node_modules/p/i.js", line: 1 }, { file: "lib/a.ts", line: 9, function: "f" }] } as any);
    assert.equal(f.file, "lib/a.ts");
  });
});

describe("zetaris generic TEMP VIEW builder", () => {
  it("types columns from rows, escapes strings, handles nulls and empty tables", () => {
    const t = { name: "obs-1", rows: [{ table: "x.create", n: 1, note: "it's" }, { table: "x.update", n: null, extra: { a: 1 } }] };
    assert.deepEqual(schemaOf(t).map((c) => c.type), ["STRING", "DOUBLE", "STRING", "STRING"]);
    const sql = tempViewSql(t);
    assert.match(sql, /^CREATE OR REPLACE TEMP VIEW obs_1 AS SELECT \* FROM \(VALUES/);
    const b64 = (x: string) => `CAST(unbase64('${Buffer.from(x).toString("base64")}') AS STRING)`;
    assert.ok(sql.includes(b64("it's")), "non-plain strings are base64 literals"); assert.match(sql, /'x\.create'/); assert.match(sql, /CAST\(NULL AS DOUBLE\)/); assert.ok(sql.includes(b64('{"a":1}')));
    const big = { name: "big", rows: Array.from({ length: 400 }, (_, i) => ({ i, code: "CREATE TABLE t (a int) OR x; -- ".repeat(20) + i })) };
    const parts = tempViewSqls(big); assert.ok(parts.length > 2); assert.match(parts.at(-1)!, /^CREATE OR REPLACE TEMP VIEW big AS SELECT \* FROM big__P0 UNION ALL/);
    assert.ok(parts.slice(0, -1).every((q) => q.length < 70_000 && !/CREATE TABLE/.test(q.slice(30))), "chunks are bounded and code text never appears raw");
    assert.equal(renameTables("SELECT e.x FROM ERROR_LOG e JOIN error_log_2 f ON 1=1 WHERE e.ERROR_LOG_id = 1", { ERROR_LOG: "ERROR_LOG_r1" }), "SELECT e.x FROM ERROR_LOG_r1 e JOIN error_log_2 f ON 1=1 WHERE e.ERROR_LOG_id = 1");
    assert.match(tempViewSql({ name: "e", rows: [] }), /WHERE 1 = 0/);
    assert.equal(describeTables([t])[0].sample.length, 2);
  });
  it("error log and run tables are generic, with provenance", () => {
    const e = errorLogTable({ id: "E1", message: "boom", frames: [{ file: "a.py", line: 3, function: "f" }] } as any);
    assert.equal(e.rows[0].frame_file, "a.py");
    const t = appDbTable({ ok: true, results: [{ name: "r", role: "reproduction", pass: true, recorded: [{ name: "n", value: 2 }], db_changes: [{ table: "T", op: "insert", row: { id: 1 } }] }] } as any, "original");
    assert.equal(t.name, "APP_DB_WRITES"); assert.ok(t.provenance.includes("original"));
    assert.ok(!Object.keys(t.rows[0]).some((k) => /pass|recorded|value/.test(k)), "no test outcomes or test-recorded values");
  });
  it("validates SQL against the real schema", () => {
    const tabs = [{ name: "ERROR_LOG", columns: ["frame_file STRING", "__empty DOUBLE"] }, { name: "APP_DB_WRITES", columns: ["db_table STRING", "status STRING", "__empty DOUBLE"] }];
    assert.deepEqual(validateSql("SELECT e.frame_file FROM ERROR_LOG e JOIN APP_DB_WRITES w ON w.db_table = 'x' WHERE e.__empty = 0 AND w.__empty = 0", tabs), []);
    assert.match(validateSql("SELECT w.success FROM APP_DB_WRITES w", tabs).join(), /w\.success does not exist/);
    assert.match(validateSql("SELECT * FROM WCE_TEST_RUNS", tabs).join(), /unknown table/);
    assert.match(validateSql("SELECT nope FROM ERROR_LOG", tabs).join(), /nope/);
  });
});

describe("helper import following", () => {
  it("follows local imports (TS and Python) bounded by depth", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs"); const { join } = await import("node:path"); const { tmpdir } = await import("node:os");
    const { helperSources } = await import("../src/engine/context.js");
    const d = mkdtempSync(join(tmpdir(), "hs-")); mkdirSync(join(d, "lib"));
    writeFileSync(join(d, "a.ts"), 'import { b } from "./lib/b";\nimport x from "pkg";\nexport const a = () => b();');
    writeFileSync(join(d, "lib/b.ts"), 'import { c } from "@/lib/c";\nexport const b = () => c();');
    writeFileSync(join(d, "lib/c.ts"), 'import { e } from "./e";\nexport const c = () => e;');
    writeFileSync(join(d, "lib/e.ts"), "export const e = 1;");
    const h = helperSources(d, "a.ts", "ts", true);
    assert.deepEqual(h.map((x: any) => [x.path, x.depth]), [["lib/b.ts", 1], ["lib/c.ts", 2]]);
    mkdirSync(join(d, "src/pk"), { recursive: true });
    writeFileSync(join(d, "src/pk/m.py"), "from .n import f\nimport os\n"); writeFileSync(join(d, "src/pk/n.py"), "def f(): pass\n"); writeFileSync(join(d, "src/pk/__init__.py"), "");
    assert.deepEqual(helperSources(d, "src/pk/m.py", "python", false).map((x: any) => x.path), ["src/pk/n.py"]);
  });
});

describe("lessons keyed by concept", () => {
  it("normalizes concept + language/framework", () => {
    assert.equal(lessonKey({ concept: "Webhook retry idempotency", language_framework: "TypeScript / Next.js" }), "webhook-retry-idempotency|typescript-next-js");
  });
});

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const chat = (content: unknown) => jsonRes({ choices: [{ message: { content: JSON.stringify(content) } }] });

describe("visible failures", () => {
  it("llmJson throws on HTTP error and on budget exhaustion (no canned fallback)", async () => {
    const calls: any[] = [];
    await assert.rejects(llmJson({ provider: "openai", label: "t", system: "s", user: "u", schema: obj({ a: str }) }, calls, async () => jsonRes({ error: "x" }, 500)), LlmError);
    assert.equal(calls[0].ok, false);
    writeFileSync(process.env.WCE_CALL_LEDGER!, '{"at":"2026-01-01","label":"x","model":"m","ok":true}\n');
    process.env.WCE_CALL_BUDGET = "1";
    await assert.rejects(llmJson({ provider: "openai", label: "t", system: "s", user: "u", schema: obj({ a: str }) }, [], async () => chat({ a: "1" })), /budget/);
    delete process.env.WCE_CALL_BUDGET;
    assert.equal(callsUsed(), 1);
  });
  it("llmJson retries once on runaway/invalid JSON with a varied seed and an invalid-output notice, then fails visibly", async () => {
    const bodies: any[] = []; const raw = (c: string) => jsonRes({ choices: [{ message: { content: c } }] });
    let n = 0;
    const r = await llmJson<{ a: string }>({ provider: "openai", label: "t", system: "s", user: "u", schema: obj({ a: str }) }, [], async (_u: any, init: any) => { bodies.push(JSON.parse(init.body)); return n++ ? chat({ a: "ok" }) : raw('{"a": "x x x x'); });
    assert.equal(r.a, "ok"); assert.equal(bodies.length, 2); assert.notEqual(bodies[0].seed, bodies[1].seed); assert.match(bodies[1].messages.at(-1).content, /previous answer was invalid/);
    await assert.rejects(llmJson({ provider: "openai", label: "t", system: "s", user: "u", schema: obj({ a: str }) }, [], async () => raw("{not json")), /unparseable/);
  });
  it("runaway-prone calls (patch, test drafts) use RUNAWAY_PRONE_RETRIES: recovers on 3rd response with distinct seeds", async () => {
    const { RUNAWAY_PRONE_RETRIES } = await import("../src/engine/llm.js");
    assert.equal(RUNAWAY_PRONE_RETRIES, 2);
    const raw = (c: string) => jsonRes({ choices: [{ message: { content: c } }] });
    const seeds: number[] = []; let n = 0;
    const r = await llmJson<{ a: string }>({ provider: "openai", label: "patch:t", system: "s", user: "u", schema: obj({ a: str }), invalidRetries: RUNAWAY_PRONE_RETRIES }, [], async (_u: any, init: any) => { seeds.push(JSON.parse(init.body).seed); return n++ < 2 ? raw('{"rationale": "loop loop') : chat({ a: "ok" }); });
    assert.equal(r.a, "ok"); assert.equal(new Set(seeds).size, 3);
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../src/engine/investigate.ts", import.meta.url), "utf8");
    for (const label of ["label: `patch:${checkP}`", "label: `draft_tests:${checkP}`"]) {
      const i = src.indexOf(label); assert.ok(i > 0, label);
      assert.match(src.slice(i, i + 1200), /invalidRetries: RUNAWAY_PRONE_RETRIES/, label);
    }
    assert.ok(!src.includes("patch_revision"), "v18 revision step removed");
  });
  it("mechanism gate retries unparseable output with varied seed + invalid-output notice", async () => {
    const { judgeMechanisms } = await import("../src/prove/mechanism.js");
    const bodies: any[] = [];
    const out = await judgeMechanisms(["c"], "x = 1", "openai", (async (_u: any, init: any) => { bodies.push(JSON.parse(init.body)); return jsonRes({ choices: [{ message: { content: '{"results": [{"claim' } }] }); }) as any);
    assert.equal(bodies.length, 2); assert.notEqual(bodies[0].seed, bodies[1].seed); assert.match(bodies[1].messages.at(-1).content, /previous answer was invalid/);
    assert.equal(out[0].verdict, "gate_error");
  });
  it("investigate returns no_provenance without calling a model when no edit wrote the frame", async () => {
    const t = join(TMP, "t.jsonl"); writeFileSync(t, JSON.stringify({ role: "user", message: { content: [{ type: "text", text: "hi" }] } }) + "\n");
    const r = await investigate({ error: { message: "x", frames: [{ file: "lib/none.ts", line: 1, function: "nope" }] } as any, transcript: t });
    assert.equal(r.verdict, "no_provenance"); assert.equal(r.calls.length, 0);
    assert.match(renderGenericReport(r), /no_provenance/);
  });
});

describe("Meterless H-MEM in-process + prevention", () => {
  const mk = (concept: string, wrong: string, rule: string) => ({ id: concept, created_at: "t", concept, language_framework: "Python", file: "a.py", error_id: "e", wrong_assumption: wrong, correct_rule: rule, suggested_fix: "-x\n+y", verdict: "proven_false", citations: [] });
  it("writes, dedups and recalls lessons by concept key", () => {
    const w = writeLessonToMeterless(mk("float rounding", "rounding to 2dp is exact", "use Decimal"));
    assert.equal(w.detail, "new");
    assert.equal(writeLessonToMeterless(mk("float rounding", "rounding to 2dp is exact", "use Decimal")).detail, "dedup_existing");
    const r = recallLessonsFromMeterless("float rounding Python", { tags: ["kind:lesson"] });
    assert.equal(r.hits[0].record?.concept, "float rounding");
  });
  it("prevent drops a 'repeats' finding whose quote is not in the change", async () => {
    writeLessonToMeterless(mk("loop bound", "range(n) includes n", "range(n) stops at n-1"));
    const real = globalThis.fetch;
    globalThis.fetch = (async (_u: any, init: any) => {
      const ids = JSON.parse(JSON.parse(init.body).messages[1].content).lessons.map((l: any) => l.lesson_id);
      return chat({ findings: ids.map((id: string, i: number) => ({ lesson_id: id, repeats: true, quote: i === 0 ? "return a+b" : "invented line", reason: "r" })) });
    }) as typeof fetch;
    try {
      const r = await preventCheck({ change: "def f(a, b):\n    return a+b\n", language_framework: "Python", provider: "openai" }, []);
      assert.ok(r.recalled >= 2);
      assert.equal(r.findings.filter((f) => f.repeats).length, 1);
      assert.ok(r.findings.slice(1).every((f) => !f.repeats && /dropped/.test(f.reason)));
    } finally { globalThis.fetch = real; }
  });
});
