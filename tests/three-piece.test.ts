import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { TranscriptIndex } from "../src/session/transcript.js";
import type { ProdError, SessionMessage } from "../src/types.js";
import { editThatWroteLine, isMachineUserText, mostRelevantParagraph, threePieceFromTranscript, threePieceFromGithub } from "../src/story/three-piece.js";

const diff = (file: string, start: number, lines: string[]) => `{"diffString":"--- /dev/null\n+++ b//workspace/${file}\n@@ -0,0 +${start},${lines.length} @@\n${lines.join("\n")}","oldStart":0}`;
function idx(msgs: SessionMessage[]): TranscriptIndex {
  const by = new Map<string, number[]>();
  for (const m of msgs) for (const f of m.edited_files ?? []) by.set(f, [...(by.get(f) ?? []), m.line]);
  return { path: "t.jsonl", messages: msgs, byEditedFile: by, scrubReplacements: 0 };
}
const long = "I will look up the row first and then create it only when missing, because the pair is unique and a second click toggles it off again.";
const err: ProdError = { id: "e1", timestamp: "", severity: "error", service: "s", message: "Unique constraint failed", frames: [{ file: "node_modules/x.js", line: 1 }, { file: "lib/a.ts", line: 3, function: "f" }] };

describe("three-piece explanation (deterministic)", () => {
  it("links error -> line -> the edit that wrote it, and quotes asked + understood verbatim", () => {
    const i = idx([
      { line: 1, role: "user", text: "Build a board.\n\nUsers can upvote feedback once." },
      { line: 2, role: "user", text: "<timestamp>x</timestamp>\n<system_notification>task done</system_notification>" },
      { line: 3, role: "assistant", text: long },
      { line: 4, role: "tool", tool_name: "edit_file", edited_files: ["lib/a.ts"], code_written: diff("lib/a.ts", 1, ["+export function f() {", "+  const e = find();", "+  create(upvote);", "+}"]) },
    ]);
    const r = threePieceFromTranscript(err, i, "t.jsonl", () => "export function f() {\n  const e = find();\n  create(upvote);\n}");
    assert.equal(r.frame?.file, "lib/a.ts");
    assert.equal(r.asked?.citation.startsWith("t.jsonl#L1"), true, "machine notification is not the ask");
    assert.equal(r.asked?.text, "Users can upvote feedback once.");
    assert.equal(r.understood?.text, long);
    assert.match(r.happened!.text, /3: create\(upvote\);/);
    assert.equal(r.complete, true);
  });
  it("silent edit -> understood invalid; frame line not written by the agent -> no pieces", () => {
    const i = idx([
      { line: 1, role: "user", text: "do it" }, { line: 2, role: "assistant", text: "Now the file." },
      { line: 3, role: "tool", tool_name: "edit_file", edited_files: ["lib/a.ts"], code_written: diff("lib/a.ts", 1, ["+x();"]) },
    ]);
    assert.equal(threePieceFromTranscript(err, i, "t", () => "a\nb\nx();").understood?.valid, false);
    const r = threePieceFromTranscript(err, i, "t", () => "a\nb\nhuman_code();");
    assert.equal(r.complete, false); assert.equal(r.asked, undefined); assert.match(r.notes[0], /not written by any edit/);
  });
  it("uses the LAST edit that wrote the exact line, so later line shifts do not break the link", () => {
    const i = idx([
      { line: 1, role: "tool", tool_name: "edit_file", edited_files: ["lib/a.ts"], code_written: diff("lib/a.ts", 1, ["+x();"]) },
      { line: 2, role: "tool", tool_name: "edit_file", edited_files: ["lib/a.ts"], code_written: diff("lib/a.ts", 7, ["+  x();"]) },
    ]);
    assert.equal(editThatWroteLine(i, "lib/a.ts", "x();")?.edit_line, 2);
  });
  it("helpers", () => {
    assert.equal(isMachineUserText("<system_notification>a</system_notification>"), true);
    assert.equal(isMachineUserText("please add invites"), false);
    assert.equal(mostRelevantParagraph("intro\n\nthe invite token expires", "const token = invite()"), "the invite token expires");
  });
  it("github variant marks text-only errors without localization as incomplete", () => {
    const prov = { repo: "o/r", commit: "c", method: "", agent: { is_agent: true, evidence: [] }, segments: [{ id: "S1", kind: "pr_body" as const, url: "u", author: "bot", text: "Problem: x" }, { id: "S2", kind: "commit_message" as const, url: "c", author: "bot", text: "fix x" }] };
    assert.equal(threePieceFromGithub({ id: "e", message: "m", source_url: "s" }, prov).complete, false);
    assert.equal(threePieceFromGithub({ id: "e", message: "m", source_url: "s" }, prov, { file: "a.py", lines: [1, 2] }).complete, true);
  });
});
