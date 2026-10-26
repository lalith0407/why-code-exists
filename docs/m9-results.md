# M9 results (Sun Oct 25 2026). Restore point: tag `pre-m9-2026-10-25` + snapshots/pre-m9-2026-10-25.tar.gz

Grading of "correct" = the claim names the known root cause of the burned dev case (read by hand, same standard as M8; "strict" counts hedged claims as false).

## 1. Claude Code transcript support (28dab91), tested
`src/session/claude-code.ts` converts Claude Code JSONL to the existing provenance format: one output line per input line, so line numbers are kept. Write, Edit, MultiEdit and Read are replayed into whole-file diffs, errored edits are skipped, and thinking and text are surfaced. It is hooked into `loadTranscript` and `reconstructTree`.
Tests: `npm test` went from 61 to 65, all passing. The real-sample test runs on box transcripts that are not copied into the repo because they hold private data. The edit replay is covered by a labeled SYNTHETIC fixture only, because no real transcript on the box contains an edit.

## 2. Held-out 7, tested
The rule (`docs/heldout7-selection-rule.md`) was committed before the search, and `docs/heldout7-search-log.md` records the search. There are 846 Claude Code transcripts on the box, all from one non-coding project. Their tool calls are only Bash (5) and ReportFindings (19), and none are Write, Edit or MultiEdit. **0 eligible, so nothing was frozen, the `heldout7-frozen` tag was not made, and nothing was run.** No fallback source was added.

## 3. Decoy quality: immediate-return check (v14, 6490ada), tested on dev only
The check already existed (since v12): a no-op mutant, one redraft, then a `decoy_vacuous` downgrade. v14 adds up to 3 redrafts, each told why the previous attempt failed. A decoy that is still vacuous after that is **rejected** (dropped) if at least one non-vacuous decoy remains; otherwise the downgrade is kept.
| run | cases with a vacuous decoy left | repaired/redrafted | rejected | proven: correct / false |
|---|---|---|---|---|
| v13 c,d,e,f (before) | 2,3,4,1 | 1/4,4/9,3/9,4/6 | n/a | 1/1, 2/0, 3/0, 1/1 |
| v14 a,b | 1,1 | 3/5, 3/6 | 0,1 | 2/0, 1/0 |
| v15 a,b | 3,1 | 2/9, 1/5 | 1,2 | 2/0, 2/0 |
Run v14a hit a bug: a rejection without any replacement tripped the "frozen tests changed" assert, which crashed 2 cases. It was fixed before v14b. With n=2 per engine, the proof numbers are noise. The vacuous-decoy count fell from an average of 2.5 to an average of 1.5.

## 4. "X or Y" claims (v15, dfe21e5), tested on dev only
Before writing the claim, the claim writer must fill in `candidate_causes` (each with an evidence line) and commit to ONE `chosen_cause`. Up to 2 re-asks are allowed on multiple causes. No words are matched.
vote-race: v13 runs were mechanism_mismatch, patch_ineffective, proven (correct), and proven (false, "or" claim). v14b was claim_not_single_cause. **v15a and v15b were proven with a concurrency-only claim (1 atom) both times, so 2/2 correct.**
Cost: in v15b, caps-unknown became claim_not_single_cause because the atom parse split one guard used in two loops into 2 causes, so a correct claim was lost. Totals: v15a 2 correct / 0 false; v15b 2 correct / 0 false (vote-race and stop-minhold).
Run notes: running 2 suites in parallel caused Nemotron http_429 on every case. Those runs are in `artifacts/m9-v15b-429-discarded*` and are not counted. v15b was rerun case by case. In v15b, swing-batch crashed on unparseable patch JSON (degenerate generation; this is known from M8 and not fixed).

## Totals
Held-out total is unchanged: **2/15 proven, 0 false** (no held-out 7). Dev false proofs under v14 and v15: 0 across 4 runs.
