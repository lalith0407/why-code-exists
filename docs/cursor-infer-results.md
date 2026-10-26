# Cursor inference experiment: results, blind variant (headline)

- **Run:** cloud agent bc-818eb37d-f55f-58a4-a8ef-40f5d8ea219a (Claude Sonnet 5), on `bundle-blind.tgz` with prompt-blind.txt. Rule frozen at `cursor-infer-frozen-v3`, applied unchanged.
- **Answers:** extracted verbatim from the agent's final message (its commit 91bf6c9) to `artifacts/cursor-infer/blind-sonnet5/answers/`. A trailing newline was added to each file.
- **Fix-changed lines:** recorded in docs/cursor-infer-fix-lines.md (commit 20f6258) BEFORE any answer was opened, and not adjusted afterwards. They're my reading: each case's culprit frame.
- **Grading:**
  - Grounded: scripted (`grade_mech.py`). A transcript quote is checked against every physical line that carries its `Lnnn` label; code quotes are checked against the cited source line; whitespace is normalized.
  - Correct cause: read against ground-truth/ (scenario test plus the known cause). One grader, not blind to the case identity.

## Headline
| | count |
|---|---|
| Grounded (strict v3: all quotes verify + ≥1 transcript + ≥1 code + a code quote within 10 lines of the fix line) | **4 / 15** |
| Correct cause | **14 / 15** |
| **Explained (both)** | **4 / 15** (baseline: 2/15) |

- All 15 answers pass the quote-verification part of grounding: every one of the 37 quotes is a real substring, and every answer has at least 1 transcript and 1 code quote.
- The 11 grounding failures all fail **only** on the within-10-lines proximity test against my pre-recorded frame lines.
- Several of those frame lines are function definitions (`guard_orders` at caps.py:242, `_xirr` at metrics.py:38) or the wrong file (case06: the frame is the settings action, while the `.toLowerCase()` that causes the bug is in validations.ts).
- So the 4/15 mostly reflects my proximity anchor, not wrong citations. Under the frozen rule it stands at 4/15. Not counted, for information only: 14/15 are correct and cite only verifiable quotes.

## Per case
| case | grounded | correct | explained | one-line reasoning | transcript quote states the belief? |
|---|---|---|---|---|---|
| case01 slack-multiline | ✗ (code quote lib/slack.ts:45 is the real regex, but not within 10 lines of the frame route.ts:31) | ✓ | ✗ | `/^\/?pulse\s+feedback\s+(.+)$/i` has no `s`/`m` flag, so `.` can't cross `\n`; a two-line message returns null. That's the actual mechanism. | **No.** L406 is a tool result ("Please add keyboard shortcuts"), unrelated. The "only tested single-line" claim is the answerer's inference. |
| case02 vote-race | ✓ | ✓ | ✓ | Non-atomic findUnique then create, with concurrent double submits; the second create hits @@unique. | Partly. L121 states the check-then-create plan, not an explicit "no concurrency" belief. |
| case03 xirr-short | ✗ (metrics.py:60/65 vs frame :38) | ✓ | ✗ | Newton step clamped to ≤5.0; the true root is ≈740%/yr for +6% in 10 days, so npv(5.0)≠0 and it returns None. Matches the code. | Yes. L277 "Short windows may yield no IRR if Newton fails": the agent foresaw it and accepted it. |
| case04 drawdown-penny | ✗ (caps.py:276 vs :242; 34 lines) | ✓ | ✗ | Drawdown halt checks only `order.sleeve == "high_risk"`, while the penny rule (<$5) is applied only in the sizing caps. | Yes. L102 is the halt rule as the agent stated it. |
| case05 webhook-block | ✗ (feedback.ts:58 vs :15) | ✓ | ✗ | The action awaits the webhook with a 5 s timeout, which gives the 5036 ms. | **Yes, strongly.** L121 "I should await the webhook send too … accepting the extra latency". |
| case06 webhook-case | ✗ (validations.ts:46 vs frame workspace-settings.ts:12, a different file) | ✓ | ✗ | `.toLowerCase()` on webhookUrl in the zod schema; the Zapier token is case-sensitive. | **No.** L112 is a generic "setting up validation schemas" line. |
| case07 plan-injection | ✓ | ✓ | ✓ | The parsed identifier is f-string-spliced, unescaped, into the step-1 literal. | Yes. L46: the agent believed sqlglot's handling of quoted identifiers defeats evasion. |
| case08 retype-unique | ✗ (db.py:80-81 vs :101; 20 lines) | ✓ | ✗ | The SQLite rebuild reads PRAGMA table_info only; the DROP loses the UNIQUE index, which isn't recreated. | **Yes, strongly.** L72 "only handles simple schemas (… no FKs/indexes/triggers) which fits this repo's known tables". |
| case09 schema-target | ✗ (models.py:79 vs :160) | ✓ | ✗ | `_name()` strips the schema, so archive.orders becomes orders, and evidence and plan target the production table. | Yes. L175 treats schema_qualified as an evasion case. |
| case10 caps-unknown | ✓ | ✓ (via why_it_breaks) | ✓ | `enforce_caps` skips tickers not in meta, so an unknown ticker is never capped. The one-sentence assumption puts the blame on `_meta_for` in risk_tools; the mechanism the scenario exercises (`enforce_caps` with empty meta) is named in why_it_breaks. Counted yes; a stricter reading could say partial. | **No.** L102 is a generic algorithm description; L4896 is a tool result ("unknown ticker {ticker}") from another tool. |
| case11 stop-minhold | ✗ (caps.py:279 vs :242; 37 lines) | ✓ | ✗ | The min-hold exemption in guard_orders lists only cap_reduction/holdings_cap, not "stop". | Yes. L8672 shows the agent updating the exemption for holdings_cap only. |
| case12 swing-batch | ✗ (caps.py:263/288 vs :242) | ✓ | ✗ | swings_this_quarter is computed once per batch and never incremented as same-session sells are approved. | Partly. L20 states the counter rule, not the batch assumption; L102 is a nearby line. |
| case13 citation-leaf | ✗ (citations.py vs frame loop.py:230, a different file) | **✗** | ✗ | A neighbouring bug. It blames `validate_claims` in citations.py for not resolving json_path. The failing step is `_keep_after_reopen` (loop.py:230), which does re-check, but only tests that the leaf name ("AAPL") is a **substring of the payload text**, not that the path resolves. Wrong mechanism. | No. L102 is about validate_claims. |
| case14 macro-leapday | ✓ | ✓ | ✓ | `end.replace(year=end.year-5)` on Feb 29 raises ValueError. | **No.** L3567 is the code itself in a tool result, not the agent's reasoning. The answer's "agent reasoned about leap years elsewhere" isn't quoted. |
| case15 outcome-keys | ✗ (selected-work.tsx:69 vs :8) | ✓ | ✗ | `key={outcome.detail}`, and the stub repeats the same detail string. | Yes. L998: the agent knew the placeholders were identical and intended distinct keys. |

