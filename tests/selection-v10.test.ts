import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { harnessViolations } from "../src/engine/investigate.js";
import { runRealTests } from "../src/engine/sandbox.js";

test("alias of the real function from an app module is not a redefinition", () => {
  const spec = { setup: 'm = app("src/a.py")\nf = m.f', stubs: [], tests: [] };
  assert.deepEqual(harnessViolations(spec, "src/a.py", "f", "python").filter((v) => v.includes("redefined")), []);
});
test("a real redefinition is still caught", () => {
  const spec = { setup: 'm = app("src/a.py")\ndef f(x):\n    return 1', stubs: [], tests: [] };
  assert.ok(harnessViolations(spec, "src/a.py", "f", "python").some((v) => v.includes("redefined")));
  const spec2 = { setup: 'm = app("src/a.py")\nf = other.f', stubs: [], tests: [] };
  assert.ok(harnessViolations(spec2, "src/a.py", "f", "python").some((v) => v.includes("redefined")));
});
test("await app(...) is flagged in Python only", () => {
  assert.ok(harnessViolations({ setup: 'm = await app("a.py")', stubs: [], tests: [] }, "a.py", undefined, "python").some((v) => v.includes("synchronous")));
  assert.ok(!harnessViolations({ setup: 'const m = await app("a.ts")', stubs: [], tests: [] }, "a.ts", undefined, "ts").some((v) => v.includes("synchronous")));
});
test("python harness reports whether the attributed function ran", () => {
  const root = mkdtempSync(join(tmpdir(), "wce-trace-"));
  writeFileSync(join(root, "mod.py"), "def helper(x):\n    return x + 1\ndef other(x):\n    return x\n");
  const mk = (body: string) => ({ setup: 'm = app("mod.py")', stubs: [], tests: [{ name: "t", role: "reproduction", asserts: "", body }], trace: { file: "mod.py", function: "helper" } });
  const ws = { root, origin: "repo", python: "python3", notes: [] } as never;
  assert.equal(runRealTests("python", ws, mk("m.helper(1)") as never).results[0].target_ran, true);
  assert.equal(runRealTests("python", ws, mk("m.other(1)") as never).results[0].target_ran, false);
});
