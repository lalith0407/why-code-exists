# Held-out set 4: success criteria (written and committed before any run)

Source: trading-agent-system (Python), transcript `bc-a98b50df`, repo checkout `/workspace/trading-agent-system`. Every bug is in code
written by that agent session (provenance: `guard_orders` and `enforce_caps` are introduced at transcript L108, each modified by 2 later edits)
and is still in the final code. Each was confirmed by running the real code (`src/bin/capture-error.ts`; the values in each `error.json`
come from that run). None was planted.

**Disclosures**
- The builder picked these bugs after reading the code, and knows the engine. They were never looked at during engine development; the
  engine (gen-v9) was committed before selection began.
- Two cases (`swing-batch`, `stop-minhold`) sit in `guard_orders`, the same function as held-out-2 `drawdown-penny`. The bugs are different
  lines and different mechanisms.
- Both frame functions were introduced by a transcript edit, so these cases do **not** exercise the new fallback attribution
  (that was checked only on dev cases: heldout3 plan-injection and schema-target).
- OpenAI credits are exhausted (HTTP 429 `insufficient_quota`, checked 2026-10-24 ~21:00 PT), so every role runs on Nemotron
  (`nvidia/nemotron-3.5-lightning-30b-a3b`): claim, tests, patch **and** the mechanism gate. The gate is therefore not a different model
  from the test writer in this set.
- Only 3 cases. Finding more genuine, not-yet-used agent-written bugs would need more reading time; none were fabricated to make up a number.

| case | frame given to engine | ground-truth cause (hidden from engine) | success = |
|---|---|---|---|
| heldout4-swing-batch | `guard_orders` (src/ta/harness/caps.py) | `swings_this_quarter` is counted once before the order loop and never incremented as swing exits are kept, so several full exits in one batch all pass when the quarter has 1 slot left (spec: swing trades ≤ N per quarter) | claim names the per-batch count not being updated / cap checked against a stale count; verdict proven_false |
| heldout4-stop-minhold | `guard_orders` | the min-hold exemption only covers `cap_reduction`/`holdings_cap`; a `stop` sell (a hard trigger in `portfolio_tools._HARD_REASONS`, and the agent wrote "A stop-loss sell is treated as a hard trigger, so it is not blocked by the minimum-hold check") is dropped inside the minimum hold | claim names stop-loss (hard-trigger) sells missing from the min-hold exemption; proven_false |
| heldout4-caps-unknown | `enforce_caps` (src/ta/harness/caps.py) | tickers with no `NameMeta` are skipped by every cap check (`if ticker not in meta: continue`), so an unknown ticker passes with any weight and `ok=True` (fail-open) | claim names missing-metadata names bypassing the caps (fail-open); proven_false |

A case succeeds only if the verdict is `proven_false`, the gate is consistent, **and** the claim matches the ground-truth cause. No partial
credit. Zetaris confirmation is reported separately and is not required. Each case runs exactly once on tag `heldout4-frozen`; no engine
change between runs; results go to `docs/heldout-results.md` whatever they are.
