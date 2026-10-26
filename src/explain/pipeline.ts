/**
 * The "explain why" pipeline stage: the tool's own account of what the coding agent overlooked, backed by
 * verified quotes — distinct from the three-piece explanation (which only shows asked/understood/happened and
 * leaves the "why" to a human reader). Stages, in order:
 *   1. three-piece linking (existing, deterministic) — finds the frame and the edit that wrote it.
 *   2. context building (context.ts, deterministic) — symptom, hunk ± N lines, related files, three pieces,
 *      transcript windows, under a char/token budget.
 *   3. reasoning (reasoner.ts) — one generic LLM call (Nemotron default, Anthropic optional).
 *   4. verification (verify.ts, deterministic) — quote-checks every citation; one bounded repair re-ask if needed.
 * Never fakes success: a missing frame/edit, missing credentials, or a model/parse failure is reported as such,
 * with the stage it failed at, not hidden behind a plausible-looking answer.
 */
import type { ProdError } from "../types.js";
import type { TranscriptIndex } from "../session/transcript.js";
import { editThatWroteLine, threePieceFromFrame, threePieceFromTranscript, type ThreePiece } from "../story/three-piece.js";
import { buildExplainContext, usableRoot, type ExplainContext, type ExplainLocation } from "./context.js";
import { askReasoner, hasCredentials, selectExplainProvider, type ExplainProvider } from "./reasoner.js";
import { buildRepairRequest, noRepair, verifyAnchoredLine, verifyAnswer, type RepairRecord, type VerifiedAnswer } from "./verify.js";
import { capConfidence, type Confidence } from "./confidence.js";
import { matchUsedCandidate, type UsedCandidate } from "./used-candidate.js";
import { layer1ScoreMargin } from "../locate/shortlist.js";
import type { LlmCall } from "../engine/llm.js";
import { locate, type LocateInput, type LocateResult } from "../locate/pipeline.js";
import type { Candidate } from "../locate/types.js";
import { explainLessonStatus, type ExplainLessonStatus } from "../lesson/explain-lesson.js";

export interface ExplainWhyResult {
  schema: "why-code-exists/explain-why@1";
  stage: "no_frame" | "no_edit" | "no_credentials" | "model_error" | "ok";
  provider: ExplainProvider;
  reason?: string;
  three_piece: ThreePiece;
  /**
   * Present whenever the input report had no stack frame at all: the LOCATE stage's own account of how (or
   * whether) it found a candidate file:line to hand to the linker above. Never hidden, even when it found nothing.
   */
  locate?: LocateResult;
  context?: { budget: ExplainContext["budget"]; prompt_user: unknown };
  answer?: VerifiedAnswer;
  /** The first-pass answer, kept verbatim when a repair re-ask replaced it (for before/after-repair scoring). */
  pre_repair_answer?: VerifiedAnswer;
  /** The repair re-ask's reply, verified, whether or not it was adopted. */
  repair_answer?: VerifiedAnswer;
  repair: RepairRecord;
  calls: LlmCall[];
  /** Which labelled shortlist entry the verified code quotes landed on, when LOCATE supplied candidates. */
  used_candidate?: UsedCandidate;
  /**
   * Model self-report capped by the deterministic evidence level. `capped` is what `answer.confidence` stores.
   * Present only when LOCATE ran and an answer was produced.
   */
  confidence_cap?: {
    model: Confidence;
    computed: Confidence;
    capped: Confidence;
    margin: number;
    layer2_confirmed: boolean;
    anchor?: string;
    quotes_verified: boolean;
  };
  /** Built from verified fields after the answer exists. Pending until `npm run approve`. */
  lesson_status: ExplainLessonStatus;
  approval?: { decision: string; by: string; at: string; lesson?: string };
}

export interface ExplainWhyInput {
  error: ProdError;
  index: TranscriptIndex;
  transcriptName: string;
  readSource: (file: string) => string | undefined;
  root?: string;
  provider?: ExplainProvider;
  /** LOCATE stage knobs, forwarded as-is (see src/locate/pipeline.ts). Only consulted when `error.frames` is empty. */
  locate?: Pick<LocateInput, "enableModel" | "provider" | "maxModelSteps" | "topK">;
}

function locationsFrom(found: LocateResult | undefined): ExplainLocation[] | undefined {
  if (!found?.shortlist.length) return undefined;
  return found.shortlist.map((c, i) => ({
    label: `candidate ${i + 1}`,
    file: c.file,
    line: c.line,
    function: c.function,
    score: c.score,
    role: c.role,
    role_weight: c.role_weight,
    anchor: c.anchor,
    method: c.method,
    text: c.text,
    snippet: c.snippet,
  }));
}

/** Cap `answer.confidence` by the evidence formula. Does not modify the pre-repair copy. */
function capLocatedAnswer(answer: VerifiedAnswer, found: LocateResult | undefined): Pick<ExplainWhyResult, "used_candidate" | "confidence_cap"> & { answer: VerifiedAnswer } {
  if (!found) return { answer };
  const used = matchUsedCandidate(found.shortlist, answer.evidence);
  const focus: Candidate | undefined = used ? found.shortlist[used.index] : found.shortlist[0];
  const margin = layer1ScoreMargin(found.layer1.candidates);
  const layer2Confirmed = focus?.method === "agentic_model";
  const quotesVerified = answer.status === "verified";
  const cap = capConfidence({ model: answer.confidence, margin, layer2Confirmed, anchor: focus?.anchor, quotesVerified });
  return {
    answer: { ...answer, confidence: cap.capped },
    ...(used ? { used_candidate: used } : {}),
    confidence_cap: {
      model: answer.confidence,
      computed: cap.computed,
      capped: cap.capped,
      margin,
      layer2_confirmed: layer2Confirmed,
      anchor: focus?.anchor,
      quotes_verified: quotesVerified,
    },
  };
}

