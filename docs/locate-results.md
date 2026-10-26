# LOCATE stage results (run under tag `locate-frozen`)

Rule: `docs/locate-eval-rule.md` (frozen before any live call). One run per config, no retries were needed.
Outputs: `artifacts/locate/{A,B-nemotron,B-anthropic}/caseNN/`; grading: `scripts/eval/locate-grade.py`
(writes `locate-grade.json`, `grade.txt` = frozen v4 grade.py on final answers, `grade-pre.txt` = before repair).

Labels: **tested** = locate hit, linker, verified, grounded (mechanical). **read** = correct cause (my single read against the
ground-truth mechanisms). Belief was not graded separately from correct cause. Every answer is marked `confidence: high`
(case15 Anthropic: medium) whether or not it is right, so self-reported confidence carries no signal.

**case05 is contaminated** (the example report given to Cursor while it wrote LOCATE paraphrases it). It is excluded from the headline and shown separately.

## Headline (14 cases, excluding case05)

| Metric | A: layer 1 only | B-nemotron (headline B) | B-anthropic (secondary) |
|---|---|---|---|
| Locate top-1 hit (of 12 frameless cases) | 1/12 | 1/12 | 4/12 |
| Locate top-3 hit (of 12) | 2/12 | 2/12 | 5/12 |
| Linker found the edit | 11/14 | 11/14 | 13/14 |
| Verified, before → after repair | 4 → 7 /14 | 4 → 6 /14 | 9 → 11 /14 |
| Grounded (frozen grade.py), before → after | 0 → 1 /14 | 0 → 1 /14 | 6 → 7 /14 |
| Correct cause (read) | 3/14 (+1 partial) | 3/14 (+1 partial) | 5/14 (+1 partial) |

All 15 cases: same, plus case05. A and B-nemotron miss case05 (README pick, no_edit). B-anthropic gets locate top-1, correct cause, and a verified/grounded fail, so all-15 correct cause is 6/15.

**B-nemotron = A.** Nemotron's layer 2 ran on all 13 frameless cases and in every one ended with "exhausted 6 tool steps without a confirmed answer". So it fell back to the layer-1 pick, and LOCATE output matches A exactly. The explain-stage numbers differ a little (verification), only because reasoning is non-deterministic.

## Per case (top-1 / top-3 hit; final verified; grounded; correct cause)

| Case | A pick | A t1/t3 | A ver/gr/cause | B-nem ver/gr/cause | B-anth pick | B-anth t1/t3 | B-anth ver/gr/cause |
|---|---|---|---|---|---|---|---|
| 01 | README.md:167 | N/N | no_edit | no_edit | lib/slack.ts:45 (L2) | Y/Y | no_edit (picked line not written by a parsed edit) |
| 02 | frames | n/a | N/N/Y | N/N/Y | frames | n/a | Y/Y/Y |
| 03 | metrics.py:43 | N/N | N/N/N | Y/N/N | metrics.py:42 (L2) | N/N | Y/Y/N (blames annualization, not the 5.0 clamp) |
| 04 | README.md:172 | N/Y | Y/N/N | Y/N/N | README.md:172 | N/Y | N/N/N |
| 05* | README.md:4 | N/N | no_edit | no_edit | feedback.ts:58 (L2) | Y/Y | N/N/Y |
| 06 | README.md:144 | N/N | no_edit | no_edit | validations.ts:46 (L2) | Y/Y | Y/Y/Y |
| 07 | base.py:26 | Y/Y | N/N/Y (quoted name breaks f-string SQL) | N/N/Y | base.py:26 | Y/Y | Y/Y/N (invents a "removed early return") |
| 08 | tests/test_guarded_kinds.py:111 | N/N | Y/N/N | Y/N/N | same | N/N | N/N/N |
| 09 | tests/test_guarded_kinds.py:176 | N/N | N/N/N | N/N/N | models.py:85 edit-time (L2; re-anchors to another line) | N/N | Y/Y/Y (_name returns schema identifier) |
| 10 | guides/risk_manager/v1.md:15 | N/N | Y/N/N | Y/N/N | same | N/N | Y/N/N |
| 11 | portfolio_tools.py:145 | N/N | Y/N/N | Y/N/N | same | N/N | Y/N/partial (stop not exempted, wrong gate) |
| 12 | tests/test_churn.py:269 | N/N | Y/N/N | N/N/N | same | N/N | Y/N/N |
| 13 | loop.py:214 | N/N | Y/N/N | N/N/N | same | N/N | Y/N/N |
| 14 | frames | n/a | Y/Y/Y | Y/Y/Y | frames | n/a | Y/Y/Y |
| 15 | app/work/[slug]/page.tsx:47 | N/N | N/N/partial | N/N/partial | selected-work.tsx:69 (L2) | Y/Y | Y/Y/Y (key={outcome.detail} duplicates) |

## Comparison
- Explain stage alone (no LOCATE): correct cause 2/15 (only case02 and case14, which have frames).
- With LOCATE: A or B-nemotron 3/14; B-anthropic 5/14 (6/15 including the contaminated case05). Layer 1 alone adds one case (07).
- Outside feasibility spike (cloud agent, not the product): finds the edit 13/15. Product LOCATE with B-anthropic gets a top-1 hit on the edited line in 4/12 frameless cases (5/13 with case05). It is still well below the spike.

## Caveats
- Layer 1 ranks README, guides and tests hunks above source (6 of 13 layer-1 picks are docs or tests). The candidate universe is every agent-edited hunk, with no source preference. This is the main failure mode.
- Nemotron layer 2 never produced a confirmed answer, so the agentic layer only helps with Anthropic. I did not diagnose whether the cause is the confirm check (edit-time vs current line numbers) or model behaviour.
- Layer 2 confirms against edit-time line numbers. case09's pick is an edit-time line that re-anchors far from the anchor, and case01's correct pick still ended no_edit.
- Only the top-1 candidate goes to the explain stage. Top-3 hits (case04) don't help.
- n=15 dev cases, contamination on case05, a single reader for correct cause, one run per config.
- Reviewed (read): no per-case words, stubs or fake success. The stopwords are generic. The capitalized-phrase +4 rule and the ms/s unit list are disclosed in the rule.
