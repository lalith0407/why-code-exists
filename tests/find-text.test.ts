import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveFind } from "../src/engine/find-text.js";
const FILE = "def f(x):\n    if x not in meta:\n        continue\n    y = x  + 1\n    return y\n\ndef g():\n    return 2\n";
describe("resolveFind", () => {
  it("uses an exact unique match as is", () => assert.deepEqual(resolveFind(FILE, "    return y"), { kind: "exact", find: "    return y" }));
  it("maps a whitespace-only difference to the file's actual text", () => {
    const r = resolveFind(FILE, "if x not in meta:\n  continue\ny = x + 1");
    assert.equal(r.kind, "whitespace_normalized"); assert.equal((r as { find: string }).find, "    if x not in meta:\n        continue\n    y = x  + 1");
  });
  it("refuses non-whitespace differences and returns the nearest actual text", () => {
    const r = resolveFind(FILE, "if x not in meta:\n    continue\ny = x + 2");
    assert.equal(r.kind, "none"); assert.match((r as { nearest?: string }).nearest ?? "", /y = x  \+ 1/);
  });
  it("refuses ambiguous matches", () => assert.equal(resolveFind("a\n  b\na\nb\n", "a\n b").kind, "none"));
});
import { repairPythonIndent } from "../src/engine/sandbox.js";
describe("repairPythonIndent", () => {
  it("re-aligns a stray-indented statement and verifies with the parser", () => {
    const r = repairPythonIndent("x = 1\n\n db = make(x)\nprint(db)");
    assert.deepEqual(r.fixed, [3]); assert.equal(r.src, "x = 1\n\ndb = make(x)\nprint(db)");
  });
  it("leaves block bodies and valid code alone", () => {
    assert.deepEqual(repairPythonIndent("if a:\n    b = 1\n").fixed, []);
  });
});
