# Meterless e2e on explain reports (tested 2026-10-26 ~7:55 AM PT, branch meterless @ 1746405)

Real vendored engine, real store at `data/meterless` (gitignored, started empty), no mocks. Reports were copied to
`/tmp/e2e`, so saved artifacts are untouched.
- case05 and u06: saved B-anthropic reports (`artifacts/locate-postfix/B-anthropic/case05`, `artifacts/unseen/post/B-anthropic/u06`).
  They predate `lesson_status`, so `approve` computed it.
- case06: one fresh Anthropic run (3 calls, claude-sonnet-4-5, logged in `data/llm-calls.jsonl`).

| Step | Command | Output |
|---|---|---|
| approve case05 | `npm run approve -- --report /tmp/e2e/case05/report.json --decision approve --by Lalith` | `"lesson":"mem-1 (new)"`, key `the-agent-assumed-that-awaiting-the-webhook-call-…\|ts` |
| approve again | same | `"lesson":"mem-1 (dedup_existing)"`; store still 1 record |
| approve u06 | same on u06 | `"lesson":"mem-2 (new)"`; its recall surfaced mem-1 (relevance 0.189, shares file no, shares key no), an **unrelated** lesson, same extension only |
| explain on case06 (fresh) | `npx tsx src/bin/explain-why.ts … --provider anthropic --locate-provider anthropic` | `status: verified`, `lesson: pending approval (…\|ts)`, `recall: 2 related`: mem-1 0.28 (webhook, shares the word "webhook" but a different bug), mem-2 0.22 (unrelated) |
| unverified (saved case01) | `npm run approve -- --report /tmp/e2e/case01/report.json --decision approve` | `refusing: not created because unverified`, exit 1; store still 2 records |

**Honest read:** storing, dedup and refusal work as specified. Recall is word overlap within the same file extension at
threshold 0, so with a tiny store it returns every same-extension lesson. Nothing truly related was surfaced in this test.
