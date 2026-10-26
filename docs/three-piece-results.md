# Three-piece explanation: coverage on the DEV set (TESTED, 2026-10-25 PDT)

Engine: `src/story/three-piece.ts` (deterministic, no LLM, no network). Runner: `scripts/three-piece-all.sh` → `artifacts/three-piece/`.
Tests: `tests/three-piece.test.ts` (5 pass). These 15 cases were earlier used as held-out sets for the old engine. For this linker they're a DEV set: the linker was improved on them (6/15 → 12/15). Their errors were written by us and name the culprit file:line. Explanatory grading: docs/explanatory-grades.md.

The three pieces:
1. **Asked**: latest human-written user message before the edit (tool/system notifications in the user channel are skipped), and its paragraph most related to the written code, quoted verbatim.
2. **Understood**: the agent's last message before the edit, quoted in full. Marked invalid if it has fewer than 15 words (a silent edit).
3. **Happened**: the error, the first stack frame in a file the agent edited, the exact source line at that frame, and the transcript edit whose added lines contain that exact line. The last such edit wins, so later line shifts don't break the link.

"Valid citation" means the quote is a substring of the cited transcript line, and the frame line text equals an added line of the cited edit.

## Result (dev): 12 / 15 have all three pieces present (13/15 linked)

| case | asked | understood | happened | complete |
|---|---|---|---|---|
| heldout-vote-race | ok | ok | ok | ✅ |
| heldout-xirr-short | ok | ok | ok | ✅ |
| heldout2-drawdown-penny | ok | ok | ok | ✅ |
| heldout2-webhook-block | ok | ok | ok | ✅ |
| heldout2-webhook-case | ok | ok | ok | ✅ |
| heldout3-retype-unique | ok | ok | ok | ✅ |
| heldout4-caps-unknown | ok | ok | ok | ✅ |
| heldout4-stop-minhold | ok | ok | ok | ✅ |
| heldout4-swing-batch | ok | ok | ok | ✅ |
| heldout5-citation-leaf | ok | ok | ok | ✅ |
| heldout5-macro-leapday | ok | ok | ok | ✅ |
| heldout6-outcome-keys | ok | ok | ok | ✅ |
| heldout-slack-multiline | ok | **silent edit** (8 words: "Now let's build the Slack events API route.") | ok | ❌ |
| heldout3-plan-injection | – | – | – | ❌ frame line was not written in this transcript (pre-existing code) |
| heldout3-schema-target | – | – | – | ❌ same |

First version (function-level anchor from `findProvenance`): 6/15. Seven cases failed because later edits had shifted the function's line numbers. That was fixed at the root by anchoring on the frame line's text, not on line numbers. This is a generic change, not a per-case rule.

## Honest limits (read before quoting the number)
- **11 of the 13 linked frames point at a function definition line** (`def …` / `export function …`), because that's how these case errors record the frame. So for those cases, "exact line" really means "exact function". Only vote-race and one other point at a statement line.
- **Understood is the whole preceding message, not a pinpointed sentence.** Some are long (caps-unknown: 5,251 words). Pinpointing the belief sentence needs the LLM step (`reframe_belief`), which quotes verbatim and is string-checked, but it wasn't part of this deterministic count.
- **Asked is often the session's original build prompt.** These sessions have only one or two human messages, so the ask is broad ("Build Pulseboard…"). The deterministic step picks the most related paragraph, which is relevant but not always specific.
- The gap between 2 and 3 (the explanation) is written by a model or a human reading the three pieces. The count above covers the cited evidence only, not the quality of the explanation.

## litellm (real public case, GitHub provenance): partial
`artifacts/three-piece/litellm-video-hook.json`, built from the saved provenance in `artifacts/reframe/litellm-r4-openai/report.json`.
- Asked: PR #42354 description (written by Devin; the human's original prompt isn't public). Valid.
- Understood: Devin's commit message, verbatim ("…CallTypes did not know… Add the video call types…"). Valid.
- Happened: the error text is from the fix PR #42535. It's a text-only error with no stack trace. The engine picked the **right PR (#42354)** but the **wrong file** (`litellm/llms/openai/videos/guardrail_translation/__init__.py`). Ground truth: `litellm/types/utils.py` CallTypes plus the hook in `litellm/utils.py`. So the PR-level link is correct and the line-level link isn't. The automatic `complete=true` flag is too generous here; counted as **partial**.
