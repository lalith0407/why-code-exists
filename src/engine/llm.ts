/**
 * One generic structured-output LLM call. Fails VISIBLY (throws) — no canned fallbacks.
 * Every live call is appended to data/llm-calls.jsonl (label, model, ok, time) for budget accounting. Never logs keys or bodies.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { extractJsonObject, isTransient, postJson, providerCfg, OPENAI_SEED, type LlmProvider, type PostResult } from "../llm/providers.js";

export const CALL_LEDGER = resolve(process.env.WCE_CALL_LEDGER || "data/llm-calls.jsonl");

export class LlmError extends Error {}

export function callsUsed(since?: string): number {
  if (!existsSync(CALL_LEDGER)) return 0;
  return readFileSync(CALL_LEDGER, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { at: string }).filter((r) => !since || r.at >= since).length;
}

/** Record a live call made outside llmJson (e.g. the mechanism gate). */
export function logCall(r: { label: string; model: string; ok: boolean }): void {
  mkdirSync(dirname(CALL_LEDGER), { recursive: true });
  appendFileSync(CALL_LEDGER, JSON.stringify({ at: new Date().toISOString(), ...r }) + "\n");
}

/** Invalid-JSON retries for long free-text outputs prone to runaway loops (test drafts, patch edits). */
export const RUNAWAY_PRONE_RETRIES = 2;

export interface LlmCall { label: string; model: string; ok: boolean; reason?: string }

export async function llmJson<T>(
  o: { provider: LlmProvider; label: string; system: string; user: unknown; schema: Record<string, unknown>; maxTokens?: number; noRetryOnInvalid?: boolean; invalidRetries?: number },
  calls: LlmCall[],
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const cfg = providerCfg(o.provider);
  if (!cfg.key) throw new LlmError(`${o.label}: no API key for provider ${o.provider}`);
  const max = Number(process.env.WCE_CALL_BUDGET || 0);
  if (max && callsUsed() >= max) throw new LlmError(`${o.label}: call budget ${max} exhausted (see ${CALL_LEDGER})`);
  const body = {
    model: cfg.model,
    temperature: 0,
    seed: OPENAI_SEED,
    max_tokens: o.maxTokens ?? 3000,
    response_format: { type: "json_schema", json_schema: { name: o.label.replace(/\W/g, "_"), strict: true, schema: o.schema } },
    messages: [
      { role: "system", content: o.system },
      { role: "user", content: typeof o.user === "string" ? o.user : JSON.stringify(o.user) },
    ],
  };
  const r = await withRetry(() => postJson(fetchImpl, cfg.key!, body, cfg), o.label, fetchImpl === fetch);
  const rec = { at: new Date().toISOString(), label: o.label, model: cfg.model, ok: r.ok, reason: r.ok ? undefined : r.reason, attempts: r.attempts };
  if (fetchImpl === fetch) {
    mkdirSync(dirname(CALL_LEDGER), { recursive: true });
    appendFileSync(CALL_LEDGER, JSON.stringify(rec) + "\n");
  }
  calls.push({ label: o.label, model: cfg.model, ok: r.ok, reason: rec.reason });
  if (!r.ok) throw new LlmError(`${o.label}: model call failed (${r.reason})`);
  try {
    return JSON.parse(extractJsonObject(r.content)) as T;
  } catch {
    // Runaway/truncated JSON (e.g. a repeated loop until max_tokens). Retrying the identical request at temperature 0 and a fixed
    // seed reproduces it, so the single retry varies the seed and tells the model its previous output was invalid and must be concise.
    let prevLen = r.content.length;
    for (let i = 0; !o.noRetryOnInvalid && i < (o.invalidRetries ?? 1); i++) {
      const body2 = { ...invalidJsonRetryBody(body, prevLen), seed: OPENAI_SEED + 1 + i };
      const r2 = await withRetry(() => postJson(fetchImpl, cfg.key!, body2, cfg), o.label + ":invalid_json_retry", fetchImpl === fetch);
      calls.push({ label: o.label + ":invalid_json_retry", model: cfg.model, ok: r2.ok, reason: r2.ok ? undefined : r2.reason });
      if (fetchImpl === fetch) appendFileSync(CALL_LEDGER, JSON.stringify({ at: new Date().toISOString(), label: o.label + ":invalid_json_retry", model: cfg.model, ok: r2.ok, attempts: r2.attempts }) + "\n");
      if (r2.ok) { try { return JSON.parse(extractJsonObject(r2.content)) as T; } catch { prevLen = r2.content.length; } }
    }
    throw new LlmError(`${o.label}: model returned unparseable JSON (${r.content.length} chars, ends: ${JSON.stringify(r.content.slice(-120))})`);
  }
}

/** Strict-schema helper: object with all props required, no extras. */
export function obj(props: Record<string, unknown>): Record<string, unknown> {
  return { type: "object", additionalProperties: false, required: Object.keys(props), properties: props };
}
export const str = { type: "string" };

/**
 * Generic backoff + retry for transient provider errors (rate limits, 5xx, timeouts, network). Exhausted quota/credits is NOT retried
 * (it cannot succeed). Each retry is logged to stderr (label, reason, wait) — never keys or bodies. Max WCE_LLM_RETRIES (default 4),
 * exponential from WCE_LLM_RETRY_BASE_MS (default 2000) with jitter, honouring Retry-After when given, capped at 60 s.
 */
export async function withRetry(
  send: () => Promise<PostResult>, label: string, log = true,
  o: { retries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<PostResult & { attempts: number }> {
  const retries = o.retries ?? Number(process.env.WCE_LLM_RETRIES ?? 4);
  const baseMs = o.baseMs ?? Number(process.env.WCE_LLM_RETRY_BASE_MS ?? 2000);
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));
  for (let attempt = 1; ; attempt++) {
    const r = await send();
    if (r.ok || !isTransient(r.reason) || attempt > retries) return { ...r, attempts: attempt };
    const wait = Math.min(60000, r.retryAfterMs ?? baseMs * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5));
    if (log) console.error(`[llm retry] ${label}: ${r.reason}; attempt ${attempt}/${retries + 1} failed, waiting ${Math.round(wait)} ms`);
    await sleep(wait);
  }
}

/** The single retry after unparseable output (shared by llmJson and the mechanism gate): varied seed + an explicit invalid-output notice. */
export function invalidJsonRetryBody<B extends { seed?: number; messages: Array<{ role: string; content: string }> }>(body: B, prevLen: number): B {
  return { ...body, seed: (body.seed ?? OPENAI_SEED) + 1, messages: [...body.messages, { role: "system", content: `Your previous answer was invalid JSON (${prevLen} chars, cut off or repetitive). Answer again with complete, valid JSON matching the schema; keep every string short and do not repeat content.` }] };
}
