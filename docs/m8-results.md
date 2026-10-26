> Historical development notes; linked run outputs are not included in the public repo.

# M8 results (branch generalize, Sun Oct 25 2026; restore tag pre-m8-2026-10-25 at ea97116, tarball snapshots/pre-m8-2026-10-25.tar.gz)

PROMPT_VERSION: `gen-v13-rival-cause`. Criteria and every design amendment, each written before the run it governs: docs/m8-criteria.md.
All numbers: full 15-case dev suite (burned cases, never held-out), one run each, gpt-4.1-mini writes claim/tests/patch, Nemotron gates. Noise ±1-2.

## 1. Circular-proof hole (what changed, tested)
New generic checks, no case data:
- **Single cause:** the claim prompt asks for one cause with alternatives in `rejected_alternatives`; Nemotron parses claim+mechanism into
  causes that need *different fixes* (a parse, not a verdict on correctness); >1 → the claim writer is re-asked once; still >1 → `claim_not_single_cause`.
- **Rival-cause counterfactual (executed):** Nemotron names a rival cause away from the cited lines; gpt-4.1-mini, blind to claim and tests, writes a
  minimal fix for only the rival; edits touching the cited lines are rejected by the engine; frozen tests run on the rival tree. Rival fix also
  removes the harm with decoys passing → `cause_not_discriminated`. No valid rival edit → `unavailable` (no downgrade).
- **Error consistency:** the cause gate now also sees the production error and must say the repro's condition asserts the same outcome (not
  its opposite) → else `repro_contradicts_error`.

| engine | run | proven | correct | **false** | notes |
|---|---|---|---|---|---|
| v11f (before) | p4 / p4b | 3 / 6 | 3 / 4 | 0 / 2 | |
| v12b (before) | m7-v12b / r2 | 3 / 4 | 3 / 3 | 0 / 1 strict | |
| v13 design run | m8-v13 | 1 | 1 | 0 | vote-race crashed (Nemotron 429); rerun m8-v13-vr: proven with "propagation **or** concurrency" claim → motivated the atomicity parse |
| v13 design run | m8-v13b | 0 | 0 | 0 | parse over-split restatements: 3 claim_not_single_cause, ≥2 on correct claims → distinct-fix parse |
| v13 | m8-v13c | 2 | 1 (webhook-block) | **1** (drawdown-penny: repro asserted the buy WAS halted, opposite of the error) → motivated error-consistency gate | |
| v13 | m8-v13d | 2 | 2 (stop-minhold, caps-unknown) | 0 | |
| v13 final | m8-v13e | 3 | 3 (vote-race correct, stop-minhold, caps-unknown) | 0 | |
| v13 final | m8-v13f | 2 | 1 (webhook-block) | **1 strict** (vote-race "deletion propagated or concurrency"; parse counted it as one cause) | swing-batch crashed: unparseable patch JSON |

Verdict: **not closed.** Final-engine runs (e, f): correct 3, 1; false 0, 1 strict. Across the 4 v13 measurement runs: correct 1/2/3/1, false 1/0/0/1.
Correct-proof rate is unchanged within noise (v12b: 3, 3). The rival counterfactual mostly returned `unavailable` (Nemotron's rival usually lives
at the cited lines); when it ran it discriminated (e.g. macro-leapday, ssrf) and never downgraded a correct proof. The single-cause and error-
consistency checks are still model judgments (Nemotron), so the proof is less circular, not non-circular. The vote-race "X or Y" claim survives
whenever the parse calls both halves one fix.

## 2. Held-out proofs re-run under gen-v13 (tested; not new held-out evidence)
- **macro-leapday** (2 runs, artifacts/m8-v13-macro1, -macro2): correct claim both times, **not proven** both times: mechanism_mismatch
  (gate wanted a verbatim quote for a runtime effect), decoy_vacuous (Feb-28 decoy passes on the no-op mutant). Rival check discriminated in both.
- **webhook-block** (4 dev runs c-f): proven_false 2 (c, f; correct claim), not_reproduced 2. Unstable.

## 3. Zetaris (tested)
Root causes found: (a) transcript parser read diff paths out of JSON-stringified results up to a literal `\n`, so CODE_EDITS file keys were
whole diffs and never matched the frame file (also `workspace/` prefix not stripped); (b) edit code was capped at 1500 chars, cutting off the
relevant function. Fixed both; SQL must now read APP_DB_WRITES (the only source that differs original vs patched); if the code writes no rows
on either run → `no_data_trace` with no SQL. Reruns (artifacts/m8-zetaris):
- dev vote-race (m8-v13e, proven): **confirms**, 1 row original / 0 patched — first confirmation ever. Caveat: rows come from the scenario the
  repro drove (independent of the test verdict, not of its inputs).
- webhook-block (m8-v13f): 1/1, does_not_confirm (latency not recorded anywhere).
- macro-leapday, caps-unknown: no_data_trace (bug leaves no row; recorded, not invented).

## 4. Held-out 7 (not run)
Rule check before searching: the source must be a transcript never used before. All 4 cloud-agent transcripts in /workspace/cloud-agent-transcripts
are used (sets 1-6). Claude Code transcripts exist under ~/.claude/projects (trading-agent-system, already-used repo) in a format the engine's
parser does not read. No held-out 7 was formed; nothing searched.

## 5. Docs
README and docs/heldout-results.md: 2/15 (sets 1-6), 0 held-out false proofs, dev false proofs disclosed per engine, PROMPT_VERSION gen-v13-rival-cause.

## Totals
Held-out: **2/15 proven, 0 false, 4 harness errors** (unchanged). 61/61 unit tests pass at every code commit.
