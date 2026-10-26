> HISTORY ONLY (superseded 2026-10-24). Describes an earlier engine that ran shimmed/hand-written code. Its scores, demo scripts (demo:*) and sponsor claims are not current results. See ../../README.md.

# Why does this code exist?

## Measured status (2026-10-24 PDT, honest numbers)

- Dev set (6 earlier cases), current engine gen-v7: **0/6 proven**. Harness-error rate went from **5/8 runs (M2) to 0/6** after the generic framework boundary shims.
- Held-out set 2 (3 new agent-written bugs, frozen at tag `heldout2-frozen`, one run each): **1/3 proven** (webhook-block). See `docs/heldout-results.md`.
- Held-out set 1 (tag `generalize-frozen`): 0/3.
- Older demo claims below (marked "Correction") came from an earlier engine with shimmed code. Treat them as history, not current results.


**Open Agent Hackathon · Track 02 — The Agent That Can Explain Why**

When AI-written code breaks in production, `git blame` names a bot commit. The real cause is a wrong assumption the agent made in a session nobody re-reads. Teams fix the symptom; the next agent repeats the mistake.

This tool walks the full chain:

**prod error → file:line → commit → agent session message → wrong assumption → prove it false → lesson**

Pulseboard (a multi-tenant feedback board built by a Grok Build (formerly Cursor) agent from a vague founder prompt) is the **demo victim only**. This package is the investigation engine.

**Sponsor coverage [tested]:** Zetaris covers **2 of 3** bugs: it **proves** invite (TEMP VIEW `WCE_MEMBERSHIP_EVENTS`) and **confirms** the H3 duplicates (TEMP VIEW `WCE_SLACK_EVENTS`, `GROUP BY event_id HAVING count(*)>1` → `Ev0PULSE1`, 3 side effects). For H3 the local predicate makes the proof; Zetaris confirms it. The repro script adds an event_id to each row, because the agent's route stores none. Meterless H-MEM stores lessons for **all 3** bugs (invite-accept-email-bind, link-preview-ssrf-block, slack-event-idempotency), deduped one per bug+check: a rerun reuses the memory (H3 = mem-60).

**Several sources.** Each investigation joins four evidence sources: (1) the prod error and stack trace, (2) git blame and the commit, (3) the agent session transcript, and (4) Zetaris SQL evidence. It then writes the lesson to (5) Meterless H-MEM memory, so the next agent recalls it.

Last independent judge score: 94.5/100 (v12, self-run brief pass; docs/judge-assessment-v12.md; v11=93.6, v5=88, v1=77). Tests: 81/81.

---

## Problem

Startups ship most new code through Grok Build / Claude Code. On-call gets a stack trace, not the agent's thinking. The bug that looked "obvious in hindsight" was an unstated assumption ("token + logged in is enough", "fetch any URL the user pastes"). Without tying the failure back to that assumption — and writing it down for the next agent — the same class of bug returns.

## How it works

1. **Ingest** a prod-shaped error (log fixture today).
2. **Map** stack frame → file:line → commit (`git blame -L` when a local Pulseboard tree exists; else fixture).
3. **Open the session** — load a real Grok Build cloud-agent transcript, scrub secrets, find the message that edited the failing file.
4. **Extract assumptions** from text / thinking / tool args (heuristic by default; NVIDIA Nemotron opt-in).
5. **Prove one false** — membership email mismatch via **Zetaris SQL** preferring `SELECT … FROM WCE_MEMBERSHIP_EVENTS` (session TEMP VIEW from live-evidence); VALUES labeled fallback; soft-falls back to local predicates offline.
6. **Write a lesson** (+ one-line fix sketch) to Meterless H-MEM by default when the blast-radius bridge is present; always also local JSON (soft-fail).
7. **Sponsor ping:** `NY_TAXI.taxi_zones` still verifies the cluster path (5 rows).

