# Pre-merge eval: selection rule (written BEFORE any search; Sun Oct 25 2026 ~2:50 PM PT)

Purpose: measure whether the pre-merge reviewer (src/premerge) would have flagged a coding-agent PR that later needed a fix,
and how often it raises flags on agent PRs that turned out fine. Rule fixed before searching; the list is frozen (git tag
`premerge-eval-frozen`) before the engine is run on any eval case. No tuning on eval cases after freezing.

## Agent PR (both classes)
- Merged PR on a public GitHub repo whose author is a coding-agent bot (copilot-swe-agent, devin-ai-integration, openhands-agent,
  chatgpt-codex-connector, google-labs-jules, cursor, claude, ...) OR whose commits carry an agent Co-Authored-By trailer
  (same detection as src/session/github.ts).
- Changed code is predominantly TypeScript/JavaScript or Python (>50% of changed non-test code lines).
- Merged on or before 2026-09-25 (so a >=30-day observation window exists).

## Positive
- A LATER merged PR or commit in the same repo whose title/body/commit message explicitly names the agent PR (by #number, URL, or
  merge SHA) as the cause of a bug / regression it fixes, or is a revert of it.
- Ground-truth location = files/functions changed by that fix (cause text from the fix PR).

## Negative
- Agent PR from the same repo as a positive (or, if not enough, from the same search), merged within ±60 days of that positive,
  with no later PR/commit/issue referencing it as a cause/revert (checked via GitHub search for the PR number and "revert") >= 30 days after merge.
- Picked deterministically: the merged agent PRs in that window, ordered by merge date nearest to the positive, skipping PRs that are
  docs/test/CI-only or > 1500 changed lines; first N taken.

## Excluded (inspired the design; dev/demo only, labeled as such)
litellm #42354, #43283, #42262, #41588, #40669; Azure/typespec-azure #4341; dotnet/efcore #37302; dotnet/runtime #120625.

## Target size
~5 positives, ~10 negatives. If fewer positives are found within the search time-box (~60 min), the shortfall is reported, not padded.

## Scoring (fixed now)
- Positive = HIT if at least one flag's cited consumer site is in a file the fix changed (or the same function), AND the flag's stated
  breakage is consistent with the fix's stated cause (judged by me, written down per case with the flag text quoted). Otherwise MISS.
- Negative = FALSE ALARM if the engine emits >=1 flag (any confidence). Also reported: flags per PR.
- Every flag on every case is listed in docs/premerge-eval-results.md.

## Search outcome (Sun Oct 25, ~3:00-3:15 PM PT) — FROZEN in docs/premerge-eval-frozen.json, tag premerge-eval-frozen
- Search: scripts/premerge-search/find.py (merged TS/Python PRs whose text names #N with revert/regress/introduc/caus/broke; keep N if authored
  by an agent bot). 8 queries; raw hits in scripts/premerge-search/candidates.jsonl. Negatives: scripts/premerge-search/neg.py (rule above).
- Positives (5): vexor-terminal #32 (fix #33), fluxocaixa #19 (#20), xuantoi #127 (#129), soberliving #13 (#14), securenexus #416 (#417).
  All Devin-authored. Excluded: otterworks #137 (no TS/Py code), amatjkay #25 (5-month release PR, not a single change), vulnerability-scanner
  #10 (reference was to an issue), EventRelay #542 (not merged), OSINT-BIBLE #4 / boomtick #927 (merged after 2026-09-25).
- Negatives (10): 2 per positive repo, nearest merge date, no later PR referencing them with revert/regress/fix/bug/broke.
- HONEST CAVEATS, known before running: all are small/personal repos (no large OSS project matched the rule in the time-box); 4 of 5 fixes
  say Devin Review (a post-merge review bot) flagged the regression; 1 positive touches a .vue file (TS analyser can't parse SFCs);
  securenexus #416 is 3122 lines (fan-out bound will apply). Several positives are bugs INSIDE the changed code, not in a consumer, so the
  engine design (fixed now, before any eval run) reviews the changed hunks themselves as "self" sites in addition to consumer sites.
