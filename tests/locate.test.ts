/**
 * Unit tests for the LOCATE stage (src/locate/), with synthetic FIXTURE data only: a small fake repo, a fake
 * transcript with edits, and a fake plain-language report. No eval case data, no tuning on any real case.
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TranscriptIndex } from "../src/session/transcript.js";
import type { SessionMessage } from "../src/types.js";
import { extractTerms, splitIdentifier, tokenize } from "../src/locate/terms.js";
import { buildSymbolIndex, enclosingSymbolName, listSourceFiles } from "../src/locate/symbols.js";
import { buildEditIndex, wasWrittenByAgent } from "../src/locate/edits.js";
import { scoreEditedHunks } from "../src/locate/score.js";
import { agenticLocate } from "../src/locate/agentic.js";
import { locate } from "../src/locate/pipeline.js";

// ---- FIXTURE helpers (synthetic, no relation to any real case) ----
const diff = (file: string, start: number, lines: string[]) =>
  `{"diffString":"--- /dev/null\n+++ b//workspace/${file}\n@@ -0,0 +${start},${lines.length} @@\n${lines.join("\n")}","oldStart":0}`;

function idx(msgs: SessionMessage[]): TranscriptIndex {
  const by = new Map<string, number[]>();
  for (const m of msgs) for (const f of m.edited_files ?? []) by.set(f, [...(by.get(f) ?? []), m.line]);
  return { path: "fixture.jsonl", messages: msgs, byEditedFile: by, scrubReplacements: 0 };
}

const FIXTURE_REPORT = "Clicking 'Submit feedback' spins for 5 seconds when the webhook endpoint is slow.";

function fixtureIndex(): TranscriptIndex {
  return idx([
    { line: 1, role: "user", text: "Add a feedback form that posts to our webhook." },
    { line: 2, role: "assistant", text: "I will add the webhook POST call and a feedback form button." },
    {
      line: 3, role: "tool", tool_name: "edit_file", edited_files: ["src/lib/webhook.ts"],
      code_written: diff("src/lib/webhook.ts", 1, [
        "+export async function postToWebhookEndpoint(payload) {",
        "+  const res = await fetch(WEBHOOK_URL, { method: \"POST\", body: JSON.stringify(payload) });",
        "+  return res.json();",
        "+}",
      ]),
    },
    {
      line: 4, role: "tool", tool_name: "edit_file", edited_files: ["src/ui/AvatarMenu.ts"],
      code_written: diff("src/ui/AvatarMenu.ts", 1, [
        "+export function renderAvatarMenu(user) {",
        "+  return `<div class=\\\"avatar\\\">${user.name}</div>`;",
        "+}",
      ]),
    },
  ]);
}

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "wce-locate-fixture-"));
  mkdirSync(join(root, "src/lib"), { recursive: true });
  mkdirSync(join(root, "src/ui"), { recursive: true });
  writeFileSync(join(root, "src/lib/webhook.ts"), [
    "export async function postToWebhookEndpoint(payload) {",
    "  const res = await fetch(WEBHOOK_URL, { method: \"POST\", body: JSON.stringify(payload) });",
    "  return res.json();",
    "}",
  ].join("\n") + "\n");
  writeFileSync(join(root, "src/ui/AvatarMenu.ts"), [
    "export function renderAvatarMenu(user) {",
    "  return `<div class=\"avatar\">${user.name}</div>`;",
    "}",
  ].join("\n") + "\n");
  return root;
}

describe("locate/terms (generic extraction, no per-case words)", () => {
  it("splits identifiers on camelCase and snake_case", () => {
    assert.deepEqual(splitIdentifier("postToWebhookEndpoint"), ["post", "to", "webhook", "endpoint"]);
    assert.deepEqual(splitIdentifier("webhook_timeout_ms"), ["webhook", "timeout", "ms"]);
  });

  it("tokenize drops generic stopwords and short fragments", () => {
    assert.deepEqual(tokenize("to the webhook"), ["webhook"]);
  });

  it("extracts quoted phrases, numbers, identifiers and domain words from a plain report", () => {
    const terms = extractTerms(FIXTURE_REPORT);
    const texts = terms.map((t) => t.text);
    assert.ok(texts.includes("submit feedback"), "quoted phrase kept verbatim (lowercased)");
    assert.ok(texts.includes("5"), "bare number extracted");
    assert.ok(terms.some((t) => t.text === "webhook" && t.kind === "word"));
    assert.ok(terms.some((t) => t.text === "endpoint" && t.kind === "word"));
  });

  it("extracts no terms from an empty report and never throws", () => {
    assert.deepEqual(extractTerms(""), []);
  });
});

describe("locate/symbols (generic syntactic index, no framework special-casing)", () => {
  it("finds functions, exports, consts, routes and string literals", () => {
    const root = mkdtempSync(join(tmpdir(), "wce-locate-symbols-"));
    after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(join(root, "a.ts"), [
      'export const TIMEOUT_MS = 5000;',
      'export function handler() {',
      '  return "hello world";',
      '}',
      'router.post("/api/widgets", handler);',
    ].join("\n"));
    writeFileSync(join(root, "b.py"), ["def run(x):", "    return x + 1"].join("\n"));

    const symbols = buildSymbolIndex(root, ["a.ts", "b.py"]);
    assert.ok(symbols.some((s) => s.kind === "const" && s.name === "TIMEOUT_MS"));
    assert.ok(symbols.some((s) => s.kind === "function" && s.name === "handler"));
    assert.ok(symbols.some((s) => s.kind === "route" && s.name === "/api/widgets"));
    assert.ok(symbols.some((s) => s.kind === "string" && s.name === "hello world"));
    assert.ok(symbols.some((s) => s.kind === "function" && s.name === "run" && s.file === "b.py"));
  });

  it("enclosingSymbolName finds the nearest preceding function/export in the same file", () => {
    const symbols = [
      { file: "a.ts", line: 2, kind: "function" as const, name: "handler", text: "" },
      { file: "a.ts", line: 10, kind: "function" as const, name: "other", text: "" },
    ];
    assert.equal(enclosingSymbolName(symbols, "a.ts", 5), "handler");
    assert.equal(enclosingSymbolName(symbols, "a.ts", 12), "other");
    assert.equal(enclosingSymbolName(symbols, "a.ts", 1), undefined);
  });

  it("listSourceFiles skips node_modules/dist/tests and non-source files", () => {
    const root = mkdtempSync(join(tmpdir(), "wce-locate-list-"));
    after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, "node_modules/pkg"), { recursive: true });
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(join(root, "node_modules/pkg/index.ts"), "export const x = 1;");
    writeFileSync(join(root, "tests/a.test.ts"), "export const x = 1;");
    writeFileSync(join(root, "real.ts"), "export const x = 1;");
    writeFileSync(join(root, "readme.md"), "# hi");
    const files = listSourceFiles(root);
    assert.deepEqual(files, ["real.ts"]);
  });
});

describe("locate/edits (the agent's own edits are the candidate universe)", () => {
  it("indexes added lines from edit-tool diffs into hunks", () => {
    const hunks = buildEditIndex(fixtureIndex());
    assert.equal(hunks.length, 2);
    const webhookHunk = hunks.find((h) => h.file.endsWith("webhook.ts"))!;
    assert.equal(webhookHunk.edit_line, 3);
    assert.equal(webhookHunk.start, 1);
    assert.ok(webhookHunk.added.some((a) => a.text.includes("postToWebhookEndpoint")));
  });

  it("wasWrittenByAgent confirms a real agent-written line and rejects everything else", () => {
    const hunks = buildEditIndex(fixtureIndex());
    const hit = wasWrittenByAgent(hunks, "src/lib/webhook.ts", 1);
    assert.ok(hit);
    assert.equal(wasWrittenByAgent(hunks, "src/lib/webhook.ts", 1, "export async function postToWebhookEndpoint(payload) {"), hit);
    assert.equal(wasWrittenByAgent(hunks, "src/lib/webhook.ts", 1, "not the real text"), undefined);
    assert.equal(wasWrittenByAgent(hunks, "src/lib/webhook.ts", 999), undefined);
    assert.equal(wasWrittenByAgent(hunks, "src/does/not/exist.ts", 1), undefined);
  });
});

describe("locate/score (layer 1: deterministic BM25-style search, no model)", () => {
  it("ranks the edited hunk whose terms overlap the report above an unrelated edited hunk, and drops zero-score hunks", () => {
    const hunks = buildEditIndex(fixtureIndex());
    const { terms, candidates } = scoreEditedHunks(FIXTURE_REPORT, hunks, []);
    assert.ok(terms.length > 0);
    assert.equal(candidates.length, 1, "the unrelated avatar-menu hunk scores 0 and is dropped");
    assert.match(candidates[0].file, /webhook\.ts$/);
    assert.ok(candidates[0].matched_terms.includes("webhook"));
    assert.ok(candidates[0].matched_terms.includes("endpoint"));
    assert.ok(candidates[0].score > 0);
  });

  it("gives a quoted-phrase / string-literal match an extra bonus over plain word overlap alone", () => {
    const hunks = [
      { id: "h1", file: "a.ts", edit_line: 1, tool: "edit", start: 1, end: 1, added: [{ line: 1, text: 'const label = "Retry connection";' }] },
      { id: "h2", file: "b.ts", edit_line: 2, tool: "edit", start: 1, end: 1, added: [{ line: 1, text: "const retryConnectionCount = 1;" }] },
    ];
    const { candidates } = scoreEditedHunks("The button labelled 'Retry connection' does nothing.", hunks, []);
    assert.equal(candidates[0].file, "a.ts", "the exact quoted string literal outranks mere identifier-token overlap");
  });

  it("picks the single best-matching line inside the winning hunk, not just its first line", () => {
    const hunks = [{
      id: "h1", file: "a.ts", edit_line: 1, tool: "edit", start: 1, end: 3,
      added: [
        { line: 1, text: "export function unrelatedHelper() {" },
        { line: 2, text: "  return postToWebhookEndpoint(x);" },
        { line: 3, text: "}" },
      ],
    }];
    const { candidates } = scoreEditedHunks("the webhook endpoint call is wrong", hunks, []);
    assert.equal(candidates[0].line, 2);
  });

  it("attaches the enclosing function name from the symbol index", () => {
    const hunks = buildEditIndex(fixtureIndex());
    const root = fixtureRoot();
    after(() => rmSync(root, { recursive: true, force: true }));
    const symbols = buildSymbolIndex(root, listSourceFiles(root));
    const { candidates } = scoreEditedHunks(FIXTURE_REPORT, hunks, symbols);
    assert.equal(candidates[0].function, "postToWebhookEndpoint");
  });
});

describe("locate/agentic (layer 2: optional, bounded, sandboxed, deterministically checked)", () => {
  const jsonRes = (body: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }), { status: 200, headers: { "content-type": "application/json" } });

  it("reports missing credentials plainly and never calls the network", async () => {
    delete process.env.NVIDIA_API_KEY;
    const hunks = buildEditIndex(fixtureIndex());
    let called = false;
    const r = await agenticLocate({ report: FIXTURE_REPORT, root: fixtureRoot(), hunks, provider: "nemotron", fetchImpl: async () => { called = true; return jsonRes({}); } });
    assert.equal(r.ran, false);
    assert.match(r.reason!, /no credentials: NVIDIA_API_KEY/);
    assert.equal(called, false);
  });

  it("confirms an answer that is a real agent-written line, and records the tool call for auditability", async () => {
    process.env.NVIDIA_API_KEY = "fixture-not-a-real-key";
    try {
      const hunks = buildEditIndex(fixtureIndex());
      const root = fixtureRoot();
      after(() => rmSync(root, { recursive: true, force: true }));
      const r = await agenticLocate({
        report: FIXTURE_REPORT, root, hunks, provider: "nemotron",
        fetchImpl: async () => jsonRes({ action: "answer", pattern: "", file: "src/lib/webhook.ts", start: 0, end: 0, line: 1, reason: "the webhook POST has no timeout" }),
      });
      assert.equal(r.ran, true);
      assert.ok(r.candidate);
      assert.equal(r.candidate!.file, "src/lib/webhook.ts");
      assert.equal(r.candidate!.line, 1);
      assert.equal(r.candidate!.method, "agentic_model");
      assert.equal(r.steps.length, 1);
      assert.equal(r.steps[0].action, "answer");
      assert.match(r.steps[0].result, /confirmed/);
    } finally { delete process.env.NVIDIA_API_KEY; }
  });

  it("rejects a confident but false answer (line never written by the agent) and exhausts its step budget honestly", async () => {
    process.env.NVIDIA_API_KEY = "fixture-not-a-real-key";
    try {
      const hunks = buildEditIndex(fixtureIndex());
      const root = fixtureRoot();
      after(() => rmSync(root, { recursive: true, force: true }));
      const r = await agenticLocate({
        report: FIXTURE_REPORT, root, hunks, provider: "nemotron", maxSteps: 2,
        fetchImpl: async () => jsonRes({ action: "answer", pattern: "", file: "src/lib/webhook.ts", start: 0, end: 0, line: 999, reason: "guess" }),
      });
      assert.equal(r.candidate, undefined);
      assert.equal(r.steps.length, 2);
      assert.ok(r.steps.every((s) => /rejected/.test(s.result)));
      assert.match(r.reason!, /exhausted 2 tool steps/);
    } finally { delete process.env.NVIDIA_API_KEY; }
  });

  it("grep and read tools are read-only and sandboxed to the case directory", async () => {
    process.env.NVIDIA_API_KEY = "fixture-not-a-real-key";
    try {
      const hunks = buildEditIndex(fixtureIndex());
      const root = fixtureRoot();
      after(() => rmSync(root, { recursive: true, force: true }));
      let step = 0;
      const replies = [
        { action: "grep", pattern: "postToWebhookEndpoint", file: "", start: 0, end: 0, line: 0, reason: "" },
        { action: "read", pattern: "", file: "../../etc/passwd", start: 1, end: 5, line: 0, reason: "" },
        { action: "list_edits", pattern: "", file: "", start: 0, end: 0, line: 0, reason: "" },
        { action: "answer", pattern: "", file: "src/lib/webhook.ts", start: 0, end: 0, line: 1, reason: "found it via grep" },
      ];
      const r = await agenticLocate({
        report: FIXTURE_REPORT, root, hunks, provider: "nemotron", maxSteps: 4,
        fetchImpl: async () => jsonRes(replies[step++]),
      });
      assert.equal(r.steps.length, 4);
      assert.match(r.steps[0].result, /postToWebhookEndpoint/);
      assert.match(r.steps[1].result, /outside the sandboxed tree/, "path traversal is refused, not silently resolved");
      assert.match(r.steps[2].result, /webhook\.ts/);
      assert.ok(r.candidate);
    } finally { delete process.env.NVIDIA_API_KEY; }
  });

  it("a model_error from the provider is reported, not swallowed", async () => {
    process.env.NVIDIA_API_KEY = "fixture-not-a-real-key";
    process.env.WCE_LLM_RETRIES = "0"; // a 5xx is normally retried with backoff; skip that for a fast, deterministic test
    try {
      const hunks = buildEditIndex(fixtureIndex());
      const root = fixtureRoot();
      after(() => rmSync(root, { recursive: true, force: true }));
      const r = await agenticLocate({ report: FIXTURE_REPORT, root, hunks, provider: "nemotron", fetchImpl: async () => new Response("err", { status: 500 }) });
      assert.equal(r.candidate, undefined);
      assert.match(r.reason!, /model_error/);
    } finally { delete process.env.NVIDIA_API_KEY; delete process.env.WCE_LLM_RETRIES; }
  });
});

describe("locate/pipeline (wiring layer 1 then layer 2)", () => {
  it("layer 1 only when the model layer is disabled: returns the deterministic top candidate", async () => {
    const root = fixtureRoot();
    after(() => rmSync(root, { recursive: true, force: true }));
    const r = await locate({ report: FIXTURE_REPORT, index: fixtureIndex(), root, enableModel: false });
    assert.equal(r.method, "layer1_deterministic");
    assert.equal(r.layer2, undefined);
    assert.ok(r.picked);
    assert.match(r.picked!.file, /webhook\.ts$/);
    assert.ok(r.layer1.symbols_indexed > 0);
    assert.equal(r.layer1.edited_hunks_indexed, 2);
  });

  it("layer 2 overrides layer 1's pick once it confirms a different, verified candidate", async () => {
    process.env.NVIDIA_API_KEY = "fixture-not-a-real-key";
    try {
      const root = fixtureRoot();
      after(() => rmSync(root, { recursive: true, force: true }));
      const jsonRes = (body: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }), { status: 200 });
      const r = await locate({
        report: FIXTURE_REPORT, index: fixtureIndex(), root, enableModel: true, provider: "nemotron",
        fetchImpl: async () => jsonRes({ action: "answer", pattern: "", file: "src/lib/webhook.ts", start: 0, end: 0, line: 2, reason: "the fetch has no timeout/abort" }),
      });
      assert.equal(r.method, "layer2_agentic");
      assert.equal(r.picked!.line, 2);
      assert.equal(r.picked!.method, "agentic_model");
      assert.ok(r.layer2?.ran);
    } finally { delete process.env.NVIDIA_API_KEY; }
  });

  it("with no repo root, layer 1 still runs on the edit index alone (no symbols) and layer 2 is skipped", async () => {
    const r = await locate({ report: FIXTURE_REPORT, index: fixtureIndex(), enableModel: true });
    assert.equal(r.layer1.symbols_indexed, 0);
    assert.ok(r.picked, "BM25 over edited hunks does not require a repo root");
    assert.equal(r.layer2, undefined, "layer 2 needs a root to read/grep and is skipped without one");
  });

  it("returns no candidate at all when the transcript made no edits and reports it honestly", async () => {
    const empty = idx([{ line: 1, role: "user", text: "hello" }]);
    const r = await locate({ report: FIXTURE_REPORT, index: empty, enableModel: false });
    assert.equal(r.method, "none");
    assert.equal(r.picked, undefined);
    assert.equal(r.layer1.edited_hunks_indexed, 0);
  });
});