## Hero bug — Pulseboard invite takeover (H1)

`acceptInviteForExistingUserAction` in `lib/actions/invites.ts` never checks `invite.email === user.email`.

- **Wrong assumption** (written at builder transcript **L129**, silently; L209 is a later message that reveals the belief): holding the invite **token + being logged in** means you are the invitee.
- **Impact:** any logged-in user with a token (forwarded email, shared link, console log) can join that workspace — including as **ADMIN**.
- **Proof:** Zetaris `SELECT … FROM WCE_MEMBERSHIP_EVENTS` (TEMP VIEW fed from live-evidence; bob≠alice + ADMIN). Same UI-proxy client as the catalog ping: `data/live-evidence/invite-h1-live.json`. **Correction:** this was an earlier demo path on a UI-proxy feed, not proof by the current real-code engine. The current engine does not prove this case (dev run gen-v7: decoy_failed). The Zetaris File Source is not fixed.
- Second case in `demo:compare`: SSRF in `lib/link-preview.ts` (code-proven fixture prove; transcript **L98**; not the hero).
- Third case `npm run demo:slack` [tested]: Slack events route `app/api/slack/events/[slug]/route.ts` written at transcript **L184** (reasoning before: L182, 8 words, silent). A live logic repro of the agent's exact code (Prisma shimmed) delivered one event_id 3× with Slack retry headers and got 3 feedback rows. 2 real checks + 4 decoys (forged signature, stale timestamp, bot message, other workspace's secret: the agent's code handles all four, probed live). gpt-4.1-mini: eval:claims cites L184 **3/3**, right check 3/3, proven **3/3**; eval:wrong-claims **0/2**. Report: `artifacts/reports/slack-latest.html`. **Correction:** that "proven 3/3" came from the old demo engine with Prisma shimmed and hand-picked checks. On the current real-code engine this case is not proven (dev run gen-v7: patch_ineffective).

No finance or payments framing anywhere.

## Written-at vs belief-stated

Each bug gets two answers from the session transcript:

- **Written at** (deterministic, no LLM). `src/session/provenance.ts` takes the crashing frame (file:line:function), scans the transcript's edit diffs, and finds the edit that introduced the function with the frame line inside its range. It also lists later edits that touch the function and the assistant reasoning just before the introducing edit. That reasoning is flagged **silent** if it has fewer than 15 words.
  - Invite takeover: written at **L129** (search_replace to `lib/actions/invites.ts`, fn lines 136–153). Reasoning before it: **silent** (L127, "Now I'm considering what actions to invite next.", 8 words). The agent wrote the hole without stating why.
  - SSRF: written at **L100** (`lib/link-preview.ts`, fn lines 48–101). Reasoning before it: L98, 25 words, not silent. A later edit touching it is at L355.
  - eval:lines scores this 10/10 (5/5 per bug).
- **Claim** (LLM, gpt-4.1-mini, temperature 0, two calls). Call A sees only the error, the frame, the code exactly as the written-at edit introduced it, and the reasoning before it (or "silent"). It states the wrong belief in its own words, citing the written-at edit with a quote that must be verbatim in that code or reasoning. Call B maps the claim to a proof check without the answer key. Each bug offers 6 checks: 2 real and 4 decoys. Call B must first state what each check's evidence shows, then confirm the claim is about the same subject and action, or answer "none". In eval:claims (v6c, 9:43 PM PT) the right check was chosen and the claim proven **3/3 per bug** (invite via the Zetaris TEMP VIEW, SSRF via a local predicate). In eval:wrong-claims, on-topic wrong claims were proven **0/2 per bug**.
  - Limitations: the wrong-claim set is small (2 per bug), and call B was tuned on those same claims. Decoy checks return 0 rows by design, so a claim mapped to a decoy can never be proven. The 0/2 result shows the model avoided the real check; it doesn't show the proof rejecting a claim on its own.
