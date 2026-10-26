> Historical development notes; linked run outputs are not included in the public repo.

# Judge assessment v8 — Why-Code-Exists (Track 02)

Independent, skeptical pass, Fri Oct 23 2026 ~9:50 PM PT. **[tested]** = ran on the box this pass (only `npm test`, offline; no OpenAI calls). **[read]** = files/docs only; live eval numbers below are taken from `docs/eval-lines.md` v6c tables, not re-run.

## What I checked
- `npm test`: **61/61 pass** [tested].
- `artifacts/reports/index.html` links invite/compare/prevent-latest.html [read]. Per-demo filenames fix the v7 overwrite hole.
- Fixtures: invite and SSRF evidence each carry 2 real + 4 decoy checks (`"decoy": true`, 0-row queries on the same evidence; cross-bug decoys included) [read]. Slack (H3) evidence: 1 check, 0 decoys [read].
- Call B (`src/assume/openai.ts` ~L141–229): step 1 describes each check's subject/action, step 2 requires `same_subject_and_action=true` or `none` [read].
- eval-lines v6c (9:43 PM PT): eval:claims 3/3 per bug, citing L129/L100; eval:wrong-claims 0/2 per bug ("admins" claim → none; other 3 → decoys returning 0 rows) [read].
- Video: no mp4 under why-code-exists [tested: find].

## Idea-level holes (first)
1. **Wrong-claim eval is n=2 per bug, and the prompt was tuned on exactly those claims.** v6 failed on the "admins" claim, the prompt got tightened, the same claims were re-run. That's in-sample. A judge will call it overfit. Held-out wrong claims are needed.
2. **Decoys pass by construction.** A decoy returns 0 rows, so any claim mapped to a decoy is "not proven" no matter what. The 0/2 is mostly "the model didn't pick the one real check", so it measures call B's discrimination, not the proof. Fair, but say it that way.
3. **Checks are still human-authored per bug** (v7 hole 2, unchanged). H3 confirms it: a human wrote `slack_event_duplicated`. The LLM picks from a list, it doesn't produce the falsifying query.
4. **Generalization: H3 is real progress but partial.** Written-at (L184) and silent (L182) were right with no engine changes, which is the strongest evidence yet that provenance generalizes. But the check pick was trivial (1 option), Zetaris wasn't used, and the lesson template is wrong for idempotency. It's not in any demo or report.
5. **Zetaris is still a TEMP VIEW over app-injected rows**; SSRF and H3 are proven locally, not by Zetaris. Sponsor depth is unchanged.

## Code/doc-level issues (verified)
- **Stale/overstated counts:** README L50 and devpost L98 still say "5/5 invite, 4/4 SSRF". They should cite v6c (3/3 + wrong-claims 0/2) and mention decoys [read].
- **Devpost L58 says "L209 assumption … proven false on Zetaris named relation."** That contradicts the written-at L129 story and overstates the TEMP VIEW as a "named relation". Fix before submit [read].
- Devpost L32 "federated SQL (sponsor path)": soften to "TEMP VIEW on the Zetaris cluster; File Source blocked" [read].
- `npm test` still mocks OpenAI (`WCE_REASONER=heuristic`). Regressions in the live call B prompt aren't caught offline. Acceptable, but don't say "tests prove discrimination" [tested].
- `fixtures/slack-retry-evidence.json` has no decoys, and H3's fidelity label is wrong (`prove:fixture_predicates`) [read].
- The demo script never mentions decoys or the wrong-claim eval, which is the strongest new Technical beat [read].

## Scores
| Criterion | v7 | v8 | Δ | Why |
|---|---|---|---|---|
| Impact 30 | 27.0 | 27.2 | +0.2 | H3 shows written-at on a held-out real bug, but it's undemoed and medium severity. |
| Technical 20 | 18.0 | 18.6 | +0.6 | 6-way check choice with decoys, live adversarial eval, subject/action confirmation, failed config documented. Deductions: in-sample n=2, decoys 0-row by design, checks human-authored. |
| Innovation 15 | 12.8 | 12.9 | +0.1 | "The proof can reject the model's wrong claim" sharpens the pitch. |
| Demo 15 | 14.7 | 14.7 | 0 | Index plus per-demo reports are clean. **Video still missing (hard gate, otherwise 0).** |
| Product/UX 10 | 8.9 | 9.2 | +0.3 | Overwrite fixed, index page. Still static, no real alert source. |
| Sponsor 10 | 9.4 | 9.3 | −0.1 | Unchanged depth. Devpost overstates Zetaris ("named relation", "federated"). |
| **Total** | **90.8 (91)** | **91.9 (92)** | **+1.1** | Conditional on the video. |

## Top 5 remaining holes (ranked by points at stake)
1. **No video (all 15 Demo points, and eligibility).** Record it from `../docs/demo-script.md`. Add a 10 s beat: the eval-lines wrong-claims table ("admins" → none).
2. **Overfit / in-sample adversarial eval (~1.5 Technical).** Write 4–6 fresh wrong claims per bug that weren't used in tuning (e.g. "token expiry not checked", "agent trusted redirect targets"). Run once (~6–12 calls), report the result even if imperfect.
3. **Stale and overstated docs (~1 Sponsor/Technical credibility).** Fix README L50 and devpost L58/L98/L32 to the v6c numbers, written-at L129, and "TEMP VIEW". A judge who catches "L209" vs "L129" will discount everything else.
4. **Generalization not shown on stage (~1 Impact).** Add H3 as a 15 s "same engine, third real bug, no code changes: written-at L184, silent" beat or a report row. Optionally add 2 decoys to slack evidence so the check pick isn't trivial.
5. **Checks human-authored / Zetaris shallow (~1 Sponsor + Innovation).** Minimum: say so openly in the Q&A ("pluggable SQL predicate library; roadmap is LLM-drafted SQL dry-run on Zetaris"). Stretch: route H3's `generic_neq` through the Zetaris TEMP VIEW, so 2 of 3 proofs use the sponsor.

## Verdict
Real, honest improvement. The proof step now demonstrably rejects on-topic wrong claims in the documented runs, which answers the biggest v7 Technical question. The remaining risk is mostly non-code: the video, and docs that still carry pre-v6 numbers and the L209 story.
