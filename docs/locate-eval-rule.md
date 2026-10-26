# LOCATE stage: eval rule (frozen before any run)

Written 2026-10-25 PT, before any run of the LOCATE stage on eval inputs. Tag: `locate-frozen`.
Code under test: branch `locate-stage` = `explain-stage` + Cursor's LOCATE patch (9227de8), applied cleanly.
No code, prompt or threshold changes after this tag.

## Contamination: case05
The example report Lalith gave Cursor ("Submit feedback spins ~5 seconds when the webhook endpoint is slow")
paraphrases case05, and Cursor's test fixture uses it. **case05 is contaminated.** It is run and reported
separately and **not counted in the headline**. Headline = out of 14 (case05 excluded); out of 15 is also shown.
Code review (before the run, read): no fixture word (submit, feedback, webhook, endpoint, slow, spin) appears in any
list or in the scoring. The stopword list is generic function words only. Two generic choices plausibly shaped by
the example are disclosed: the capitalized-phrase rule (comment cites "Submit feedback") with a +4 literal bonus,
and the unit list in the number regex (ms/s/seconds/...).

## Inputs
Identical to `docs/explain-stage-eval-rule.md`: the v4 report wrapped by `scripts/eval/report-to-error.mjs`, `--repo
v4/x/caseNN/src`, and the source session JSONL that `transcript.txt` was rendered from. No ground truth, no hints.
LOCATE runs only when a report has zero frames, which is the product's behavior. case02 and case14 keep their stack frames.

## Configs, one run each (`scripts/eval/locate-eval.sh <config>`)
- **A**: LOCATE layer 1 only (deterministic, `--no-locate-model`). The explain stage still uses Nemotron, because
  verified, cause and belief need it.
- **B-nemotron (headline B)**: layer 1 + layer 2 agentic (Nemotron, default 6 steps); explain stage on Nemotron.
- **B-anthropic (secondary)**: layer 2 and explain stage on Anthropic (`ANTHROPIC_MODEL` default).
At most 1 retry per case, only for a network error, disclosed. Outputs: `artifacts/locate/<config>/caseNN/`.

## Metrics per case
- **Locate hit top-1 / top-3**: the picked candidate (top-1) or any of the top 3 (layer-2 pick, if any, followed by
  layer-1 ranks) is in the anchor's file (path suffix match) and within 10 lines of a frozen v4 anchor line
  (`fix-lines-v4.json`). The candidate line is re-anchored to the current file by its exact text, nearest occurrence,
  as the product does. N/A for case02 and case14 (they have frames; scored by whether the linker used the frame).
- **Linker found the edit**: stage is past `no_frame`/`no_edit`.
- **Verified**: product status, before and after repair.
- **Correct cause** (read, against ground-truth/), **grounded** (frozen grade.py + fix-lines-v4.json, same
  path normalization as before), **belief quoted** (yes/partly/no).
- Compare: explain-stage alone 2/15, outside spike 13/15 (not the product).
