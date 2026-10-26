/**
 * Integration tests: the LOCATE stage (src/locate/) wired into the existing linker (src/story/three-piece.ts)
 * and the "explain why" pipeline (src/explain/pipeline.ts), for a plain-language report with NO stack frame.
 * Synthetic FIXTURE data only (a fake repo, a fake transcript, a fake plain report) — no eval case data, no
 * tuning on any real case.
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CALL_LEDGER } from "../src/engine/llm.js";

// This file's mocked-but-"live-looking" calls append to the real call ledger (engine/llm.ts resolves its path at
// import time, before a test could override WCE_CALL_LEDGER); data/llm-calls.jsonl is gitignored, and this removes
// the noise it would otherwise leave on disk after a local test run.
after(() => { if (existsSync(CALL_LEDGER)) rmSync(CALL_LEDGER, { force: true }); });
import type { TranscriptIndex } from "../src/session/transcript.js";
import type { SessionMessage, ProdError } from "../src/types.js";
import { threePieceFromTranscript } from "../src/story/three-piece.js";
import { explainWhy } from "../src/explain/pipeline.js";

const diff = (file: string, start: number, lines: string[]) =>
  `{"diffString":"--- /dev/null\n+++ b//workspace/${file}\n@@ -0,0 +${start},${lines.length} @@\n${lines.join("\n")}","oldStart":0}`;

function idx(msgs: SessionMessage[]): TranscriptIndex {
  const by = new Map<string, number[]>();
  for (const m of msgs) for (const f of m.edited_files ?? []) by.set(f, [...(by.get(f) ?? []), m.line]);
  return { path: "fixture.jsonl", messages: msgs, byEditedFile: by, scrubReplacements: 0 };
}

// A PLAIN symptom report, no file:line in it anywhere (this is exactly the case the LOCATE stage exists for).
const PLAIN_REPORT = "Clicking 'Submit feedback' spins for 5 seconds when the webhook endpoint is slow.";

const FIXTURE_ERR: ProdError = {
  id: "fixture-locate-e1",
  timestamp: "2026-01-01T00:00:00.000Z",
  severity: "error",
  service: "fixture-svc",
  message: PLAIN_REPORT,
  frames: [], // plain user complaint: no stack trace at all
};

function fixtureIndex(): TranscriptIndex {
  return idx([
    { line: 1, role: "user", text: "Add a feedback form that posts to our webhook. Keep it simple, no retries needed." },
    { line: 2, role: "assistant", text: "I'll add a single fetch() call to the webhook with no timeout; the endpoint is expected to be fast so this should be fine for now." },
    {
      line: 3, role: "tool", tool_name: "edit_file", edited_files: ["src/lib/webhook.ts"],
      code_written: diff("src/lib/webhook.ts", 1, [
        "+export async function postToWebhookEndpoint(payload) {",
        "+  const res = await fetch(WEBHOOK_URL, { method: \"POST\", body: JSON.stringify(payload) });",
        "+  return res.json();",
        "+}",
      ]),
    },
    { line: 4, role: "assistant", text: "Done — the feedback form now posts straight to the webhook endpoint with no retry or timeout handling." },
  ]);
}

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "wce-explain-locate-fixture-"));
  mkdirSync(join(root, "src/lib"), { recursive: true });
  writeFileSync(join(root, "src/lib/webhook.ts"), [
    "export async function postToWebhookEndpoint(payload) {",
    "  const res = await fetch(WEBHOOK_URL, { method: \"POST\", body: JSON.stringify(payload) });",
    "  return res.json();",
    "}",
  ].join("\n") + "\n");
  return root;
}

function readSourceFrom(root: string) {
  return (f: string): string | undefined => {
    try { return readFileSync(join(root, f), "utf8"); } catch { return undefined; }
  };
}

describe("three-piece linker falls back to LOCATE when the report has no stack frame", () => {
  it("threePieceFromTranscript alone still reports no_frame for a plain report (no LOCATE wired in at this layer)", () => {
    const index = fixtureIndex();
    const piece = threePieceFromTranscript(FIXTURE_ERR, index, "fixture.jsonl", readSourceFrom(fixtureRoot()));
    assert.equal(piece.frame, undefined);
    assert.match(piece.notes[0], /no stack frame/);
  });
});

describe("explainWhy wires LOCATE in: plain report -> layer 1 finds the agent's edit -> linker runs on it", () => {
  it("links asked/understood/happened from a LOCATE-found candidate, and reports the no_credentials stage honestly past that point", async () => {
    delete process.env.NVIDIA_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    const root = fixtureRoot();
    after(() => rmSync(root, { recursive: true, force: true }));
    const index = fixtureIndex();
    const result = await explainWhy({
      error: FIXTURE_ERR, index, transcriptName: "fixture.jsonl", readSource: readSourceFrom(root), root,
      locate: { enableModel: false },
    });

    assert.ok(result.locate, "the LOCATE result is always attached when the report had no frame");
    assert.equal(result.locate!.method, "layer1_deterministic");
    assert.match(result.locate!.picked!.file, /webhook\.ts$/);

    assert.ok(result.three_piece.frame, "the synthesized frame from LOCATE's top candidate reaches the linker");
    assert.match(result.three_piece.frame!.file, /webhook\.ts$/);
    assert.ok(result.three_piece.happened, "editThatWroteLine confirms the LOCATE candidate really was agent-written");
    assert.ok(result.three_piece.asked, "ASKED is linked from the located edit, same as a stack-frame case");
    assert.ok(result.three_piece.understood);

    // Past the linker, the normal pipeline takes over; with no model key configured this is the honest stage.
    assert.equal(result.stage, "no_credentials");
    assert.match(result.reason!, /no credentials/);
  });

  it("reports no_frame (not a crash) honestly when LOCATE itself finds nothing: an unrelated report over an edit-free session", async () => {
    const index = idx([{ line: 1, role: "user", text: "hello" }]);
    const result = await explainWhy({
      error: { ...FIXTURE_ERR, message: "Completely unrelated free-text report about nothing in particular." },
      index, transcriptName: "fixture.jsonl", readSource: () => undefined, locate: { enableModel: false },
    });
    assert.equal(result.stage, "no_frame");
    assert.ok(result.locate);
    assert.equal(result.locate!.picked, undefined);
    assert.match(result.reason!, /LOCATE stage/);
  });

  it("does NOT run LOCATE when the report already has stack frames (even if they don't resolve) — unchanged existing behaviour", async () => {
    const index = fixtureIndex();
    const result = await explainWhy({
      error: { ...FIXTURE_ERR, frames: [{ file: "some/other/file.ts", line: 10, function: "nope" }] },
      index, transcriptName: "fixture.jsonl", readSource: readSourceFrom(fixtureRoot()), locate: { enableModel: false },
    });
    assert.equal(result.stage, "no_frame");
    assert.equal(result.locate, undefined, "LOCATE is only a fallback for reports with zero frames");
  });

  it("the HTML report renders the LOCATE section with candidates and the picked file:line", async () => {
    const { renderExplainReport } = await import("../src/report/explain.js");
    const root = fixtureRoot();
    after(() => rmSync(root, { recursive: true, force: true }));
    const result = await explainWhy({
      error: FIXTURE_ERR, index: fixtureIndex(), transcriptName: "fixture.jsonl", readSource: readSourceFrom(root), root,
      locate: { enableModel: false },
    });
    const html = renderExplainReport(result);
    assert.match(html, /How the location was found/);
    assert.match(html, /webhook\.ts/);
    assert.match(html, /Picked:/);
  });
});

describe("end-to-end with layer 2 enabled and mocked model calls (no live network; synthetic fixtures only)", () => {
  it("LOCATE's layer 2 confirms a candidate, the linker uses it, and the explain reasoner (mocked) produces a verified answer", async () => {
    process.env.NVIDIA_API_KEY = "fixture-not-a-real-key";
    const realFetch = globalThis.fetch;
    const root = fixtureRoot();
    after(() => { rmSync(root, { recursive: true, force: true }); });
    try {
      globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
        const body = JSON.parse(init.body);
        const schemaName = body.response_format?.json_schema?.name as string | undefined;
        const jsonRes = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200, headers: { "content-type": "application/json" } });
        if (schemaName === "locate_step") {
          return jsonRes({ action: "answer", pattern: "", file: "src/lib/webhook.ts", start: 0, end: 0, line: 2, reason: "the fetch has no timeout or abort signal" });
        }
        // explain_why / explain_why:repair
        return jsonRes({
          overlooked_assumption: "The agent assumed the webhook endpoint always responds quickly and needs no timeout.",
          evidence: [
            { kind: "transcript", file: "", line: 2, quote: "the endpoint is expected to be fast so this should be fine for now" },
            { kind: "code", file: "lib/webhook.ts", line: 2, quote: "fetch(WEBHOOK_URL" },
          ],
          why_it_breaks: "When the endpoint is slow, the fetch with no timeout hangs and the button spins for the full duration.",
          confidence: "medium",
        });
      }) as typeof fetch;

      const result = await explainWhy({
        error: FIXTURE_ERR, index: fixtureIndex(), transcriptName: "fixture.jsonl", readSource: readSourceFrom(root), root,
        locate: { enableModel: true, provider: "nemotron" },
      });

      assert.equal(result.locate!.method, "layer2_agentic");
      assert.equal(result.locate!.picked!.line, 2);
      assert.ok(result.locate!.layer2!.steps.length >= 1, "every layer-2 tool call is recorded for auditability");
      assert.equal(result.three_piece.frame!.line, 2);
      assert.equal(result.stage, "ok");
      assert.equal(result.answer!.status, "verified");
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.NVIDIA_API_KEY;
    }
  });
});
