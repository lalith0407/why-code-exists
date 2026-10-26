# Held-out results (frozen code, tag generalize-frozen, one run each, no code changes)

Criteria: docs/heldout-success-criteria.md (written before running). LLM ledger: 83 → 100 calls (+17 incl. one run killed mid-way and re-run).

| case | provenance | claim correct? | verdict | success |
|---|---|---|---|---|
| heldout-vote-race (TS/Prisma) | ✅ L123 | ✅ check-then-create race (concept `race-condition-in-concurrent-requests`, quote verified) | patch_ineffective — repro still passes on the patch | ❌ |
| heldout-slack-multiline (TS) | ✅ L184 | ❌ blames use of `payload.event.text`; real bug is the regex in callee `parsePulseCommand` (lib/slack.ts), which the harness replaced with a model-written fake | not_reproduced | ❌ |
| heldout-xirr-short (Python, repo checkout) | ✅ L219 | ❌ blames iteration count / tolerance; real cause is the [-0.9, 5.0] step clamp (belief quote not verified) | harness_error — `IndentationError` in assembled harness | ❌ |

**0 / 3 held-out successes.** The gate refused to certify any of them (no false proven_false), but the engine did not prove the real bugs.

Root causes found (engine, not case-specific):
1. Python harness assembly trims only the first line of a model test body (`t.body.trim()`), so multi-line bodies get inconsistent indentation → every Python test crashes. Both allowed harness repairs (2) ran, but they only rewrite the prelude, so the bug survived.
2. Callee blindness: when the frame is a caller (route POST) and the bug is in an imported helper, the model fakes the helper, so the real code is never run. Need: include agent-written callees from the same transcript as real code under test.
3. Race repro vs patch: the patcher's fix did not change the concurrent outcome in the fake (likely no atomic upsert/unique semantics in the fake ORM) — fake fidelity limit.
4. Zetaris step did not run (gated on proven_false), so no cross-source evidence for these cases.

## M2 run (real-code engine, commit 540ad30, 2026-10-24 PDT)

Engine: real app modules from transcript replay or `--repo`, real PostgreSQL 17 per test, stubs only for bare external packages,
tests frozen and hashed before any run, repairs may change setup/stubs only. Models: gpt-4.1-mini (claim/tests/patch/SQL),
Nemotron 3.5 lightning (mechanism gate). error.json for every case was regenerated from a real run (`src/bin/capture-error.ts`);
the original hand-written errors are kept as `error.frozen.json`.

| case | frozen engine (pre-M2) | M2 post-fix | what happened |
|---|---|---|---|
| heldout-vote-race | not proven | patch_ineffective | bug reproduced on real code + real DB; patch did not remove it; one decoy hit Next `headers()` outside request scope (harness) |
| heldout-slack-multiline | not proven | harness_error | no test process produced a result |
| heldout-xirr-short | not proven | patch_ineffective | bug reproduced on the real repo (both decoys pass); patch did not change the outcome |

Held-out score: **0/3 frozen, 0/3 post-fix.** Note: vote-race was also run once earlier during M2 development (harness_error, 2 calls) and engine
changes were made afterwards; those changes were driven by dev cases (invite, ssrf, slack-retry) and are generic (see git log).

Dev cases on the same commit: invite harness_error, ssrf not_reproduced (patch also over the line limit), slack-retry harness_error.
Zetaris ran on every case that executed tests and returned does_not_confirm in all of them.

## Held-out set 2 (tag `heldout2-frozen`, commit 22efbd5, one run each, 2026-10-24 PDT)

Criteria: `docs/heldout2-success-criteria.md`, committed before any run. Engine gen-v7 (framework shims). Artifacts: `artifacts/m3b/`.

| case | verdict | claim right? | success |
|---|---|---|---|
| heldout2-webhook-block (TS) | **proven_false**: repro passes on original (5.0 s submit), fails on patch; both decoys pass; Nemotron gate consistent | ✅ awaiting `sendFeedbackWebhook` blocks the action | ✅ |
| heldout2-webhook-case (TS) | not_reproduced; a decoy failed | ❌ claims the URL is *not* normalised (the opposite). Its patch adds another `.toLowerCase()`. The real `.toLowerCase()` is in callee `lib/validations.ts`, which the engine did not look at | ❌ |
| heldout2-drawdown-penny (Python) | not_reproduced; gate: mechanism_mismatch | ❌ blames the `<=` threshold comparison. The real cause is the sleeve-only check that misses sub-$5 names. The model's repro used a `high_risk`-tagged order, which is already halted | ❌ |

