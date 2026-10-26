# M7 wrong-cause gate: dev results (criteria: docs/m7-gate-criteria.md, fixed before these runs)

All runs: full 15-case dev suite, one run each, `scripts/dev-suite.sh`, gpt-4.1-mini writes claim/tests/patch, Nemotron gates. Dev cases are burned and none is held-out evidence. Run-to-run noise is about ±1-2 cases.

| engine | run | proven_false | correct claim | **false proofs** | blocked by new gates |
|---|---|---|---|---|---|
| gen-v11f (before) | p4 | 3 | 3 | 0 | n/a |
| gen-v11f (before) | p4b | 6 | 4 | **2** (xirr, vote-race) | n/a |
| gen-v12 (980cdce) | m7-v12 | 0 | 0 | 0 | 1 verdict changed (invite: decoy_vacuous); cited-line location was over-broad (one cited `return`-style line matched 12-42 places) |
| gen-v12b (locate fix) | m7-v12b | 3 (vote-race, stop-minhold, caps-unknown) | 3 | 0 | 1 verdict changed (invite: patch_off_claim, patch at L134-135 vs cited L128-131) |
| gen-v12b | m7-v12b-r2 | 4 (vote-race, webhook-block, stop-minhold, caps-unknown) | 3 strict / 4 lenient | **1 under the strict rule** (vote-race, see below) | 0 verdicts changed (flags fired only on runs that already failed) |

Claim judgements (ground truth for vote-race: check-then-create is not atomic under concurrent toggles):
- m7-v12b vote-race: "...attempts to create a vote without handling concurrent requests that cause duplicate entries"; mechanism "without transactional or concurrency control". **Correct.**
- m7-v12b-r2 vote-race: "...without ensuring the deletion has fully propagated **or** handling concurrent requests". The first-named cause is the one judged wrong in p4b. **Counted as a false proof under the strict rule**; it is borderline because concurrency is also named.
- stop-minhold, caps-unknown and webhook-block claims name the ground-truth cause (same rule as before).
- xirr: the v11f false proof is gone in all 3 v12 runs: patch_ineffective, patch_not_minimal or not_reproduced; in m7-v12 the gate also flagged patch_off_claim.

What the gates catch (from reasons in report.json): patches that land outside the cited lines (webhook-case: claim cites workspace-settings.ts, patch edits validations.ts; ssrf, retype-unique, schema-target, slack-retry) and vacuous decoys (invite, plan-injection, retype-unique, schema-target, webhook-case) that also pass with the function made a no-op.

**Primary criterion (false proofs = 0): met in 2 of 3 v12 runs, missed in m7-v12b-r2 (1 borderline false proof, strict count).** The gate does not stop a patch that is *at* the cited lines with a claim that is only partly right: binding checks "where", not "which of two stated causes". Correct proofs: 0, 3, 3 vs v11f 3, 4. That is not lower beyond noise, except the v12 run whose location bug was fixed in v12b. Decoy-vacuity mutants built on 13-15 of 15 cases per run (TS expression-bodied arrows and harness-failed runs are recorded as `unavailable` or `harness_failed`).
