/**
 * LLM transport for OpenAI-compatible chat-completions providers (OpenAI, NVIDIA Nemotron). Plain fetch, no SDK.
 * Never logs the key or response bodies. Prompts live in src/engine/ and src/prove/mechanism.ts.
 */

export const OPENAI_DEFAULT_MODEL = "gpt-4.1-mini";

export type ReasonerName = "openai" | "nemotron" | "heuristic";

export function selectReasoner(): ReasonerName {
  const r = (process.env.WCE_REASONER || "").trim().toLowerCase();
  if (r === "openai" || r === "nemotron" || r === "heuristic") return r;
  return process.env.OPENAI_API_KEY ? "openai" : "heuristic";
}

export function openaiModel(): string {
  return process.env.WCE_OPENAI_MODEL || OPENAI_DEFAULT_MODEL;
}

/** LLM provider for the shared two-step (call A + call B) path. All three speak JSON in/out; Anthropic uses its own Messages API. */
export type LlmProvider = "openai" | "nemotron" | "anthropic";
export const NEMOTRON_TWO_STEP_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
/** Mid-tier Sonnet-class model, overridable so a newer Sonnet can be swapped in without a code change. */
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-5";

export interface ProviderCfg {
  provider: LlmProvider;
  model: string;
  key?: string;
  base: string;
  /** call label prefix, e.g. assume:openai_call_A / assume:nemotron_call_A */
  tag: string;
}

export function providerCfg(p: LlmProvider = "openai"): ProviderCfg {
  if (p === "nemotron")
    return {
      provider: p,
      model: process.env.NEMOTRON_MODEL || NEMOTRON_TWO_STEP_MODEL,
      key: process.env.NVIDIA_API_KEY,
      base: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
      tag: "nemotron",
    };
  if (p === "anthropic")
    return {
      provider: p,
      model: process.env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL,
      key: process.env.ANTHROPIC_API_KEY,
      base: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
      tag: "anthropic",
    };
  return {
    provider: p,
    model: openaiModel(),
    key: process.env.OPENAI_API_KEY,
    base: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    tag: "openai",
  };
}

/** Pull the JSON object out of a reply that may include <think> blocks or code fences (Nemotron). */
export function extractJsonObject(content: string): string {
  const noThink = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  try {
    JSON.parse(noThink);
    return noThink;
  } catch {
    /* fall through */
  }
  const m = noThink.match(/\{[\s\S]*\}/);
  return m ? m[0] : noThink;
}

export const OPENAI_SEED = 7;

export async function postJson(
  fetchImpl: typeof fetch,
  key: string,
  body: unknown,
  cfg: ProviderCfg = providerCfg("openai"),
): Promise<PostResult> {
  if (cfg.provider === "nemotron") return postNemotron(fetchImpl, key, body as Record<string, unknown>, cfg);
  if (cfg.provider === "anthropic") return postAnthropic(fetchImpl, key, body as Record<string, unknown>, cfg);
  const base = cfg.base;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number(process.env.WCE_OPENAI_TIMEOUT_MS || 20000));
  try {
    const res = await fetchImpl(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, reason: await httpReason(res), retryAfterMs: retryAfter(res) };
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string; refusal?: string } }> };
    const msg = json.choices?.[0]?.message;
    if (msg?.refusal) return { ok: false, reason: "refusal" };
    return { ok: true, content: msg?.content ?? "" };
  } catch (e) {
    const name = e instanceof Error ? e.name : "error";
    return { ok: false, reason: name === "AbortError" ? "timeout" : `fetch_${name}` };
  } finally {
    clearTimeout(t);
  }
}