**1 / 3 held-out successes.** No false proven_false. 0 harness errors in 3 runs.

Caveats:
- webhook-block's patch is a fire-and-forget IIFE. That is correct for a long-lived Node server, but on serverless the work can be cut off; `after()` from next/server would be more robust. The criteria counted this case as success because the patch passed the gate.
- That run exited with code 3 because the Zetaris SQL step failed: the model's SQL referenced a column that does not exist (`w.success`). The verdict comes from the real test runs, not from Zetaris.
- Recurring engine weaknesses: (1) callee blindness: the bug was in an imported module and the claim stayed on the frame; (2) a repro that does not set up the specific condition in the report.

## Held-out set 3 (tag `heldout3-frozen`, commit 758e610, one run each, 2026-10-24 PDT)

Source: Blast Radius (Python, non-Pulseboard), transcript bc-fe0ae5aa. Criteria: `docs/heldout3-success-criteria.md`. Artifacts: `artifacts/m5/`.

| case | verdict | LLM calls | success |
|---|---|---|---|
| heldout3-plan-injection | **no_provenance**: no transcript edit introduces `safe_plan` | 0 | ❌ |
| heldout3-retype-unique | **aborted**: the OpenAI claim call returned HTTP 429, so the run crashed (exit 1) before any test | 1 (failed) | ❌ (infrastructure) |
| heldout3-schema-target | **no_provenance**: no transcript edit introduces `parse_action` | 0 | ❌ |

**0 / 3.**

Why, honestly:
- **Case-design error (mine).** `safe_plan` and `parse_action` already existed in the base (7b62ee9). The session modified them; it did not create them. The buggy helpers it did create (`_deprecation_step`, `_name`) are callees. The engine's provenance step only accepts a frame function that a transcript edit *introduced*. That is a real limitation: it should fall back to "last modified by edit L…" or follow the edited callee. The frames given here made the cases ungradeable as specified.
- **Rate limit.** The 429 is an infrastructure failure, not an engine verdict. Following the one-run rule, it was not re-run.

## After held-out 3: gen-v9 changes, void re-run, dev re-check (2026-10-24 PDT)
- New: fallback provenance (deepest agent-written callee on the call path, else last edit that touched the frame function), labeled `attribution`; the claim step may pick among callee candidates; LLM retry/backoff for 429/5xx/network errors (quota/billing errors are not retried). Unit tests 52/52.
- **OpenAI credits are exhausted** (`insufficient_quota`); the held-out-3 429 was very likely the same. All runs below use Nemotron for every role, gate included.
- Void re-run of heldout3 `retype-unique` on the pre-change engine (does not count): OpenAI → 429 quota; Nemotron → harness_error (JS syntax in Python tests). Claim was close to the truth; nothing proven.
- Dev re-check (gen-v9, these cases are now dev, not held-out): plan-injection — fallback found the right helper `_deprecation_step`, wrong claim, harness_error. schema-target — fallback picked the wrong helper (`_only_args`, real cause `_name`); one run not_reproduced/mechanism_mismatch, one harness_error.

## Held-out set 4 (tag `heldout4-frozen`, commit e90f8dd, one run each, Nemotron only, 2026-10-24 PDT)
Criteria: `docs/heldout4-success-criteria.md`. Artifacts: `artifacts/m7/`.

| case | claim matches truth? | verdict | success |
|---|---|---|---|
| swing-batch | partly (names the cap check across a batch, not the stale count) | harness_error: tried to stub the app's own module | no |
| stop-minhold | yes (stop sells should bypass min-hold) | not_reproduced: repro test crashed, decoy failed, gate mechanism_mismatch | no |
| caps-unknown | yes (unknown tickers skipped, fail-open) | harness_error: frozen Python test body put on one line (syntax error) | no |

