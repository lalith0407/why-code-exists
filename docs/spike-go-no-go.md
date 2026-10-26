# Spike: model-written falsification tests (Option A) — decision: **GO (with A′ standalone harness)**
Sat Oct 24 2026, ~6:30–7:25 PM PT, branch `generalize`. Cases: invite (H1) and Slack retry (H3). DB faked.

## Decision
- **Running against the real Next.js server action: infeasible.** There is no Pulseboard checkout on this box (the app only exists as edits inside transcript bc-25dab342), so there is no Prisma schema, DB or Next runtime to boot.
- **Fallback A′ used:** a standalone harness assembled per case = fixed generic helpers (check/record + a generic permissive in-memory ORM `wceDb`, not app-specific) + **model-generated fakes** + the function **verbatim** as the agent wrote it + model-written tests. Runs under `unshare -rn` (no network), 30 s timeout, empty env (no keys).
- **GO** because both bugs ended `proven_false` under the full gate on the final prompt (gen-v5):

| case | repro test on original | repro test on patch | decoys (orig/patch) | patch lines | mechanism gate | verdict |
|---|---|---|---|---|---|---|
| invite | passes (bug reproduced) | fails (bug gone) | 2/2 pass, 2/2 pass | 5 | consistent | proven_false |
| slack retry | passes | fails | 2/2, 2/2 | 13 | consistent | proven_false |

## What it took (honest)
Eight spike iterations (gen-v1 → gen-v5). Failures found and fixed **generically** (no per-bug code):
1. Model wrote Python for a TS file → language spelled out per run.
2. Model redeclared our helpers (`check`, `record`, `wceDb`), and added `export`s → helpers moved to `globalThis`, exports stripped from the prelude.
3. "Correctness" tests asserted the buggy behaviour → test 1 redefined as a **reproduction** test (asserts the harmful outcome; must PASS on original, FAIL on patch), with an explicit polarity rule.
4. Patch used a fake-only internal (`db.slackEventLog.find`) → the patcher no longer sees the fakes, and a deterministic check rejects patches that reference names defined only in the fakes (`patch_uses_test_fakes`).
5. Hand-rolled fakes lacked ORM methods the patch needed (`findUnique`), so a decoy correctly failed → shipped one generic permissive in-memory ORM (`src/engine/fakedb.js.txt`).
6. Harness that cannot run at all (or where every test incl. decoys fails) gets ≤2 repair calls **before** the freeze hash; recorded as `harness_repairs`.

## Known weaknesses (carry into docs)
- Same model family writes fakes and tests and patch; fakes encode its own idea of the payload shape (e.g. Slack `event_id` placement). The counterfactual + decoys limit, but do not remove, this.
- Run-to-run variance at temperature 0 is real: the same case went proven / not_reproduced / harness_error across iterations while prompts changed. Single-run numbers are reported as such.
- Spike cost: ~83 live calls (ledger `data/llm-calls.jsonl`), more than planned because of iteration.
