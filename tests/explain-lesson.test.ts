/**
 * Synthetic explain-report lessons. Invented ribbon-stamp and marble-chute wording only.
 * The happy path uses the vendored H-MEM engine in a temp dir. The failure test replaces add/query
 * at the Meterless boundary and is labeled there.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { ExplainWhyResult } from "../src/explain/pipeline.js";
import type { ExplainLessonSource } from "../src/lesson/explain-lesson.js";

const root = new URL("..", import.meta.url).pathname;
const savedDir = process.env.WCE_METERLESS_DIR;

function useDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "wce-explain-lesson-"));
  process.env.WCE_METERLESS_DIR = dir;
  return dir;
}

afterEach(async () => {
  const { setMeterlessBoundaryForTests } = await import("../src/lesson/meterless.js");
  setMeterlessBoundaryForTests(undefined);
  if (savedDir === undefined) delete process.env.WCE_METERLESS_DIR;
  else process.env.WCE_METERLESS_DIR = savedDir;
});

function piece(text: string, citation: string, valid: boolean) {
  return { text, citation, valid, ...(valid ? {} : { why_invalid: "not a quote of the transcript" }) };
}

function report(over: {
  file?: string;
  assumption: string;
  why: string;
  status?: "verified" | "unverified";
  stage?: ExplainLessonSource["stage"];
  errorId?: string;
}): ExplainLessonSource {
  const file = over.file ?? "pkg/ribbon_counter.ts";
  const status = over.status ?? "verified";
  const verified = status === "verified";
  return {
    schema: "why-code-exists/explain-why@1",
    stage: over.stage ?? "ok",
    provider: "nemotron",
    three_piece: {
      schema: "why-code-exists/three-piece@1",
      error_id: over.errorId ?? "ribbon-sample",
      frame: { file, line: 4, function: "stampInk" },
      asked: piece("Count ribbons only when the stamp touches paper.", "transcript#L2", true),
      understood: piece("this understood text is invalid and must not be stored", "transcript#L3", false),
      happened: { ...piece("The tally stayed at zero after an idle stamp.", "transcript#L8", true), later_edits: [] },
      complete: true,
      notes: [],
    },
    answer: {
      overlooked_assumption: over.assumption,
      why_it_breaks: over.why,
      confidence: "medium",
      status,
      verified_code_quotes: verified ? 1 : 0,
      verified_transcript_quotes: verified ? 1 : 1,
      evidence: [
        { kind: "code", file, line: 4, quote: "tally += 1", verified, ...(verified ? {} : { reason: "quote is not a substring of the cited line" }) },
        { kind: "transcript", line: 3, quote: "the stamp is idle so the counter can reset", verified: true },
        { kind: "code", file, line: 9, quote: "this quote was never in the source and must not be stored", verified: false, reason: "quote is not a substring of the cited line" },
      ],
    },
    repair: { attempted: false, failed_quotes: [], outcome: "not_attempted" },
    calls: [],
    confidence_cap: {
      model: "high",
      computed: "medium",
      capped: "medium",
      margin: 2,
      layer2_confirmed: false,
      quotes_verified: verified,
    },
  };
}

const RIBBON = "A ribbon counter resets itself whenever the ink stamp is idle.";
const RIBBON_WHY = "The counter only moves when stampInk runs, so an idle stamp leaves the tally unchanged.";
const RELATED = "Leaving the ink stamp idle still resets the ribbon counter.";
const RELATED_WHY = "Idle time never calls stampInk, so the tally stays where the last stamp left it.";
const REVISED_WHY = "An idle stamp never clears the tally; only stampInk increments it.";
const MARBLE = "Marbles fall into the nearest open bin when the chute tilts left.";
const MARBLE_WHY = "The chute only opens the bin on the right when tiltLeft is false.";

describe("explain lesson keys from verified fields", () => {
  it("derives concept from the assumption text and language from the file extension", async () => {
    const { lessonFromExplainReport, languageFromFile, conceptFromVerifiedAssumption } = await import("../src/lesson/explain-lesson.js");
    const { lessonKey } = await import("../src/lesson/meterless.js");
    const lesson = lessonFromExplainReport(report({ assumption: `  ${RIBBON}  `, why: RIBBON_WHY }))!;
    assert.ok(lesson);
    assert.equal(conceptFromVerifiedAssumption(`  ${RIBBON}  `), RIBBON);
    assert.equal(languageFromFile("pkg/ribbon_counter.ts"), "ts");
    assert.equal(languageFromFile("pkg/Ribbon.TS"), "ts");
    assert.equal(languageFromFile("README"), "unknown");
    assert.equal(lesson.concept, RIBBON);
    assert.equal(lesson.language_framework, "ts");
    assert.equal(lesson.verified_context!.lesson_key, lessonKey(lesson));
    assert.equal(lesson.verified_context!.located_by, "frame");
    assert.equal(lesson.verdict, "verified");
    assert.equal(lesson.suggested_fix, "");
    assert.equal(lesson.file, "pkg/ribbon_counter.ts");
    assert.ok(!lesson.verified_context!.lesson_key.includes(lesson.error_id));
    assert.deepEqual(lesson.citations.map((c) => c.ref), ["code:pkg/ribbon_counter.ts:4", "transcript#L3"]);
    assert.equal(lesson.verified_context!.pieces.understood, undefined);
    assert.equal(lesson.verified_context!.pieces.asked?.text, "Count ribbons only when the stamp touches paper.");
    assert.equal(lesson.verified_context!.pieces.happened?.text, "The tally stayed at zero after an idle stamp.");
    assert.equal(lesson.verified_context!.provider, "nemotron");
    assert.equal(lesson.verified_context!.confidence_cap?.capped, "medium");
    const content = JSON.stringify(lesson);
    assert.equal(content.includes("this understood text is invalid and must not be stored"), false);
    assert.equal(content.includes("this quote was never in the source and must not be stored"), false);
  });

  it("builds no lesson when the answer is unverified or the stage is not ok", async () => {
    const { explainLessonStatus } = await import("../src/lesson/explain-lesson.js");
    const unverified = explainLessonStatus(report({ assumption: RIBBON, why: RIBBON_WHY, status: "unverified" }));
    assert.equal(unverified.disposition, "not_created");
    assert.equal(unverified.reason, "not created because unverified");
    assert.equal(unverified.lesson, undefined);
    assert.equal(unverified.recall.ran, false);
    assert.match(unverified.recall.error ?? "", /not run/);
    const early = explainLessonStatus(report({ assumption: RIBBON, why: RIBBON_WHY, stage: "no_credentials" }));
    assert.equal(early.disposition, "not_created");
    assert.match(early.reason ?? "", /no_credentials/);
    assert.equal(early.lesson, undefined);
  });

  it("uses the LOCATE pick when the report has no frame", async () => {
    const { lessonFromExplainReport } = await import("../src/lesson/explain-lesson.js");
    const body = report({ assumption: RIBBON, why: RIBBON_WHY, file: "pkg/marble_chute.py" });
    body.three_piece.frame = undefined;
    body.locate = {
      schema: "why-code-exists/locate@1",
      report: "tally",
      terms: ["tally"],
      layer1: { symbols_indexed: 0, edited_hunks_indexed: 0, candidates: [] },
      shortlist: [],
      picked: { file: "pkg/marble_chute.py", line: 2, score: 1, matched_terms: [], tool: "edit", edit_line: 1, method: "symbol", text: "x", snippet: "x", role: "edit", role_weight: 1, anchor: "exact" } as never,
      method: "layer1_deterministic",
    };
    const lesson = lessonFromExplainReport(body)!;
    assert.equal(lesson.file, "pkg/marble_chute.py");
    assert.equal(lesson.language_framework, "py");
    assert.equal(lesson.verified_context!.location?.via, "locate");
    assert.equal(lesson.verified_context!.located_by, "layer1_deterministic");
  });
});

describe("explain lesson recall and approval", () => {
  it("stores only after write, dedups, supersedes the same key, and recalls a related lesson", async () => {
    const dir = useDir();
    const { explainLessonStatus, lessonFromExplainReport, writeExplainLesson } = await import("../src/lesson/explain-lesson.js");
    const { renderExplainReport } = await import("../src/report/explain.js");
    const first = report({ assumption: RIBBON, why: RIBBON_WHY });
    const pending = explainLessonStatus(first);
    assert.equal(pending.disposition, "pending");
    assert.equal(pending.recall.ok, true);
    assert.equal(pending.recall.hits.length, 0);
    const htmlPending = renderExplainReport({ ...first, lesson_status: pending } as ExplainWhyResult, "report.json");
    assert.match(htmlPending, /pending approval/);
    assert.match(htmlPending, /npm run approve/);
    assert.doesNotMatch(htmlPending, /once a reviewer approves this explanation/);

    const stored = writeExplainLesson(pending.lesson!);
    assert.equal(stored.detail, "new");
    assert.match(stored.memory_id, /^mem-/);
    const again = writeExplainLesson(lessonFromExplainReport(first)!);
    assert.equal(again.detail, "dedup_existing");
    assert.equal(again.memory_id, stored.memory_id);

    writeExplainLesson(lessonFromExplainReport(report({ assumption: MARBLE, why: MARBLE_WHY, file: "pkg/marble_chute.ts", errorId: "marble-sample" }))!);
    writeExplainLesson(lessonFromExplainReport(report({ assumption: "A clay tally advances when the kiln door opens.", why: "The door switch does not touch the ribbon counter.", file: "kiln/door.py", errorId: "kiln-sample" }))!);

    const related = explainLessonStatus(report({ assumption: RELATED, why: RELATED_WHY, errorId: "ribbon-related" }));
    assert.equal(related.disposition, "pending");
    const ribbonHit = related.recall.hits.find((h) => h.id === stored.memory_id);
    assert.ok(ribbonHit, `expected the stored ribbon lesson among ${related.recall.hits.map((h) => h.id).join(",")}`);
    assert.equal(ribbonHit.shares_file, true);
    assert.equal(ribbonHit.shares_key, false);
    assert.equal(typeof ribbonHit.relevance, "number");
    const marbleHit = related.recall.hits.find((h) => h.file === "pkg/marble_chute.ts");
    if (marbleHit) assert.ok((ribbonHit.relevance ?? 0) > (marbleHit.relevance ?? 0));
    assert.equal(related.recall.hits.some((h) => h.file === "kiln/door.py"), false);
    const htmlRelated = renderExplainReport({ ...report({ assumption: RELATED, why: RELATED_WHY }), lesson_status: related } as ExplainWhyResult);
    assert.match(htmlRelated, /shares file:/);
    assert.match(htmlRelated, /shares key:/);
    assert.match(htmlRelated, new RegExp(stored.memory_id));

    const revised = writeExplainLesson(lessonFromExplainReport(report({ assumption: RIBBON, why: REVISED_WHY }))!);
    assert.match(revised.detail, new RegExp(`^supersedes_${stored.memory_id}$`));
    const revisedAgain = writeExplainLesson(lessonFromExplainReport(report({ assumption: RIBBON, why: REVISED_WHY }))!);
    assert.equal(revisedAgain.detail, "dedup_existing");
    assert.equal(revisedAgain.memory_id, revised.memory_id);
    const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8")) as { records: Array<{ id: string; content: string; tags: string[]; supersedes?: string; provenance: { label: string } }> };
    const active = state.records.find((rec) => rec.id === revised.memory_id)!;
    assert.equal(active.provenance.label, "approved explain report");
    assert.ok(active.tags.some((t) => t.startsWith("file:")));
    assert.equal(active.content.includes(REVISED_WHY), true);
    assert.equal(active.content.includes("this quote was never in the source and must not be stored"), false);
    assert.equal(active.supersedes, stored.memory_id);
    const after = explainLessonStatus(report({ assumption: RELATED, why: RELATED_WHY, errorId: "ribbon-after" }));
    assert.ok(after.recall.hits.some((h) => h.id === revised.memory_id));
    assert.equal(after.recall.hits.some((h) => h.id === stored.memory_id), false);
  });

  it("reports engine failure from the Meterless boundary and does not invent hits", async () => {
    const { setMeterlessBoundaryForTests } = await import("../src/lesson/meterless.js");
    const { explainLessonStatus, writeExplainLesson, lessonFromExplainReport } = await import("../src/lesson/explain-lesson.js");
    const { renderExplainReport } = await import("../src/report/explain.js");
    // MOCK: Meterless boundary
    setMeterlessBoundaryForTests({
      add() { throw new Error("meterless engine unavailable"); },
      query() { throw new Error("meterless engine unavailable"); },
    });
    const body = report({ assumption: RIBBON, why: RIBBON_WHY });
    const status = explainLessonStatus(body);
    assert.equal(status.disposition, "pending");
    assert.equal(status.recall.ran, true);
    assert.equal(status.recall.ok, false);
    assert.match(status.recall.error ?? "", /meterless engine unavailable/);
    assert.deepEqual(status.recall.hits, []);
    const html = renderExplainReport({ ...body, lesson_status: status } as ExplainWhyResult);
    assert.match(html, /Recall failed:/);
    assert.match(html, /meterless engine unavailable/);
    assert.match(html, /pending approval/);
    setMeterlessBoundaryForTests({
      query() {
        return { memories: [], context: "", trace: { retrievalReason: "mock empty", strategy: "minimal" as const, scores: {} } };
      },
      add() { throw new Error("meterless add failed"); },
    });
    assert.throws(() => writeExplainLesson(lessonFromExplainReport(body)!), /meterless add failed/);
  });
});

describe("npm run approve", () => {
  function approve(reportPath: string, decision: string, dir: string) {
    return spawnSync("npm", ["run", "approve", "--", "--report", reportPath, "--decision", decision, "--by", "tester"], {
      cwd: root, env: { ...process.env, WCE_METERLESS_DIR: dir }, encoding: "utf8",
    });
  }

  it("approves an explain report, dedups, recalls, refuses unverified, rejects without writing, and still approves investigate", async () => {
    const dir = useDir();
    const work = mkdtempSync(join(tmpdir(), "wce-explain-reports-"));
    const verifiedPath = join(work, "verified.json");
    const relatedPath = join(work, "related.json");
    const unverifiedPath = join(work, "unverified.json");
    const investigatePath = join(work, "investigate.json");
    writeFileSync(verifiedPath, JSON.stringify(report({ assumption: RIBBON, why: RIBBON_WHY })));
    writeFileSync(relatedPath, JSON.stringify(report({ assumption: RELATED, why: RELATED_WHY, errorId: "ribbon-related" })));
    writeFileSync(unverifiedPath, JSON.stringify(report({ assumption: RIBBON, why: RIBBON_WHY, status: "unverified", errorId: "ribbon-unverified" })));
    const unverifiedBefore = readFileSync(unverifiedPath, "utf8");
    writeFileSync(investigatePath, JSON.stringify({
      version: "2",
      verdict: "proven_false",
      error: { id: "ink-err", message: "ribbon tally stayed at zero", timestamp: "t", severity: "error", service: "stamp", frames: [{ file: "pkg/ribbon_counter.ts", line: 4 }] },
      frame: { file: "pkg/ribbon_counter.ts", line: 4, function: "stampInk" },
      language: "ts",
      provenance: { written_at: { edit_line: 3 } },
      tree: { origin: "fixture" },
      code_under_test: { source: "fixture", text: "export function stampInk() { return 1 }\n" },
      claim: {
        claim: "the ribbon tally resets when the stamp is idle",
        mechanism: "idle path clears the counter",
        belief_quote: "resets when idle",
        belief_quote_source: "transcript",
        belief_quote_verified: true,
        concept: "ribbon tally idle reset",
        language_framework: "TypeScript",
        correct_rule: "the tally changes only inside stampInk",
      },
      patch: { diff: "-return 0\n+return 1\n", text: "", changed_lines: 1, rationale: "synthetic" },
      tests: { tests_sha256: "abc123", frozen_at: "t", harness_sha256: "h", harness_repairs: [], setup: "", stubs: [], tests: [] },
      reasons: ["synthetic gate"],
      calls: [],
      started_at: "t",
    }));

    const first = approve(verifiedPath, "approve", dir);
    assert.equal(first.status, 0, first.stderr);
    const firstApproval = JSON.parse(first.stdout.trim().split("\n").filter((l) => l.startsWith("{")).at(-1)!);
    assert.match(firstApproval.lesson, /^mem-\d+ \(new\)$/);
    const memoryId = firstApproval.lesson.split(" ")[0];
    const saved = JSON.parse(readFileSync(verifiedPath, "utf8"));
    assert.equal(saved.lesson_status.disposition, "stored");
    assert.equal(saved.lesson_status.write.memory_id, memoryId);
    assert.equal(saved.lesson_status.write.detail, "new");
    const html = readFileSync(join(work, "report.html"), "utf8");
    assert.match(html, /why-code-exists: explain why/);
    assert.match(html, new RegExp(memoryId));
    assert.match(html, />stored</);

    const second = approve(verifiedPath, "approve", dir);
    assert.equal(second.status, 0, second.stderr);
    const secondApproval = JSON.parse(second.stdout.trim().split("\n").filter((l) => l.startsWith("{")).at(-1)!);
    assert.equal(secondApproval.lesson, `${memoryId} (dedup_existing)`);

    const { explainLessonStatus } = await import("../src/lesson/explain-lesson.js");
    const recalled = explainLessonStatus(report({ assumption: RELATED, why: RELATED_WHY, errorId: "ribbon-related" }));
    assert.ok(recalled.recall.hits.some((h) => h.id === memoryId && h.shares_file && !h.shares_key));

    const rejected = approve(relatedPath, "reject", dir);
    assert.equal(rejected.status, 0, rejected.stderr);
    const rejectedReport = JSON.parse(readFileSync(relatedPath, "utf8"));
    assert.equal(rejectedReport.approval.decision, "reject");
    assert.equal(rejectedReport.lesson_status.disposition, "rejected");
    assert.equal(rejectedReport.lesson_status.write, undefined);
    const rejectedHtml = readFileSync(join(work, "report.html"), "utf8");
    assert.match(rejectedHtml, /rejected/);

    const refused = approve(unverifiedPath, "approve", dir);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /not created because unverified/);
    assert.equal(readFileSync(unverifiedPath, "utf8"), unverifiedBefore);

    const investigated = approve(investigatePath, "approve", dir);
    assert.equal(investigated.status, 0, investigated.stderr);
    const investigatedApproval = JSON.parse(investigated.stdout.trim().split("\n").filter((l) => l.startsWith("{")).at(-1)!);
    assert.match(investigatedApproval.lesson, /^mem-\d+ \(new\)$/);
    const genericHtml = readFileSync(join(work, "report.html"), "utf8");
    assert.match(genericHtml, /why-code-exists: proven_false/);
    assert.match(genericHtml, /ribbon tally idle reset/);
    assert.doesNotMatch(genericHtml, /explain why/);

    const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8")) as { records: Array<{ content: string; tags: string[]; provenance: { label: string }; supersededBy?: string }> };
    const explainRec = state.records.find((rec) => rec.content.includes(RIBBON_WHY) && !rec.supersededBy);
    const investigateRec = state.records.find((rec) => rec.content.includes("the tally changes only inside stampInk"));
    assert.ok(explainRec);
    assert.equal(explainRec!.provenance.label, "approved explain report");
    assert.ok(explainRec!.tags.includes("kind:lesson"));
    assert.ok(investigateRec);
    assert.equal(investigateRec!.provenance.label, "approved investigation");
    assert.equal(investigateRec!.tags.some((t) => t.startsWith("file:")), false);
    assert.equal(state.records.some((rec) => rec.content.includes("this quote was never in the source")), false);
  });
});

describe("explain-why attaches lesson status", () => {
  it("a report with no frame is not_created and does not call a model", async () => {
    const { explainWhy } = await import("../src/explain/pipeline.js");
    const result = await explainWhy({
      error: { id: "ribbon-empty", timestamp: "2026-01-01T00:00:00Z", severity: "error", service: "stamp", message: "ribbon tally stuck", frames: [] },
      index: { path: "ribbon.jsonl", messages: [], byEditedFile: new Map(), scrubReplacements: 0 },
      transcriptName: "ribbon.jsonl",
      readSource: () => undefined,
      locate: { enableModel: false },
    });
    assert.equal(result.stage, "no_frame");
    assert.equal(result.calls.length, 0);
    assert.equal(result.lesson_status.disposition, "not_created");
    assert.equal(result.lesson_status.lesson, undefined);
    assert.equal(result.lesson_status.recall.ran, false);
  });
});