**0/3.** Claims were right in 2 of 3 cases, but the test-writing step on Nemotron did not produce runnable Python tests, so nothing was proven. The fallback was not exercised (both frames introduced by an edit).

## Void re-runs after the OpenAI quota failure (2026-10-24 ~21:45 PT, OpenAI restored with a new key)
**These are re-runs after an infrastructure failure, not clean held-out results, and they do not count toward any held-out score.**
Each ran on its own frozen tag in a git worktree (`heldout3-frozen` 758e610, `heldout4-frozen` e90f8dd). Models: gpt-4.1-mini for claim/tests/patch/SQL,
Nemotron 3.5 lightning for the mechanism gate. Artifacts: `artifacts/m8/`.

Operator errors, disclosed:
- The first heldout4 attempt ran the 3 cases **in parallel** against the same repo checkout. The engine wrote every harness to the shared `<repo>/.wce/`,
  so the runs overwrote each other's files (stop-minhold crashed with ENOENT; the others may be contaminated). Those outputs are kept in
  `artifacts/m8/collided/` and are not used. The 3 cases were then run **once more, sequentially**; that is the void re-run below. (Fixed in gen-v10: per-run harness dir.)
- The worktrees lacked the gitignored `secrets/`, so Zetaris failed on retype-unique ("missing connection"); in the heldout4 runs Zetaris failed on the service side (login HTTP 500 / fetch failed). Zetaris is not part of the verdict.

| case (tag) | claim matches ground truth? | verdict | why not proven |
|---|---|---|---|
| heldout3-retype-unique (heldout3-frozen) | partly (index lost on table rebuild) | not proven (repro passed on original; patch over line limit, decoy ImportError on patch, gate mechanism_mismatch) | patch rewrote 54 lines and removed a helper the tests import |
| heldout4-swing-batch (heldout4-frozen) | yes (cap checked against a count not updated within the batch) | harness_error | lint false positive: `guard_orders = m_caps.guard_orders` (an alias of the real function) was rejected as a redefinition |
| heldout4-stop-minhold (heldout4-frozen) | yes (stop sells blocked by min-hold) | harness_error | setup wrote `m = await app(...)` in Python (app is synchronous); 4 setup repairs did not fix it |
| heldout4-caps-unknown (heldout4-frozen) | yes (unknown tickers skipped, fail-open) | harness_error | same `await app(...)` error |

**Void re-runs: 0/4 proven. Claims correct in 3/4 (4/4 at least partly).** With gpt-4.1-mini restored the claims improved; the failures are harness issues, two of them engine bugs (fixed generically in gen-v10, below).

## gen-v10 (commits c238dfd, 59d3c61) and dev check
Generic changes, no case-specific logic:
1. Per-run harness directory `<root>/.wce/<pid-time-rand>/` so concurrent investigations of one repo cannot collide.
2. `f = mod.f` / `const f = mod.f`, where `mod` came from `app(...)`, is an alias of the real function, not a redefinition (real redefinitions and aliases of non-app objects are still rejected).
3. Python lint: `await app(...)` is rejected before running, with the fix in the message (goes to setup repair, or pre-freeze redraft for bodies).
4. Helper selection: candidate ids are name-sorted (no depth hint). Before writing the claim, the model must name a concrete `input_value → observed_value` from the error, review **every** candidate against it, pick one and quote an evidence line. The pick counts only if the quote is verbatim in that candidate (checked); otherwise the deepest-callee default stays, labeled.
5. Test-time attribution check (Python): the harness profiles calls; if the reproduction never executes the attributed function, the verdict is `target_not_exercised` instead of `proven_false`.
Unit tests 56/56.

Dev check (these cases are dev, not held-out; artifacts `artifacts/m9/`):

| dev run | target picked | claim | verdict |
|---|---|---|---|
| schema-target, v10 step 4 first form | `_only_args` (wrong; same as before) | wrong (invented "extra modifiers") | not_reproduced |
| schema-target, v10b (wrong-value first) | `_classify_alter`, evidence line `table = _name(stmt.args.get("this"))` (verified) — the caller of the real culprit `_name` | **right** (schema prefix stripped) | decoy_failed: repro passed on original and failed on patch, but one decoy asserted schema preservation on a drop-table (the same bug), so it failed |
| plan-injection, v10 | single candidate `_deprecation_step` (right helper) | SQL injection via target (not the ground truth) | patch_ineffective |

