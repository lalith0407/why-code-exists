# Judge assessment v9: Why-Code-Exists (Track 02)

This is an independent, skeptical pass, done Sat Oct 24 2026 around 4:00 PM PT on branch `nemotron-h3` (commit d6e4bb3 plus the `assume:nemotron` script).
- **[tested]** means it ran on the box during this pass, as a full end-to-end run.
- **[read]** means I only read the files or docs.

## End-to-end run [tested]
| Step | Result | Time | Key output |
|---|---|---|---|
| `npm test` | PASS 68/68 | 2.4 s | offline, heuristic reasoner |
| `npm run typecheck` | PASS | 1.6 s | clean |
| `demo:invite` | PASS | ~10 s | written-at L129 (silent, L127). Claim cites L129. 2 claims, both proven false via `membership_row_wrong_user` by the **Zetaris SQL oracle** (`FROM WCE_MEMBERSHIP_EVENTS (temp_view)`, 1 row: alice invite → bob ADMIN). The lesson went to **Meterless H-MEM mem-57**. One quote was dropped as unverified (mocked label). |
| `demo:compare` | PASS | ~12 s | Invite at L129 PROVEN. SSRF: written-at L100, claim cites L100, PROVEN via `ssrf_preview_internal`. Lessons mem-58 and mem-59. |
| `demo:prevent` | PASS | <1 s | Recalled `invite-accept-email-bind` from H-MEM **mem-37**. WITHOUT the lesson it accepts; WITH it, it rejects. |
| `demo:slack` | PASS | ~5 s | written-at L184 (silent, L182). 3/3 claims cite L184 and are proven, via `slack_event_duplicated` (2) and `slack_retry_reprocessed` (1). Zetaris is skipped. No lesson persisted. |
| `assume:nemotron` (invite) | PASS | 13 s | reasoner `nemotron (nvidia/nemotron-3.5-lightning-30b-a3b)`. Claim cites L129 (`const user = await requireUser();`) and is proven false through the Zetaris TEMP VIEW. |

- **Reports [tested]:** index, invite-latest, compare-latest, prevent-latest, slack-latest and invite-nemotron were all regenerated at 3:57–3:58 PM PT. Spot-checked text:
  - invite: L129, PROVEN, WCE_MEMBERSHIP_EVENTS, mem-57
  - compare: L129 and L100, mem-58 and mem-59
  - slack: L184, PROVEN
  - nemotron: L129, PROVEN, Zetaris
- **Live calls:** about 11 OpenAI (invite 3, compare 6, slack 2) and 2 NVIDIA. There were no errors or retries, and every step passed on the first run.
- **E2E findings:**
  - The index page header shows a UTC ISO timestamp. The rows are in PT.
  - The index doesn't list `invite-nemotron.html`.
  - Every invite or compare run writes a **new** H-MEM memory: 57, 58 and 59 in this pass alone. Meanwhile prevent recalls the old mem-37. The lesson store has no dedupe, which is ironically the same class of bug as H3.
  - The Slack lesson's Fix is the generic "Add the missing check…".

## Doc numbers that don't match the outputs [read]
- `../docs/devpost.md` L5 says "Internal judge 88/100 (v5) · Tests: 22/22", and L73 says "22/22". The actual figures are 68/68 tests and a judge score of 92.
- devpost L34 says "Nemotron Ultra via NVIDIA NIM". The tested path is lightning-30b, two-step.
- `../docs/slides-outline.md` L16 says "Quote transcript **L209**". The story is written-at L129.
- `../docs/demo-script.md` and slides-outline don't mention H3 or the Nemotron two-step run.
- There's still no video file [tested: find].

## Idea-level holes (first)
1. **Do the checks generalize, or only the provenance?** H3 makes the strongest case yet that *finding where the code was written and the claim* generalizes. L184 came out with zero engine changes, and gpt-4.1-mini's claim is precise ("no event_id dedupe"). But a human still wrote both real checks and all four decoys for each bug. A judge will say: "you proved the belief false because you already knew the answer key." The honest pitch: a library of reusable predicates, picked by the model, that can reject its own wrong claims.
2. **The adversarial eval is still mostly in-sample.** Invite and SSRF wrong claims are the same n=2 that were tuned on. H3's 0/2 is fresh, which helps. But each H3 wrong claim names exactly the decoy's subject ("no signature check", "no timestamp check"), so mapping it to a decoy is easy.
3. **Nemotron's invite wrong-claim result (1/2 proven) hurts only the NVIDIA story, and only modestly.**
   - It doesn't touch the main rubric: the default reasoner is gpt-4.1-mini and NVIDIA isn't scored.
   - For the separate Nemotron prize it is a real weakness. A smaller model put "admins can accept any invite" onto the real email check, so the proof accepted a wrong claim.
   - Reported honestly, it is actually a good Technical beat: the decoy-and-confirm design is what *measures* this. Spin it as "we run a calibration eval per model and we don't trust Nemotron as the default yet".
   - Hiding it would be the failure.