async function postNemotron(
  fetchImpl: typeof fetch,
  key: string,
  body: Record<string, unknown>,
  cfg: ProviderCfg,
): Promise<PostResult> {
  const timeout = Number(process.env.WCE_NEMOTRON_TIMEOUT_MS || 45000);
  const send = async (b: Record<string, unknown>) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetchImpl(`${cfg.base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(b),
        signal: ctrl.signal,
      });
      if (!res.ok) return { ok: false as const, reason: await httpReason(res), retryAfterMs: retryAfter(res) };
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { ok: true as const, content: json.choices?.[0]?.message?.content ?? "" };
    } catch (e) {
      const name = e instanceof Error ? e.name : "error";
      return { ok: false as const, reason: name === "AbortError" ? "timeout" : `fetch_${name}` };
    } finally {
      clearTimeout(t);
    }
  };
  const base = {
    ...body,
    model: cfg.model,
    max_tokens: Math.max(Number(body.max_tokens) || 0, 3000),
    chat_template_kwargs: { enable_thinking: false },
  };
  const r = await send(base);
  if (r.ok || !r.reason.startsWith("http_400")) return r;
  const rf = body.response_format as { json_schema?: { schema?: unknown } } | undefined;
  const msgs = (body.messages as Array<{ role: string; content: string }>).map((m) =>
    m.role === "system"
      ? { ...m, content: m.content + " Reply ONLY with one JSON object matching this JSON schema: " + JSON.stringify(rf?.json_schema?.schema ?? {}) }
      : m,
  );
  const { response_format: _drop, chat_template_kwargs: _k, ...rest } = base as Record<string, unknown>;
  return send({ ...rest, messages: msgs });
}

/**
 * Translate the shared OpenAI-shaped call body (system + user message, optional json_schema response_format) into an Anthropic
 * Messages API request. Pure function so the translation is testable without a network call. Anthropic has no json_schema mode,
 * so the schema (when present) is appended to the system prompt as an explicit instruction, same trick used for Nemotron's 400 retry.
 */
export function toAnthropicRequest(body: Record<string, unknown>, model: string): Record<string, unknown> {
  const messages = (body.messages as Array<{ role: string; content: string }>) ?? [];
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");
  const rf = body.response_format as { json_schema?: { schema?: unknown } } | undefined;
  const schema = rf?.json_schema?.schema;
  const sys = schema ? `${system}\n\nReply ONLY with one JSON object matching this JSON schema (no prose, no code fences): ${JSON.stringify(schema)}` : system;
  return {
    model,
    max_tokens: Math.max(Number(body.max_tokens) || 0, 1024),
    ...(typeof body.temperature === "number" ? { temperature: body.temperature } : {}),
    system: sys,
    messages: rest.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
  };
}

async function postAnthropic(
  fetchImpl: typeof fetch,
  key: string,
  body: Record<string, unknown>,
  cfg: ProviderCfg,
): Promise<PostResult> {
  const timeout = Number(process.env.WCE_ANTHROPIC_TIMEOUT_MS || 45000);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetchImpl(`${cfg.base}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(toAnthropicRequest(body, cfg.model)),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, reason: await anthropicHttpReason(res), retryAfterMs: retryAfter(res) };
    const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = (json.content ?? []).filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
    return { ok: true, content: text };
  } catch (e) {
    const name = e instanceof Error ? e.name : "error";
    return { ok: false, reason: name === "AbortError" ? "timeout" : `fetch_${name}` };
  } finally {
    clearTimeout(t);
  }
}

/** Anthropic error bodies are `{type:"error", error:{type, message}}`; only the machine `type` is surfaced, never the message text. */
async function anthropicHttpReason(res: Response): Promise<string> {
  let code = "";
  try {
    const j = (await res.json()) as { error?: { type?: unknown } };
    const c = j?.error?.type;
    if (typeof c === "string" && /^[\w.-]{1,64}$/.test(c)) code = `:${c}`;
  } catch { /* non-JSON body */ }
  return `http_${res.status}${code}`;
}

export type PostResult = { ok: true; content: string } | { ok: false; reason: string; retryAfterMs?: number };

/** "http_<status>" plus the provider's machine error code when present (e.g. http_429:insufficient_quota). Never includes the body text. */
async function httpReason(res: Response): Promise<string> {
  let code = "";
  try {
    const j = (await res.json()) as { error?: { code?: unknown; type?: unknown } };
    const c = j?.error?.code ?? j?.error?.type;
    if (typeof c === "string" && /^[\w.-]{1,64}$/.test(c)) code = `:${c}`;
  } catch { /* non-JSON body */ }
  return `http_${res.status}${code}`;
}

function retryAfter(res: Response): number | undefined {
  const h = res.headers?.get?.("retry-after");
  if (!h) return undefined;
  const n = Number(h);
  return Number.isFinite(n) ? Math.min(n * 1000, 60000) : undefined;
}

/** Transient = worth retrying: rate limits (not exhausted quota/credits), 5xx, 408, timeouts and network errors. */
export function isTransient(reason: string): boolean {
  if (/insufficient_quota|credit_balance_exhausted|billing/.test(reason)) return false;
  return /^http_(429|408|409|5\d\d)\b/.test(reason) || reason === "timeout" || reason.startsWith("fetch_");
}
