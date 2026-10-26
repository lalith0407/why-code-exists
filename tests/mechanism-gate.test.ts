import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aggregateMechanism, applyMechanismGate } from "../src/prove/mechanism.js";

// Synthetic code, unrelated to any eval bug.
const CODE = `function pay(amount) {\n  if (amount > 0) {\n    ledger.add(amount);\n  }\n}`;

describe("mechanism gate (generic aggregation)", () => {
  it("consistent when every claimed element matches and present quotes are verbatim", () => {
    const v = aggregateMechanism([{ element: "upper bound check", claimed: "absent", actual: "absent", quote: "" },
      { element: "positive check", claimed: "present", actual: "present", quote: "if (amount > 0) {" }], CODE);
    assert.equal(v.verdict, "consistent");
  });
  it("mismatch when the claim says a construct exists that the code lacks", () => {
    assert.equal(aggregateMechanism([{ element: "currency compare", claimed: "present", actual: "absent", quote: "" }], CODE).verdict, "mechanism_mismatch");
  });
  it("mismatch when a present quote is not verbatim", () => {
    assert.equal(aggregateMechanism([{ element: "positive check", claimed: "present", actual: "present", quote: "if (amount >= 0)" }], CODE).verdict, "mechanism_mismatch");
  });
  it("unstated when no element", () => {
    assert.equal(aggregateMechanism([], CODE).verdict, "mechanism_unstated");
  });
  it("applyMechanismGate demotes proven_false on mismatch and fails closed on HTTP error", async () => {
    process.env.OPENAI_API_KEY ||= "test-key";
    const mk = (status: number, content: string) => (async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status })) as unknown as typeof fetch;
    const as: any[] = [{ id: "a1", text: "x" }, { id: "a2", text: "y" }];
    const pf = () => [{ assumption_id: "a1", status: "proven_false", check_id: "c", evidence_summary: "", details: {}, fidelity: "tested" },
      { assumption_id: "a2", status: "proven_false", check_id: "c", evidence_summary: "", details: {}, fidelity: "tested" }] as any[];
    const content = JSON.stringify({ results: [
      { claim_index: 0, elements: [{ element: "e", claimed: "absent", actual: "absent", quote: "" }] },
      { claim_index: 1, elements: [{ element: "e", claimed: "present", actual: "absent", quote: "" }] } ] });
    const p1 = pf();
    await applyMechanismGate(as, p1, CODE, "openai", mk(200, content));
    assert.deepEqual(p1.map((p) => p.status), ["proven_false", "mechanism_mismatch"]);
    const p2 = pf();
    await applyMechanismGate(as, p2, CODE, "openai", mk(500, ""));
    assert.deepEqual(p2.map((p) => p.status), ["mechanism_mismatch", "mechanism_mismatch"]);
  });
});

import { gateProvider } from "../src/prove/mechanism.js";
describe("gate provider + honesty line", () => {
  it("gate defaults to openai regardless of the claim writer", () => {
    delete process.env.WCE_GATE_PROVIDER;
    assert.equal(gateProvider(), "openai");
    process.env.WCE_GATE_PROVIDER = "nemotron";
    assert.equal(gateProvider(), "nemotron");
    delete process.env.WCE_GATE_PROVIDER;
  });
});