4. **H3 strengthens "several sources" for provenance, but not for the sponsors.**
   - 3 real agent-written bugs, 3 different files and classes (auth, SSRF, idempotency), the same engine, and written-at found deterministically each time. That's a big generalization upgrade.
   - But Zetaris proves only 1 of 3, and Meterless stores lessons for only 1 of 3: H3's lesson isn't persisted and SSRF's isn't recalled.
   - The data-platform CTO judge will notice that the sponsor tech is load-bearing for the hero bug only.
5. **Zetaris is still a TEMP VIEW over injected rows. The File Source is blocked on S3.** Nothing has changed since v8.
6. **Impact framing:** there's still no real alert source (Sentry or similar). The input errors are hand-written fixtures, which is acceptable for a hackathon.

## Code-level issues [tested/read]
- The H-MEM lesson store isn't idempotent: every demo run creates a new memory, and prevent recalls a stale one [tested]. Key the lessons by `bug_id + check_id`.
- H3 never reaches step 6 (the lesson); `demo:slack` defaults to `persistLesson: false` [read]. Its Fix text is generic.
- `npm test` mocks the LLM. The live call B regression is guarded only by evals [read] (unchanged).
- Nemotron's two-step path runs through `openai.ts`. The old `nemotron.ts` single-call path is now dead in all demos but still documented as the fallback [read]. That's fine.
- Small good points: tests now cover the provider routing, think-block parsing, the "no keyword rescue" rule for Nemotron, and H3 provenance and decoys [read].

## Scores
| Criterion | v8 | v9 | Δ | Why |
|---|---|---|---|---|
| Impact 30 | 27.2 | 27.6 | +0.4 | 3 real bugs across 3 classes, H3 demoed and reported, and written-at generalizes. |
| Technical 20 | 18.6 | 18.9 | +0.3 | Live-probed H3 decoys, a provider-agnostic two-step path, 68 tests, honest per-model calibration. Deductions: in-sample invite/SSRF wrong claims, hand-written checks, H-MEM dupes. |
| Innovation 15 | 12.9 | 13.0 | +0.1 | "The proof rejects wrong claims, and we measure it per model." |
| Demo 15 | 14.7 | 14.7 | 0 | All paths run first try. **The video is still missing (hard gate).** |
| Product/UX 10 | 9.2 | 9.2 | 0 | Slack report added. Index uses UTC in the header and doesn't link the nemotron report. |
| Sponsor 10 | 9.3 | 9.3 | 0 | Zetaris and Meterless are still load-bearing for 1 of 3 bugs. NVIDIA now runs the full path but fails 1 of 2 adversarial claims. |
| **Total** | **91.9** | **92.7 (93)** | **+0.8** | Conditional on the video. Stale devpost numbers could cost credibility if they're left in. |

## Top 5 holes, ranked by impact per hour (deadline Mon Oct 27 4:45 PM PT)
1. **Record the video (it's a hard gate, worth 15 points plus eligibility; about 2–3 h).** Add a 10 s H3 beat: "third real bug, no engine change, written-at L184". Add a 5 s beat on the wrong-claims table.
2. **Fix stale docs (about 20 min; a credibility hole across all criteria).** devpost L5/L73 should say 68/68 and 93. L34 should name lightning two-step. slides-outline L16 should say L129, not L209. Add H3 to demo-script and slides.
3. **Make H3 go through both sponsors (about 1–2 h; worth roughly +0.5 Sponsor and +0.3 Impact).** Load the Slack repro rows into a Zetaris TEMP VIEW (`WCE_SLACK_EVENTS`) and prove `slack_event_duplicated` with `GROUP BY event_id HAVING count(*)>1`. Persist the H3 lesson to H-MEM with a specific fix ("dedupe on event_id; ack retries"). Then 2 of 3 bugs use Zetaris and all 3 use Meterless.
4. **Dedupe the H-MEM lessons (about 30 min; Technical credibility).** Upsert by `bug_id+check_id` so that prevent recalls the newest lesson. A judge rerunning the demos would see mem-37 next to mem-57/58/59.
5. **Run a fresh held-out wrong-claim set (about 45 min, 6–12 calls; roughly +0.5 Technical).** Use 4 new wrong claims per bug, with gpt-4.1-mini and Nemotron, and report the results even if they're imperfect. This turns the Nemotron 1/2 into a calibration comparison instead of an anecdote.

Lower priority: link invite-nemotron from the index, use PT in the index header, and write Q&A copy for "checks are human-authored".

## Verdict
This is a real step forward. H3 is genuine (a real transcript edit at L184, a live repro of the agent's own code, live-probed decoys) and it is the best generalization evidence so far. Nemotron's failure is honest and contained, so report it as calibration. The remaining risk is non-code: the video, plus devpost numbers that are two versions stale.
