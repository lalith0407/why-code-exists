# GitHub real agent-bug case search log
Started: 2026-10-25 ~2:20 PM PT. Time box ~1h. Read-only.

## Selection criteria (written before searching)
1. Agent PR provably agent-authored (author copilot-swe-agent/Copilot, devin-ai-integration[bot], codex/openhands bot, or Claude Code trailer).
2. Merged into a real project with real users (not toy/personal).
3. Later bug report by a real user with concrete error/stack trace/wrong behavior.
4. Bug traceable to lines introduced by the agent PR.
5. Fixed by a later commit/PR (ground truth).
6. Prefer TS/Python; severity and local runnability recorded but NOT used to judge engine success.
Candidates are not chosen by whether the engine would succeed.

## Queries
(all via authenticated `gh` CLI, read-only; ~2:20-3:00 PM PT)

| # | Query | Yield |
|---|---|---|
| 1 | issues `"regression" "copilot-swe-agent"` | 0 (toy/personal repos, agent-config issues) |
| 2-3 | issues `regression introduced by copilot` (py / ts) | 0 |
| 4 | issues `"introduced in" author:app/copilot-swe-agent` | 0 |
| 5-6 | `revert ... copilot/devin in:title` (issue search, bad syntax) | 0 |
| 7 | prs `Revert "` --author app/copilot-swe-agent --merged | 0 usable (mostly toy repos; vscode#343337 is a settings revert) |
| 8 | prs regression + "introduced in #" copilot (python) | 0 |
| 9 | prs Revert in microsoft/aspire | 0 (reverted PRs were human-authored: 18642 adamint, 18683 JamesNK, 16033 mitchdenny) |
| 10 | prs Revert in vscode + copilot | 0 |
| 11 | prs Revert --author app/devin-ai-integration | leads: litellm#44335 reverting Devin #44144 (perf/ordering, not a user bug) |
| 12 | prs `regression introduced` in BerriAI/litellm, parse "introduced/caused/regressed #N", check author | 7 Devin-authored origin PRs (42262, 42334, 42354, 41588, 40669, 33717, 44738) |
| 13 | issues `regression` in litellm, non-bot authors, referenced PR authored by Devin | 13 hits; after reading, mostly "related/insufficient fix" refs, 1 real causal link (48171 <- 43283) |
| 14-17 | global issues `"introduced in #"`, `"regression from #"`, `"caused by #"`, `"broke in #"` since 2026-03 | 200 issues, 6 with parsable refs, 0 agent-authored |
| 18-20 | prs --author app/copilot-swe-agent --merged "regression introduced" in owners microsoft/dotnet/Azure; check referenced PR authored by Copilot | 7 Copilot->Copilot chains (efcore, runtime, roslyn, sdk, typespec-azure, azure-dev, runtime tests) |

## Candidates (see report)
- STRONG: dotnet/efcore #37302 (Copilot) -> customer issue #37516 -> fixes #37762 (main), #37703 (release). C#.
- STRONG-ish: BerriAI/litellm #42354 (Devin) -> #42535 (Devin found it, no user issue). Python.
- USABLE: BerriAI/litellm #43283 (Devin) -> user issue #48171 -> fix PR #48187 (OPEN, unmerged). Python, security.
- USABLE: BerriAI/litellm #42262 -> #42528 ; #41588 -> #42534 ; #40669 -> #41786 (Devin self-found regressions, no external user issue).
- USABLE: Azure/typespec-azure #4341 (Copilot) -> #4386 (Copilot fix). TypeScript. No public user issue found.
- USABLE: dotnet/runtime #120625 (Copilot) -> #123088. C#. No user issue found.

## Rejected
- litellm #37485 <- #34812: issue says #34812 *did not cover* the case; not causal.
- litellm #46835 <- #43787: residual case not covered by #43787; pre-existing sync/async asymmetry, not introduced by agent.
- litellm #47952 <- #44784: #44784 unmerged, only "related".
- litellm #43946 <- #42345, #45586 <- #42323, #43732 <- #40322/#42414: references are design context, not cause (budget one blames #26829, human).
- litellm #41517/#41549/#41552: maintainer CI-red issues, not real-user bugs (could be used as weak cases).
- litellm #44144 -> revert #44335: reverted for perf/ordering, no user-facing failure.
- dotnet/roslyn #80695, dotnet/sdk #49544, azure-dev #7035, runtime #120731: not inspected in depth (C#/changelog/test-flake), time box.
- All toy/personal repos from queries 1 and 7.