- **Agent later said** (optional supporting quote, never gates the proof). This is the earlier belief-message pick (v3). Candidates are generic: messages that mention the function or file, messages just before or after an edit touching it, and the top keyword matches. The model picks the message that best states the belief behind the code and must give a verbatim quote. Line boosts are off, and an env var can no longer turn them on.
  - This step is unreliable. eval:lines hit our target 2/5 for invite (picks were L168, L168, L209, a fallback, L209) and 0/5 for SSRF (it picked L2 every time).
  - The target itself is debatable. L168 (the page "checks whether the logged-in user's email matches") and L2 (the link-preview plan) are defensible readings.

## Sponsors

| Sponsor | Role in this project | Status |
|---------|----------------------|--------|
| **Zetaris** | **Membership prove oracle** (SQL) + **H3 duplicate confirmation** (`WCE_SLACK_EVENTS` GROUP BY event_id; the repro script adds the event_ids, since the route stores none) + catalog ping: 2 of 3 bugs | **Tested** — prove prefers `FROM WCE_MEMBERSHIP_EVENTS` (TEMP VIEW); VALUES fallback; ping **5 rows**. File Source needs S3 (blocked). JDBC :10000 blocked |
| **Meterless** | Default lesson sink for all 3 bugs (H-MEM `#record` via blast-radius bridge), deduped one per bug+check | **Default on** when bridge present; `WCE_METERLESS=0` forces local-only |
| **Grok Build** | Build tool + subject (real cloud-agent session transcript) | Transcript load + scrub **tested** |
| **NVIDIA Nemotron** | Assumption extract / rank with citations | **Opt-in** (`WCE_REASONER=nemotron`); default demos use free heuristic |


## Where NVIDIA contributes

