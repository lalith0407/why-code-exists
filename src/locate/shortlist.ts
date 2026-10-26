/**
 * The handful of locations handed to the explain stage: layer 2's confirmed pick first, then layer-1
 * rank, with overlapping hunks collapsed so the same edit is not shown three times.
 */
import type { Candidate } from "./types.js";

/** Explain shows a few distinct locations. Three is enough for a near-tie to be visible without a long prompt. */
export const SHORTLIST_SIZE = 3;

const sameFile = (a: string, b: string) => a === b || a.endsWith("/" + b) || b.endsWith("/" + a);

function span(c: Candidate): [number, number] {
  const start = c.hunk_start ?? c.edit_time_line;
  const end = c.end_line;
  return [Math.min(start, end), Math.max(start, end)];
}

/** Same hunk id, or the same file with overlapping edit-time spans. */
export function overlapsCandidate(a: Candidate, b: Candidate): boolean {
  if (a.hunk_id && a.hunk_id === b.hunk_id) return true;
  if (!sameFile(a.file, b.file)) return false;
  const [a1, a2] = span(a);
  const [b1, b2] = span(b);
  return a1 <= b2 && b1 <= a2;
}

/** Keep the first (higher-ranked) candidate of each overlapping group. */
export function dedupeOverlapping(ranked: Candidate[]): Candidate[] {
  const out: Candidate[] = [];
  for (const c of ranked) {
    if (out.some((k) => overlapsCandidate(k, c))) continue;
    out.push(c);
  }
  return out;
}

/** Layer-2 confirmed pick first, then layer-1 rank, at most `limit` distinct hunks. */
export function buildShortlist(layer1: Candidate[], layer2?: Candidate, limit = SHORTLIST_SIZE): Candidate[] {
  const out: Candidate[] = [];
  if (layer2) out.push(layer2);
  for (const c of dedupeOverlapping(layer1)) {
    if (out.length >= limit) break;
    if (out.some((k) => overlapsCandidate(k, c))) continue;
    out.push(c);
  }
  return out.slice(0, limit);
}

/**
 * Relative gap `(s1 - s2) / s1` between layer-1 rank 1 and rank 2 after overlap dedupe.
 * A single positive hit has margin 1: there is no rival to tie with.
 */
export function layer1ScoreMargin(candidates: Candidate[]): number {
  const ranked = dedupeOverlapping(candidates.filter((c) => c.method === "deterministic_bm25" && c.score > 0));
  if (ranked.length <= 1) return 1;
  const s1 = ranked[0].score;
  const s2 = ranked[1].score;
  if (!(s1 > 0)) return 0;
  return (s1 - s2) / s1;
}
