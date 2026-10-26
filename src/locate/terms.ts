/**
 * Generic term extraction from a plain-language bug report (no per-case rules, no domain lists).
 * Pulls out: quoted strings and UI-label-style phrases (strongest literal signal), numbers (can match
 * literal constants in code), identifier-looking tokens (camelCase / snake_case / dotted), and ordinary
 * domain words. The same camelCase/snake_case splitter is reused to tokenize source code in score.ts, so
 * the report and the code are compared in one shared vocabulary.
 */

export type TermKind = "identifier" | "quoted" | "number" | "phrase" | "word";

export interface Term {
  /** Normalized (lowercased) form used for matching. */
  text: string;
  kind: TermKind;
  /** The text as it appeared in the report. */
  raw: string;
}

/** Generic English function words. Not tuned to any case; only used to drop noise from plain-language reports. */
const GENERIC_STOP = new Set(
  (
    "the a an and or but if then else for while with without from into onto over under about above below between " +
    "this that these those is are was were be been being have has had do does did will would can could should may " +
    "might must not no yes it its they them their there here when where which who whom whose what why how i you " +
    "he she we us our your his her my me mine yours hers ours theirs as at by in of on to up out so than too very " +
    "just also only even still again more most some any each every both few many much other another such like " +
    "after before during because since while until unless"
  )
    .split(/\s+/)
    .filter(Boolean),
);

/** Split a code-style identifier into lowercase word parts on camelCase / snake_case / kebab-case / dotted boundaries. */
export function splitIdentifier(id: string): string[] {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .map((p) => p.toLowerCase())
    .filter(Boolean);
}

/** Plain tokenizer shared by the report and by source code: identifier split, generic stopwords dropped, length>=2. */
export function tokenize(text: string): string[] {
  const words = text.match(/[A-Za-z][A-Za-z0-9]*(?:[_-][A-Za-z0-9]+)*/g) ?? [];
  const out: string[] = [];
  for (const w of words) for (const p of splitIdentifier(w)) if (p.length >= 2 && !GENERIC_STOP.has(p)) out.push(p);
  return out;
}

const QUOTE_RE = /["'`“”]([^"'`“”]{2,80})["'`“”]/g;
/** Capitalized multi-word phrase outside quotes: a generic approximation of UI labels / proper-noun error text ("Save changes"). */
const PHRASE_RE = /\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Za-z][a-zA-Z0-9]*){1,3})\b/g;
const NUMBER_RE = /\b(\d+(?:\.\d+)?)\s*(?:ms|s|sec|secs|seconds|minute|minutes|min|mins|hour|hours|%|x)?\b/gi;
/** A bare word that "looks like code": has an internal case change, underscore+letter, or a dotted segment. */
const CODEY_RE = /\b[A-Za-z_][A-Za-z0-9_.]*\b/g;
const LOOKS_LIKE_CODE = /[a-z][A-Z]|_[a-z0-9]|\.[a-z]/;

/**
 * Salient terms from free text, generic across reports: identifiers, quoted strings, numbers, error text, UI
 * labels, domain nouns. No per-case words, no hard-coded synonyms — only generic code-token splitting and a
 * fixed, generic English stopword list.
 */
export function extractTerms(report: string): Term[] {
  const terms: Term[] = [];
  const seen = new Set<string>();
  const add = (text: string, kind: TermKind, raw: string) => {
    const t = text.trim();
    if (!t) return;
    const key = `${kind}:${t}`;
    if (seen.has(key)) return;
    seen.add(key);
    terms.push({ text: t, kind, raw });
  };

  for (const m of report.matchAll(QUOTE_RE)) add(m[1].toLowerCase(), "quoted", m[1]);
  for (const m of report.matchAll(PHRASE_RE)) add(m[1].toLowerCase(), "phrase", m[1]);
  for (const m of report.matchAll(NUMBER_RE)) add(m[1], "number", m[0]);
  for (const m of report.matchAll(CODEY_RE)) {
    const w = m[0];
    if (!LOOKS_LIKE_CODE.test(w)) continue;
    for (const p of splitIdentifier(w)) if (p.length >= 2 && !GENERIC_STOP.has(p)) add(p, "identifier", w);
  }
  for (const w of tokenize(report)) if (w.length >= 4) add(w, "word", w);

  return terms;
}
