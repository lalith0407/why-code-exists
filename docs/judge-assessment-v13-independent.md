# Independent judge v13 (Sat Oct 24 2026, ~7 PM PT), branch nemotron-h3 @364816c
Ran: npm test 81/81 pass [tested]; tsc --noEmit clean [tested]. No live demos run (0 calls). Rest [read].

## Scores
Impact 25/30 · Technical 17/20 · Innovation 12/15 · Demo 9/15 (no video) · Product/UX 7/10 · Sponsor 7/10 · **Total 77/100 as of now; ~88-90 if a clean 3-min video lands.**
Verdict: competitive for a placing in Track 02 only once the video exists; without the video it isn't a valid submission.

## Idea-level holes
1. Humans write the proof checks per bug (src/prove/check.ts:24-33, hand-coded predicates like membership_email_mismatch, ssrf_internal_fetch). The "agent explains why" only picks from 6 human-authored checks. Pitch it honestly as "the agent maps its claim onto executable evidence", not as automated discovery.
2. Proof checks the outcome, not the mechanism. The mechanism gate helps, but on fresh unseen claims gpt still let 1 of 6 wrong claims through. Every adversarial set is n=6, so the numbers are small.
3. Zetaris is thin: TEMP VIEWs over our own repro rows, so SQL could be swapped for sqlite with nothing lost. No federation across multiple sources, and the File Source is blocked.

## Overstated / inconsistent claims
- README.md:17 says "Last independent judge score: 94.5 ... self-run brief pass". That contradicts itself, since a self-run pass isn't independent. devpost.md:5 puts an internal judge score in the public writeup. Remove both from anything submitted.
- README.md:54 says "eval:lines 10/10" but README.md:58 says "eval:lines hit target 2/5 / 0/5". These read as contradictory unless the versions are labeled.
- src/assume/extract.ts:180-195 is a heuristic fallback keyed to bug text ("invite", answer text "email need not match"). If the LLM fails, the answer is effectively hard-coded. It's labeled mocked in the run labels, but the video must never show a fallback run.
- I found no pre-existing code declaration in README.md or devpost.md (grep "pre-existing"). That is a required item.
- README/devpost lines 58/77 are walls of text. Judges won't read them; the honesty is buried.

## Top 5 by impact per hour
1. Record the 1-4 min video showing a live Zetaris SQL proof and a Meterless store/recall (+6-8 Demo, which gates the whole submission). 2-3 h.
2. Add the pre-existing code declaration and the sponsor-usage section, and remove the judge scores from README/devpost (a compliance risk). 20 min.
3. Collapse the eval prose into one honest table: true claims 3/3 x3 bugs; wrong claims by set; fresh near-miss 1/6 gpt, 0/6 with the gpt gate. Fix the eval:lines contradiction. 30 min.
4. Deck/script: frame checks as human-authored evidence probes, and frame Nemotron as "measured, not trusted". This pre-empts the obvious judge question. 20 min.
5. Make Zetaris do real work: one query that joins membership events with a second source (e.g. the error log table) to tie prod error to row. 1-2 h, and only after 1-4.

## Comparison with prior self-assessments
Not read before scoring. My score is well below the 93.6 to 94.5 range mainly because I score Demo against the missing video and doubt how deep the Zetaris use goes.
