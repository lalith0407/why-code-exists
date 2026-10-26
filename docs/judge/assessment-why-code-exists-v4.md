# Judge assessment: "Why does this code exist?" — current project state (v4)

**When:** Oct 22, 2026 ~11:00 pm PT (America/Los_Angeles; box clock).  
**Persona:** Data-Platform CTO panel (`/workspace/open-agent/judge/persona.md`). Official event rubric (§7).  
**Mode:** Code + demos + docs on the box *now* — not the plan. Harsh. Independent. [I] = judgment.  
**Do not invent features.** Findings labeled **tested** (commands run this pass) vs **read-only**.

**Re-verified on box before scoring (no secrets printed):**

| Command | Result | Label |
|---|---|---|
| `cd why-code-exists && npm test` | **21/21 pass** (9 suites; includes live TEMP VIEW prove + prevent checker/recall) | **tested** |
| `npm run zetaris:ping` | **PASS rows=5 via=ui-proxy**; JDBC :10000 blocked note labeled | **tested** |
| `npm run demo:invite` | Full chain; prove **`Oracle: … path=temp_view`**; summary `FROM WCE_MEMBERSHIP_EVENTS (temp_view)`; lesson **`Backend: meterless_hmem`**, **`H-MEM #: mem-7`** | **tested** |
| `npm run demo:prevent` | Recall **`Source: meterless_hmem`**, **`H-MEM #: mem-5`**; WITHOUT → ACCEPT ADMIN; WITH → REJECT; checker OK; no CloudAgent | **tested** |
| `docs/zetaris-federation.md` | TEMP VIEW preferred; File Source / CREATE TABLE / JDBC blockers documented | **read-only** |
| Ship docs | README (package + root Track 02), demo-script, prevention-ab, judge-qa, slides-outline, devpost, zetaris-federation | **read-only** |
| Recorded 1–4 min video | **Not on box** | **read-only** |

---

## Scores

| Impact 30 | Tech 20 | Innov 15 | Demo 15 | UX 10 | Sponsor 10 | **Total** |
|---|---|---|---|---|---|---|
| 8.9 → **26.7** | 8.3 → **16.6** | 8 → **12** | 9.7 → **14.5** | 8 → **8** | 9.4 → **9.4** | **87.2 → ~87** |

**Reported total: 87/100.**  
**Delta vs v3 (85): +2.**

(Exact sum: 26.7 + 16.6 + 12 + 14.5 + 8 + 9.4 = **87.2**; round to **87** for panel reporting.)

### Why the movement

| Criterion | Was (v3) | Now | Why |
|---|---|---|---|
| Impact | 26 | 26.7 | Prevention is now an in-product CLI loop (recall → next decision flips), not only a markdown A/B table. Track 02 “explain → remember → prevent” is watchable end-to-end. Still one hero + fixture prod error; SSRF not in compare. |
| Tech | 16 | 16.6 | Prefer `CREATE TEMP VIEW WCE_MEMBERSHIP_EVENTS` then `SELECT … FROM` (`oracle_path=temp_view`); 21/21 tests; prevent module with local checker. Deducts: TEMP VIEW still VALUES-fed from app JSON; File Source blocked; git blame fixture; no HTTP Pulseboard repro. |
| Innov | 12 | 12 | Same distinctive prove→lesson→prevention arc. Named TEMP VIEW and `demo:prevent` productize prior ideas; not a new category. |
| Demo | 13.8 | 14.5 | **Material:** `demo:prevent` is a terminal closer with Meterless id + WITHOUT/WITH side-by-side. `demo:invite` now prints named-relation oracle. Still **no recorded 1–4 min video**. |
| UX | 8 | 8 | CLI clear; root README still Track 02. Drag: ship docs cite stale **13/13** and **81** (slides, judge-qa, package README score line, root README, devpost). No on-call dashboard. |
| Sponsor | 9 | 9.4 | Meterless **recall** is load-bearing on `demo:prevent` (mem-5). Zetaris prove shows `FROM WCE_MEMBERSHIP_EVENTS` with honest File Source blockers. Cap: Hay still sees **session TEMP VIEW over app-injected VALUES**, not cluster-owned membership evidence. |

---

## Hard requirements (pass/fail gate)

| Gate | Status | Note |
|---|---|---|
| Zetaris integrated | **Pass (medium)** | Ping + membership prove via TEMP VIEW / VALUES fallback. Not File Source / durable table. |
| Meterless integrated | **Pass (stronger medium)** | Default H-MEM write on invite; **live recall** on prevent. Soft-fail local still present. |
| Cursor used in development | **Pass** | Builder transcript + prevention agents + scrubbed session index. |
| Demo video 1–4 min | **Not on box** | Script ready (`docs/demo-script.md`); video unscored — **hard submission risk**. |
| GitHub + README | **Pass (framing)** | Root + package README are Track 02. Origin publish not verified here. |

Gate no longer fails on “pending sponsors.” Remaining Hay question: *“Did Zetaris hold the membership row, or only evaluate literals you registered as a TEMP VIEW?”* Honest answer tonight: **TEMP VIEW over app-injected VALUES; File Source blocked (documented).**

---

## Prior top holes (v3) — closed / partial / open