**Transcript quotes that state the agent's belief:**
- Yes in 9/15 (03, 04, 05, 07, 08, 09, 11, 15, plus 02 partly).
- Partly in 12.
- No in 5 (01, 06, 10, 13, 14): a tool result, a generic line, or code.

So "correct cause" often came from reading the code, with the transcript quote attached afterwards.

## Leakage check (read)
- **Restating error.txt:** none of the answers just restates error.txt. Each names a code-level mechanism that error.txt doesn't contain.
- **Case04:** the answer's key phrase "sub-$5 penny" was **removed** from error.txt by the bundle builder (leak-log.md), so it came from the code or transcript (caps.py `penny_price_threshold`, L102).
- **Case14:** the only case where error.txt has the culprit frame; it's a real stack trace, so the frame is legitimate input.
- **Case02:** its real stack trace also names the culprit file:line, so the location was given. The race mechanism wasn't.
- **No hint file:** the blind bundle has no located_by_tool.txt.
- **What does leak by construction:** the symptom texts we wrote for the 13 non-exception cases still describe the failing scenario fairly precisely. For example, case12 says "in one session" and case08 names the exact ALTER and the lost index. That makes the search much easier than with a real user report.

## Caveats
- **Dev cases, not held-out:** our linker was tuned on these cases, and the bugs were seeded or found by us. The errors were written by us (13/15 are symptom reports). These cases aren't real production reports.
- **Grounded uses my anchor:** the proximity anchor (the culprit frame) is a coarse, pre-registered reading. It's often a function definition or a caller file. I didn't adjust it after seeing the answers, so grounded 4/15 understates the citation quality. A better pre-registered anchor, the actual fix hunk, doesn't exist for these dev cases.
- **Case01:** I graded correct based on my reading of JS regex semantics: without `s`, `.` doesn't match `\n`; without `m`, `$` is end-of-input, so a multi-line message can't match. The answer's "only tested single-line" is unsupported by its quote.
- **Case10:** graded correct on why_it_breaks; the assumption sentence alone points at a different function.
- **Grader and runs:** one grader, not blind; correct cause is a human judgement. Only one model run, and the hint variant hasn't been run yet.
- **Baseline comparison:** 2/15 was graded with the A/U/E rubric, not correct cause + grounded, so the comparison is rough.
