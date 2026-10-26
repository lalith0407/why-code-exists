import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stems } from "../src/reframe/localize.js";
import { runCheck } from "../src/reframe/explain.js";

test("stems split camel/snake, drop stopwords", () => {
  assert.deepEqual(stems("'VideoObject' object has no attribute 'choices'").sort(), ["choice", "video"]);
});
test("runCheck: empty scope is invalid, contradiction when observation differs from belief", () => {
  const d = mkdtempSync(join(tmpdir(), "rc-")); writeFileSync(join(d, "a.py"), "Types = (\n  A\n  | B\n)\n");
  const base = { id: "c", file: "a.py", meaning: "m" };
  assert.equal(runCheck(d, { ...base, anchor_regex: "^Nope", test_regex: "A", expect_if_belief_true: "match" }).outcome, "invalid");
  assert.equal(runCheck(d, { ...base, anchor_regex: "^Types = \\(", test_regex: "Types = \\([^)]*C", expect_if_belief_true: "match" }).outcome, "contradicts_belief");
  assert.equal(runCheck(d, { ...base, anchor_regex: "^Types = \\(", test_regex: "Types = \\([^)]*B", expect_if_belief_true: "match" }).outcome, "consistent_with_belief");
});
