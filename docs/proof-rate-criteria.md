# Proof-rate measurement (fixed before any proof-step change, 2026-10-24 22:30 PT)

**Dev set only** (15 cases, none held-out any more): pulseboard-invite, -ssrf, -slack-retry; heldout-vote-race, -slack-multiline,
-xirr-short; heldout2-webhook-block, -webhook-case, -drawdown-penny; heldout3-plan-injection, -retype-unique, -schema-target;
heldout4-swing-batch, -stop-minhold, -caps-unknown. Runner: `scripts/dev-suite.sh` (one run per case per engine commit).

Metrics, computed from each report.json (plus one human judgement, the claim column):
1. **proof rate** = cases with verdict `proven_false` AND claim matching the ground truth in the case's criteria doc / 15. (Primary.)
2. **conversion** = among cases whose claim matches ground truth, the share that end `proven_false`. (What this work targets.)
3. **harness_error** count; **repro runs on original** (reproduction passes on the original code); **patch_not_minimal** count;
   **decoy_failed** count; **target_not_exercised** count.
4. **false proofs** = `proven_false` with a claim that does NOT match ground truth. Must stay 0; any false proof is reported.

Rules: a change is kept only if it is generic (no case names, values, files or concepts in src/), and it is reported with
before/after numbers on the same metric. n=15 and one run each, so differences of 1-2 cases are within run-to-run noise
(temperature-0 runs are not deterministic); this is stated next to every number. Claim matching is my judgement against the
ground-truth tables in docs/heldout*-success-criteria.md and docs/heldout-results.md and is listed per case so it can be audited.