Honest status: **Nemotron now runs the same two-step path as gpt-4.1-mini, tested live on Sat Oct 24 2026 (~4 PM PT). It's an optional path (`WCE_REASONER=nemotron`), not the default reasoner.**
- Model: `nvidia/nemotron-3.5-lightning-30b-a3b` via the OpenAI-compatible NVIDIA NIM API, thinking off, temperature 0. `src/assume/openai.ts` now takes a provider (`openai` | `nemotron`): call A (claim grounded in the written-at edit, verbatim quote required) and call B (v6c: state each check's evidence as subject + action, confirm `same_subject_and_action`, else "none") use identical prompts, schemas and validation. Nemotron claims are never keyword-matched to a check (`src/prove/check.ts`). The old single-call `src/assume/nemotron.ts` path remains only as a fallback when there is no edit/check context. (In the current engine, Nemotron is used only as the mechanism gate; gpt-4.1-mini writes claim, tests, patch and SQL.)
- **eval:claims [tested], 3 runs per bug:** invite: claim cites written-at **L129 3/3**, right check 3/3, proven **3/3** (Zetaris TEMP VIEW). SSRF: cites **L100 3/3**, right check 3/3, proven **3/3**. Same as gpt-4.1-mini. The earlier L209 citation is gone because Nemotron now sees the written-at edit instead of the heuristic seed.
- **eval:wrong-claims [tested]:** SSRF **0/2** proven (pass). Invite **1/2** proven (fail): Nemotron mapped "admins can accept any invite" to the real `membership_row_wrong_user` check, so a wrong claim was proven false. gpt-4.1-mini scores 0/2 on this set. Nemotron is therefore **not** trusted as the default reasoner.
- **Held-out wrong claims [tested, fix 5]:** 12 new on-topic wrong claims (4 per bug: invite, SSRF, H3) were written and committed before any run, and nothing was tuned afterwards. Results: gpt-4.1-mini **0/12** proven, Nemotron lightning **0/12** proven (6 call-B requests). Caveat: this set is easier. None of the 12 led either model to the real check; they went to decoys or "none". Nemotron still proves **1/2** on the original set (the "admins can accept any invite" claim maps to the real check), so it stays off the default. **Near-miss wrong claims [tested, v10]:** 2 per bug, committed before running. gpt-4.1-mini proved **3/6**, Nemotron **4/6**. The checks test outcomes, not mechanisms, so a claim with the wrong mechanism and the right outcome gets proven (see docs/eval-lines.md). **Mechanism gate [tested, mech-v1]:** a generic call C checks the code constructs a claim asserts against the written-at code, with verbatim quotes and a deterministic verdict. The prompt was frozen and committed before any run. True claims: recorded 9/9 (gpt) and 6/6 (Nemotron) stay proven; live gpt demos stay proven. **The real gate result is the fresh set:** on fresh, never-seen near-miss claims with the same-model gate, **1/6** (gpt-4.1-mini) and **3/6** (Nemotron) wrong claims were still proven. The old near-miss set dropping to 0/6 does not count as evidence, because the gate was built after seeing it. **Gate model is now configurable [tested, Sat Oct 24 ~6:10 PM PT]:** `WCE_GATE_PROVIDER` defaults to gpt-4.1-mini even when Nemotron writes the claims. A second fresh set (FRESH-2, 2 per bug, committed before running in 3318dd2) with Nemotron claims and the gpt gate gave **0/6** wrong claims proven. That is one run of 6 claims, a small sample. With the gpt gate, the live Nemotron invite demo (`assume:nemotron`) is proven again (gate: consistent, exit 0). **Nemotron is measured, not trusted yet:** it is still off by default, and the gate fails closed (on a gate error or a non-verbatim quote, the proof is withheld rather than granted).
- Caveat: 2 of 3 SSRF claims were proven but reasoned oddly (treating the `</head>` cutoff as the SSRF boundary). The check was right; the wording was weaker than gpt-4.1-mini's.
- Calls: 16 NVIDIA calls in total (1+3 invite runs ×2, 3 SSRF runs ×2, 2 call B).

## Quick start

```bash
cd /workspace/open-agent/why-code-exists
npm install
npm test                 # all green
npm run demo:invite      # full chain; Zetaris FROM WCE_MEMBERSHIP_EVENTS + ping   # old demo path; not the current engine, and not a proof
npm run demo:compare     # JOIN ONLY vs OURS (judge pane)
npm run demo:prevent     # lesson recall + WITHOUT vs WITH (no CloudAgent)
npm run zetaris:ping     # SELECT * FROM NY_TAXI.taxi_zones LIMIT 5 → 5 rows
npm run report:open      # open latest HTML investigation report
```

`demo:invite` prints:

**error → file:line → commit → session message → assumption → proof → lesson**

`demo:compare` shows **join-only vs ours** on the invite hero, plus a **SSRF ablation beat** (`lib/link-preview.ts` / transcript L98) so judges see two agent-written bugs, not one anecdote.

`demo:prevent` recalls `invite-accept-email-bind` from Meterless H-MEM (default) or local JSON, prints WITHOUT vs WITH on the bob/alice fixture, and runs a local checker (no CloudAgent).

## Product & UX surface

**CLI + self-contained HTML report** (no separate web app). `demo:invite` / `demo:compare` write:

- `artifacts/reports/invite-latest.html` — on-call timeline (error → proof → lesson → WITHOUT/WITH)
- timestamped copy alongside it

Inline CSS only (no CDN). Secrets scrubbed before write. Open with `npm run report:open` or any browser. Honest labels: TEMP VIEW ≠ durable File Source.

## Fidelity labels (honest)

| Step | Label |
|------|--------|
| Error ingest | **tested** (fixture) |
| Git blame | **live** when `WCE_PULSEBOARD_GIT` points at a local tree; else **fixture** |
| Transcript + secret scrub | **tested** (real Pulseboard builder jsonl) |
| Session edit that wrote invites.ts | **tested** (written-at L129, silent; L209 = later belief message) |
| Assumption extract | **tested** heuristic; Nemotron **opt-in** (soft-fail) |
| Prove false | **tested** — demos use **Zetaris** `FROM WCE_MEMBERSHIP_EVENTS` (TEMP VIEW) over live-evidence; VALUES labeled fallback; offline/tests use local predicates |
| Lesson persist | **tested** Meterless H-MEM when bridge up (default); always local JSON; soft-fail |
| Zetaris | **tested** prove + ping via UI-proxy. Prefer TEMP VIEW relation; File Source needs cluster S3 (blocked). See `docs/zetaris-federation.md` |

## Env

See `.env.example`. Highlights:

| Var | Default | Purpose |
|-----|---------|---------|
| `WCE_REASONER` | `heuristic` | `nemotron` needs `NVIDIA_API_KEY` |
| `WCE_PULSEBOARD_GIT` | unset | Local Pulseboard git tree for live blame (never clones) |
| `WCE_METERLESS` | **auto** | Default on when `blast-radius/bridge` exists; `0` forces local-only; `1` forces try |
| `WCE_ZETARIS` | off in tests | Demos set prove+ping; `1` forces both in pipeline |

Zetaris credentials live under `./secrets/` (**gitignored**). Never paste the admin password into chat, logs, or docs.

## Layout

```
src/ingest/     prod error loader
src/gitmap/     blame (live or fixture)
src/session/    transcript load, scrub, index
src/assume/     heuristic + optional nemotron.ts   (legacy demo path; the current engine is src/engine/)
src/prove/      evidence predicates
src/lesson/     local JSON + optional meterless bridge
src/evidence/   zetaris.ts (UI-proxy SQL + ping)
src/pipeline.ts end-to-end investigate + formatCompare
src/demo-invite.ts / demo-compare.ts / demo-prevent.ts
fixtures/  data/live-evidence/  secrets/ (gitignored)
```

## Safety

- Transcript ingestion redacts connection strings, env secrets, password fields.
- Zetaris password is read from `secrets/` and never returned in ping/demo output.
- Default demos are free. No CloudAgent from this package without explicit OK.
- Stay on the box for this project.

## Still open (Lalith)

- **Recorded 1–4 min demo video** (script ready: `/workspace/open-agent/docs/demo-script.md`) — submission hard gate.
- Public GitHub / Devpost upload (needs your OK — not pushed from box).
- Permanent Lightning File Source for membership CSV (**blocked**: needs cluster-reachable S3; TEMP VIEW path ships — do not rename as durable federation).
- See `/workspace/open-agent/docs/SHIP-CHECKLIST.md` · `/workspace/open-agent/docs/rubric-vs-polish.md`.

## Related docs

- `/workspace/open-agent/docs/plan-why-code-exists-v1.md`
- `/workspace/open-agent/docs/devpost.md`
- `/workspace/open-agent/docs/demo-script.md`
- `/workspace/open-agent/docs/judge-qa.md`
- `/workspace/open-agent/docs/slides-outline.md`
- `/workspace/open-agent/docs/pulseboard-bug-verify.md`
- `/workspace/open-agent/docs/prevention-ab.md` (prevention A/B — tested)
- `/workspace/open-agent/docs/zetaris-federation.md` (TEMP VIEW vs File Source blockers)
- `/workspace/open-agent/judge/assessment-why-code-exists-v1.md` (77/100)
- `/workspace/open-agent/why-code-exists/docs/judge/assessment-why-code-exists-v4.md` (87/100)
- `/workspace/open-agent/why-code-exists/docs/judge/assessment-why-code-exists-v5.md` (latest polish pass)
- `/workspace/open-agent/docs/rubric-vs-polish.md`
- `/workspace/open-agent/docs/SHIP-CHECKLIST.md` (Fri submit)
- `/workspace/open-agent/docs/status-zetaris-meterless-readme.md` (oracle + Meterless default + root README)
