/**
 * Synthetic tests for the three LOCATE fixes: file-role weighting, content line remap, and the
 * top-3 shortlist with evidence-capped confidence. Invented repos and reports only.
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TranscriptIndex } from "../src/session/transcript.js";
import type { SessionMessage, ProdError } from "../src/types.js";
import type { Candidate } from "../src/locate/types.js";
import { extractTerms, tokenize } from "../src/locate/terms.js";
import { scoreEditedHunks } from "../src/locate/score.js";
import { classifyFileRole, DOC_ROLE_WEIGHT, TEST_ROLE_WEIGHT } from "../src/locate/roles.js";
import { remapEditLine } from "../src/locate/remap.js";
import { buildShortlist, layer1ScoreMargin, SHORTLIST_SIZE } from "../src/locate/shortlist.js";
import { agenticLocate } from "../src/locate/agentic.js";
import { locate } from "../src/locate/pipeline.js";
import { verifyAnchoredLine } from "../src/explain/verify.js";
import { capConfidence, CLEAR_MARGIN } from "../src/explain/confidence.js";
import { matchUsedCandidate } from "../src/explain/used-candidate.js";
import { buildExplainContext } from "../src/explain/context.js";
import { explainWhy } from "../src/explain/pipeline.js";

const diff = (file: string, start: number, lines: string[]) =>
  `{"diffString":"--- /dev/null\n+++ b//workspace/${file}\n@@ -0,0 +${start},${lines.length} @@\n${lines.join("\n")}","oldStart":0}`;

function idx(msgs: SessionMessage[]): TranscriptIndex {
  const by = new Map<string, number[]>();
  for (const m of msgs) for (const f of m.edited_files ?? []) by.set(f, [...(by.get(f) ?? []), m.line]);
  return { path: "fixture.jsonl", messages: msgs, byEditedFile: by, scrubReplacements: 0 };
}

function hunk(id: string, file: string, lines: string[], start = 1) {
  return {
    id, file, edit_line: 1, tool: "edit", start, end: start + lines.length - 1,
    added: lines.map((text, i) => ({ line: start + i, text })),
  };
}

function cand(p: Partial<Candidate> & Pick<Candidate, "file" | "hunk_id" | "score">): Candidate {
  return {
    line: 1, end_line: 3, text: "balance = saved;", matched_terms: [], edit_line: 1, tool: "edit",
    snippet: "1: balance = saved;", method: "deterministic_bm25", role: "source", role_weight: 1,
    edit_time_line: 1, hunk_start: 1, anchor: "exact", ...p,
  };
}

const LEDGER_REPORT = "Opening the ledger drops the balance when an entry is saved.";

describe("file-role weighting", () => {
  it("classifies docs, tests, fixtures, and lockfiles by generic path conventions", () => {
    const cases: Array<[string, string]> = [
      ["README.md", "doc"],
      ["docs/handbook.rst", "doc"],
      ["guides/intro.txt", "doc"],
      ["CHANGELOG.md", "doc"],
      ["pkg/ledger.ts", "source"],
      ["pkg\\motor.py", "source"],
      ["test/ledger_test.ts", "test"],
      ["tests/ledger.spec.ts", "test"],
      ["__tests__/ledger.ts", "test"],
      ["spec/ledger.ts", "test"],
      ["e2e/ledger.ts", "test"],
      ["pkg/ledger.test.ts", "test"],
      ["pkg/test_ledger.py", "test"],
      ["fixtures/sample.json", "fixture"],
      ["__fixtures__/sample.ts", "fixture"],
      ["pkg/sample.fixture.ts", "fixture"],
      ["package-lock.json", "lockfile"],
      ["yarn.lock", "lockfile"],
    ];
    for (const [file, role] of cases) assert.equal(classifyFileRole(file).role, role, file);
    assert.equal(classifyFileRole("pkg/ledger.ts").weight, 1);
    assert.ok(classifyFileRole("README.md").weight < 1);
  });

  it("ranks a source hunk above a README and a test that contain more report words", () => {
    const source = "openingLedger(entry, balance);";
    const readme = "saved entry: the balance drops after opening a ledger. balance drops again for that saved entry.";
    const testLine = "function openingLedgerDrops(entry, balance, saved) { return entry; }";
    const words = extractTerms(LEDGER_REPORT).filter((t) => t.kind === "word").map((t) => t.text);
    const hits = (text: string) => new Set(tokenize(text).filter((t) => words.includes(t))).size;
    assert.ok(hits(readme) > hits(source), "readme must contain more report words than the source line");
    assert.ok(hits(testLine) > hits(source), "test must contain more report words than the source line");

    const { candidates } = scoreEditedHunks(LEDGER_REPORT, [
      hunk("readme", "README.md", [readme]),
      hunk("test", "test/ledger_test.ts", [testLine]),
      hunk("src", "pkg/ledger.ts", [source]),
    ], []);
    assert.equal(candidates[0].file, "pkg/ledger.ts", candidates.map((c) => `${c.file}=${c.score}/${c.role}`).join(" "));
    assert.equal(candidates[0].role, "source");
    assert.equal(candidates[0].role_weight, 1);
    const doc = candidates.find((c) => c.file === "README.md")!;
    const test = candidates.find((c) => c.file.endsWith("ledger_test.ts"))!;
    assert.equal(doc.role, "doc");
    assert.equal(doc.role_weight, DOC_ROLE_WEIGHT);
    assert.equal(test.role, "test");
    assert.equal(test.role_weight, TEST_ROLE_WEIGHT);
    assert.ok(candidates[0].score > doc.score);
    assert.ok(candidates[0].score > test.score);

    // A README and a test that repeat the report sentence still lose to the same source hit.
    const echoed = scoreEditedHunks(LEDGER_REPORT, [
      hunk("readme", "README.md", ["Opening the ledger drops the balance when an entry is saved."]),
      hunk("test", "test/ledger_test.ts", ["it('opening the ledger drops the balance when an entry is saved', () => {});"]),
      hunk("src", "pkg/ledger.ts", [source]),
    ], []).candidates;
    assert.equal(echoed[0].file, "pkg/ledger.ts", echoed.map((c) => `${c.file}=${c.score}`).join(" "));
  });

  it("still returns a doc when it is the only hunk that matches", () => {
    const report = "The handbook describes the rotary encoder calibration procedure.";
    const { candidates } = scoreEditedHunks(report, [
      hunk("src", "pkg/motor.ts", ["export function spinRotor() { return 1; }"]),
      hunk("doc", "docs/handbook.md", ["Rotary encoder calibration procedure for the handbook."]),
    ], []);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].role, "doc");
    assert.match(candidates[0].file, /handbook\.md$/);
    assert.ok(candidates[0].score > 0);
  });
});

describe("content remap", () => {
  const added = "balance = balance - entry.amount;";

  it("remaps a line after 20 lines were inserted above the edit, and the quote verifies there", () => {
    const source = [...Array.from({ length: 20 }, (_, i) => `// pad ${i}`), added].join("\n") + "\n";
    const mapped = remapEditLine(source, 1, added);
    assert.equal(mapped.anchor, "exact");
    assert.equal(mapped.line, 21);
    const verified = verifyAnchoredLine(source, 1, added, [{ line: 1, text: added }], "entry.amount");
    assert.equal(verified.verified, true);
    assert.equal(verified.line, 21);
    assert.equal(verified.anchor, "exact");
  });

  it("picks the occurrence nearest the edit-time line when the text is duplicated", () => {
    const lines = Array.from({ length: 40 }, () => "other();");
    lines[11] = "mark();";
    lines[27] = "mark();";
    const source = lines.join("\n");
    const nearerEnd = remapEditLine(source, 30, "mark();");
    assert.equal(nearerEnd.anchor, "exact");
    assert.equal(nearerEnd.line, 28);
    const nearerStart = remapEditLine(source, 10, "mark();");
    assert.equal(nearerStart.line, 12);
  });

  it("marks a deleted line unanchored and does not keep the stale number", () => {
    const mapped = remapEditLine("other();\nstill();\n", 4, "mark();");
    assert.equal(mapped.anchor, "unanchored");
    assert.equal(mapped.line, 0);
    const verified = verifyAnchoredLine("other();\nstill();\n", 4, "mark();", undefined, "mark();");
    assert.equal(verified.verified, false);
    assert.equal(verified.line, 0);
  });

  it("falls back to a whitespace-normalised window when the exact indent drifted", () => {
    const mapped = remapEditLine("\tmark();\n", 3, "  mark();", [{ line: 3, text: "  mark();" }]);
    assert.equal(mapped.anchor, "window");
    assert.equal(mapped.line, 1);
  });

  it("locate() itself remaps the candidate onto the shifted file", () => {
    const root = mkdtempSync(join(tmpdir(), "wce-remap-"));
    after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, "pkg"));
    const text = "balance = balance - entry.amount;";
    writeFileSync(join(root, "pkg/ledger.ts"), [...Array.from({ length: 20 }, (_, i) => `// pad ${i}`), text].join("\n") + "\n");
    const index = idx([{
      line: 3, role: "tool", tool_name: "edit", edited_files: ["pkg/ledger.ts"],
      code_written: diff("pkg/ledger.ts", 1, ["+" + text]),
    }]);
    return locate({ report: "Saving an entry drops the balance.", index, root, enableModel: false }).then((r) => {
      assert.equal(r.picked?.edit_time_line, 1);
      assert.equal(r.picked?.line, 21);
      assert.equal(r.picked?.anchor, "exact");
      assert.equal(r.picked?.role, "source");
    });
  });

  it("a deleted line stays unanchored through locate and is not used as a frame", async () => {
    const root = mkdtempSync(join(tmpdir(), "wce-unanchor-"));
    after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, "pkg"));
    const stale = "balance = balance - entry.amount;";
    writeFileSync(join(root, "pkg/ledger.ts"), "export function spinRotor() { return 1; }\n");
    const index = idx([
      { line: 1, role: "user", text: "Keep the ledger balance aligned with each stored entry, please." },
      { line: 2, role: "assistant", text: "I will write the balance update directly and not look at anything else around it." },
      { line: 3, role: "tool", tool_name: "edit", edited_files: ["pkg/ledger.ts"], code_written: diff("pkg/ledger.ts", 4, ["+" + stale]) },
    ]);
    const found = await locate({ report: "Saving an entry drops the balance.", index, root, enableModel: false });
    assert.equal(found.picked?.anchor, "unanchored");
    assert.equal(found.picked?.line, 0);
    assert.notEqual(found.picked?.line, found.picked?.edit_time_line);
    const err: ProdError = { id: "e-unanchor", timestamp: "2026-01-01T00:00:00.000Z", severity: "error", service: "ledger", message: "Saving an entry drops the balance.", frames: [] };
    const explained = await explainWhy({
      error: err, index, transcriptName: "fixture.jsonl",
      readSource: () => "export function spinRotor() { return 1; }\n",
      root, locate: { enableModel: false },
    });
    assert.equal(explained.three_piece.frame, undefined);
    assert.equal(explained.stage, "no_frame");
  });
});

describe("layer 2 confirms the remapped line, not the stale one", () => {
  const jsonRes = (body: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }), { status: 200, headers: { "content-type": "application/json" } });

  function shiftedRoot(): { root: string; text: string } {
    const root = mkdtempSync(join(tmpdir(), "wce-layer2-remap-"));
    mkdirSync(join(root, "pkg"));
    const text = "balance = balance - entry.amount;";
    writeFileSync(join(root, "pkg/ledger.ts"), [...Array.from({ length: 20 }, (_, i) => `// pad ${i}`), text].join("\n") + "\n");
    return { root, text };
  }

  const hunksFor = (text: string) => [hunk("h1", "pkg/ledger.ts", [text])];

  it("accepts the current line and rejects the edit-time line", async () => {
    process.env.NVIDIA_API_KEY = "fixture-not-a-real-key";
    const { root, text } = shiftedRoot();
    after(() => rmSync(root, { recursive: true, force: true }));
    try {
      const confirmed = await agenticLocate({
        report: LEDGER_REPORT, root, hunks: hunksFor(text), provider: "nemotron", maxSteps: 1,
        fetchImpl: async () => jsonRes({ action: "answer", pattern: "", file: "pkg/ledger.ts", start: 0, end: 0, line: 21, reason: "the balance write" }),
      });
      assert.equal(confirmed.candidate?.line, 21);
      assert.equal(confirmed.candidate?.edit_time_line, 1);
      assert.equal(confirmed.candidate?.anchor, "exact");
      assert.match(confirmed.steps[0].result, /confirmed/);

      const stale = await agenticLocate({
        report: LEDGER_REPORT, root, hunks: hunksFor(text), provider: "nemotron", maxSteps: 1,
        fetchImpl: async () => jsonRes({ action: "answer", pattern: "", file: "pkg/ledger.ts", start: 0, end: 0, line: 1, reason: "stale" }),
      });
      assert.equal(stale.candidate, undefined);
      assert.match(stale.steps[0].result, /rejected/);
    } finally { delete process.env.NVIDIA_API_KEY; }
  });
});

describe("top-3 shortlist and evidence confidence", () => {
  it("puts the layer-2 pick first, drops overlapping hunks, and keeps three", () => {
    const a = cand({ file: "pkg/ledger.ts", hunk_id: "a", score: 5, hunk_start: 1, end_line: 10, line: 4 });
    const overlap = cand({ file: "pkg/ledger.ts", hunk_id: "b", score: 4, hunk_start: 8, end_line: 14, line: 9 });
    const c = cand({ file: "pkg/draft.ts", hunk_id: "c", score: 3, hunk_start: 1, end_line: 2 });
    const d = cand({ file: "pkg/open.ts", hunk_id: "d", score: 2, hunk_start: 1, end_line: 2 });
    const e = cand({ file: "pkg/extra.ts", hunk_id: "e", score: 1, hunk_start: 1, end_line: 2 });
    const layer2 = cand({ file: "pkg/ledger.ts", hunk_id: "a", score: 0, method: "agentic_model", hunk_start: 1, end_line: 10, line: 24, anchor: "exact" });
    const list = buildShortlist([a, overlap, c, d, e], layer2);
    assert.equal(SHORTLIST_SIZE, 3);
    assert.equal(list.length, 3);
    assert.equal(list[0].method, "agentic_model");
    assert.equal(list[1].hunk_id, "c");
    assert.equal(list[2].hunk_id, "d");
    assert.equal(buildShortlist([a, overlap, c, d]).map((x) => x.hunk_id).join(","), "a,c,d");
  });

  it("clear margin plus verified quotes is high; a near-tie is at most medium; unanchored or unverified is low", () => {
    const strong = cand({ file: "pkg/a.ts", hunk_id: "a", score: 4 });
    const weak = cand({ file: "pkg/b.ts", hunk_id: "b", score: 1 });
    const tied = cand({ file: "pkg/c.ts", hunk_id: "c", score: 3.9 });
    const clear = layer1ScoreMargin([strong, weak]);
    const near = layer1ScoreMargin([strong, tied]);
    assert.ok(clear >= CLEAR_MARGIN, `clear margin ${clear}`);
    assert.ok(near < CLEAR_MARGIN, `near margin ${near}`);

    const high = capConfidence({ model: "high", margin: clear, layer2Confirmed: false, anchor: "exact", quotesVerified: true });
    assert.equal(high.computed, "high");
    assert.equal(high.capped, "high");

    const tie = capConfidence({ model: "high", margin: near, layer2Confirmed: true, anchor: "exact", quotesVerified: true });
    assert.equal(tie.computed, "medium");
    assert.equal(tie.capped, "medium");

    const unanchored = capConfidence({ model: "high", margin: clear, layer2Confirmed: true, anchor: "unanchored", quotesVerified: true });
    assert.equal(unanchored.capped, "low");
    const unverified = capConfidence({ model: "high", margin: clear, layer2Confirmed: true, anchor: "exact", quotesVerified: false });
    assert.equal(unverified.capped, "low");

    const notRaised = capConfidence({ model: "low", margin: clear, layer2Confirmed: true, anchor: "exact", quotesVerified: true });
    assert.equal(notRaised.computed, "high");
    assert.equal(notRaised.capped, "low");
  });

  it("records which labelled candidate a verified code quote used", () => {
    const shortlist = [
      cand({ file: "pkg/ledger.ts", hunk_id: "a", score: 3, line: 4, anchor: "exact" }),
      cand({ file: "pkg/draft.ts", hunk_id: "b", score: 2, line: 2, anchor: "exact" }),
      cand({ file: "pkg/open.ts", hunk_id: "c", score: 1, line: 7, anchor: "exact" }),
    ];
    const used = matchUsedCandidate(shortlist, [
      { kind: "transcript", line: 2, verified: true },
      { kind: "code", file: "src/pkg/open.ts", line: 7, verified: true },
    ]);
    assert.equal(used?.label, "candidate 3");
    assert.equal(used?.file, "pkg/open.ts");
    assert.equal(used?.hunk_id, "c");
  });

  it("puts three labelled candidates in the explain context", () => {
    const readSource = (f: string) => {
      if (f === "pkg/ledger.ts") return "balance = balance - entry.amount;\n";
      if (f === "pkg/draft.ts") return "markEntrySaved(entry);\n";
      if (f === "pkg/open.ts") return "openLedger();\n";
      return undefined;
    };
    const index = idx([
      { line: 1, role: "user", text: "Keep the stored entry aligned with the ledger balance." },
      { line: 2, role: "assistant", text: "I will write the balance update and assume the entry is always present." },
      { line: 3, role: "tool", tool_name: "edit", edited_files: ["pkg/ledger.ts"], code_written: diff("pkg/ledger.ts", 1, ["+balance = balance - entry.amount;"]) },
    ]);
    const ctx = buildExplainContext({
      error: { message: LEDGER_REPORT, severity: "error", service: "ledger" },
      frame: { file: "pkg/ledger.ts", line: 1, function: "saveEntry" },
      wrote: { edit_line: 3, tool: "edit", hunk: "+balance = balance - entry.amount;" },
      index,
      piece: { schema: "why-code-exists/three-piece@1", error_id: "e", complete: false, notes: [], frame: { file: "pkg/ledger.ts", line: 1 } },
      readSource,
      locations: [
        { label: "candidate 1", file: "pkg/ledger.ts", line: 1, role: "source", role_weight: 1, anchor: "exact", score: 3, method: "deterministic_bm25" },
        { label: "candidate 2", file: "pkg/draft.ts", line: 1, role: "source", role_weight: 1, anchor: "exact", score: 2, method: "deterministic_bm25" },
        { label: "candidate 3", file: "pkg/open.ts", line: 1, role: "source", role_weight: 1, anchor: "exact", score: 1, method: "deterministic_bm25" },
      ],
    });
    const user = ctx.prompt.user as { candidate_locations: Array<{ label: string; file: string }> };
    assert.equal(user.candidate_locations.length, 3);
    assert.deepEqual(user.candidate_locations.map((c) => c.label), ["candidate 1", "candidate 2", "candidate 3"]);
    assert.deepEqual(user.candidate_locations.map((c) => c.file), ["pkg/ledger.ts", "pkg/draft.ts", "pkg/open.ts"]);
    assert.ok(ctx.ground_truth.code_lines["pkg/draft.ts"][1].includes("markEntrySaved"));
    assert.match(ctx.prompt.system, /candidate_locations/);
  });

  it("explainWhy passes the three locate candidates through to the context", async () => {
    delete process.env.NVIDIA_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const root = mkdtempSync(join(tmpdir(), "wce-shortlist-"));
    after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, "pkg"));
    const files: Record<string, string> = {
      "pkg/ledger.ts": "balance = balance - entry.amount;\n",
      "pkg/draft.ts": "markEntrySaved(entry);\n",
      "pkg/open.ts": "openLedger();\n",
    };
    for (const [file, body] of Object.entries(files)) writeFileSync(join(root, file), body);
    const index = idx([
      { line: 1, role: "user", text: "Keep the stored entry aligned with the ledger balance when it is saved." },
      { line: 2, role: "assistant", text: "I will update the balance from the entry and assume that value is always a number." },
      { line: 3, role: "tool", tool_name: "edit", edited_files: ["pkg/ledger.ts"], code_written: diff("pkg/ledger.ts", 1, ["+balance = balance - entry.amount;"]) },
      { line: 4, role: "tool", tool_name: "edit", edited_files: ["pkg/draft.ts"], code_written: diff("pkg/draft.ts", 1, ["+markEntrySaved(entry);"]) },
      { line: 5, role: "tool", tool_name: "edit", edited_files: ["pkg/open.ts"], code_written: diff("pkg/open.ts", 1, ["+openLedger();"]) },
    ]);
    const err: ProdError = { id: "e-three", timestamp: "2026-01-01T00:00:00.000Z", severity: "error", service: "ledger", message: LEDGER_REPORT, frames: [] };
    const result = await explainWhy({
      error: err, index, transcriptName: "fixture.jsonl",
      readSource: (f) => files[f],
      root, locate: { enableModel: false },
    });
    assert.equal(result.locate?.shortlist.length, 3);
    const user = result.context?.prompt_user as { candidate_locations: Array<{ label: string; file: string }> };
    assert.equal(user.candidate_locations.length, 3);
    assert.deepEqual(user.candidate_locations.map((c) => c.label), ["candidate 1", "candidate 2", "candidate 3"]);
    assert.equal(new Set(user.candidate_locations.map((c) => c.file)).size, 3);
  });
});
