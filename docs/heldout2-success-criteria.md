# Held-out set 2: success criteria (written and committed BEFORE any run)

Three new, real, agent-written bugs. None was planted; each line was written by a coding agent in a recorded
transcript and is still present in the final code. Each was confirmed on the real code before this doc was
written (`src/bin/capture-error.ts`, values in each `error.json` are from that real run). None of these bugs was
looked at while building Part A.

The engine is frozen at tag `heldout2-frozen`. Each case runs exactly once. No prompt, heuristic, or code change
between runs. Results go to `docs/heldout-results.md` whatever they are.

| case | repo / provenance | root cause (ground truth, hidden from the engine) |
|---|---|---|
| heldout2-webhook-case | Pulseboard (TS/Next 16, Prisma). `lib/validations.ts` `workspaceSettingsSchema.webhookUrl` has `.toLowerCase()`, written in transcript bc-25dab342 line 113 | The whole webhook URL is lowercased before saving, which corrupts case-sensitive paths and tokens (Zapier/Slack hook IDs), so deliveries go to a URL that does not exist. Reporter frame: `updateWorkspaceSettingsAction`; the faulty line is in a callee file. |
| heldout2-webhook-block | Pulseboard. `lib/actions/feedback.ts` `createFeedbackAction` awaits `sendFeedbackWebhook` (bc-25dab342 lines 122/177) | Submission waits for the outgoing webhook (5 s timeout), although the webhook's contract says a slow endpoint must never block submission. |
| heldout2-drawdown-penny | trading-agent-system (Python). `src/ta/harness/caps.py` `guard_orders` (bc-a98b50df line 107) | Drawdown halt checks only `order.sleeve == "high_risk"`; sub-$5 names, which the spec and `_in_sleeve` count as high-risk, are not halted. |

## What counts as success, per case
`proven_false` only if all of these hold:
1. The claim names the real mechanism above (not a neighbouring one).
2. The reproduction test passes on the original code and fails on the patched code, on real code.
3. Decoys pass on both.
4. The patch is minimal and does not use test fakes.
5. The mechanism gate agrees.

Any other verdict is a failure for that case and is reported as such. `harness_error` is counted separately.
Expected difficulty, stated in advance: webhook-case needs the engine to look past the reporter's frame into
`lib/validations.ts`; if the patch can only touch the frame function, a correct claim with an ineffective or
non-minimal patch is a likely outcome.