| # | Hole from v3 | Status | Evidence |
|---|---|---|---|
| 1 | Zetaris is SQL over app-injected VALUES, not evidence plane | **Partial** | Prefer named `WCE_MEMBERSHIP_EVENTS` TEMP VIEW + labeled `oracle_path=temp_view`. Open: row still comes from live-evidence JSON each session; File Source/S3 blocked. |
| 2 | Prevention not a product surface | **Closed** | `npm run demo:prevent` recalls Meterless (`mem-5`), WITHOUT vs WITH, local checker; tests cover it. Cloud A/B remains in `prevention-ab.md` (no mid-demo CloudAgent). |
| 3 | Packaging / ablation / stale docs | **Open** | No video; slides/judge-qa/devpost/READMEs still cite 13/13 and/or 81; SSRF not in `demo:compare`; git fixture. |

---

## Remaining top holes

### Idea-level (what a CTO objects to first)

1. **Zetaris TEMP VIEW is VALUES in a tuxedo.** Judges see `FROM WCE_MEMBERSHIP_EVENTS`, which is better optics than an inline VALUES dump — and the cluster still never *owned* the membership evidence. Until File Source / durable Lightning table holds the row (or another federated source the cluster can read), Sponsor stays ~9.x and Impact barely moves past mid-80s.
2. **Submission hard-gate risk: no recorded 1–4 min video; ship docs stale.** Rules require the video. Slides still say “Zetaris not yet the membership oracle,” “13/13,” “81,” and “root README still Blast Radius” — all wrong relative to tonight’s box. A panel that opens slides first will under-believe the bump.
3. **Ablation still one hero.** SSRF is code-proven and documented; it is not in `demo:compare`. One invite story + fixture prod error still reads like a chosen anecdote.

### Code-level

1. File Source / CREATE TABLE / JDBC blockers remain (tested outcomes in `docs/zetaris-federation.md`).
2. Git blame fixture unless `WCE_PULSEBOARD_GIT` set; Pulseboard tree not on box.
3. No dashboard pane; Nemotron still opt-in/off on default demos.

---

## Highest-leverage next moves (Fri EOD)

1. **Record the 3-min video from `demo-script.md`** (invite → compare → prevent → optional ping). Non-negotiable for submit. **Est.: Demo +0.3–0.5 once watchable; clears hard gate.**
2. **Refresh ship docs in one pass:** 21/21, 87 (or “latest judge”), TEMP VIEW oracle, Meterless recall on prevent, remove “not yet the membership oracle” / Blast Radius residue from slides & judge-qa & package README score line. **Est.: UX +0.5; trust.**
3. **If time:** second compare case (SSRF) or any cluster-reachable CSV File Source once. Do **not** rename TEMP VIEW as “federation owns the data.” **Est.: Impact/Sponsor +0.5 only if File Source actually holds the row.**

**Ceiling if video + docs land, federation still TEMP VIEW: ~88–89.** Past 90 still needs multi-case eval + UI an on-call would open + durable federated evidence as default.

---

## Rubric notes (what would / would not move score)

| If you… | Likely gain | Will *not* count as |
|---|---|---|
| File-source / durable table as prove default | Sponsor +0.5–1; Tech +0.5 | Calling TEMP VIEW “we federated Pulseboard” |
| Recorded 1–4 min video matching script | Demo +0.3–0.5; clears gate | Narration over mocks |
| Refresh slides/QA/devpost/README scores | UX +0.5 | Leaving 13/13 and 81 on slides |
| SSRF in `demo:compare` | Impact +0.5; Demo +0.3 | Mention-only in docs |

---

## Top 3 strengths

1. **Closed prevention loop in-CLI** — `demo:prevent` recalls a real Meterless H-MEM id and flips accept→reject on the same fixture without CloudAgent mid-talk (**tested**).
2. **Honest, load-bearing sponsor path on the hero** — Zetaris named-relation prove + ping; Meterless write+recall; fidelity labels and File Source blockers documented (**tested** + **read-only**).
3. **Clear Track 02 story with outsider hero bug** — Pulseboard invite takeover, L209 quote, join-only vs ours compare, 21/21 green (**tested**).

## Top 3 holes

1. **TEMP VIEW ≠ cluster-owned membership evidence** (VALUES-fed session relation; File Source blocked).
2. **No recorded demo video; ship docs cite stale 13/13 and 81.**
3. **Single-hero ablation** (SSRF not in compare; git/HTTP still fixture / logic-level).

---

## Go / no-go for Fri EOD submit

**Conditional GO** — product bump is real and re-verified. **Do not submit until** (a) 1–4 min video is recorded from the current CLI story, and (b) slides / judge-qa / package+root README score lines / devpost test counts match **21/21** and TEMP VIEW + `demo:prevent`. Federation honesty already labeled; overclaiming TEMP VIEW as durable federation would cost more than leaving it labeled.

---

## Verdict

**87/100 (+2 vs v3 85).** The team closed the prevention product hole and upgraded prove optics to a named TEMP VIEW with documented File Source blockers — both re-run on this box. What a Hay-type judge still sees: **sponsor SQL over app-injected session data, and a submission package that has not caught up (no video; stale 81/13-13 docs).** Ship video + doc refresh for Fri; treat durable Zetaris ownership as the remaining score ceiling, not a rename.
