# Judge assessment v10: Why-Code-Exists (Track 02)

This is an independent, skeptical pass, done Sat Oct 24 2026 around 5:10 PM PT on branch `nemotron-h3` (HEAD 22cb9e9). I role-played an Open Agent Hackathon Track 02 judge and read the code, reports and docs fresh.
- **[tested]** means it ran on the box during this pass.
- **[read]** means I only read the files or docs.
- **Live calls this pass:** 2 (one `demo:slack`, OpenAI A+B).

## Spot checks [tested]
| Step | Result | Notes |
|---|---|---|
| `npm test` | PASS 74/74 (2.1 s) | offline, heuristic reasoner |
| `npm run typecheck` | PASS | |
| `demo:slack` | PASS, 7 s | Claim cites L184. Proven via `slack_event_duplicated`, plus a Zetaris TEMP VIEW `WCE_SLACK_EVENTS` with `GROUP BY event_id HAVING count(*)>1` → `Ev0PULSE1`, side_effects=3, max_retry=2. Lesson `slack-event-idempotency` → H-MEM **mem-60, reused** (60 memories before and after the run). |
| `data/lessons.json` | 3 lessons, one per concept | The local upsert works. |

## Verdict on the four fixes
| Fix | Verdict | Evidence / residual |
|---|---|---|
| 2: stale docs, index | **Done** | Index links invite-nemotron and shows PT times. devpost/slides/demo-script were refreshed, and this pass adds 74/74 and held-out results. Residual: devpost's H3 section and sponsor table still say Zetaris and Meterless cover invite only (see hole 2). |
| 4: H-MEM dedupe | **Done, works live** | Lookup-before-write keyed on bug_id+check_id, a local upsert, and prevent picks the newest (mem-58). Memory count held at 60 across all demos [tested]. Residuals: the ~20 legacy duplicates remain (append-only bridge). The lookup is capped at topN 500 and silently stops deduping beyond that. The reuse rule ignores `wrong_assumption`, so H-MEM keeps the first run's claim text. |
| 3: H3 through both sponsors | **Done, with a framing caveat** | Zetaris SQL ran live and the H3 lesson is specific and persisted. **But** the `event_id` on each row is stamped by the repro harness (the route stores no event_id), and the Zetaris result only *annotates* a proof the local predicate already made. It is corroboration, not an independent oracle. Say "Zetaris confirms", not "Zetaris proves". |
| 5: held-out wrong claims | **Done honestly; weak as evidence** | Committed before running (15bd4bf). 0/12 for both gpt-4.1-mini and Nemotron. As the docs admit, no held-out claim tempted the real check, so this measures decoy routing, not near-miss rejection. Nemotron's 1/2 on "admins" still stands. |

## Idea-level holes
1. **The checks are still human-authored, now with a sharper edge.** The H3 SQL groups rows whose event_id the harness assigned. A data-platform judge may call this "SQL over the answer you already wrote down". The provenance engine generalizes; the proof library doesn't yet.
2. **The sponsor story is now 2 of 3 bugs on Zetaris and 3 of 3 on Meterless, but the docs don't say so.** devpost's sponsor table (L42), "Several sources" (L48) and the H3 section (L61) all predate fix 3, and demo-script's H3 beat doesn't mention Zetaris or H-MEM. Right now the work exists but earns no points.
3. **The near-miss adversarial eval is still n=2 per bug.** The only claims that tempt the real check are the original in-sample pair. A held-out set of 2–3 *near-miss* claims per bug (adjacent to the real check, but wrong) would be the convincing version.
4. **Prevent covers invite only.** The SSRF and H3 lessons are stored but never recalled into a WITHOUT/WITH flip.
5. **There's still no real alert source, and Zetaris uses a TEMP VIEW over injected rows** (File Source is blocked on S3). Both are unchanged and labeled.

## Code-level issues [read/tested]
- `findExistingLesson` queries 500 memories and then filters by tag on the client. That's fine at 60 memories but O(n), with a silent cap.
- On the H3 path, if Zetaris reports "not falsified", the local predicate still proves. The disagreement is only logged, never surfaced in the report.
- `pulseboard-repro/slack-retry/repro.ts` (the `event_rows` change) is outside git. Only the live-evidence JSON it writes is committed.
- `demo:slack` now persists and calls Zetaris by default. That's good for the demo, but the offline tests opt out, so the Zetaris SQL builder is unit-tested and the live path is not.
- Good: dedupe unit tests use a mocked bridge, including the legacy-record match. The H3 lesson concept and the SQL escaping are tested.

## Scores
| Criterion | v9 | v10 | Δ | Why |
|---|---|---|---|---|
| Impact 30 | 27.6 | 27.7 | +0.1 | H3 is now an end-to-end loop (proof, sponsor SQL, specific lesson). |
| Technical 20 | 18.9 | 19.2 | +0.3 | Idempotent lesson store (live-verified), held-out eval committed before running, 74 tests. Deductions: harness-stamped event_id, easy held-out set. |
| Innovation 15 | 13.0 | 13.0 | 0 | Same idea. |
| Demo 15 | 14.7 | 14.7 | 0 | Everything runs first try. **The video is still missing (hard gate).** |
| Product/UX 10 | 9.2 | 9.4 | +0.2 | Index fixed (PT, nemotron link). Slack report shows Zetaris and H-MEM. |
| Sponsor 10 | 9.3 | 9.5 | +0.2 | Zetaris 2/3 bugs, Meterless 3/3 with no dupes. Capped by the docs not saying so and by "confirms vs proves". |
| **Total** | **92.7** | **93.5** | **+0.8** | Conditional on the video. |

## Top 3 remaining holes, ranked by impact per hour (deadline Mon Oct 27 4:45 PM PT)
1. **Record the video (2–3 h; hard gate, 15 points plus eligibility).** In the H3 beat, add "Zetaris confirms: GROUP BY event_id → 3 side effects; lesson mem-60, reused on rerun" (about 5 s).
2. **Update the sponsor claims in devpost and demo-script (about 20 min, roughly +0.3 Sponsor).** Cover 2/3 Zetaris and 3/3 Meterless, deduped. Use "confirms" wording for H3 and state that event_id is stamped by the harness. Bump the judge line to v10.
3. **Add 2 near-miss held-out wrong claims per bug (about 40 min, 6 calls, roughly +0.3 Technical).** Make them adjacent to the real check (for example, "the agent dedupes by event_id but only in memory" for H3). Run them on both models, report as is, no tuning.

Lower priority: a prevent flip for H3 (about 1 h), committing the repro to git, and surfacing Zetaris/local disagreement in the report.

## Verdict
All four fixes are real and verified. The biggest new risk is the wording: claiming "Zetaris proves H3" would invite the harness-stamped event_id critique. Apart from that, the remaining points are in the video and in docs that undersell the work.
