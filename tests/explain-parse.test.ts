/**
 * Unit tests for parsing/validating the reasoner's JSON reply (src/explain/reasoner.ts), plus the Anthropic
 * provider's request translation (src/llm/providers.ts). Synthetic FIXTURE strings only; no network calls.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAnswer, validateAnswerShape, ANSWER_SCHEMA } from "../src/explain/reasoner.js";
import { providerCfg, toAnthropicRequest, ANTHROPIC_DEFAULT_MODEL } from "../src/llm/providers.js";

const GOOD = {
  overlooked_assumption: "The agent assumed helperFn() always returns a non-null object.",
  evidence: [
    { kind: "transcript", file: "", line: 2, quote: "I will call helperFn() and trust it always returns an object" },
    { kind: "code", file: "lib/widget.ts", line: 2, quote: "helperResult = helperFn();" },
  ],
  why_it_breaks: "When helperFn() returns null, helperResult.value throws.",
  confidence: "medium",
};

describe("explain-why JSON parsing (synthetic fixtures)", () => {
  it("parses a clean JSON reply", () => {
    const a = parseAnswer(JSON.stringify(GOOD));
    assert.equal(a.overlooked_assumption, GOOD.overlooked_assumption);
    assert.equal(a.evidence.length, 2);
    assert.equal(a.confidence, "medium");
  });

  it("tolerates a <think> block and a surrounding code fence (Nemotron-style reply)", () => {
    const wrapped = `<think>reasoning the model should not leak as the answer</think>\n\`\`\`json\n${JSON.stringify(GOOD)}\n\`\`\``;
    const a = parseAnswer(wrapped);
    assert.equal(a.overlooked_assumption, GOOD.overlooked_assumption);
  });

  it("throws a clear error on invalid JSON, never silently returning a fallback", () => {
    assert.throws(() => parseAnswer("not json at all"), /not valid JSON/);
  });

  it("throws on a well-formed JSON object missing a required field", () => {
    const { why_it_breaks, ...missing } = GOOD;
    void why_it_breaks;
    assert.throws(() => validateAnswerShape(missing), /why_it_breaks/);
  });

  it("throws on an invalid confidence value", () => {
    assert.throws(() => validateAnswerShape({ ...GOOD, confidence: "very high" }), /confidence/);
  });

  it("throws when evidence is not an array", () => {
    assert.throws(() => validateAnswerShape({ ...GOOD, evidence: "none" }), /evidence must be an array/);
  });

  it("throws when an evidence item has a bad kind", () => {
    const bad = { ...GOOD, evidence: [{ kind: "guess", line: 1, quote: "x" }] };
    assert.throws(() => validateAnswerShape(bad), /evidence\[0\]\.kind/);
  });

  it("the strict JSON schema requires every property (no silent partial answers)", () => {
    const required = (ANSWER_SCHEMA as any).required as string[];
    assert.deepEqual(new Set(required), new Set(["overlooked_assumption", "evidence", "why_it_breaks", "confidence"]));
    assert.equal((ANSWER_SCHEMA as any).additionalProperties, false);
  });
});

describe("Anthropic provider (request translation; no network)", () => {
  it("defaults to claude-sonnet-4-5 and reads ANTHROPIC_API_KEY/ANTHROPIC_MODEL", () => {
    delete process.env.ANTHROPIC_MODEL;
    const cfg = providerCfg("anthropic");
    assert.equal(cfg.model, ANTHROPIC_DEFAULT_MODEL);
    assert.equal(cfg.model, "claude-sonnet-4-5");
    process.env.ANTHROPIC_MODEL = "claude-sonnet-4-5-custom";
    assert.equal(providerCfg("anthropic").model, "claude-sonnet-4-5-custom");
    delete process.env.ANTHROPIC_MODEL;
  });

  it("translates the shared OpenAI-shaped body into an Anthropic Messages request, folding system+schema together", () => {
    const body = {
      model: "ignored",
      max_tokens: 500,
      temperature: 0,
      response_format: { type: "json_schema", json_schema: { schema: { type: "object" } } },
      messages: [{ role: "system", content: "You are helpful." }, { role: "user", content: "Say hi." }],
    };
    const req = toAnthropicRequest(body, "claude-sonnet-4-5") as any;
    assert.equal(req.model, "claude-sonnet-4-5");
    assert.equal(req.max_tokens, 1024, "max_tokens is floored at 1024 even when the shared body asks for less");
    assert.match(req.system, /You are helpful\./);
    assert.match(req.system, /Reply ONLY with one JSON object/);
    assert.deepEqual(req.messages, [{ role: "user", content: "Say hi." }]);
  });

  it("never sends the OpenAI response_format field to Anthropic", () => {
    const body = { max_tokens: 10, response_format: { type: "json_schema" }, messages: [{ role: "user", content: "x" }] };
    const req = toAnthropicRequest(body, "m") as any;
    assert.equal("response_format" in req, false);
  });
});
