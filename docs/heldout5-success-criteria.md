# Held-out set 5: success criteria (written and committed before any run)

Source: trading-agent-system (Python), transcript `bc-a98b50df`, repo checkout `/workspace/trading-agent-system`. Both bugs are in code
written by that agent session (the function definitions appear in transcript edits: `_refresh_macro` 39 mentions, `_keep_after_reopen` 11) and
are still in the final code. Each was found by reading files not read before (`src/ta/replay.py`, `src/ta/agents/loop.py`; `store.py` and
`data_audit.py` were also read, and nothing confirmable was found there in the time available) and confirmed by running the real code
(`src/bin/capture-error.ts`; each `error.json` holds values from that run). None was planted.

**Disclosures**
- The builder picked these bugs after reading the code, and knows the engine. The engine used is the one tagged `heldout5-frozen` (gen-v11f, f840c4c);
  the bugs were not looked at during engine development, and engine work after the bugs were found (gen-v11e, then
  the v11f rollback plus the sandbox-network note) was driven only by dev-set failures and measurements.
- `citation-leaf` uses a labeled boundary stand-in for the tool gateway in its scenario (it returns one stored tool output and runs the
  repo's real `match_quote_text`). The engine writes its own tests and does not see the scenario.
- `macro-leapday` is a crash report whose stack includes the harness's own asyncio frames; the first repo frame is `_refresh_macro`.
- Roles: gpt-4.1-mini writes claim, tests, and patch; Nemotron is the mechanism gate.
- Only 2 cases. No case was fabricated to make up a number.

| case | frame given to engine | ground-truth cause (hidden from engine) | success = |
|---|---|---|---|
| heldout5-macro-leapday | `_refresh_macro` (src/ta/replay.py) | the 5-year lookback is computed with `end.replace(year=end.year - 5)`, which raises ValueError when `end` is Feb 29 (the target year has no Feb 29), so a replay ending on a leap day crashes | claim names the year-replace / leap-day date arithmetic; verdict proven_false |
| heldout5-citation-leaf | `_keep_after_reopen` (src/ta/agents/loop.py) | the check takes only the last segment of the cited `json_path` and tests whether that string occurs anywhere in the payload text, so a claim citing a path that does not exist (e.g. `weights.AAPL` when weights has no AAPL) is kept whenever the leaf text appears elsewhere | claim names the leaf-substring check not resolving the cited path; proven_false |

A case succeeds only if the verdict is `proven_false`, the gate is consistent, **and** the claim matches the ground-truth cause. No partial
credit. Each case runs exactly once on tag `heldout5-frozen`; no engine change between runs; results go to `docs/heldout-results.md` whatever
they are.
