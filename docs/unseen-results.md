# LOCATE fix: unseen-set results (pre vs post)

Rule: `docs/unseen-eval-rule.md` (tag `unseen-set-frozen`, addendum at `unseen-adapter-frozen`). Pre-fix code = `locate-frozen` src
+ adapter (`unseen-adapter-frozen`); post-fix code = `locate-fix-frozen` (54e01c9). **One run per config per case, no retries;
every case exited 0.** Runs: 3 configs × 8 unseen × {pre, post} + 3 configs × 15 dev (post) = 93 runs. Dev pre numbers are the
committed `locate-frozen` runs (feb5a60), re-graded by the same script.
Raw outputs: pre `artifacts/unseen/pre/` (c9669c5, branch locate-stage); post `artifacts/unseen/post/`, `artifacts/locate-postfix/` (7a87961, branch locate-fix).
Session interruption: the agent session was interrupted after all runs had finished (every log ended at its last case, no process running),
before outputs were committed. No run was partial, so nothing was discarded or rerun.

Labels: everything below is **tested** (mechanical), except **correct cause**, which is **read** against the fix PR, B-anthropic only
(A and B-nemotron not read). Correct cause now uses the Open Agent Judge's blind grades (`docs/judge/m11.md`); the builder's earlier
read (0 → 3) is kept below only as superseded.

## Unseen set, 8 cases (headline) — top-1 / top-3 / linker / verified pre-repair / verified / grounded
| Config | Pre | Post |
|---|---|---|
| A (layer 1 only) | 0 / 3 / 7 / 0 / 0 / 0 | 2 / 4 / 7 / 3 / 3 / 2 |
| B-nemotron | 0 / 3 / 7 / 0 / 1 / 1 | 2 / 4 / 7 / 1 / 2 / 1 |
| B-anthropic | 0 / 3 / 7 / 3 / 6 / 0 | 2 / 4 / 7 / 6 / 6 / 2 |
| B-anthropic correct cause (judge M11 blind read) | **1** (u02) (+1 partial) | **4** strict (u01, u02, u04, u06); **5** if u05 counts (lenient) |
| (superseded) builder's own read | 0 (+4 partial) | 3 (+2 partial) |

## Python/TypeScript subset, 5 cases (u01–u04, u06)
| Config | Pre | Post |
|---|---|---|
| A | 0 / 2 / 5 / 0 / 0 / 0 | 1 / 3 / 5 / 3 / 3 / 2 |
| B-nemotron | 0 / 2 / 5 / 0 / 1 / 1 | 1 / 3 / 5 / 1 / 1 / 0 |
| B-anthropic | 0 / 2 / 5 / 3 / 5 / 0 | 1 / 3 / 5 / 4 / 4 / 1 |
| B-anthropic correct cause (judge M11 blind read) | 1 (u02) | 4 (u01, u02, u04, u06) |
| (superseded) builder's own read | 0 (+3 partial) | 2 (+2 partial) |

Per case (B-anthropic): pre picks were tests/README-like or wrong source in all 7 linked cases; post picks the fixed file in
u03 (wrong line, wrong mechanism: "circular import" instead of a moved/renamed import), u04, u05, u06 (top-1), u02 top-3.
u07 (fix in a file the agent never edited) is a miss both times, as pre-registered. u08 (Swift) gets no candidate in any run.

## Dev set regression check (14 cases, case05 excluded) — top-1 / top-3 / linker / verified / grounded
| Config | Pre (locate-frozen) | Post |
|---|---|---|
| A | 1 / 2 / 12 / 7 / 1 | 2 / 3 / 14 / 2 / 1 |
| B-nemotron | 1 / 2 / 12 / 6 / 1 | 2 / 3 / 14 / 2 / 1 |
| B-anthropic | 4 / 5 / 13 / 11 / **7** | 5 / 6 / 14 / 8 / **5** |
B-anthropic grounded, pre: 02 03 06 07 09 14 15; post: 02 06 12 14 15 (lost 03, 07, 09; gained 12). case05: not grounded either way.
(Linker counts here come from the grader script; docs/locate-results.md reported 11/14 for A from a hand count.)

## Verdict (pre-registered rule)
The rule needs B-anthropic top-3 AND correct cause to rise on the unseen set, with no dev grounded drop.
- Unseen top-3: 3 → 4 (rises). Unseen correct cause (judge, blind): 1/8 → 4/8, 5/8 if u05 counts (rises).
- Dev grounded (B-anthropic): 7 → 5 (**drops**). Verified also drops on dev in every config (A 7 → 2, B-anthropic 11 → 8).
**Verdict: the fix does NOT pass the pre-registered rule.** Locate itself improved on unseen and dev (top-1/top-3/linker all up),
and unseen cause improved, but grounding and verification on the dev set got worse.
**Diagnosis of the dev grounded drop** (replaces an earlier, wrong guess that the remap's line 0 caused it; tested from saved
reports and grade.txt, no reruns, details in the 2026-10-26 diagnosis):
- **case07**: layer 2 now confirmed a wrong file (`blast_radius/models.py:83`; before, layer 2 failed and layer 1's top `reasoner/base.py:26`
  was used). Quotes verify but sit far from the fix lines, so proximity fails.
- **case09**: layer 2 ran out of steps; the test hunk that ranked first before was down-weighted, and the new top-1 is `evals/run.py:127`,
  because `evals/` is classed as source. Wrong file, proximity fails.
- **case03**: right line area, but the model quoted a multi-line raw-diff fragment (`+    def npv(...`) as its transcript quote; the product
  accepted it, the frozen grader rejected it.
- **case15 was never lost**: grounded before and after. Its `page.tsx:0` entries were only shortlist slots 2–3 (unanchored), not the pick.
- No lost case involved an unanchored remap or line 0. The remap hypothesis is wrong.
- **Run-to-run noise:** the judge re-ran dev case09 (B-anthropic, 54e01c9) and it picked `blast_radius/models.py:138`, a fix line, and was
  grounded. So the 7 → 5 drop is partly noise from one run per config; the FAIL stands under the rule but is weak evidence of regression.
- **Not done, on purpose:** adding `evals/` to the role list (`src/locate/roles.ts`) now would be tuning to dev case09. It was NOT done.

## Caveats
- n = 8 (5 in the subset), one run each, LLM non-determinism; single reader for cause; correct cause read only for B-anthropic.
- Nemotron layer 2 and Anthropic layer 2 never confirmed an answer on the unseen set (all "exhausted 6 tool steps"), so B results
  differ from A only in the explain stage.
- Unseen transcripts are rebuilt from the PR (title/body + diffs), not real agent sessions; repo = fix-PR base sha (disclosed deviation).
- Grader plumbing (`scripts/eval/unseen-gradebundle.py`, case_ prefix in `unseen-grade.py`) was added after the pre runs because the
  frozen grade.py only globs `case*` dirs and needs a rendered transcript.txt; grade.py itself is unchanged and the same plumbing grades pre and post.
- 4/8 cases are litellm; u05/u07 C#, u08 Swift.
