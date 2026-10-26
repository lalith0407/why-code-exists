# M8 rival-cause gate: criteria (written Sun Oct 25 2026 ~7:55 AM PT, before any gen-v13 run)

Mechanism (gen-v13-rival-cause), chosen from the judge's M7 list before measurement:
1. Single cause: the claim prompt demands one cause; alternatives go to a structured `rejected_alternatives` field instead of an "X or Y" claim.
2. Rival-cause counterfactual (executed, not a model judgment of the verdict): Nemotron (independent, never sees tests) names the most plausible
   different cause located away from the cited lines; gpt-4.1-mini (blind to claim and tests) writes a minimal fix for only that rival; the engine
   rejects rival edits that touch the cited lines. Frozen tests run on the rival tree. If the rival fix also removes the harm with decoys passing,
   verdict = cause_not_discriminated. No rival edit → recorded `unavailable` (no downgrade; disclosed).
No case names, lines or phrases. Held-out cases not consulted.

Measurement: full 15-case dev suite, 2 runs (noise is ±1-2). Ground-truth claim judgement uses the same rules as docs/m7-gate-results.md.
Success: false proofs = 0 in both runs; correct proofs not lower than v12b (3, 3) by more than noise. Report whatever happens.

## Amendment (~8:15 AM PT, after dev run m8-v13, disclosed)
Run m8-v13 showed the prompt-only single-cause rule did not stop an "X or Y" claim (dev vote-race) and the rival check was mostly `unavailable`
(the rival proposed by Nemotron usually lives at the cited lines). Added: an independent atomicity parse (Nemotron splits claim/mechanism/rule into
distinct causes; not asked whether the claim is right). >1 cause → claim writer re-asked once; still >1 at verdict → claim_not_single_cause.
This change was motivated by a dev case (dev is burned); it has no case data. Measured on two fresh full dev runs (m8-v13b, m8-v13c).

## Amendment 2 (~8:30 AM PT, after m8-v13b, disclosed; last design change before measurement)
m8-v13b: the atomicity parse over-split restatements (3 claim_not_single_cause, at least 2 of them correct claims: caps-unknown, vote-race).
Changed the parse to an operational test: causes are distinct only if they need different fixes; each cause is returned with its fix; only claim +
mechanism are parsed. No further design changes before the two measurement runs m8-v13c and m8-v13d.

## Amendment 3 (~8:55 AM PT, after m8-v13c/d, disclosed)
m8-v13c had a false proof (dev drawdown-penny): the reproduction's condition asserted the OPPOSITE of the production error (buy halted vs "passed the
guard"), the claim blamed the comparison operator, and no gate looked at the production error. The cause gate now also receives the production error
and answers harm_matches_error (reading the condition, not the message string); false → repro_contradicts_error. Generic; motivated by a dev case.
Final measurement runs: m8-v13e, m8-v13f. No further engine changes for item 1 after this, whatever they show.
