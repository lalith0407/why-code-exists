/**
 * LOCATE stage: turns a plain symptom report (no stack frame) plus a source tree plus the agent session into
 * ranked candidate file:line locations. Two layers, each measured separately:
 *   1. Deterministic symbol search (score.ts) — always runs, no model, no network.
 *   2. Model-assisted agentic search (agentic.ts) — optional, only runs when enabled and credentials exist for
 *      the selected provider; its answer is still deterministically checked before being trusted.
 * The shortlist (layer 2's confirmed answer first, else layer 1's top-scored hunks, at most three distinct
 * hunks) is handed to the explain pipeline. `picked` is shortlist[0], the same primary the linker uses.
 * Every candidate and every layer-2 tool call is kept on the result for the report to show.
 */
import type { TranscriptIndex } from "../session/transcript.js";
import { buildEditIndex } from "./edits.js";
import { buildSymbolIndex, listSourceFiles } from "./symbols.js";
import { scoreEditedHunks } from "./score.js";
import { agenticLocate, selectLocateProvider, type AgenticLocateResult, type LocateProvider } from "./agentic.js";
import { readRepoFile, remapEditLine } from "./remap.js";
import { buildShortlist } from "./shortlist.js";
import type { Candidate } from "./types.js";

export interface LocateResult {
  schema: "why-code-exists/locate@1";
  report: string;
  terms: string[];
  layer1: { symbols_indexed: number; edited_hunks_indexed: number; candidates: Candidate[] };
  layer2?: AgenticLocateResult;
  /**
   * Top distinct candidates for the explain stage: layer-2 confirmed pick first (when it confirmed one),
   * then layer-1 rank. Overlapping hunks are collapsed. At most three.
   */
  shortlist: Candidate[];
  /** `shortlist[0]`. Kept so existing callers still have a single primary location. */
  picked?: Candidate;
  method: "layer1_deterministic" | "layer2_agentic" | "none";
}

export interface LocateInput {
  report: string;
  index: TranscriptIndex;
  /** Checked-out / reconstructed source tree root. Required for both layers (layer 1 needs it for the symbol index). */
  root?: string;
  topK?: number;
  /** Default: WCE_LOCATE_LAYER2 env var != "0". */
  enableModel?: boolean;
  provider?: LocateProvider;
  maxModelSteps?: number;
  fetchImpl?: typeof fetch;
}

export async function locate(input: LocateInput): Promise<LocateResult> {
  const hunks = buildEditIndex(input.index);
  const files = input.root ? listSourceFiles(input.root) : [];
  const symbols = input.root ? buildSymbolIndex(input.root, files) : [];
  const { terms, candidates } = scoreEditedHunks(input.report, hunks, symbols, input.topK ?? 10);

  // Content-remap edit-time lines onto the tree before anything downstream treats `line` as current.
  if (input.root) {
    for (const c of candidates) {
      const mapped = remapEditLine(readRepoFile(input.root, c.file), c.edit_time_line, c.text, c.context_lines);
      c.line = mapped.line;
      c.anchor = mapped.anchor;
    }
  }

  const result: LocateResult = {
    schema: "why-code-exists/locate@1",
    report: input.report,
    terms: [...new Set(terms.map((t) => t.text))],
    layer1: { symbols_indexed: symbols.length, edited_hunks_indexed: hunks.length, candidates },
    shortlist: [],
    picked: undefined,
    method: "none",
  };

  const enableModel = input.enableModel ?? (process.env.WCE_LOCATE_LAYER2 ?? "1") !== "0";
  if (enableModel && input.root) {
    const provider = input.provider ?? selectLocateProvider();
    result.layer2 = await agenticLocate({ report: input.report, root: input.root, hunks, provider, maxSteps: input.maxModelSteps, fetchImpl: input.fetchImpl });
  }

  result.shortlist = buildShortlist(candidates, result.layer2?.candidate);
  result.picked = result.shortlist[0];
  result.method = result.layer2?.candidate ? "layer2_agentic" : result.picked ? "layer1_deterministic" : "none";
  return result;
}
