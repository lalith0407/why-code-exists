import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scrubText, scrubObject } from "../src/scrub.js";

describe("scrubText", () => {
  it("redacts postgresql URIs", () => {
    const input = "url=postgresql://user:supersecret@db.example:5432/app?sslmode=require";
    const { text, stats } = scrubText(input);
    assert.equal(text.includes("supersecret"), false);
    assert.equal(text.includes("postgresql://[REDACTED]"), true);
    assert.ok((stats.byName.postgres_uri ?? 0) >= 1);
  });

  it("redacts env-style secrets without echoing values", () => {
    const input = "AUTH_SECRET=abc123xyz999 DATABASE_URL=postgresql://a:b@h/db";
    const { text } = scrubText(input);
    assert.equal(text.includes("abc123xyz999"), false);
    assert.equal(text.includes("AUTH_SECRET=[REDACTED]"), true);
    assert.equal(text.includes("postgresql://[REDACTED]"), true);
  });

  it("keeps camelCase code but still redacts raw tokens", () => {
    const code = "export function f(webhookSecret: string, x) { const slackSigningSecret = formData.get(\"s\"); }";
    assert.equal(scrubText(code).text, code);
    assert.equal(scrubText("stripeApiKey: AbCdEfGhIjKlMnOpQrStUv12").text.includes("AbCdEf"), false);
  });

  it("redacts json password fields", () => {
    const input = '{"password":"hunter2hunter2","email":"a@b.c"}';
    const { text } = scrubText(input);
    assert.equal(text.includes("hunter2"), false);
    assert.match(text, /"password"\s*:\s*"\[REDACTED\]"/);
    assert.equal(text.includes("a@b.c"), true);
  });

  it("scrubObject walks nested structures", () => {
    const obj = {
      nested: { token: "postgresql://x:y@z/db" },
      keep: 42,
    };
    const out = scrubObject(obj);
    assert.equal(out.keep, 42);
    assert.equal(out.nested.token, "postgresql://[REDACTED]");
  });
});