async function explainWhyCore(input: ExplainWhyInput): Promise<Omit<ExplainWhyResult, "lesson_status" | "approval">> {
  const { error, index, transcriptName, readSource, root } = input;
  const provider = input.provider ?? selectExplainProvider();
  const calls: LlmCall[] = [];
  let piece = threePieceFromTranscript(error, index, transcriptName, readSource);
  let locateResult: LocateResult | undefined;

  // The report has no stack frame at all (a plain symptom report): try the general LOCATE stage before giving up.
  // Frames that exist but don't resolve to an agent-edited file keep the original no_frame behaviour untouched.
  if (!piece.frame && error.frames.length === 0) {
    locateResult = await locate({ report: error.message, index, root, ...input.locate });
    // Remap every shortlist line with the shared helper before any quote check or frame is built.
    // An unanchored candidate keeps line 0; it is not passed to the linker at the stale number.
    let chosen: Candidate | undefined;
    for (const cand of locateResult.shortlist) {
      const anchored = verifyAnchoredLine(readSource(cand.file), cand.edit_time_line, cand.text, cand.context_lines, cand.text);
      cand.line = anchored.line;
      cand.anchor = anchored.anchor;
      if (!chosen && anchored.verified) chosen = cand;
    }
    const link = (cand: Candidate) => threePieceFromFrame(error, index, transcriptName, readSource, { file: cand.file, line: cand.line, function: cand.function });
    if (chosen) {
      const linked = link(chosen);
      if (linked.happened) piece = linked;
      else {
        for (const cand of locateResult.shortlist) {
          if (cand === chosen || cand.anchor === "unanchored" || cand.line <= 0) continue;
          const next = link(cand);
          if (next.happened) { piece = next; break; }
        }
      }
    }
  }

  const base = { schema: "why-code-exists/explain-why@1" as const, provider, three_piece: piece, repair: noRepair(), calls, ...(locateResult ? { locate: locateResult } : {}) };

  if (!piece.frame) {
    const reason = locateResult
      ? `no stack frame in the report; the LOCATE stage (deterministic symbol search${locateResult.layer2?.ran ? " + model-assisted search" : locateResult.layer2 ? `, model-assisted search skipped (${locateResult.layer2.reason})` : ""}) found no candidate either`
      : (piece.notes[0] ?? "no stack frame points at a file the agent edited in this transcript");
    return { ...base, stage: "no_frame", reason };
  }

  const source = readSource(piece.frame.file);
  const lineText = source?.split("\n")[piece.frame.line - 1];
  const wrote = lineText !== undefined ? editThatWroteLine(index, piece.frame.file, lineText) : undefined;
  if (!wrote) return { ...base, stage: "no_edit", reason: piece.notes.find((n) => n.includes("not written by")) ?? "no transcript edit wrote the frame line" };

  const ctx = buildExplainContext({
    error, frame: piece.frame, wrote, index, piece, readSource,
    root: usableRoot(root) ? root : undefined,
    locations: locationsFrom(locateResult),
  });
  const contextSummary = { budget: ctx.budget, prompt_user: ctx.prompt.user };

  if (!hasCredentials(provider)) {
    const envVar = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "NVIDIA_API_KEY";
    return { ...base, stage: "no_credentials", context: contextSummary, reason: `no credentials: ${envVar} is not set. The three-piece pieces above are still deterministic output; the "why it broke" stage needs a model call and will not run without a key.` };
  }

  try {
    const raw = await askReasoner(ctx, provider, "explain_why", calls);
    let verified = verifyAnswer(raw, ctx.ground_truth);
    const first = verified;
    let repair: RepairRecord = noRepair();
    let repairAnswer: VerifiedAnswer | undefined;
    const repairReq = buildRepairRequest(verified);
    if (repairReq) {
      repair = { attempted: true, failed_quotes: repairReq.failed.map((f) => ({ kind: f.kind, file: f.file, line: f.line, quote: f.quote, reason: f.reason })), outcome: "still_unverified" };
      try {
        const raw2 = await askReasoner(ctx, provider, "explain_why:repair", calls, repairReq.message);
        const verified2 = verifyAnswer(raw2, ctx.ground_truth);
        repairAnswer = verified2;
        if (verified2.status === "verified") { verified = verified2; repair.outcome = "verified"; }
      } catch {
        // The repair call itself failing does not change the original (unverified) verdict; it is still reported as attempted.
      }
    }
    const adopted = verified !== first;
    const capped = capLocatedAnswer(verified, locateResult);
    return {
      ...base, stage: "ok", context: contextSummary, answer: capped.answer,
      ...(adopted ? { pre_repair_answer: first } : {}),
      ...(repairAnswer ? { repair_answer: repairAnswer } : {}),
      ...(capped.used_candidate ? { used_candidate: capped.used_candidate } : {}),
      ...(capped.confidence_cap ? { confidence_cap: capped.confidence_cap } : {}),
      repair,
    };
  } catch (e) {
    return { ...base, stage: "model_error", context: contextSummary, reason: (e as Error).message };
  }
}

export async function explainWhy(input: ExplainWhyInput): Promise<ExplainWhyResult> {
  const body = await explainWhyCore(input);
  return { ...body, lesson_status: explainLessonStatus(body) };
}
