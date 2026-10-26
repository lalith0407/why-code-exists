> Historical development notes; linked run outputs are not included in the public repo.

# Fresh held-out test: rule, frozen BEFORE any candidate is looked at (2026-10-25 PDT)

Frozen by tag `fresh-heldout-frozen`. Engine = the code at that tag; no code changes in `src/` until results are written.

## Selection rule
A candidate is eligible if all of these hold:
1. It's a public GitHub PR **authored by a coding agent**. That means the PR author is one of `devin-ai-integration[bot]`, `Copilot` / `copilot-swe-agent[bot]`, `chatgpt-codex-connector[bot]` / codex, `claude[bot]`, `cursor[bot]` / `cursoragent`, or a PR commit carries a `Co-Authored-By:` trailer naming Devin, Claude, Copilot, Codex or Cursor.
2. The PR is **merged**.
3. A **later PR or issue** says it fixes or reverts a bug caused by that PR (it references the PR number or its merge commit), and contains a **real error message or stack trace from a user or CI run against the merged code**. Hand-written descriptions of behaviour with no error text don't qualify.
4. It hasn't been used before: not litellm #42354, efcore #37302, or any PR in docs/github-cases-search-log.md, docs/premerge-eval-frozen.json, or scripts/premerge-search/candidates.jsonl.
5. The repo is in Python, TypeScript or JavaScript (the engine's git and grep paths assume these), and it can be cloned.

## Search procedure (no cherry-picking)
- Queries run in this order, with the authenticated `gh` CLI (read-only):
  1. `gh search prs --merged "fix" "regression" "introduced in" --sort created` restricted to each agent author in rule 1, in the order listed.
  2. `gh search issues "Traceback" OR "Error:" "introduced in #"`. Then check whether the referenced PR is agent-authored.
- Candidates are taken in search-result order. The first **5** eligible ones are the test set (more if time allows, still in order). Every rejected candidate is logged in docs/fresh-heldout-results.md with its reason. Time box: 90 minutes of searching. If fewer than 5 are found, report the number found.

## Engine input per case (only)
- `error.json`:
  - `message` = the error text and/or stack trace copied verbatim from the fix PR or issue. Only the error and stack text: no diagnosis sentences, no file names the reporter inferred, and no frames unless they're in the pasted trace.
  - `frames` = parsed only from a pasted stack trace (empty otherwise).
  - `observed_at` = the creation time of the issue or fix PR.
  - `repo.commit` = the last default-branch commit before `observed_at`.
- A local clone at `repo.commit`.
- The engine must find the agent PR and the edit itself. No PR number and no file:line hints.
- Run: `npx tsx src/bin/explain.ts --error <e> --repo <clone> --out artifacts/fresh/<case>`, then `npx tsx src/bin/three-piece-github.ts --report …/report.json`. One run per case, with gpt-4.1-mini (the default provider).
- **Leakage note, recorded up front:** the frozen `explain.ts` gives the belief step all agent PR comments, including post-merge ones. The three-piece output uses only the PR body and commit messages, which are pre-merge, so it isn't affected. The engine's `belief` field is **not** graded.
- Ground truth (the fix diff, the fix text and the issue discussion) is read only after the run, for grading.

## Metric
- **PR link:** the engine's PR = the introducing agent PR. Tested, exact match.
- **File link:** the engine's edit file is a file that the introducing PR changed **and** that the fix changes or names. Tested against the fix diff.
- **Three pieces present:** asked (PR body), understood (agent commit message), and happened (error plus localized file). Tested.
- **Explanatory:** hand-graded (read) with the rubric in docs/explanatory-rubric.md (A / U / E). For GitHub cases, U is graded on the agent's commit message and PR body text shown.

The headline numbers are PR link x/N, file link x/N and explanatory x/N. Failures are listed case by case.