Disclosure: step 4's second form (v10b) was written after seeing the first schema-target dev run, so schema-target is now tuned-on dev data. The change itself is generic (it names no function or SQL concept).

## Proof-step work gen-v11 (dev set only; criteria fixed first in docs/proof-rate-criteria.md, 2026-10-24 PDT)

Dev set = 15 burned cases. Metric = proven_false **and** the claim matches the case's ground truth (strict, judged by the builder).
One run per row; rows marked (2) are two independent runs of the same commit. n=15 and run-to-run noise is large (same commit: 3 vs 2,
3 vs 4); read differences of 1–2 as noise.

| engine | commit | runs | proven_false | **proven + claim matches** | notes |
|---|---|---|---|---|---|
| baseline gen-v10 | 7f09545 | 1 | 1 | **1** (schema-target) | 6 harness_error |
| gen-v11c (setup probe, repo test examples, decoy redraft, find/replace patch, pre-freeze review, gate quote tolerance) | 5faa0b3 | 2 | 3, 2 | **3, 2** | harness_error 2 / 2 |
| gen-v11d (awaitable Python app(), src.* aliasing) | ce336ef | 1 | 1 | **1** | Python reproductions lost polarity |
| gen-v11e (review sees probe values) | 8ae1462 | 2 | 1, 1 | **1, 1** | one run aborted on a gate json_parse_error after retry |
| **gen-v11f** = v11c + decoded coverage URLs + Python no-trace fix + "no network: run a local 127.0.0.1 server" note | f840c4c | 2 | 3, 6 | **3, 4** | extra proofs with weak claims: xirr (does not name the step clamp), vote-race (says "deletion not propagated", not the race) |

v11d/v11e were rolled back in v11f because they measured worse; that choice used dev data only. The webhook-block failure was generic:
tests pointed the webhook at a made-up host, which fails in milliseconds in the network-less sandbox, so a slow receiver was never
simulated; v11f proved it in both runs. **False proofs on dev: 2.** In p4b-v11f the engine returned proven_false for xirr (claim does not name the step clamp) and vote-race (claim says "deletion not propagated", not the race). By `docs/proof-rate-criteria.md` metric 4 these are false proofs: the oracle (locked tests + patch + Nemotron gate) certified a wrong cause. They are counted as failures in the correct-proof column, and they show the outcome-only reproduction can certify any claim whose patch removes the outcome. Artifacts: `artifacts/p0-baseline`, `p1-v11c`, `p1b-v11c-rerun`, `p2-v11d`, `p3-v11e`, `p3b-v11e-rerun`,
`p4-v11f`, `p4b-v11f`.

## Held-out set 5 (tag `heldout5-frozen`, commit f9452c1, engine gen-v11f, one run each, 2026-10-24 PDT)

Criteria: `docs/heldout5-success-criteria.md` (committed with the cases before the run). Both bugs are in trading-agent-system code written
by transcript bc-a98b50df, found by reading `replay.py` and `agents/loop.py`, and confirmed by running the real code.

| case | verdict | claim matches ground truth | result |
|---|---|---|---|
| heldout5-macro-leapday (`_refresh_macro`, Feb 29 `replace(year-5)`) | proven_false, gate consistent | yes (names `end.replace(year=end.year - 5)` raising on Feb 29) | **success** |
| heldout5-citation-leaf (`_keep_after_reopen`, leaf-substring check) | patch_not_minimal (16-line patch > 13 limit); repro passed on original, failed on patch, decoys ok, gate consistent | yes | failure (no partial credit) |

**Held-out 5: 1/2.** Artifacts: `artifacts/heldout5/`.

## Cumulative (honest) totals

