/**
 * Evidence confidence for a LOCATE-backed explanation. The model's self-report is capped by this
 * level and is never raised.
 *
 * Formula. Ranks are low < medium < high.
 *   margin = 1 when fewer than two positive layer-1 scores remain after overlap dedupe,
 *            otherwise (s1 - s2) / s1 on those file-role-weighted scores.
 *   computed =
 *     low    if the explain quotes did not verify,
 *            OR the candidate was not anchored (unanchored, or remap never ran);
 *     medium if margin < CLEAR_MARGIN (the top two layer-1 hunks are a near-tie),
 *            even when layer 2 confirmed the line and the model said "high";
 *     medium if the anchor is only a whitespace-normalised window and layer 2 did not confirm;
 *     high   if quotes verified AND the anchor is exact AND margin >= CLEAR_MARGIN;
 *     high   if quotes verified AND the anchor is a window AND margin >= CLEAR_MARGIN
 *            AND layer 2 confirmed that line (confirmation makes up for the weaker text match).
 *   capped = min(model, computed).
 */
import type { LineAnchor } from "../locate/types.js";

export type Confidence = "high" | "medium" | "low";

/**
 * Relative (s1-s2)/s1 below which two layer-1 hunks count as a near-tie.
 * Generic: BM25 gaps smaller than this come from document length, not a real separation.
 */
export const CLEAR_MARGIN = 0.25;

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const NAME: Confidence[] = ["low", "medium", "high"];

export interface ConfidenceEvidence {
  model: Confidence;
  margin: number;
  layer2Confirmed: boolean;
  anchor?: LineAnchor;
  quotesVerified: boolean;
}

/** The deterministic level, before the model's self-report is applied. */
export function evidenceLevel(input: ConfidenceEvidence): Confidence {
  if (!input.quotesVerified) return "low";
  if (input.anchor !== "exact" && input.anchor !== "window") return "low";
  if (!(input.margin >= CLEAR_MARGIN)) return "medium";
  if (input.anchor === "exact") return "high";
  return input.layer2Confirmed ? "high" : "medium";
}

/** `capped` is min(model, computed). It is never higher than `model`. */
export function capConfidence(input: ConfidenceEvidence): { computed: Confidence; capped: Confidence } {
  const computed = evidenceLevel(input);
  const capped = NAME[Math.min(RANK[input.model], RANK[computed])];
  return { computed, capped };
}
