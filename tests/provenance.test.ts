import { bContent } from "./helpers/b-mock.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultTranscriptPath, loadTranscript, type TranscriptIndex } from "../src/session/transcript.js";
import { findProvenance, parseDiffs, whyCandidates } from "../src/session/provenance.js";
import type { ProdError, SessionMessage } from "../src/types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// The two cases below read an external session file (WCE_TRANSCRIPT or the historical default). The snapshot does not include it.
const externalTranscript = existsSync(defaultTranscriptPath()) ? false : "external transcript is not in this snapshot";

function diff(file: string, start: number, lines: string[]): string {
  return `{"diffString":"--- /dev/null\n+++ b//workspace/${file}\n@@ -0,0 +${start},${lines.length} @@\n${lines.join("\n")}","oldStart":0}`;
}

describe("edit provenance (deterministic)", () => {
  it("parseDiffs assigns new-file line numbers to added lines", () => {
    const h = parseDiffs(diff("lib/a.ts", 10, ["+export function f() {", "+  return 1;", "+}"]));
    assert.equal(h[0].file, "lib/a.ts");
    assert.deepEqual(h[0].lines.map((l) => l.newLine), [10, 11, 12]);
  });

  it("synthetic: introducing edit + silent reasoning + later modifying edit", () => {
    const msgs: SessionMessage[] = [
      { line: 1, role: "assistant", thinking: "Next." },
      { line: 2, role: "tool", tool_name: "search_replace", code_written: diff("lib/a.ts", 1, ["+export async function doThing(x: string) {", "+  return x;", "+}"]) },
      { line: 5, role: "assistant", thinking: "I am going to make doThing trim its input because whitespace keeps causing trouble for users here." },
      { line: 6, role: "tool", tool_name: "search_replace", code_written: `{"diffString":"--- a//workspace/lib/a.ts\n+++ b//workspace/lib/a.ts\n@@ -1,3 +1,3 @@\n export async function doThing(x: string) {\n-  return x;\n+  return x.trim();\n }","oldStart":0}` },
      { line: 7, role: "tool", tool_name: "search_replace", code_written: diff("lib/b.ts", 1, ["+export function other() {}"]) },
    ];
    const index = { path: "x", messages: msgs, byEditedFile: new Map(), scrubReplacements: 0 } as TranscriptIndex;
    const p = findProvenance(index, { file: "lib/a.ts", line: 2, function: "doThing" });
    assert.equal(p.written_at?.edit_line, 2);
    assert.equal(p.written_at?.frame_line_in_range, true);
    assert.equal(p.reasoning_before?.line, 1);
    assert.equal(p.reasoning_before?.silent, true);
    assert.deepEqual(p.later_edits.map((e) => e.edit_line), [6]);
    const none = findProvenance(index, { file: "lib/a.ts", line: 2, function: "missingFn" });
    assert.equal(none.written_at, undefined);
  });

  it("real transcript: invite written at L129 (silent, L127); SSRF written at L100 (L98, not silent)", { skip: externalTranscript }, async () => {
    const index = await loadTranscript();
    const inv = findProvenance(index, { file: "lib/actions/invites.ts", line: 139, function: "acceptInviteForExistingUserAction" });
    assert.equal(inv.written_at?.edit_line, 129);
    assert.equal(inv.written_at?.frame_line_in_range, true);
    assert.equal(inv.reasoning_before?.line, 127);
    assert.equal(inv.reasoning_before?.silent, true);
    const ssrf = findProvenance(index, { file: "lib/link-preview.ts", line: 53, function: "fetchLinkPreview" });
    assert.equal(ssrf.written_at?.edit_line, 100);
    assert.equal(ssrf.reasoning_before?.line, 98);
    assert.equal(ssrf.reasoning_before?.silent, false);
  });

  it("why candidates are generic (mentions / next to edits / keywords) and include both lines", { skip: externalTranscript }, async () => {
    const index = await loadTranscript();
    const f = { file: "lib/actions/invites.ts", line: 139, function: "acceptInviteForExistingUserAction" };
    const c = whyCandidates(index, f, findProvenance(index, f), []);
    assert.ok(c.some((x) => x.message.line === 209 && x.reasons.some((r) => r.startsWith("right before an edit"))));
    assert.ok(c.every((x) => x.reasons.length > 0));
  });
});
