# Third bug (H3): Slack Events retries create duplicate feedback

_Written Fri Oct 23, 2026, ~9:30 PM PT. Nothing planted: the code below is exactly what the Pulseboard builder agent wrote (transcript `bc-25dab342…jsonl`)._

## The bug
- **File:line:** `app/api/slack/events/[slug]/route.ts:79` (`POST`, `prisma.feedback.create`). The file was created at **transcript L184** and never edited again.
- **What's wrong:** the endpoint checks the Slack signature and a 5-minute timestamp window (`lib/slack.ts`), then creates a feedback row for every `event_callback`. It never looks at `event_id` or `X-Slack-Retry-Num`. Slack re-sends an event (up to 3 times) whenever it doesn't get a 2xx within 3 s. Any signed request someone captures can also be replayed for 5 minutes. Each delivery becomes a new feedback post, and the agent logs it again in `slackEventLog`.
- **Agent's belief on record:** at L104 the agent wrote that rejecting timestamps older than five minutes would "prevent replay attacks". At L182, right before writing the route, all it said was "Now let's build the Slack events API route." So the mistake was silent. Retries and dedupe are never mentioned anywhere in the transcript.
- **Severity: medium-high (integrity / double-run), not a confidentiality break.** Duplicate feedback inflates the board. Because the agent's tests (L406–408) never sent a retry, this is the "double-running retries" class and is easy to miss. It doesn't leak data across tenants or escalate privileges, so it is less severe than H1 (invite takeover) and H2 (SSRF).

## Confirmation: logic-level live repro (not the full Next.js app)
The Pulseboard tree isn't on the box (same as for H1). `pulseboard-repro/slack-retry/` runs the agent's **exact** `route.ts` and `lib/slack.ts`, reconstructed from the transcript diffs. Only the 3 import lines were rewritten, to point at an in-memory Prisma shim and a `NextResponse` shim. The repro sends one correctly signed event, then re-sends it the way Slack's retries do (`X-Slack-Retry-Num: 1`, then `2`).

```
/workspace/open-agent/why-code-exists/node_modules/.bin/tsx repro.ts   (in pulseboard-repro/slack-retry)
{ "event_id": "Ev0PULSE1", "deliveries": 3, "http_statuses": [200,200,200],
  "feedback_rows_created": 3, "distinct_titles": ["Export to CSV please"], "slack_event_log_rows": 3 }
```
Saved to `data/live-evidence/slack-retry-h3-live.json`.

## Human-written inputs (only these)
- `fixtures/slack-retry-error.json`, `fixtures/slack-retry-commit.json`
- `fixtures/slack-retry-evidence.json`: ONE check, `slack_event_duplicated`, using the existing `generic_neq` predicate (expected 1 row, actual 3).

## Pipeline run, no engine changes (2 OpenAI calls, gpt-4.1-mini)
`npx tsx src/cli.ts --error fixtures/slack-retry-error.json --commit fixtures/slack-retry-commit.json --evidence fixtures/slack-retry-evidence.json --no-persist`

- **Written-at edit:** L184 (search_replace to `app/api/slack/events/[slug]/route.ts`, function lines 31–102). Correct.
- **Reasoning before:** L182, **silent** ("Now let's build the Slack events API route."). Correct.
- **Model claim (top, verbatim):** "The agent believed that verifying the Slack request signature and parsing the event payload was sufficient to prevent duplicate processing, so it omitted any check for duplicate event IDs or idempotency handling." (cite L184)
- Claim #2 (verbatim): "The agent assumed that Slack events would not be retried or delivered multiple times, so it did not implement any deduplication or retry detection based on event_id."
- **Chosen check:** `slack_event_duplicated` for all 3 claims. **Proven false: yes** [tested, local predicate].

## Honest gaps (what a judge could poke)
1. **No real choice of check.** The evidence file has only one check, so the check-picking step was trivial. The decoy work (Plan 2) would be needed here too.
2. **Zetaris was not used.** The Zetaris SQL oracle only handles `membership_email_mismatch`, so H3 is proven by the local `generic_neq` predicate. Putting H3 through Zetaris would need an engine change.
3. **The lesson text is a generic template:** "enforce the missing authorization / reachability check". That's wrong wording for an idempotency bug, and fixing it would need an engine change. Lesson persistence was skipped (`--no-persist`).
4. **Fidelity label says `prove:fixture_predicates`** even though the observed values come from the live repro, because live-evidence detection is wired only to the invite path.
5. **The model did not surface the L104 "prevent replay attacks" quote.** That line sits in `lib/slack.ts`, which isn't the primary frame. The claim is still correct in substance.
6. Commit mapping uses a fixture (no Pulseboard git tree), same as H1 and H2.

## Candidates rejected
- **Outgoing webhook URL → server-side POST to any host** (`updateWorkspaceSettingsAction` + `sendFeedbackWebhook`): real, but it's the same SSRF class as H2 and admin-only.
- **`toggleVoteAction` double-click:** `@@unique([feedbackId, userId])` blocks duplicate votes, so the worst case is an error. Not severe.
- **`removeMemberAction`:** scoped to the workspace, and admins can't remove themselves. By design.
- **Cross-workspace reads (feedback detail, comments, votes):** all scoped through `workspaceId` or membership. No leak found.
- **Settings and members pages:** gated by `requireWorkspaceAdmin`. OK.
- **`webhookUrl` `.toLowerCase()`:** breaks case-sensitive hook URLs. A real bug, but functional, not severe.
- **`/api/webhooks/test` echoes signature validity:** a demo endpoint, low impact.
