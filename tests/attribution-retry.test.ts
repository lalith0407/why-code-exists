import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { TranscriptIndex } from "../src/session/transcript.js";
import type { SessionMessage } from "../src/types.js";
import { calledNames, fallbackAttribution, findProvenance } from "../src/session/provenance.js";
import { extractFunction } from "../src/engine/lang.js";
import { withRetry } from "../src/engine/llm.js";
import { isTransient } from "../src/llm/providers.js";

const add = (file: string, start: number, lines: string[]) =>
  `{"diffString":"--- a//workspace/${file}\n+++ b//workspace/${file}\n@@ -${start},0 +${start},${lines.length} @@\n${lines.map((l) => "+" + l).join("\n")}","oldStart":0}`;
const idx = (msgs: SessionMessage[]) => ({ path: "x", messages: msgs, byEditedFile: new Map(), scrubReplacements: 0 }) as TranscriptIndex;
const ex = (src: string, fn: string, l: any) => extractFunction(src, fn, l);

describe("fallback attribution (generic, deterministic)", () => {
  it("Python: frame pre-existed; picks the DEEPEST agent-introduced callee on the call path", () => {
    const tree: Record<string, string> = {
      "pkg/base.py": "def plan(a):\n    s = _step(a)\n    return helper_old(s)\n\ndef helper_old(x):\n    return x\n\ndef _step(a):\n    return _quote(a.t)\n\ndef _quote(t):\n    return f\"'{t}'\"\n",
    };
    const msgs: SessionMessage[] = [
      { line: 10, role: "tool", tool_name: "edit", code_written: add("pkg/base.py", 8, ["def _step(a):", "    return _quote(a.t)"]) },
      { line: 12, role: "tool", tool_name: "edit", code_written: add("pkg/base.py", 11, ["def _quote(t):", "    return f\"'{t}'\""]) },
    ];
    const frame = { file: "pkg/base.py", line: 2, function: "plan" };
    assert.equal(findProvenance(idx(msgs), frame).written_at, undefined);
    const fb = fallbackAttribution(idx(msgs), frame, (f) => tree[f], [], ex)!;
    assert.equal(fb.attribution, "callee_introduced_by_edit");
    assert.deepEqual(fb.call_path.map((c) => c.function), ["plan", "_step", "_quote"]);
    assert.equal(fb.target.function, "_quote");
    assert.equal(fb.edit_line, 12);
    assert.deepEqual(fb.candidates.map((c) => c.function), ["_quote", "_step"]);
  });

  it("TS: callee introduced in an imported local file", () => {
    const tree: Record<string, string> = {
      "lib/a.ts": "export async function submit(x: string) {\n  const u = normalize(x);\n  return u;\n}\n",
      "lib/v.ts": "export function normalize(s: string) {\n  return s.toLowerCase();\n}\n",
    };
    const msgs: SessionMessage[] = [{ line: 4, role: "tool", tool_name: "write", code_written: add("lib/v.ts", 1, ["export function normalize(s: string) {", "  return s.toLowerCase();", "}"]) }];
    const fb = fallbackAttribution(idx(msgs), { file: "lib/a.ts", line: 2, function: "submit" }, (f) => tree[f], ["lib/v.ts"], ex)!;
    assert.equal(fb.attribution, "callee_introduced_by_edit");
    assert.deepEqual(fb.target, { file: "lib/v.ts", function: "normalize" });
  });

  it("falls back to last_modified_by_edit when no agent-written callee exists; undefined when nothing touched it", () => {
    const tree: Record<string, string> = { "m.py": "def parse(x):\n    y = x.strip()\n    return y\n" };
    const mod = (line: number) => ({ line, role: "tool", tool_name: "edit",
      code_written: `{"diffString":"--- a//workspace/m.py\n+++ b//workspace/m.py\n@@ -1,3 +1,3 @@\n def parse(x):\n-    y = x\n+    y = x.strip()\n     return y","oldStart":0}` }) as SessionMessage;
    const fb = fallbackAttribution(idx([mod(3), mod(9)]), { file: "m.py", line: 2, function: "parse" }, (f) => tree[f], [], ex)!;
    assert.equal(fb.attribution, "last_modified_by_edit");
    assert.equal(fb.edit_line, 9);
    assert.equal(fb.target.function, "parse");
    assert.equal(fallbackAttribution(idx([]), { file: "m.py", line: 2, function: "parse" }, (f) => tree[f], [], ex), undefined);
  });

  it("calledNames skips the definition line and keywords", () => {
    assert.deepEqual(calledNames("def f(a):\n    if g(a):\n        return self.h(len(a))"), ["g", "h"]);
  });

  it("introduced frame keeps attribution introduced_by_edit", () => {
    const p = findProvenance(idx([{ line: 2, role: "tool", tool_name: "edit", code_written: add("m.py", 1, ["def parse(x):", "    return x"]) }]), { file: "m.py", line: 2, function: "parse" });
    assert.equal(p.attribution, "introduced_by_edit");
  });
});

describe("LLM retry/backoff", () => {
  it("classifies transient vs permanent", () => {
    assert.equal(isTransient("http_429"), true);
    assert.equal(isTransient("http_429:rate_limit_exceeded"), true);
    assert.equal(isTransient("http_503"), true);
    assert.equal(isTransient("timeout"), true);
    assert.equal(isTransient("http_429:insufficient_quota"), false);
    assert.equal(isTransient("http_400"), false);
  });
  it("retries transient errors with backoff and stops on success", async () => {
    const waits: number[] = []; let n = 0;
    const r = await withRetry(async () => (++n < 3 ? { ok: false, reason: "http_429" } : { ok: true, content: "{}" }), "t", false, { retries: 4, baseMs: 100, sleep: async (ms) => { waits.push(ms); } });
    assert.equal(r.ok, true); assert.equal(r.attempts, 3); assert.equal(waits.length, 2); assert.ok(waits[1] > waits[0]);
  });
  it("does not retry exhausted quota; gives up after max retries", async () => {
    let n = 0;
    const q = await withRetry(async () => { n++; return { ok: false, reason: "http_429:insufficient_quota" }; }, "t", false, { sleep: async () => {} });
    assert.equal(q.ok, false); assert.equal(n, 1);
    const g = await withRetry(async () => ({ ok: false, reason: "http_502" }), "t", false, { retries: 2, sleep: async () => {} });
    assert.equal(g.attempts, 3);
  });
  it("honours Retry-After", async () => {
    const waits: number[] = []; let n = 0;
    await withRetry(async () => (++n < 2 ? { ok: false, reason: "http_429", retryAfterMs: 1234 } : { ok: true, content: "" }), "t", false, { sleep: async (ms) => { waits.push(ms); } });
    assert.deepEqual(waits, [1234]);
  });
});
