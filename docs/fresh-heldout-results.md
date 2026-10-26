# Fresh held-out test: results (TESTED, 2026-10-25 PDT)

- Rule: docs/fresh-heldout-rule.md, frozen at tag `fresh-heldout-frozen` (770a091) before any candidate was looked at.
- Engine: the code at that tag, unchanged. No `src/` edits during the test.
- Raw search output and the scanning scripts are in docs/fresh-heldout-search/.

## Headline
- **Eligible cases found: 1 of the target 5.** The rule's search procedure turned up only one candidate that met every criterion. We didn't widen the rule mid-test.
- **PR link: 0/1. File link: 0/1. Explanatory: 0/1.**
- Three pieces "present" (non-empty, with citations): 1/1. They're attached to the wrong PR, so this counts for nothing.

## Case 1: litellm, agent PR #41885 (Devin), fixed by #42517. FAIL
- **Agent PR (ground truth):** https://github.com/BerriAI/litellm/pull/41885 by `devin-ai-integration`, merged. The fix PR says "The unscoped opt-in was introduced in 1a52bae779 (#41885)".
- **Fix:** https://github.com/BerriAI/litellm/pull/42517. It changes `litellm/rust_bridge/catalog.py` (`Route.MESSAGES` goes back to `PYTHON_ONLY`).
- **Input:**
  - `message` = the HTTP 400 body copied verbatim from the fix PR's "Before" block (`context_management: Extra inputs are not permitted`).
  - `frames` = [] (no stack trace).
  - `observed_at` = the fix PR's creation time.
  - `repo.commit` = 4bcdaf3d4b, the last main commit before that time (the fix PR's own "Before" commit).
  - File: docs/fresh-heldout-search/litellm-41885.json.
- **Engine output** (artifacts/fresh/litellm-41885/): edit `litellm/llms/bedrock/claude_platform/common_utils.py:16-73` @ f3c920a06b, PR **#31203** (a different Devin PR, about stripping Bedrock body params).
  - PR link ✗ and file link ✗ (tested).
  - Asked = the "Credit" paragraph of #31203 (A ✗). Understood = "fix(bedrock/claude_platform): strip body params the AWS endpoint rejects" (U ✗ for this bug). E ✗ (read).
- **Why it failed (read):** the error text says nothing about the Rust bridge or `LITELLM_RUST`. The commit ranker matched on the "extra inputs / rejected params" wording and picked an unrelated param-stripping PR. With only the error text as input, the cause can't be seen.

## Rejected candidates (search order)
The scanning scripts used regexes to find a "introduced/caused/regressed … #N" reference and error or stack text in the fix PR body. Hits where the referenced PR was agent-authored were then read by hand.
- **Query 1** (merged agent-authored fix PRs matching "regression" "introduced in"; Devin and Copilot top 100 each; Codex, Claude and Cursor top 30): 260 PRs.
  - The large majority were rejected for having **no reference to an earlier agent PR as the cause**. The per-PR lines are in q1*.out.
  - Rejected with an agent-PR reference but **no error or stack text** (rule 3):
    - zhuocun/agent-skills#126
    - litellm#44484 (tech-debt cleanup, not a bug)
    - epartscart/ecomae#1789 and #1780
    - DJLougen/hive#91
    - airbyte#85802
    - nikolausnold/NIKNOLIG-Monorepo#118
    - opentelemetry-java-instrumentation#20664 (also Java)
    - SJS1001/PROspector#32
    - KamalAlipour/trustme#47
    - Jorybraun/victoria-kill-zone#20
    - mohammadraufzahed/tondbad-swoole#50
    - herbertnathan28-123/beagle-projections#124
    - wattzor/STruCpp#22
    - FILLIN-RX/CHILLERS#17
    - Big621/Main-#15
    - mastra#18127 (read: code snippet and a Slack report, no error text)
    - evanbackup1256-ship-it/kick#4
    - jackdarckart#56
    - Micfinch/mempool.js#18
    - tgptom/cordova-plugin-push#9
  - Rejected, read by hand:
    - Otisigma/halo-world-global-platform#421 and #95: feature refinements, not a bug fix with an error.
    - dotnet/efcore#38924: C# (rule 5).
  - **Accepted:** litellm#42517 → #41885.
- **Query 2** (issues "Traceback"/"Error:" with "introduced in #", top 150 each): 300 issues, **0** whose referenced PR was agent-authored.

## Honest summary
- On genuinely fresh input (only the real error text plus the repo), the frozen engine got the one eligible case wrong at the PR level.
- The search rule also proved too narrow to reach 5 cases. Agent-caused regressions with a pasted error text and an explicit back-reference are rare in public search.
- We're not changing the rule or the engine after seeing this, so the fresh held-out result stands at **0/1**.
