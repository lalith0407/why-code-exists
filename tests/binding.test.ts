import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { locateCited, patchTouchedLines, overlaps, noopMutant } from "../src/prove/binding.js";

describe("claim binding", () => {
  const src = ["def f(x):", "    y = x + 1", "    if y > 3:", "        return y", "    return 0", ""].join("\n");
  it("locates cited lines verbatim (whitespace-insensitive), drops unknown", () => {
    const c = locateCited(["if y > 3:", "z = nope()"], { "a.py": src });
    assert.deepEqual(c.map((x) => [x.file, x.line]), [["a.py", 3]]);
  });
  it("ambiguous cited lines count only inside the preferred span", () => {
    const two = src + "def g(x):\n    return 0\n" + "def h(x):\n    return 0\n";
    assert.deepEqual(locateCited(["return 0"], { "a.py": two }).length, 0);
    assert.deepEqual(locateCited(["return 0"], { "a.py": two }, [{ file: "a.py", range: [1, 5] }]).map((x) => x.line), [5]);
  });
  it("maps a find/replace edit to original line numbers", () => {
    assert.deepEqual(patchTouchedLines(src, "    if y > 3:\n        return y", "    if y >= 3:\n        return y"), [3]);
    const ins = patchTouchedLines(src, "    y = x + 1\n    if y > 3:", "    y = x + 1\n    y = max(y, 0)\n    if y > 3:");
    assert.ok(ins.includes(2) || ins.includes(3));
  });
  it("overlap requires same file and nearby line", () => {
    const c = [{ file: "a.py", line: 3, text: "" }];
    assert.equal(overlaps(c, "a.py", [4]).length, 1);
    assert.equal(overlaps(c, "a.py", [6]).length, 0);
    assert.equal(overlaps(c, "b.py", [3]).length, 0);
  });
  it("builds no-op mutants for python and ts", () => {
    const m = noopMutant(src, [1, 5], "python")!;
    assert.equal(m.split("\n")[1], "    return None  # wce noop mutant");
    const ts = ["export async function g(a: { x: number }): Promise<{ ok: boolean }> {", "  return { ok: a.x > 0 };", "}"].join("\n");
    const mt = noopMutant(ts, [1, 3], "ts")!;
    assert.match(mt.split("\n")[0], /Promise<\{ ok: boolean \}> \{ return undefined;/);
    assert.equal(noopMutant("const h = (a) => a + 1;", [1, 1], "ts"), undefined);
  });
});
