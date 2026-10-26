# Judge assessment v12 (Sat Oct 24 2026, ~6:20 PM PT). A brief pass, done by the same agent that built the change, not an outside reviewer.

**Score: 94.5/100** (v11 was 93.6)

## What changed since v11, verified this pass
- **Gate model:** now configurable with `WCE_GATE_PROVIDER`, default gpt-4.1-mini. It is no longer the same model as the claim writer. There is a unit test for this.
- **FRESH-2:** 6 new near-miss claims, committed before running. Nemotron claims with the gpt gate: 0/6 proven. Four were stopped by the gate and two never mapped to the real check.
- **Live demo:** `assume:nemotron` invite is proven again (gate: consistent, exit 0). The v11 regression is gone, with no prompt change.
- **Honesty line:** now derived from each proof's details: oracle, the TEMP VIEW name taken from ensure_sql, proves vs. confirms, and the evidence source.
  - Invite: "Zetaris proves… WCE_MEMBERSHIP_EVENTS".
  - SSRF: "local predicate… Zetaris is not used".
  - H3: "Zetaris confirms… WCE_SLACK_EVENTS" plus a note that the event_ids come from the repro.
- **Docs:** README, devpost, slides-outline, demo-script and eval-lines now quote the fresh numbers (1/6 and 3/6) as the real gate result. They also no longer cite 68/68, 74/74 or 88.
- **Tests and demos:** 81/81 tests pass. demo:invite, demo:compare, demo:prevent, demo:slack and assume:nemotron all exit 0.

## Top holes
1. **Video not recorded.** This is the hard submission gate.
2. **Small samples.** FRESH-2 is 6 claims and 1 run, so 0/6 is not a rate. The earlier "workspaceIds instead of emails" miss shows the gate can be fooled by a plausible mechanism.
3. **The gpt gate is a second model, not a second method.** Using an OpenAI gate on the Nemotron path also weakens the "Nemotron path" story.
4. **H3's Zetaris role is confirm, not prove,** and its event_ids are synthesized by the repro. Both are disclosed.
