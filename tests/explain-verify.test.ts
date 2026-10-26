/**
 * Unit tests for the "explain why" verifier (src/explain/verify.ts), with synthetic FIXTURE data only.
 * No eval case data, no tuning on any real case.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExplainContext } from "../src/explain/context.js";
import { buildRepairRequest, verifyAnswer, verifyEvidence, type RawAnswer } from "../src/explain/verify.js";

// FIXTURE ground truth: a tiny synthetic code file + a tiny synthetic transcript.
const groundTruth: ExplainContext["ground_truth"] = {
  code_lines: {
    "lib/widget.ts": { 1: "export function makeWidget() {", 2: "  const helperResult = helperFn();", 3: "  return helperResult.value;", 4: "}" },
  },
  transcript_lines: {
    1: "Build a fixture widget.\n\nMake sure helperFn never returns null.",
    2: "THINKING: I will call helperFn() and trust it always returns an object, since the fixture spec says so.",
  },
};

describe("explain-why verifier (synthetic fixtures)", () => {
  it("verifies a code quote that is a real substring of the cited (normalized) line", () => {
    const r = verifyEvidence({ kind: "code", file: "src/lib/widget.ts", line: 2, quote: "helperFn()" }, groundTruth);
    assert.equal(r.verified, true);
  });

  it("rejects a code quote not present on the cited line", () => {
    const r = verifyEvidence({ kind: "code", file: "lib/widget.ts", line: 2, quote: "doesNotExist()" }, groundTruth);
    assert.equal(r.verified, false);
    assert.match(r.reason!, /not a substring/);
  });

  it("rejects a code quote citing a file not in the context", () => {
    const r = verifyEvidence({ kind: "code", file: "lib/other.ts", line: 1, quote: "x" }, groundTruth);
    assert.equal(r.verified, false);
    assert.match(r.reason!, /not in context/);
  });

  it("verifies a transcript quote against the full joined message body, even when the quote sits on a later physical line of that Lnnn block", () => {
    const r = verifyEvidence({ kind: "transcript", line: 1, quote: "Make sure helperFn never returns null." }, groundTruth);
    assert.equal(r.verified, true);
  });

  it("rejects a transcript quote on a line number that was never recorded", () => {
    const r = verifyEvidence({ kind: "transcript", line: 999, quote: "anything" }, groundTruth);
    assert.equal(r.verified, false);
    assert.match(r.reason!, /does not exist/);
  });

  it("whitespace-normalizes before giving up (a model may re-wrap a quote)", () => {
    const r = verifyEvidence({ kind: "transcript", line: 2, quote: "trust it   always returns\nan object" }, groundTruth);
    assert.equal(r.verified, true);
  });

  const okCode = { kind: "code" as const, file: "lib/widget.ts", line: 2, quote: "helperFn()" };
  const okTranscript = { kind: "transcript" as const, line: 1, quote: "Make sure helperFn never returns null." };
  const badCode = { kind: "code" as const, file: "lib/widget.ts", line: 2, quote: "nope" };
  const badTranscript = { kind: "transcript" as const, line: 1, quote: "nope" };

  it("status is verified only with >=1 verified code AND >=1 verified transcript quote", () => {
    const answer: RawAnswer = { overlooked_assumption: "x", why_it_breaks: "y", confidence: "medium", evidence: [okCode, okTranscript] };
    const v = verifyAnswer(answer, groundTruth);
    assert.equal(v.status, "verified");
    assert.equal(v.verified_code_quotes, 1);
    assert.equal(v.verified_transcript_quotes, 1);
  });

  it("status is unverified with only a code quote, or only a transcript quote, or neither", () => {
    assert.equal(verifyAnswer({ overlooked_assumption: "x", why_it_breaks: "y", confidence: "low", evidence: [okCode] }, groundTruth).status, "unverified");
    assert.equal(verifyAnswer({ overlooked_assumption: "x", why_it_breaks: "y", confidence: "low", evidence: [okTranscript] }, groundTruth).status, "unverified");
    assert.equal(verifyAnswer({ overlooked_assumption: "x", why_it_breaks: "y", confidence: "low", evidence: [badCode, badTranscript] }, groundTruth).status, "unverified");
  });

  it("an unverified answer is never upgraded by a confident model-stated confidence", () => {
    const v = verifyAnswer({ overlooked_assumption: "x", why_it_breaks: "y", confidence: "high", evidence: [badCode, badTranscript] }, groundTruth);
    assert.equal(v.status, "unverified");
  });

  it("buildRepairRequest is undefined once verified, and bounded to only the failed quotes otherwise", () => {
    const verifiedAnswer = verifyAnswer({ overlooked_assumption: "x", why_it_breaks: "y", confidence: "medium", evidence: [okCode, okTranscript] }, groundTruth);
    assert.equal(buildRepairRequest(verifiedAnswer), undefined);

    const unverifiedAnswer = verifyAnswer({ overlooked_assumption: "x", why_it_breaks: "y", confidence: "medium", evidence: [okCode, badTranscript] }, groundTruth);
    const repair = buildRepairRequest(unverifiedAnswer);
    assert.ok(repair);
    assert.equal(repair!.failed.length, 1, "only the failed quote is included, not the already-verified one");
    assert.equal(repair!.failed[0].kind, "transcript");
    assert.match(repair!.message, /verified transcript quote/);
  });
});
