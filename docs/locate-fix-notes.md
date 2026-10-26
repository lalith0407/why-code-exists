# LOCATE fixes

Baseline is the unpacked snapshot (`846cce8`). This note covers the three general fixes in `src/locate/`, plus the explain-stage wiring that consumes them. No evaluation set shipped with the snapshot, and none was run. No LLM API was called; tests mock `fetch` or stop before the reasoner.

## What changed

**File-role weighting (layer 1).** `classifyFileRole` labels a path as `source`, `doc`, `test`, `fixture`, or `lockfile` from the extension and common directory names (`*.md` / `*.rst` / `*.txt`, `docs/` and `guides/`, `test` / `tests` / `__tests__` / `spec` / `e2e`, `*_test.*` / `*.test.*` / `*.spec.*` / `test_*`, `fixture(s)` / `__fixtures__` / `*.fixture.*`, and generated lockfile basenames). `scoreEditedHunks` multiplies the BM25 score, including the literal-phrase bonus, by that role's weight. Source stays at 1. A zero score is still dropped, so a doc or test is returned when it is the only match. Each candidate carries `role` and `role_weight`.

**Content remap.** `remapEditLine` is the shared helper. It looks for an exact copy of the added line and keeps the occurrence nearest the edit-time line (ties break to the earlier line). If that misses, it looks for a whitespace-normalised window of neighbouring added lines (`REMAP_WINDOW`). If nothing matches, the candidate is `unanchored` and `line` is 0 — the stale number is not kept. Layer 1 runs this when a repo root is available. Layer 2 projects every hunk onto the current file *before* `wasWrittenByAgent`, and `list_edits` shows those current lines, so a shifted line can confirm and a deleted one cannot. The explain pipeline calls `verifyAnchoredLine` (same helper) before it builds a frame or checks quotes. An unanchored shortlist entry is not handed to the linker.

**Top 3 and confidence.** `buildShortlist` keeps at most three distinct candidates: the layer-2 confirmed pick first, then layer-1 rank, dropping hunks whose edit-time spans overlap. The explain prompt includes them as labelled `candidate_locations`, and the reasoner may quote any of them. `matchUsedCandidate` records which label the verified code quote landed on. Confidence is capped by `capConfidence` in `src/explain/confidence.ts` (never raised above the model's self-report). The formula is in the comment on that function. In short: unverified quotes, or a missing / unanchored remap, force `low`; a layer-1 margin below `CLEAR_MARGIN` forces at most `medium` even when layer 2 confirmed the line; an exact anchor with a clear margin and verified quotes is `high`; a window-only anchor reaches `high` only when layer 2 also confirmed and the margin is clear.

The "Save changes" wording in `terms.ts` replaces the old UI-label example. New tests live in `tests/locate-fixes.test.ts` and use invented paths and reports.

## Constants

| Constant | Value | Why it is generic |
| --- | --- | --- |
| `DOC_ROLE_WEIGHT` | 0.1 | Prose often repeats the report sentence. A tenth keeps a real source hit ahead of that echo. |
| `TEST_ROLE_WEIGHT` | 0.1 | Tests name the symbols they exercise, so they echo the report more loudly than the cause. |
| `FIXTURE_ROLE_WEIGHT` | 0.1 | Fixtures are canned data that copy labels and field names out of the report. |
| `LOCKFILE_ROLE_WEIGHT` | 0.05 | Lockfiles are generated dependency inventories; a name hit there is not the edited logic. |
| `REMAP_WINDOW` | 3 | Three adjacent added lines identify a shifted hunk, and stay short enough not to glue unrelated copies together. |
| `SHORTLIST_SIZE` | 3 | Three distinct locations show a near-tie without a long explain prompt. |
| `CLEAR_MARGIN` | 0.25 | Relative `(s1-s2)/s1` below which two layer-1 hunks are a near-tie. Smaller BM25 gaps are document-length noise. |
| `USED_CANDIDATE_LINE_SLOP` | 20 | Matches the explain code window, so a quote inside the shown hunk still counts as that candidate. |
| candidate window | 5 lines | A few lines around a labelled candidate is enough to copy a quote; the primary edit window stays larger. |

`LOCKFILE_BASENAMES` is matched on the lowercased basename: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `npm-shrinkwrap.json`, `cargo.lock`, `gemfile.lock`, `poetry.lock`, `composer.lock`, `go.sum`, `pipfile.lock`, `bun.lock`, `bun.lockb`. Those names are toolchain conventions, not project paths.

A lone positive layer-1 hit has margin 1 (no rival to tie with). Margin is computed on role-weighted scores after overlap dedupe.

## Trade-offs

- The 0.1 prior means a doc, test, or fixture needs about ten times the raw BM25 score to outrank a source hunk. A source line that shares only a few identifiers can beat a README that restates the report. That is the point of the prior. A non-source hunk still wins when every source hunk scores zero.
- A rewritten line (not merely shifted or reindented) becomes `unanchored` and is not linked. The alternative was to keep pointing at the old line number.
- Whitespace-only drift anchors as `window`, which caps confidence at `medium` unless layer 2 confirmed that line and the layer-1 margin is clear.
- A near-tie stays at most `medium` even if layer 2 confirmed the line and the model said `high`.
- The cap never lifts a model's `low`.
- Overlap dedupe uses edit-time spans. Two non-overlapping hunks in the same file both stay.
- After a shift, layer 2 accepts the current line and rejects the old edit-time line. `list_edits` shows the remapped numbers so the model is not handed the stale ones.
- Role and weight are fields on the candidate. The HTML report table was not changed.
- Two provenance tests read an external transcript that this snapshot does not include. They failed on the baseline (`Transcript not found`). They now skip when that file is absent, the same way the Claude Code sample tests already skip. They still run if `WCE_TRANSCRIPT` points at a file.

## Not done

- No recall or precision against held-out reports. Those inputs were stripped, and the brief says not to run an evaluation.
- The confidence thresholds were not fit to labelled cases. They are the generic rules above.
- The HTML locate table does not show `role` or `role_weight`.

## Review by Grok Bot before freezing (read)
- Grepped every added line in src/ and tests/ for names from the 15 dev cases and the 8 unseen cases (repos, paths, symbols, report words): no matches.
- Constants are generic file-role conventions. Disclosed: `guides/` is in the doc-role list; a dev case (case10) has a `guides/` pick. The brief asked for it by name as a general convention.
- `tests/provenance.test.ts`: two tests now skip only when the external transcript is missing; on this box it exists, so they still run.
- New tests (tests/locate-fixes.test.ts) use invented paths and reports. The patch's README rewrite was not applied (the snapshot README had been stripped).
- `npm test`: 152 pass, 0 fail, 0 skipped (tested). `tsc --noEmit` clean.
