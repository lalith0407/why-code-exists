# M10 results (Sun Oct 25 2026). Restore point: tag `pre-m10-2026-10-25` + snapshots/pre-m10-2026-10-25.tar.gz

All dev suites were run one case at a time (no parallel suites), so there were no Nemotron 429s. Grading uses the same standard as M8/M9: correct means the claim names the known root cause of the burned dev case (read by hand).

## 1. Cause splitting by fix concept (gen-v16, 120418a), tested on dev
The cause-splitting step now writes each cause's `fix_concept` (the change, stated independently of where it is applied) and lists its `sites`. The rule is that one fix concept applied at several sites is ONE cause. No phrase matching is used.
| engine/run | claim_not_single_cause | caps-unknown | vote-race | proven correct / false |
|---|---|---|---|---|
| v15a | 0 | proven | proven | 2 / 0 |
| v15b (before) | 1 (caps-unknown: one guard in 2 loops split into 2 causes) | claim_not_single_cause | proven | 2 / 0 |
| v16a | 0 | not_reproduced, 1 cause | proven (concurrency) | 1 / 0 |
| v16b | 0 | crashed (Nemotron mechanism gate json_parse_error), cause step not reached | proven (concurrency) | 2 / 0 (vote-race, webhook-block) |
The over-split no longer occurred (0/2 runs), and vote-race stayed a single cause. caps-unknown was not re-proven in either v16 run, because its repro did not reproduce in one run and the gate crashed in the other. So the fix is shown not to over-split, but the lost proof has **not** been recovered.

## 2. Invalid/runaway JSON (70c174a), tested
On unparseable output, `llmJson` now retries once with a different seed and a system note that the previous answer was invalid and must be concise. If the retry also fails, it still fails visibly. A unit test covers this; the suite went from 65 to 66 passing.
swing-batch before: crashed in M8 v13f and M9 v15b on unparseable patch or probe JSON. After: v16a hit the retry (`patch:openai:invalid_json_retry`), recovered, and reached a verdict (not_reproduced); v16b reached patch_ineffective without needing a retry. Crashes went from 2 in 4 earlier runs to 0 in 2.
**Not covered:** the Nemotron mechanism gate parses JSON on its own path (`json_parse_error`) and has no retry. It crashed caps-unknown in v16b.

## Totals
v16 dev: 1/0 and 2/0 (correct/false). Dev false proofs since v14: 0 across 6 runs. Held-out total is unchanged: **2/15 proven, 0 false** (no new held-out set).
Recurring non-v16 failures: harness_error (repro missing harm_observed, Python setup indent, patch find-text not verbatim) 3 per run; patch_ineffective 4–6.
