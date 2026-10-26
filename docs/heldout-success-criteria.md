# Held-out generality run — success criteria (written BEFORE running)

Code frozen at tag `generalize-frozen` (commit b7cef2b) before any held-out case was chosen. No code changes between freeze and these runs.
Cases chosen after the freeze; only `error.json` (+ optional `data/*.json` rows standing in for the app DB / event log) written per case.
Each bug was confirmed real by running the agent-written code (see each error's `context.source`), not planted.

| case | source | language | frame |
|---|---|---|---|
| heldout-vote-race | Pulseboard bc-25dab342 | TS / Next.js + Prisma | lib/actions/feedback.ts:96 toggleVoteAction |
| heldout-slack-multiline | Pulseboard bc-25dab342 | TS / Next.js | app/api/slack/events/[slug]/route.ts:74 POST |
| heldout-xirr-short | trading-agent-system bc-a98b50df | Python | src/ta/sim/metrics.py:60 _xirr (repo checkout used) |

Per case, a run is a **success** only if ALL hold:
1. Provenance finds the transcript edit that wrote the frame function.
2. The claim names the real wrong assumption:
   - vote-race: check-then-create is not atomic / concurrent toggles (no upsert/transaction/unique-error handling).
   - slack-multiline: the command regex cannot match multi-line text (`.` excludes newlines / `$` anchoring), so commands with a body are dropped.
   - xirr-short: the Newton step clamp to [-0.9, 5.0] assumes annualized IRR stays in that band; short windows legitimately exceed it, so the solver returns None.
3. Verdict `proven_false` (repro passes on original, fails on patch; decoys pass on both; minimal patch; mechanism gate consistent).
4. With `--zetaris`: model-written SQL returns ≥1 row on original observations and 0 on patched (`confirms`). Reported separately; failure here does not change (3).

Anything else is reported as a failure with its verdict. Results vary run to run (temperature 0 is not deterministic); each case is run ONCE.
