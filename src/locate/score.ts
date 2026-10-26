/**
 * Layer 1 (deterministic, no model): score the agent's edited hunks/lines against the report's salient terms,
 * using a BM25-style score over identifiers split on camelCase/snake_case, plus an exact-substring bonus for
 * quoted strings / UI-label-style phrases from the report (string-literal matches). No per-case words, no
 * domain lists, no hard-coded synonyms beyond the generic code-token splitter in terms.ts.
 */
import { extractTerms, tokenize, type Term } from "./terms.js";
import type { EditedHunk } from "./edits.js";
import { enclosingSymbolName, type Symbol } from "./symbols.js";
import { neighbourWindow } from "./remap.js";
import { classifyFileRole } from "./roles.js";
import type { Candidate } from "./types.js";

const K1 = 1.5;
const B = 0.75;

function hunkTokens(h: EditedHunk): string[] {
  return h.added.flatMap((a) => tokenize(a.text));
}

/** Rank edited hunks by BM25-style term overlap with the report, then pick the single best line inside the winning hunk. */
export function scoreEditedHunks(report: string, hunks: EditedHunk[], symbols: Symbol[], topK = 10): { terms: Term[]; candidates: Candidate[] } {
  const terms = extractTerms(report);
  const queryTokens = new Set<string>();
  for (const t of terms) {
    if (t.kind === "quoted" || t.kind === "phrase") for (const p of tokenize(t.text)) queryTokens.add(p);
    else queryTokens.add(t.text);
  }
  const literalPhrases = terms.filter((t) => t.kind === "quoted" || t.kind === "phrase").map((t) => t.text).filter((p) => p.length >= 3);

  const docs = hunks.map((h) => ({ hunk: h, tokens: hunkTokens(h) }));
  const avgdl = docs.reduce((a, d) => a + d.tokens.length, 0) / (docs.length || 1);
  const N = docs.length || 1;
  const df = new Map<string, number>();
  for (const q of queryTokens) df.set(q, docs.filter((d) => d.tokens.includes(q)).length);
  const idf = (t: string) => Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));

  const lineScore = (text: string, matched: Set<string>): number => {
    const toks = new Set(tokenize(text));
    let s = 0;
    for (const t of toks) if (queryTokens.has(t)) { s += idf(t); matched.add(t); }
    const lower = text.toLowerCase();
    for (const p of literalPhrases) if (lower.includes(p)) { s += 4; matched.add(p); }
    return s;
  };

  const candidates: Candidate[] = docs.map(({ hunk, tokens }) => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const matched = new Set<string>();
    let score = 0;
    for (const q of queryTokens) {
      const f = tf.get(q) ?? 0;
      if (!f) continue;
      matched.add(q);
      score += idf(q) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * tokens.length) / (avgdl || 1))));
    }
    const hunkText = hunk.added.map((a) => a.text).join("\n").toLowerCase();
    for (const p of literalPhrases) if (hunkText.includes(p)) { score += 4; matched.add(p); }

    // Best single line inside the winning hunk: highest per-line term overlap (ties: first = earliest in the hunk).
    let best = hunk.added[0], bestScore = -1, bestMatched = new Set<string>();
    for (const a of hunk.added) {
      const m = new Set<string>();
      const s = lineScore(a.text, m);
      if (s > bestScore) { best = a; bestScore = s; bestMatched = m; }
    }

    // Role weight is a prior on the whole BM25 score (including the literal-phrase bonus), not a second ranker.
    const role = classifyFileRole(hunk.file);
    const weighted = score * role.weight;
    return {
      file: hunk.file,
      line: best.line,
      end_line: hunk.end,
      text: best.text,
      function: enclosingSymbolName(symbols, hunk.file, best.line),
      score: +weighted.toFixed(4),
      matched_terms: [...matched, ...bestMatched].filter((v, i, a) => a.indexOf(v) === i),
      edit_line: hunk.edit_line,
      tool: hunk.tool,
      hunk_id: hunk.id,
      snippet: hunk.added.slice(0, 10).map((a) => `${a.line}: ${a.text}`).join("\n"),
      method: "deterministic_bm25" as const,
      role: role.role,
      role_weight: role.weight,
      edit_time_line: best.line,
      hunk_start: hunk.start,
      context_lines: neighbourWindow(hunk.added, best.line),
    };
  });

  const ranked = candidates.filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);
  return { terms, candidates: ranked };
}
