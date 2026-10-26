/**
 * Unit tests for the "explain why" context builder (src/explain/context.ts), with synthetic FIXTURE data only.
 * No eval case data, no tuning on any real case.
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TranscriptIndex } from "../src/session/transcript.js";
import type { SessionMessage, ProdError } from "../src/types.js";
import { threePieceFromTranscript, editThatWroteLine } from "../src/story/three-piece.js";
import { buildExplainContext, normalizeCodePath, callIdentifiersInHunk } from "../src/explain/context.js";

// ---- FIXTURE helpers (synthetic, no relation to any real case) ----
const diff = (file: string, start: number, lines: string[]) =>
  `{"diffString":"--- /dev/null\n+++ b//workspace/${file}\n@@ -0,0 +${start},${lines.length} @@\n${lines.join("\n")}","oldStart":0}`;

function idx(msgs: SessionMessage[]): TranscriptIndex {
  const by = new Map<string, number[]>();
  for (const m of msgs) for (const f of m.edited_files ?? []) by.set(f, [...(by.get(f) ?? []), m.line]);
  return { path: "fixture.jsonl", messages: msgs, byEditedFile: by, scrubReplacements: 0 };
}

const FIXTURE_ERR: ProdError = {
  id: "fixture-e1",
  timestamp: "2026-01-01T00:00:00.000Z",
  severity: "error",
  service: "fixture-svc",
  message: "FixtureError: widget exploded",
  frames: [{ file: "lib/widget.ts", line: 3, function: "makeWidget" }],
};

const FIXTURE_SOURCE = "export function makeWidget() {\n  const helperResult = helperFn();\n  return helperResult.value;\n}";

function fixtureIndex(): TranscriptIndex {
  return idx([
    { line: 1, role: "user", text: "Build a fixture widget.\n\nMake sure helperFn never returns null." },
    { line: 2, role: "assistant", text: "I will call helperFn() and trust it always returns an object, since the fixture spec says so, so no null check is needed here." },
    { line: 3, role: "tool", tool_name: "edit_file", edited_files: ["lib/widget.ts"], code_written: diff("lib/widget.ts", 1, ["+export function makeWidget() {", "+  const helperResult = helperFn();", "+  return helperResult.value;", "+}"]) },
    { line: 4, role: "assistant", text: "Done, helperFn() is used elsewhere too so this should be consistent with the rest of the fixture codebase." },
  ]);
}

function buildPieceAndWrote(index: TranscriptIndex, readSource: (f: string) => string | undefined) {
  const piece = threePieceFromTranscript(FIXTURE_ERR, index, "fixture.jsonl", readSource);
  assert.ok(piece.frame, "fixture must link to a frame");
  const src = readSource(piece.frame!.file)!;
  const lineText = src.split("\n")[piece.frame!.line - 1];
  const wrote = editThatWroteLine(index, piece.frame!.file, lineText)!;
  assert.ok(wrote, "fixture edit must be found");
  return { piece, wrote };
}

describe("explain-why context builder (synthetic fixtures)", () => {
  it("normalizeCodePath strips one leading src/ and ./", () => {
    assert.equal(normalizeCodePath("src/lib/widget.ts"), "lib/widget.ts");
    assert.equal(normalizeCodePath("./lib/widget.ts"), "lib/widget.ts");
    assert.equal(normalizeCodePath("lib/widget.ts"), "lib/widget.ts");
    assert.equal(normalizeCodePath("src/src/widget.ts"), "src/widget.ts", "only one leading src/ is stripped");
  });

  it("callIdentifiersInHunk pulls call-like identifiers from ADDED lines only", () => {
    const hunk = "+  const x = helperFn();\n-  oldCall();\n   context();\n+  anotherCall(x);";
    const names = callIdentifiersInHunk(hunk);
    assert.deepEqual(names.sort(), ["anotherCall", "helperFn"].sort());
  });

  it("assembles symptom, edit, edit_window (±N lines) and three_piece from the linker output", () => {
    const index = fixtureIndex();
    const readSource = (f: string) => (f === "lib/widget.ts" ? FIXTURE_SOURCE : undefined);
    const { piece, wrote } = buildPieceAndWrote(index, readSource);
    const ctx = buildExplainContext({ error: FIXTURE_ERR, frame: piece.frame!, wrote, index, piece, readSource, opts: { fileWindowLines: 1 } });

    assert.equal(ctx.symptom, FIXTURE_ERR.message);
    assert.equal(ctx.edit.file, "lib/widget.ts");
    assert.equal(ctx.edit.line, 3);
    assert.equal(ctx.edit.edit_line, wrote.edit_line);
    assert.match(ctx.edit_window.text, /2:\s+const helperResult = helperFn\(\);/);
    assert.match(ctx.edit_window.text, /3:\s+return helperResult\.value;/);
    assert.equal(ctx.three_piece.asked, piece.asked?.text);
    assert.equal(ctx.three_piece.understood, piece.understood?.text);
    assert.ok(ctx.prompt.system.includes("overlooked"));
  });

  it("builds a transcript window around the edit and one for reasoning that mentions a touched identifier", () => {
    const index = fixtureIndex();
    const readSource = (f: string) => (f === "lib/widget.ts" ? FIXTURE_SOURCE : undefined);
    const { piece, wrote } = buildPieceAndWrote(index, readSource);
    const ctx = buildExplainContext({ error: FIXTURE_ERR, frame: piece.frame!, wrote, index, piece, readSource, opts: { editMessageWindow: 1 } });

    const labels = ctx.transcript_windows.map((w) => w.label);
    assert.ok(labels.some((l) => l.includes("around the edit")), `expected an edit window, got: ${labels.join(", ")}`);
    assert.ok(labels.some((l) => l.includes("helperFn")), `expected a reasoning window mentioning helperFn, got: ${labels.join(", ")}`);
    // The "asked" message (L1) mentions helperFn and sits outside the ±3 edit window — it should surface as its own window.
    assert.ok(ctx.transcript_windows.some((w) => w.start_line <= 1 && w.end_line >= 1));
  });

  it("ground_truth covers the FULL file and FULL transcript, independent of what the (budgeted) prompt shows", () => {
    const index = fixtureIndex();
    const readSource = (f: string) => (f === "lib/widget.ts" ? FIXTURE_SOURCE : undefined);
    const { piece, wrote } = buildPieceAndWrote(index, readSource);
    const ctx = buildExplainContext({ error: FIXTURE_ERR, frame: piece.frame!, wrote, index, piece, readSource, opts: { fileWindowLines: 0 } });

    // Even with a 0-line window (only line 3 shown), the full file's line 1 is still in ground_truth for verification.
    assert.equal(ctx.ground_truth.code_lines["lib/widget.ts"][1], "export function makeWidget() {");
    assert.equal(ctx.ground_truth.code_lines["lib/widget.ts"][3], "  return helperResult.value;");
    // Every transcript message is covered, including L4 which is outside every rendered window.
    assert.match(ctx.ground_truth.transcript_lines[4], /elsewhere too/);
    assert.match(ctx.ground_truth.transcript_lines[1], /helperFn never returns null/);
  });

  it("finds related files by simple static search: what the edit calls, and who calls the edited function", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wce-explain-ctx-fixture-"));
    mkdirSync(join(tmp, "lib"), { recursive: true });
    writeFileSync(join(tmp, "lib", "widget.ts"), FIXTURE_SOURCE);
    writeFileSync(join(tmp, "lib", "helper.ts"), "export function helperFn() {\n  return { value: 1 };\n}\n");
    writeFileSync(join(tmp, "lib", "caller.ts"), "import { makeWidget } from './widget';\nmakeWidget();\n");
    after(() => rmSync(tmp, { recursive: true, force: true }));

    const index = fixtureIndex();
    const readSource = (f: string) => (f === "lib/widget.ts" ? FIXTURE_SOURCE : undefined);
    const { piece, wrote } = buildPieceAndWrote(index, readSource);
    const ctx = buildExplainContext({ error: FIXTURE_ERR, frame: piece.frame!, wrote, index, piece, readSource, root: tmp });

    const calls = ctx.related.find((r) => r.relation === "calls");
    const calledBy = ctx.related.find((r) => r.relation === "called_by");
    assert.ok(calls, "expected a 'calls' related file (helper.ts defines helperFn)");
    assert.match(calls!.path, /helper\.ts$/);
    assert.ok(calledBy, "expected a 'called_by' related file (caller.ts calls makeWidget)");
    assert.match(calledBy!.path, /caller\.ts$/);
  });

  it("respects a small char budget: trims the lowest-priority sections first and marks truncated", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wce-explain-ctx-budget-"));
    mkdirSync(join(tmp, "lib"), { recursive: true });
    writeFileSync(join(tmp, "lib", "widget.ts"), FIXTURE_SOURCE);
    writeFileSync(join(tmp, "lib", "helper.ts"), "export function helperFn() {\n  return { value: 1 };\n}\n");
    writeFileSync(join(tmp, "lib", "caller.ts"), "import { makeWidget } from './widget';\nmakeWidget();\n");
    after(() => rmSync(tmp, { recursive: true, force: true }));

    const index = fixtureIndex();
    const readSource = (f: string) => (f === "lib/widget.ts" ? FIXTURE_SOURCE : undefined);
    const { piece, wrote } = buildPieceAndWrote(index, readSource);
    const full = buildExplainContext({ error: FIXTURE_ERR, frame: piece.frame!, wrote, index, piece, readSource, root: tmp });
    const squeezed = buildExplainContext({ error: FIXTURE_ERR, frame: piece.frame!, wrote, index, piece, readSource, root: tmp, opts: { maxChars: 400 } });

    assert.ok(squeezed.budget.used_chars < full.budget.used_chars || squeezed.budget.truncated, "a tight budget must shrink or flag the context");
    assert.equal(squeezed.budget.truncated, true);
    assert.ok(squeezed.budget.dropped_sections.length > 0);
    // The mandatory edit window always survives trimming.
    assert.ok(squeezed.transcript_windows.some((w) => w.label.includes("around the edit")));
  });
});
