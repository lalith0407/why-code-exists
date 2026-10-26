/**
 * Which labelled shortlist entry the reasoner's verified code quotes landed on.
 * The model may ground the code quote on any of the three; this records that choice.
 */
import type { Candidate } from "../locate/types.js";
import { normalizeCodePath } from "./context.js";

/**
 * How far a verified code quote's line may sit from a candidate and still count as that candidate.
 * Generic: it matches the explain code window, so a quote inside the shown hunk is the same location.
 */
export const USED_CANDIDATE_LINE_SLOP = 20;

export interface UsedCandidate {
  label: string;
  index: number;
  file: string;
  line: number;
  hunk_id: string;
}

function filesMatch(a: string, b: string): boolean {
  const na = normalizeCodePath(a);
  const nb = normalizeCodePath(b);
  return na === nb || na.endsWith("/" + nb) || nb.endsWith("/" + na);
}

export function matchUsedCandidate(
  shortlist: Candidate[],
  evidence: Array<{ kind: string; file?: string; line: number; verified: boolean }>,
): UsedCandidate | undefined {
  const quotes = evidence.filter((e) => e.kind === "code" && e.verified);
  if (!quotes.length || !shortlist.length) return undefined;
  let best: { index: number; dist: number } | undefined;
  for (const q of quotes) {
    const cited = q.file ?? "";
    shortlist.forEach((c, index) => {
      if (c.anchor === "unanchored" || c.line <= 0) return;
      if (!filesMatch(c.file, cited)) return;
      const dist = Math.abs(c.line - q.line);
      if (!best || dist < best.dist) best = { index, dist };
    });
  }
  if (!best || best.dist > USED_CANDIDATE_LINE_SLOP) return undefined;
  const c = shortlist[best.index];
  return { label: `candidate ${best.index + 1}`, index: best.index, file: c.file, line: c.line, hunk_id: c.hunk_id };
}
