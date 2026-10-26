import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertClaudeCode, isClaudeCodeTranscript, stripCatN } from "../src/session/claude-code.js";
import { loadTranscript } from "../src/session/transcript.js";
import { reconstructTree } from "../src/engine/tree.js";

// REAL samples: the box's own Claude Code sessions (not copied into the repo; they hold private session data). Skipped when absent.
const DIR = "/home/box/.claude/projects/-workspace-trading-agent-system";
const real = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".jsonl")).sort().map((f) => join(DIR, f)).filter((f, i) => i < 15 || readFileSync(f, "utf8").includes('"tool_use"')) : [];

describe("Claude Code transcripts: real samples", { skip: real.length ? false : "no Claude Code sessions on this machine" }, () => {
  it("are detected, keep 1:1 line numbering, and surface text/thinking and tool calls", async () => {
    let thinking = 0, tools = 0;
    for (const f of real) {
      assert.equal(isClaudeCodeTranscript(f), true, f);
      const src = readFileSync(f, "utf8");
      assert.equal(convertClaudeCode(src).split("\n").length, src.split("\n").length, f);
      const idx = await loadTranscript(f);
      assert.equal(idx.path, f);
      thinking += idx.messages.filter((m) => m.thinking || m.text).length; // real thinking blocks are often redacted (empty text + signature)
      tools += idx.messages.filter((m) => m.tool_name).length;
      // every recorded line points at a real tool_use / thinking line of the original file
      for (const m of idx.messages.filter((x) => x.tool_name)) assert.match(src.split("\n")[m.line - 1], /"tool_use"/);
    }
    assert.ok(thinking > 0 && tools > 0, `thinking=${thinking} tools=${tools}`);
  });
  it("a Cursor transcript is not misdetected", () => {
    const c = "/workspace/cloud-agent-transcripts/bc-25dab342-ff3b-5916-ae3f-7b0214f24784.jsonl";
    if (existsSync(c)) assert.equal(isClaudeCodeTranscript(c), false);
  });
});

// SYNTHETIC fixture (labeled): the box's real sessions contain no edit tool calls, so the Write/Edit/MultiEdit/Read shapes below follow
// Claude Code's documented tool-input schema. This tests the format mapping only; it is not evidence about any bug.
describe("Claude Code edit tools (synthetic fixture of the documented format)", () => {
  const cwd = "/proj";
  const L = (type: string, content: unknown[]) => JSON.stringify({ type, cwd, timestamp: "2026-01-01T00:00:00Z", message: { role: type, content } });
  const lines = [
    L("user", [{ type: "text", text: "build it" }]),
    L("assistant", [{ type: "thinking", thinking: "I will assume the list is sorted" }, { type: "tool_use", id: "t1", name: "Write", input: { file_path: "/proj/src/a.py", content: "def f(x):\n    return x[0]\n" } }]),
    L("user", [{ type: "tool_result", tool_use_id: "t1", content: "ok" }]),
    L("assistant", [{ type: "tool_use", id: "t2", name: "Edit", input: { file_path: "/proj/src/a.py", old_string: "x[0]", new_string: "min(x)" } }]),
    L("user", [{ type: "tool_result", tool_use_id: "t2", content: "ok" }]),
    L("assistant", [{ type: "tool_use", id: "t3", name: "Edit", input: { file_path: "/proj/src/a.py", old_string: "nope", new_string: "zzz" } }]),
    L("user", [{ type: "tool_result", tool_use_id: "t3", is_error: true, content: "String not found" }]),
    L("assistant", [{ type: "tool_use", id: "t4", name: "Read", input: { file_path: "/proj/src/b.py" } }]),
    L("user", [{ type: "tool_result", tool_use_id: "t4", content: "     1\tA = 1\n     2\tB = 2\n" }]),
    L("assistant", [{ type: "tool_use", id: "t5", name: "MultiEdit", input: { file_path: "/proj/src/b.py", edits: [{ old_string: "A = 1", new_string: "A = 10" }, { old_string: "B = 2", new_string: "B = 20" }] } }]),
    L("user", [{ type: "tool_result", tool_use_id: "t5", content: "ok" }]),
  ];
  it("replays Write, Edit, MultiEdit (seeded by a full Read) and skips errored edits", async () => {
    const d = mkdtempSync(join(tmpdir(), "cc-")); const f = join(d, "s.jsonl"); writeFileSync(f, lines.join("\n") + "\n");
    const idx = await loadTranscript(f);
    assert.deepEqual(idx.byEditedFile.get("src/a.py"), [2, 4, 6]);
    assert.equal(idx.messages.find((m) => m.line === 2)?.thinking, "I will assume the list is sorted");
    const t = reconstructTree(f, join(d, "tree"));
    assert.deepEqual(t.failed, []);
    assert.equal(readFileSync(join(d, "tree/src/a.py"), "utf8"), "def f(x):\n    return min(x)\n");
    assert.equal(readFileSync(join(d, "tree/src/b.py"), "utf8"), "A = 10\nB = 20\n");
    const upTo = reconstructTree(f, join(d, "tree2"), 3);
    assert.equal(readFileSync(join(d, "tree2/src/a.py"), "utf8"), "def f(x):\n    return x[0]\n");
    assert.equal(upTo.files.includes("src/b.py"), false);
  });
  it("stripCatN handles both prefix styles and rejects non-cat-n text", () => {
    assert.equal(stripCatN("     1\tx\n     2→y\n"), "x\ny");
    assert.equal(stripCatN("plain text"), undefined);
  });
});
