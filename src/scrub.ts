/**
 * Redact secrets from transcript / log text before anything reaches an LLM or UI.
 * Never log the raw match — only the redacted string.
 */

const PATTERNS: Array<{ name: string; re: RegExp; replace: string | ((...m: string[]) => string) }> = [
  {
    name: "postgres_uri",
    re: /postgres(?:ql)?:\/\/[^\s"'<>\\]+/gi,
    replace: "postgresql://[REDACTED]",
  },
  {
    name: "mysql_uri",
    re: /mysql:\/\/[^\s"'<>\\]+/gi,
    replace: "mysql://[REDACTED]",
  },
  {
    name: "mongodb_uri",
    re: /mongodb(?:\+srv)?:\/\/[^\s"'<>\\]+/gi,
    replace: "mongodb://[REDACTED]",
  },
  {
    name: "bearer",
    re: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
    replace: "Bearer [REDACTED]",
  },
  {
    name: "openai_sk",
    re: /\bsk-[A-Za-z0-9]{16,}\b/g,
    replace: "sk-[REDACTED]",
  },
  {
    name: "aws_key",
    re: /\bAKIA[0-9A-Z]{16}\b/g,
    replace: "AKIA[REDACTED]",
  },
  {
    name: "env_assignment",
    re: /\b([A-Z][A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API[_-]?KEY|DATABASE_URL|AUTH_SECRET))\s*[=:]\s*([^\s"'\\]{4,})/gi,
    // Code member references (e.g. `secret: config.apiSecret,`) are identifiers, not secret values.
    // camelCase code (`fooSecret: string,`, `barToken: form.get(...)`) is kept unless the value looks like a raw token.
    replace: (full: string, name: string, val: string) => {
      if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+[,;)]*$/.test(val) || /^(process\.env|os\.environ|env)\b/.test(val)) return full;
      const codeName = name !== name.toUpperCase();
      if (codeName && !/^[A-Za-z0-9_\-+/=]{20,}[,;]?$/.test(val)) return full;
      return `${name}=[REDACTED]`;
    },
  },
  {
    name: "json_secret_field",
    re: /("(?:password|passwordHash|secret|apiKey|api_key|token|authorization)"\s*:\s*")([^"]{4,})(")/gi,
    replace: (_full, p1: string, _val: string, p3: string) => `${p1}[REDACTED]${p3}`,
  },
];

export interface ScrubStats {
  replacements: number;
  byName: Record<string, number>;
}

export function scrubText(input: string): { text: string; stats: ScrubStats } {
  let text = input;
  const byName: Record<string, number> = {};
  let replacements = 0;
  for (const { name, re, replace } of PATTERNS) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const global = new RegExp(re.source, flags);
    let count = 0;
    text = text.replace(global, (...args) => {
      count += 1;
      if (typeof replace === "function") {
        return replace(...(args as string[]));
      }
      return replace;
    });
    if (count) {
      byName[name] = count;
      replacements += count;
    }
  }
  return { text, stats: { replacements, byName } };
}

export function scrubObject<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === "string") return scrubText(value).text as T;
  if (Array.isArray(value)) return value.map((v) => scrubObject(v)) as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubObject(v);
    }
    return out as T;
  }
  return value;
}
