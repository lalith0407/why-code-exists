# M11 results (Sun Oct 25 2026). Restore point: tag `pre-m11-2026-10-25` + snapshots/pre-m11-2026-10-25.tar.gz
Engine: gen-v17-harness-robust. Dev only; each suite was run one case at a time. Grading is the same as in M8–M10 (claim vs. the known root cause, read by hand).

## Changes (tested by unit tests: 71/71 + 6 in find-text.test.ts)
1. **Nemotron mechanism gate (d64978d).** Its second attempt now uses the same invalid-JSON retry as llmJson (varied seed plus an "invalid output" notice, alongside the larger token budget).
2. **Harness errors (a94b292):**
   - **Repro without harm_observed:** up to 5 test drafts. The model review runs on the first 2; later drafts fix static issues only, so a structurally invalid repro is no longer frozen.
   - **Python unexpected indent:** a stray-indented line is re-aligned to the previous line (never under a block opener), re-checked with the real parser. Applied to setup and tests before the lock, and to setup after each repair.
   - **Patch find text:** if there is no exact unique match, a whitespace-normalized unique line match uses the file's ACTUAL text, verified unique; non-whitespace differences are refused. Otherwise the nearest actual text is sent back as feedback (main and rival patch).

## Dev before (v16) / after (v17)
| run | harness_error | crash (exit 1) | proven correct / false | notes |
|---|---|---|---|---|
| v16a | 3 | 0 | 1 / 0 | |
| v16b | 3 | 1 (mechanism gate json_parse_error) | 2 / 0 | |
| v17a | 1 (webhook-block: harness tried to stub `node:http`, a different failure type) | 0 | 1 / 0 (caps-unknown) | vote-race claim_not_single_cause |
| v17b | 0 | 1 (swing-batch: draft_tests runaway newlines, the retry also failed) | 2 / 0 (vote-race, caps-unknown) | |
- Harness errors went from 6 to 1 across 2 runs each, and none of the 3 targeted types recurred. The new repair paths did not visibly fire in these runs (indent fixes 0, whitespace find 0, mechanism retry 0). So most of the drop is probably the extra static redrafts or chance: **cause attribution is unproven**.
- caps-unknown is proven again (2/2, single cause), recovering the case lost in v15b.
- False proofs: 0. Dev false proofs since v14: 0 across 8 runs.
- Still open: runaway JSON can survive the single retry (swing-batch v17b); patch_ineffective is 5–8 per run.

## Totals
Held-out unchanged: **2/15 proven, 0 false**.
