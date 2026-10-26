# Explain-why stage results (product, frozen rule `explain-stage-frozen`)

Run 2026-10-25 ~10:15 PM PT, once per provider, under `docs/explain-stage-eval-rule.md`. Outputs:
`artifacts/explain-stage/<provider>/caseNN/`. No retries were needed (no network errors).
Tested: linker stage, verifier status, grade.py. Read: correct cause, belief.

## Headline
**The product's linker found an edit in only 2 of 15 cases** (case02, case14), the two whose v4 reports carry a real
stack trace. The other 13 plain user reports have no `file:line`, so the stage stopped at `no_frame`, which counts as a
miss under the rule. On the two cases it reached, both providers named the correct cause.

| case | linker found edit | Nemotron verified (pre→post repair) | Nemotron correct | Nemotron grounded | Nemotron belief | Anthropic verified | Anthropic correct | Anthropic grounded | Anthropic belief |
|---|---|---|---|---|---|---|---|---|---|
| 01, 03–13, 15 | no (`no_frame`) | – | no | no | no | – | no | no | no |
| 02 vote-race | yes (feedback.ts:106) | no → no (repair attempted, still unverified) | yes (check-then-create race) | no (transcript quote L123 is a tool-output block, not a substring) | no | yes (no repair) | yes | yes | partly (L121 states the check-then-create design) |
| 14 macro-leapday | yes (replay.py:322) | yes (no repair) | yes (Feb 29 `replace(year-5)`) | yes | no (quotes the code line as echoed in the transcript) | yes | yes | yes | no (code echo + "Adding `_refresh_macro`…") |

## Totals
| | Nemotron (headline) | Anthropic claude-sonnet-4-5 (secondary) |
|---|---|---|
| Linker found the edit | 2/15 | 2/15 |
| Verified, before repair | 1/15 | 2/15 |
| Verified, after repair | 1/15 (1 repair attempted, failed) | 2/15 (no repairs) |
| Correct cause | 2/15 | 2/15 |
| Grounded (frozen v4 grade.py, path-normalized) | 1/15 | 2/15 |
| Correct and grounded | 1/15 | 2/15 |
| Belief quoted yes / partly / no | 0 / 0 / 15 | 0 / 1 / 14 |

## Comparison
- Product baseline (three pieces, hand-graded "explains why"): 2/15. The new stage gives the same 2/15 on these plain
  reports, now with a model-stated cause (1/15 correct and grounded on Nemotron, 2/15 on Anthropic). It does not yet
  beat the baseline. Different cases and inputs, so this isn't a like-for-like comparison.
- Outside feasibility spike (not the product, Cursor cloud agent on Claude Sonnet 5): 13/15 correct cause on the same
  reports. The gap is almost entirely localization: the spike searched the code itself, while the product needs a
  stack frame to find the edit.
- Where the stage did run, it named the right cause 4 of 4 times (2 cases × 2 providers).

## Caveats
- Input adaptation (frozen before the run): the reports were wrapped as JSON with a generic `file:line` regex, and the
  source JSONL was used instead of the rendered `transcript.txt` (same session, same `Lnnn` numbers).
- `llmJson` has its own single re-ask on invalid JSON. It's part of the product and wasn't triggered in these calls
  (each case logged 1 call, plus 1 repair call for Nemotron case02).
- "Verified" needs only 1 code and 1 transcript quote to check out. Nemotron case02's repair reply verified its
  transcript quote but not its code quote, which was a 3-line block cited to a single line.
- Cases 02 and 14 are the two whose reports give the fix line in a stack trace (see the v4 leakage notes), so they are
  the easiest cases.
- n=15, one run, dev cases. One grader for cause and belief.
