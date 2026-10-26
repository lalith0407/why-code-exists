# Judge assessment: "Why does this code exist?" — polish pass (v5)

**When:** Oct 23, 2026 ~1:40 pm PT (America/Los_Angeles; box clock).  
**Persona:** Data-Platform CTO panel (`/workspace/open-agent/judge/persona.md`). Official event rubric (§7).  
**Mode:** Code + demos + docs on the box *now* — not the plan. Harsh. Independent. [I] = judgment.  
**Do not invent features.** Findings labeled **tested** (commands run this pass) vs **read-only**.

**Re-verified on box before scoring (no secrets printed):**

| Command | Result | Label |
|---|---|---|
| `cd why-code-exists && npm test` | **22/22 pass** (9 suites; +SSRF compare ablation) | **tested** |
| `npm run zetaris:ping` | **PASS rows=5 via=ui-proxy**; JDBC :10000 blocked note labeled | **tested** |
| `npm run demo:invite` | Full chain; prove **`path=temp_view`**; Meterless **`mem-8`**; VP banner | **tested** |
| `npm run demo:compare` | Hero JOIN ONLY vs OURS + **SECOND CASE SSRF** (L98, `link-preview-ssrf-block`) | **tested** |
| `npm run demo:prevent` | Recall **`meterless_hmem` / mem-5**; WITHOUT ADMIN / WITH REJECT; checker OK | **tested** |
| Pulseboard git tree on box | **Absent** — blame remains fixture; `WCE_PULSEBOARD_GIT` documented | **read-only** |
| Recorded 1–4 min video | **Not on box** | **read-only** |
| Ship docs + `docs/rubric-vs-polish.md` | Synced to TEMP VIEW / prevent / SSRF-in-compare / File Source blocked | **read-only** |

---

## Scores

| Impact 30 | Tech 20 | Innov 15 | Demo 15 | UX 10 | Sponsor 10 | **Total** |
|---|---|---|---|---|---|---|
| 9.0 → **27.0** | 8.4 → **16.8** | 8 → **12** | 9.8 → **14.7** | 8.5 → **8.5** | 9.4 → **9.4** | **88.4 → ~88** |

**Reported total: 88/100.**  
**Delta vs v4 (87): +1.**

(Exact: 27.0 + 16.8 + 12 + 14.7 + 8.5 + 9.4 = **88.4**; round to **88**.)

### Why the movement

| Criterion | Was (v4) | Now | Why |
|---|---|---|---|
| Impact | 26.7 | 27.0 | SSRF is now a watchable second case in `demo:compare` (same pipeline, L98 quote). Still fixture prod errors; not a multi-incident eval set. Harsh: +0.3 not full +0.5. |
| Tech | 16.6 | 16.8 | 22/22; SSRF investigate path + generic session finder; live-blame path documented. Deducts: TEMP VIEW still VALUES-fed; blame fixture; SSRF prove is local predicate not Zetaris. |
| Innov | 12 | 12 | Same prove→lesson→prevent category; ablation productizes prior idea. |
| Demo | 14.5 | 14.7 | VP headers + SSRF beat improve terminal story. **Still no recorded 1–4 min video** — hard submission risk; caps Demo. |
| UX | 8 | 8.5 | Ship docs (README, slides, judge-qa, devpost, SHIP-CHECKLIST, demo-script, rubric map) synced; stale “SSRF not in compare” removed. |
| Sponsor | 9.4 | 9.4 | Unchanged: Meterless recall load-bearing; Zetaris TEMP VIEW labeled; File Source still blocked. SSRF does not strengthen Zetaris story. |

---

## Hard requirements (pass/fail gate)

| Gate | Status | Note |
|---|---|---|
| Zetaris integrated | **Pass (medium)** | Ping + membership TEMP VIEW prove. Not File Source. |
| Meterless integrated | **Pass (stronger medium)** | Write on invite/compare; live recall on prevent. |
| Cursor used in development | **Pass** | Builder transcript + scrub + session index. |
| Demo video 1–4 min | **Not on box** | Script + capture helper ready — **hard submission risk**. |
| GitHub + README | **Pass (framing)** | Track 02 root + package README. Origin publish not verified. |

---

## Prior top holes (v4) — closed / partial / open

| # | Hole from v4 | Status | Evidence |
|---|---|---|---|
| 1 | TEMP VIEW = VALUES in a tuxedo | **Open** | Still `oracle_path=temp_view`; File Source blocked (**tested** / docs). |
| 2 | No video; ship docs stale (13/13, 81) | **Partial** | Docs synced (**read-only**). Video still missing. |
| 3 | Single-hero ablation | **Closed (product)** | `demo:compare` prints SSRF beat; 22/22 includes ablation test (**tested**). |

---

## Remaining top holes

1. **No recorded 1–4 min Devpost video** — rules hard gate; Demo cannot clear mid-14s until watchable.  
2. **Zetaris TEMP VIEW ≠ cluster-owned membership evidence** — File Source / durable table still blocked.  
3. **Git blame fixture** — no Pulseboard checkout on box (`WCE_PULSEBOARD_GIT` unset).  
4. **SSRF evidence is code-proven fixture** — honest, but not a live HTTP hit (same class of honesty as invite HTTP blocker).

---

## Highest-leverage next moves (Lalith only)

1. **Record the 1–4 min video** from `docs/demo-script.md` / `scripts/record-demo-capture.sh`. **Est.: Demo +0.3–0.5; clears hard gate → ~89.**  
2. **Public GitHub + Devpost** with your OK.  
3. Do **not** claim File Source fixed. Durable federation only if cluster S3 appears.

**Ceiling if video lands, federation still TEMP VIEW: ~89–90.** Past 90 still needs durable federated evidence + on-call UI + multi-case eval.

---

## Top 3 strengths

1. **Closed Track 02 loop in-CLI** — invite prove → Meterless lesson → `demo:prevent` flips decision (**tested**).  
2. **Ablation now productized** — invite hero + SSRF L98 beat in one compare command (**tested**).  
3. **Honest sponsor labeling** — TEMP VIEW / UI-proxy / File Source blockers / fixture blame all said aloud (**tested** + **read-only**).

## Top 3 holes

1. **No recorded demo video** (submit gate).  
2. **TEMP VIEW still app-injected session relation.**  
3. **Fixture blame + fixture SSRF evidence** (paths ready; trees/HTTP not on box).

---

## Go / no-go for Fri EOD submit

**Conditional GO** — polish landed and re-verified. **Do not submit until** the 1–4 min video is recorded from the current CLI story (invite → compare with SSRF → prevent). Federation honesty already labeled; overclaiming TEMP VIEW as durable federation would cost more than leaving it labeled.

---

## Verdict

**88/100 (+1 vs v4 87).** The team closed the single-hero ablation hole and synced ship docs; demos and 22/22 tests re-ran clean on this box. What a Hay-type judge still sees: **sponsor SQL over app-injected session data, and a missing required video.** Record the video for Fri; treat durable Zetaris ownership as the remaining score ceiling.