- **Clean held-out: 2/15 proven, 0 false proofs, 4 harness errors** (set 1 0/3, set 2 1/3, set 3 0/3, set 4 0/3, set 5 1/2, set 6 0/1). (Before set 6 the figure was 2/14.)
- **Dev (burned) runs**: reported in the gen-v11 table above; never added to the held-out total.
- **Clean held-out** (frozen before the run, run once): 12 runs across sets 1–4 (3 each; held-out 1's later M2 post-fix runs, also 0/3, are not counted here because the set was already burned) → 1 proven / 12 for sets 1–4 only (heldout2 webhook-block); with set 5 (1/2) it was 2/14; with set 6 (0/1) the headline total is **2/15**. One of the 12 (heldout3 retype-unique) was aborted by the quota failure.
- **Void re-runs after infrastructure failure** (do not count): heldout3 retype-unique (3 attempts total: OpenAI 429, Nemotron-only, now gpt-4.1-mini) and heldout4 ×3 → **0/4** on the latest attempts.
- **Dev runs**: gen-v11f proved 3 and 6 of 15 dev cases in two runs; 3 and 4 had correct claims; 2 (p4b xirr, vote-race) were false proofs. See the gen-v11 table above.

## Held-out 6 (bc-cfc1fe44 portfolio; frozen at tag `heldout6-frozen`, run once, engine gen-v12b)
The rule (docs/heldout6-selection-rule.md) found **1 confirmed bug** in the whole tree (n=1, below the target of 3). See docs/heldout6-search-log.md.

| case | verdict | claim | scored |
|---|---|---|---|
| heldout6-outcome-keys | harness_error (harness monkeypatched the app's site module, which is rejected) | wrong: blamed `key={study.slug}`, truth is `key={outcome.detail}` | not proven (0 false proofs) |

Held-out 6: 0/1 proven, 0 false. Running total over held-out sets 1–6: 2/15 proven. Caveats: n=1. Harness capabilities (dom(), console_errors(), src-dir alias, JSX fallback tsconfig) were added after the case was seen, before the freeze. The buggy component is dead code in the final tree.

## M8 (gen-v13-rival-cause), Sun Oct 25 2026 — dev only, no new held-out set
- **Held-out total unchanged: 2/15 proven, 0 false proofs** (sets 1–6). No held-out 7: no unused cloud-agent transcript exists (see docs/m8-results.md).
- **Dev false proofs disclosed (burned cases, never held-out):** gen-v11f 2 (p4b xirr, vote-race); gen-v12b 1 strict (m7-v12b-r2 vote-race); gen-v13 measurement runs: m8-v13c 1 (drawdown-penny, repro asserted the opposite of the production error; caught by the gate added after it), m8-v13f 1 strict (vote-race "propagation or concurrency" claim, again).
- **Re-runs of the two held-out proofs under gen-v13 (not new held-out evidence):** macro-leapday 0/2 (correct claim both times; mechanism_mismatch, decoy_vacuous); webhook-block proven in 2 of 4 dev runs (c, f), not_reproduced in 2 — unstable.

## M9 (gen-v14-decoy-repair, gen-v15-chosen-cause), Sun Oct 25 2026: dev only
- **Held-out total unchanged: 2/15 proven, 0 false proofs.** Held-out 7 had 0 eligible cases under the pre-registered rule, because none of the box's Claude Code transcripts contain agent edits. Nothing was frozen or run.
- Dev: v14 a,b gave 2/0 and 1/0 (correct/false); v15 a,b gave 2/0 and 2/0. See docs/m9-results.md.

## M10 (gen-v16-fix-concept + invalid-JSON retry), Sun Oct 25 2026: dev only
- **Held-out total unchanged: 2/15 proven, 0 false proofs.** Dev v16a/b gave 1/0 and 2/0 (correct/false). See docs/m10-results.md.

## M11 (gen-v17-harness-robust), Sun Oct 25 2026: dev only
- **Held-out total unchanged: 2/15 proven, 0 false proofs.** Dev v17a/b: 1/0, 2/0 (correct/false); harness_error 6 -> 1 vs v16. See docs/m11-results.md.

## M12 (gen-v18-patch-revision, dev only)
Two dev runs: v18a had 1 correct and 1 FALSE proof (xirr-short); v18b had 1 correct proof. patch_ineffective was 5 in each run, and the revision rescued 0 cases. See docs/m12-results.md. The held-out total is unchanged at **2/15 proven, 0 false**.
