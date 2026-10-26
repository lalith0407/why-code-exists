# Judge assessment v7 — Why-Code-Exists (Track 02)

Independent, skeptical pass. **[tested]** = ran on the box Oct 23 2026, ~9:20 PM PT. **[read]** = code/docs only.

## What I ran
- `npm run demo:invite`: passed **[tested]**. Hero boost OFF. Written-at = L129 (reasoning before = L127, flagged silent). Two gpt-4.1-mini calls (A: claim, B: check map), temp 0. Zetaris ui-proxy oracle: 1 row (alice invite accepted by bob → ADMIN). Meterless mem-48.
- `npm run demo:compare`: passed **[tested]**. Invite L129 GROUNDED/PROVEN; SSRF written-at L100 GROUNDED, PROVEN via `ssrf_preview_internal`. mem-49.
- `npm run demo:prevent`: passed **[tested]** (recall mem-37, local checker).
- `npm test`: **48/48** **[tested]**. Note: still `WCE_REASONER=heuristic`, so OpenAI is mocked in the tests.
- About 6–8 OpenAI calls total (under the cap of 10). The key was never printed.
- Report: `invite-latest.html`, 14.1 KB, inline CSS **[tested]**. Note: `demo:compare` and `demo:prevent` both overwrite `invite-latest.html`, so what's on screen depends on which ran last **[tested]**.
- Video: still no mp4 on the box **[tested: ls]**.

## Scores
| Criterion | v6 | v7 | Δ | Why |
|---|---|---|---|---|
| Impact 30 | 27.0 | 27.0 | 0 | Still 2 seeded fixture bugs, no held-out incident. "Written-at" is a useful generalizable primitive, but it isn't shown on a third bug. |
| Technical 20 | 17.3 | 18.0 | +0.7 | Deterministic diff-scan provenance, boosts removed, no quote substitution, model-picked check with a `none` option, adversarial test **[tested+read]**. Deductions: the wrong-claim test mocks the model's answer, and the check enum has only 2 options. |
| Innovation 15 | 12.3 | 12.8 | +0.5 | "git blame for the agent's chat" plus the silent-mistake framing is fresh and easy to remember. |
| Demo 15 | 14.7 | 14.7 | 0 | Runs are clean and fast (~7 s). **The video is still missing (hard gate).** |
| Product/UX 10 | 8.9 | 8.9 | 0 | Clean doc report. It's still static, the latest path gets overwritten by other demos, and nothing is wired to a real alert source. |
| Sponsor 10 | 9.4 | 9.4 | 0 | Zetaris is still a TEMP VIEW over app-injected rows. Meterless recall is real. |
| **Total** | **89.6 (89)** | **90.8 → 91** | **+1.2** | |

## v6 holes: status
1. **LLM doesn't choose where to look / hero boosts: FIXED, with a reframe [tested+read].** `session:hero_boost_off` in the output. The location is now deterministic (`provenance.ts` diff scan on the frame function), not chosen by the model. That's honest, but a judge may notice the LLM still doesn't "find" anything. It interprets code it was handed. `eval-lines.md` openly records 0/5 and 1/5 line-pick failures, which helps credibility.
2. **Proof doesn't depend on the claim: PARTLY FIXED [tested+read].** Call B maps each claim to an enum `[membership_row_wrong_user, ssrf_preview_internal, none]` without the answer key. But with 2 checks per incident and only one on-topic, the choice is near-trivial. The live run proved 3 separate claims (a-oai-129-1..3) with the *same* row, so the SQL still tests the bug, not the specific belief. The "wrong claim not proven" test (`tests/judge-v6.test.ts:65`) feeds a mocked `check_id:"none"`, so it tests the plumbing, not the model's discrimination.
3. **Citation fallback mislabels quotes: FIXED [read].** Non-verbatim quotes are dropped (test at L132). Also seen in eval-lines: SSRF falls back with `all_citations_invalid` instead of faking a quote.
4. **No generalization evidence: OPEN [read].** Still 2 bugs, with fixture evidence and checks written per bug. eval:claims and eval:lines measure stability (temp 0, the same input), not generalization.
5. **Video missing / Zetaris app-injected: OPEN [tested ls / read].**

