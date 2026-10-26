/** Shared types for the LOCATE stage (src/locate/). */

/** Coarse role of a path. Non-source roles are down-weighted in layer 1; they are not dropped. */
export type FileRole = "source" | "doc" | "test" | "fixture" | "lockfile";

/**
 * How an edit-time line was placed in the current file.
 * `unanchored` means the added text is gone — the stale line number is not kept.
 */
export type LineAnchor = "exact" | "window" | "unanchored";

export interface Candidate {
  file: string;
  /** Current-file line after content remap. `0` when `anchor` is `unanchored`. */
  line: number;
  /** Edit-time end line of the hunk (last added line), used with `hunk_start` to dedupe overlaps. */
  end_line: number;
  /** The exact line text at the edit-time line, for content remap if line numbers later drift. */
  text: string;
  function?: string;
  /** BM25 score after the file-role weight. Layer 2 leaves this at 0; it did not run BM25. */
  score: number;
  matched_terms: string[];
  /** The transcript line of the edit that wrote this candidate line. */
  edit_line: number;
  tool: string;
  hunk_id: string;
  snippet: string;
  method: "deterministic_bm25" | "agentic_model";
  /** Debug: role assigned from the path. See `role_weight` for the multiplier applied to `score`. */
  role: FileRole;
  /** Debug: multiplicative prior applied to the layer-1 score. `1` for source. */
  role_weight: number;
  /** Source line recorded on the edit, before content remap. */
  edit_time_line: number;
  /** Edit-time first added line of the hunk. With `end_line`, the span used to drop overlapping hunks. */
  hunk_start: number;
  /** Set once remap has run. Absent only when no current file was available yet. */
  anchor?: LineAnchor;
  /** Added lines around `edit_time_line` (edit-time numbers). The window fallback matches these. */
  context_lines?: Array<{ line: number; text: string }>;
}
