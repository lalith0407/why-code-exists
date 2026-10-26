# Devpost write-up draft: Why does this code exist?

> DRAFT for Lalith's review. Not submitted. Every number is from committed artifacts (`docs/three-piece-results.md`, `artifacts/three-piece/`).

**Track 02: The Agent That Can Explain Why**

## Inspiration
More and more production code is written by coding agents. When it breaks, `git blame` stops at a bot commit. The reason the code looks the way it does (what the agent was told and what it took that to mean) is buried in a session thousands of lines long that nobody re-reads. A real example: Devin's litellm PR [#42354](https://github.com/BerriAI/litellm/pull/42354) added video call types so guardrails would run on `/v1/videos`. It also routed video results into a chat-shaped hook, and production returned HTTP 400 `'VideoObject' object has no attribute 'choices'` while the provider billed three video jobs for one request (per the fix PR). It was fixed in [#42535](https://github.com/BerriAI/litellm/pull/42535).

## What it does
Given an error with a stack trace and the agent session (or PR) that wrote the code, it shows three cited pieces side by side:
1. **What the agent was asked**: the human instruction in force, quoted from the session (or the PR description).
2. **What it understood**: the agent's own words right before it wrote the line, verbatim.
3. **What happened**: the error, file:line, the exact line and the edit that wrote it.

The tool selects and links these pieces; a human reads the gap between 2 and 3. If the agent said nothing before an edit, we flag it as a **silent edit**, which is itself a finding for review.

## How we built it
- **Deterministic linker** (`src/story/three-piece.ts`, TypeScript, no LLM): error → first frame in agent-edited code → exact source line → the transcript edit whose added lines contain it → the user and agent messages before that edit. Every hop is a citation. Two things are checked mechanically: each quote is a substring of its source, and the frame line matches a line the edit added. Whether a quote is relevant, or explains the bug, is not checked.
- **Sources:** Grok Build (formerly Cursor) agent transcripts, Claude Code transcripts, and GitHub PRs (agent authorship from bot author or `Co-Authored-By` trailers; PR body, commits and the agent's pre-merge comments as quotable text).
- **Optional LLM step** (gpt-4.1-mini; NVIDIA Nemotron as alternative): picks the single belief sentence. Quotes must match the source character for character, or nothing is claimed.
- **Optional corroboration and memory:** **Zetaris** SQL across the error log, code edits and app DB writes; **Meterless** H-MEM stores the lesson and recalls it for the next agent.

## Results (tested)
- **Dev set (15 cases, used to build the linker; errors written by us and naming the culprit file:line):** 13/15 linked to the edit that wrote the line, 12/15 with a non-silent agent message. Linking went from 6 to 12 while we improved it on these same cases.
- **Hand-graded explanatory score (rubric written before grading):** 2/15 where the pieces actually explain the error; 'understood' shows the faulty belief in 5/15.
- **Fresh held-out set (frozen rule, real error text only):** 1 eligible case found, and the tool picked the wrong PR (0/1). See docs/fresh-heldout-results.md.
- **Unseen-set test of the LOCATE fix:** On 8 real agent-authored PRs that later needed production fixes (not seen during development; transcripts rebuilt from each PR), our LOCATE fix raised top-3 location hits from 3 to 4 and correct root cause (single reader) from 1 to 4 of 8. It also cut grounded answers on our 14-case dev set from 7 to 5 in one run each, so it failed our pre-registered rule. Details: `docs/unseen-results.md`.
- **Feasibility spike (not the product):** An outside Cursor cloud agent running Claude Sonnet 5, on our 15 dev cases, showed that explaining *why* needs model reasoning over the code. It is not part of the tool, and its numbers are not the tool's. The tool's real, tested capability is: finds the edit 13/15, shows the asked/understood/happened pieces 12/15, explains why 2/15 (hand-graded), and fresh test 0/1. Experiment logs: `docs/cursor-infer-results.md`, `docs/cursor-infer-v4-results.md`.
- **litellm (real, public, no stack trace):** right PR, wrong file in it. Partial.
- **Zetaris:** confirmed 1 dev case.

## Challenges
Agent sessions are thousands of lines long, and the agent often edits the same function several times, which shifts line numbers. Our first linker anchored on function line numbers and linked only 6 of our 15 dev cases. Anchoring on the exact text of the failing line, and taking the last edit that wrote it, raised that to 12 of 15. The fix is general, but it was made on those same cases, so that's a dev number. The harder lesson: linking isn't explaining. By hand, only 2 of the 15 explain the error.

## Accomplishments
- Exact, deterministic linking from a stack frame to the agent edit and the agent's words, with no per-case rules and every hop cited.
- Strict honesty labels: tested vs read-only, corroboration vs evidence, partial vs complete.

## What we learned
Linking to the exact edit is the easy part. Whether the agent's words reveal the faulty belief depends on the agent: often they're a long planning note or a one-liner. Sometimes the agent said almost nothing before an edit, and that silence is worth flagging.

## What's next
Pending discussion with Lalith (deck slide 10).

## Sponsor tech
| Sponsor | How it's used | Status |
|---|---|---|
| **Grok Build** (formerly Cursor) | Agent transcripts are the primary source; the demo app Pulseboard was built by a Grok Build agent | used in every dev case |
| **Zetaris** | Federated SQL over ERROR_LOG, CODE_EDITS, and APP_DB_WRITES TEMP tables on the Zetaris cluster | corroboration; 1 dev confirm; durable File Source blocked (needs S3) |
| **Meterless** | H-MEM lesson store and recall, vendored unmodified at 1742dec, in-process (no hosted service upstream) | conformance 13/13 |
| **NVIDIA** | Nemotron as alternative model for the belief step and mechanism gate | measured, not default |

## Built with
TypeScript, Node.js, Python, PostgreSQL, GitHub CLI, OpenAI gpt-4.1-mini, NVIDIA Nemotron, Zetaris, Meterless H-MEM.

## Pre-existing code
See `docs/pre-existing-code-declaration.md`.