## New top 5 holes
1. **No video [tested].** This is the submission hard gate.
2. **The checks are per-bug oracles authored alongside the bug [read].** `fixtures/invite-evidence.json` ships the exact SQL predicate (`membership_email_mismatch`). A judge's question: "Who writes the check for a new incident?" Today the answer is "a human". The LLM picks from a list of 2.
3. **The proof is not claim-specific [tested].** Three paraphrased claims got the identical proof row. A slightly wrong but on-topic claim (for example "the agent forgot to check role") would likely still map to `membership_row_wrong_user` and be "proven". There's no live adversarial eval, only a mocked one.
4. **Written-at depends on the diff format and the function name [read].** `defRe` matches `function X` / `const X =` only. Bugs introduced by later edits, renames, refactors, multi-file changes, or code the human typed aren't covered. The frame has to carry a function name. It's a good primitive but brittle, and it's untested beyond 2 cases.
5. **Zetaris is still a TEMP VIEW over app-injected rows, and the tests never hit live OpenAI [read/tested].** "Federated evidence" isn't really demonstrated, and a regression in call A or B wouldn't be caught by `npm test`.

## Is "silent mistake + written-at" credible and generalizable?
**Credible: yes [tested].** It's actually a stronger, more honest story than "we found message 209". L129 is the edit that created `invites.ts` with the hole, and L127 ("considering what actions to invite next") shows no reasoning about email. It's deterministic and repeatable, and the report quotes real code. Admitting the earlier configs failed in `eval-lines.md` is good practice.
**Generalizable: plausible but unproven [read].** The mechanism (crash frame → transcript edit diff that introduced the function → claim from that code) is bug-agnostic in principle, but the evidence base is 2 seeded bugs and the proof checks are hand-authored. Pitch it as: "deterministic provenance generalizes; demonstrated on 2; checks are pluggable." Don't claim "works on any bug".
Risk: if the framing is oversold, "silent" can sound like "we couldn't find the reasoning, so we called it silent". Show the L127 text on screen so the judge sees for themselves.

## Top 3 fixes before Oct 27
1. **Record the 1–4 min video** using the compare demo (written-at L129 silent → claim → Zetaris row → Meterless lesson → prevent WITH/WITHOUT).
2. **One live adversarial eval (~4 calls):** feed 2 deliberately wrong claims (for example "agent forgot role check", "token expiry not checked") through live call B and show they map to `none`. Add a third decoy check per incident (for example `role_escalation`, `expired_invite_accepted`) so the mapping is a real choice. Put the result in `eval-claims.md`.
3. **A third, held-out bug** (even a small one), run with no code changes, showing written-at plus the claim working. If that's impossible in time, at least give the report a stable per-demo filename so `demo:prevent` doesn't overwrite the hero report.

## Likely Q&A
- *"Is the line hard-coded?"* No. The diff scan of the transcript edits finds the edit that introduced `acceptInviteForExistingUserAction` (L129). Show `session:hero_boost_off` and `eval-lines.md`.
- *"So what does the LLM do?"* It reads the code the agent wrote and states the omitted check in its own words, with verbatim-validated quotes. Then a second call picks the falsifying check or `none` without seeing expected values.
- *"Who writes the checks for a new bug?"* Honest answer: today, a pluggable library of SQL predicates. The roadmap is LLM-generated SQL against Zetaris, validated by a dry run.
- *"Would a wrong claim get proven?"* Show the test, and ideally the live adversarial eval from fix 2.
- *"What if the agent did reason out loud?"* Then the "why" message is quoted too (SSRF L98 shows as the informational belief message).
- *"Is Zetaris doing more than a JSON filter?"* Not yet. It's a TEMP VIEW. The value is federated SQL over prod event stores.
- *"What does 'silent' mean?"* No substantive reasoning message before the introducing edit. That's the scariest class of agent bug, because reviewing the chat wouldn't catch it.
