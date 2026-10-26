# Judge assessment v11: Why-Code-Exists (Track 02)

This is an independent, skeptical pass, done Sat Oct 24 2026 around 6:05 PM PT on `nemotron-h3` (HEAD 893e650). I role-played a Track 02 judge.
- I read the gate code, the eval harnesses, `eval-lines.md` and the reports.
- **[tested]** means I re-used the run outputs from this session, not new calls: `npm test` 79/79 and five demos.

## What changed since v10
A **mechanism gate** (call C) now runs before "proven":
- It sees only the claim text and the written-at function code.
- It lists the constructs the claim says are present or absent, with verbatim quotes.
- A deterministic aggregation decides the verdict, and the gate fails closed on errors.
- The prompt and a fresh near-miss set were committed (94e8ef6) before any gate run. I checked the git order.

## No-hard-coding audit [tested]
- `grep -iE "invite|ssrf|slack|preview|membership|event_id|email|localhost|129|184|bug_id|check_id|retry|redirect"` finds nothing in `src/prove/mechanism.ts` or `runMechanismGate`.
- The prompt has no examples, and the unit tests use synthetic `pay(amount)` code.
- The bug names appear only in the eval harnesses, which pick which recorded claims and code to replay. They aren't in the gate.

## Results [tested]
| set | gpt-4.1-mini | Nemotron |
|---|---|---|
| true claims, recorded (replay) | 9/9 stay proven | 6/6 stay proven |
| true claims, live demos | 3/3 bugs proven | **invite NOT proven (regression; `assume:nemotron` exits 1)** |
| original wrong claims | 0/6 | 1/6 (admins; call B error, not catchable by the gate) |
| held-out 12 | 0/12 | 0/12 |
| old near-miss 6 | 3/6 → 0/6 | 4/6 → 0/6 |
| **fresh near-miss 6** | **1/6 proven** | **3/6 proven** |

## Idea-level holes
1. **The fresh set is the only clean test, and the gate is only partly effective there.** gpt passes 5/6 and Nemotron 3/6. The old near-miss 0/6 shows the gate *can* reject wrong mechanisms. But that set inspired the design (the prompt was written knowing the failure mode, though without its texts), so the fresh numbers are what to quote.
2. **An "absent" claim can't be verified.** The gate verifies quotes only for constructs the model says are present. When the model says a construct is "present" by a loose match (`workspaceId: invite.workspaceId` passing as "compares workspaceIds"), the verbatim check passes. Quote-is-verbatim doesn't mean quote-implements-the-element.
3. **Some passes are "mechanism_unstated".** The model listed no construct, and fail-closed happened to give the right answer. That's luck, not detection.
4. **The same model family judges its own claims.** Nemotron as the gate is weaker: it gives 3/6 on fresh and broke a true claim live.
5. **The replay batched true and wrong claims per bug in one call C.** Each element is judged independently, but having both kinds in one batch is a mild contamination risk. Live runs batch only the claims from one investigation.

## Code-level issues
- **`assume:nemotron` now fails** (exit 1) because the gate's quote wasn't verbatim. If it appears in the video, re-record that beat, or say outright "the gate rejected it: fails closed".
- In the slack and compare reports, the proven step still prints the invite-specific "membership TEMP VIEW (`WCE_MEMBERSHIP_EVENTS`)" honesty line [tested: grep]. The wording is wrong for H3 and SSRF.
- Each proven claim costs one more call (C). It is batched per investigation, so that's fine.
- Good:
  - The gate is pure and testable (`aggregateMechanism`).
  - The status type has a `mechanism_mismatch` state.
  - The report lists each element with "✓ verbatim" or "✗".
  - Eval tables have a gate column.

## Scores
| Criterion | v10 | v11 | Δ | Why |
|---|---|---|---|---|
| Impact 30 | 27.7 | 27.7 | 0 | |
| Technical 20 | 19.2 | 19.2 | 0 | The near-miss exposure (−0.4) is offset by a generic, frozen, honestly-reported gate (+0.4). The fresh 1/6 and 3/6 and the Nemotron regression hold it back. |
| Innovation 15 | 13.0 | 13.3 | +0.3 | Outcome falsification + mechanism check against the code the agent wrote is a distinctive idea. |
| Demo 15 | 14.7 | 14.6 | −0.1 | `assume:nemotron` exits 1. **The video is still missing.** |
| Product/UX 10 | 9.4 | 9.4 | 0 | Gate shown in the reports. Wrong honesty line on H3/SSRF. |
| Sponsor 10 | 9.5 | 9.4 | −0.1 | The NVIDIA path loses its live true claim to the gate. |
| **Total** | **93.5** | **93.6** | **+0.1** | Conditional on the video. |

## Top holes, ranked by impact per hour (deadline Mon Oct 27 4:45 PM PT)
1. **Video (2–3 h; hard gate).** Use the gpt path for the live beats. Show the Nemotron gate rejection as calibration ("the gate fails closed"), not as success.
2. **Wording fixes (about 20 min).** Make the report's honesty line case-specific. In devpost and the slides, quote the fresh numbers (1/6 gpt, 3/6 Nemotron) as the gate's real result, not the 0/6 replay.
3. **Optional, not by tuning:** make the gate's model selectable independently of the reasoner (gpt-4.1-mini gate for a Nemotron reasoner), then evaluate it on a *new* fresh set. That's about 1 h and 8 calls. Don't re-run the current fresh set after changes.

## Verdict
This is real, honest progress. The team found its own blind spot, built a generic fix, froze it before testing, and published a partial result. The fresh-set numbers show the gate narrows the hole but doesn't close it. Present it that way.
