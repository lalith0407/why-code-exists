# Why does this code exist?

**Open Agent Hackathon 2026 · Track 02: The Agent That Can Explain Why**

When agent-written code breaks, `git blame` stops at a bot commit. The reason the code looks the way it does is buried in an agent session thousands of lines long, and nobody re-reads it.

Given an error with a stack trace, plus the agent session (or GitHub PR) that wrote the code, this tool shows three things side by side, each quoted from its source with a citation:

| 1. What the agent was asked | 2. What it understood | 3. What happened |
|---|---|---|
| The latest human instruction before the edit, quoted from the session (or the PR description) | The agent's own message right before it wrote the line, verbatim | The error, the stack frame's file:line, the exact line, and the edit that wrote it |

The tool selects and links these pieces; it doesn't write an explanation. A human reads the gap between 2 and 3.

## Example (dev case; pieces are tool output, explanation is human-written)

`heldout-vote-race` (dev set, despite the name): Pulseboard, a feedback board built by an agent from a plain founder prompt.

- **Asked** (`transcript L1`): "People in a workspace can submit feedback, upvote, and leave comments."
- **Understood** (`L121`, 2 lines before the edit at `L123`): "Then I need toggleVoteAction, which checks for an existing vote by user+feedback and either deletes (un-vote) or creates it…"
- **Happened**: `Unique constraint failed on the fields: (feedbackId, userId)` at `lib/actions/feedback.ts:106`, a line written by edit `L123`.

*Human-written interpretation, not tool output:* the agent planned check-then-create and never mentions concurrent clicks; a double-click sends two requests, both see "no vote yet", and the second `create` fails. The quote shows the plan, not an explicit single-click belief.

## The problem is real: litellm #42354 (Devin)

[BerriAI/litellm #42354](https://github.com/BerriAI/litellm/pull/42354), opened by `devin-ai-integration[bot]`, was asked to make key-attached guardrails run on `POST /v1/videos`. Devin's commit message gives its understanding: `/v1/videos` dispatches `avideo_generation`, "which CallTypes did not know… Add the video call types…". Adding those call types also routed video results into a chat-shaped post-call hook. In production, `POST /v1/videos` returned HTTP 400 `'VideoObject' object has no attribute 'choices'`, and the provider showed three queued (billed) jobs for one request (both from the fix PR's "Before" section). The fix, [#42535](https://github.com/BerriAI/litellm/pull/42535), wraps each hook call in try/except.

- **What the engine got (tested):** this error has no stack trace. The engine picked the right PR (#42354) but the wrong file in it, so it's a **partial** result.

## What we measured

### Dev set: 15 cases (tested; not held out)
Details: [`docs/three-piece-results.md`](docs/three-piece-results.md), [`docs/explanatory-grades.md`](docs/explanatory-grades.md).

- These 15 cases were used to build and improve the linker: anchoring on the line's text instead of function line numbers raised linking from 6 to 12 on these same cases. So 12/15 is a dev number.
- Their errors were **written by us** (from runs of each case's scenario), and each one names the culprit file:line in its stack frame. They aren't captured production errors.
- **Linking: 13/15** frame lines were written by an edit in the session (2 were pre-existing code). **12/15** also have a non-silent agent message (≥15 words) before the edit; 1 is a silent edit.
- **What is mechanically checked:** (1) the quoted text is a substring of the cited source message, and (2) the frame line's text equals a line the cited edit added. **What isn't checked:** whether the "asked" paragraph is relevant, or whether "understood" explains the bug. Check (1) is close to trivial, because the quote is cut from that same message.
- **Hand-graded explanatory score (read, not tested; rubric written before grading):** **2/15** cases where "understood" shows the faulty belief *and* the three pieces explain the error (webhook-block, outcome-keys). "Understood" shows the belief in 5/15, and "asked" is relevant in 5/15. The judge estimated 4–5/15.

### Unseen-set test of the LOCATE fix
On 8 real agent-authored PRs that later needed production fixes (not seen during development; transcripts rebuilt from each PR), our LOCATE fix raised top-3 location hits from 3 to 4 and correct root cause (single reader) from 1 to 4 of 8. It also cut grounded answers on our 14-case dev set from 7 to 5 in one run each, so it failed our pre-registered rule. Details: `docs/unseen-results.md`.

### Feasibility spike (not the product)
An outside Cursor cloud agent running Claude Sonnet 5, on our 15 dev cases, showed that explaining *why* needs model reasoning over the code. It is not part of the tool, and its numbers are not the tool's. The tool's real, tested capability is: finds the edit 13/15, shows the asked/understood/happened pieces 12/15, explains why 2/15 (hand-graded), and fresh test 0/1. Experiment logs: `docs/cursor-infer-results.md`, `docs/cursor-infer-v4-results.md`.

### Fresh held-out set (tested)
Under a rule frozen before searching, the search found only **1** eligible public agent-caused bug with a real error text (litellm #41885 → fix #42517). Given only that error text and the repo, the tool picked the **wrong PR** (#31203). That's PR link 0/1, file link 0/1 and explanatory 0/1. Details and every rejected candidate: [`docs/fresh-heldout-results.md`](docs/fresh-heldout-results.md).

Limits:
- In 11 of the 13 linked dev cases, the frame points at a function definition, so "exact line" there means "exact function".
- "Understood" is the agent's whole preceding message, which can run to thousands of words.
- "Asked" is often the session's broad opening prompt.
- The runner is told which transcript belongs to each case; finding the session is not done by the tool.
- We chose the dev cases.

## How the linking works

error → first frame in agent-edited code → exact source line → the transcript edit whose added lines contain that line (the last one wins) → the user message and agent message before that edit. `src/story/three-piece.ts` does this with no LLM, no network and no per-case rules. Sources: Grok Build (formerly Cursor) transcripts, Claude Code transcripts (`src/session/claude-code.ts`), and GitHub PRs (`src/session/github.ts`).

## "Why it broke": the tool's own explanation (new, verified)

The three-piece output above links the pieces; it doesn't explain the gap between "understood" and "happened" — a human
reads that. `src/explain/` adds one more pipeline stage that has the tool itself name what the coding agent overlooked:

1. **Context builder** (`src/explain/context.ts`, deterministic, no LLM, no per-case logic): from the three-piece linker
   output, assembles the symptom, the edited hunk plus ±N lines of its file, the files the edit's function calls or is
   called by (plain static search over the checked-out/reconstructed tree), the three pieces, and transcript windows
   around the edit and around any later agent reasoning that mentions the touched identifiers — under a character budget
   (a token-budget proxy); lowest-priority sections are dropped first and the drop is recorded.
2. **Reasoner** (`src/explain/reasoner.ts`): one generic prompt, answered as JSON (`overlooked_assumption`,
   `evidence[{kind: transcript|code, file?, line, quote}]`, `why_it_breaks`, `confidence`). Default provider is **NVIDIA
   Nemotron** (`NVIDIA_API_KEY`); **Anthropic** (`ANTHROPIC_API_KEY`, model from `ANTHROPIC_MODEL`, default
   `claude-sonnet-4-5`) is an opt-in alternative via `--provider anthropic` / `WCE_EXPLAIN_PROVIDER=anthropic`.
3. **Verifier** (`src/explain/verify.ts`, deterministic): every quote must be a substring of its cited line (a
   transcript `Lnnn` citation is checked against that whole message's body, since one `Lnnn` can span several physical
   lines; code paths are normalized by stripping one leading `src/`). An answer needs at least one verified code quote
   and one verified transcript quote, or it is reported `unverified` — never shown as an explanation. One bounded
   re-ask (telling the model exactly which quotes failed) may be attempted; the attempt and its outcome are recorded as
   a `repair`.
4. **Wiring**: `npx tsx src/bin/explain-why.ts --error <error.json> --transcript <t.jsonl> [--repo <checkout>]
   [--provider nemotron|anthropic]` writes `report.json` and `report.html` (the three pieces, then a "Why it broke"
   section with verified status, plus pointers to the Meterless lesson store and Zetaris evidence paths — neither
   gates this output). Missing credentials are reported plainly (`stage: "no_credentials"`); nothing is faked.

Tested with synthetic fixtures only (`tests/explain-context.test.ts`, `tests/explain-verify.test.ts`,
`tests/explain-parse.test.ts`): no eval case data was used or created, and the stage was not tuned on any real case.
This box has no model API keys, so the reasoner call itself has not been run live — `stage: "no_credentials"` is the
honest, tested result today.

## LOCATE: when the report has no stack frame at all (`src/locate/`)

Everything above needs a stack frame (`file:line`) to anchor on. A plain user complaint — *"clicking Submit
feedback spins for 5 seconds when the webhook endpoint is slow"* — has none, so the pipeline used to stop at
`stage: "no_frame"` before `src/explain/` ever ran. `src/locate/` is a general LOCATE stage that turns a plain
symptom report, the source tree, and the agent session into ranked candidate file:line locations, in two layers,
each measured separately, wired in only when `error.frames` is empty:

1. **Deterministic symbol search** (`src/locate/terms.ts`, `symbols.ts`, `edits.ts`, `score.ts`; no model):
   salient terms are pulled from the report — identifiers, quoted strings, numbers, error text, UI-label-style
   phrases, domain nouns (`terms.ts`, one generic stopword list, no per-case words, no hard-coded synonyms beyond
   generic camelCase/snake_case splitting). A syntactic symbol index of the source tree (`symbols.ts`: functions,
   exports, string literals, numeric constants, routes) and an index of the agent's own edits from the transcript
   (`edits.ts` — the candidate universe, since only code the agent wrote is in scope) feed a BM25-style scorer
   (`score.ts`) over identifiers split on camelCase/snake_case, plus an exact-match bonus for quoted/label
   phrases. Output: the top-K edited hunks, each with its score, matched terms, and the single best line inside it.
2. **Model-assisted agentic search** (`src/locate/agentic.ts`, optional, behind the same provider interface as
   above, `src/llm/providers.ts`): a bounded loop of at most `WCE_LOCATE_MAX_STEPS` (default 6) tool steps —
   `grep(pattern)`, `read(file, start, end)`, `list_edits()` — read-only and sandboxed to the case directory (path
   traversal is refused, nothing is ever written). The model proposes a culprit file:line; a deterministic check
   (`wasWrittenByAgent`) confirms the line exists and was actually written by an agent edit before it is trusted —
   a confident but false answer is rejected and the loop keeps its remaining steps. Every tool call is recorded
   on the result for auditability. Only runs when enabled and credentials exist for the selected provider
   (`WCE_LOCATE_PROVIDER`, default `nemotron`); missing credentials are stated plainly, same as the explain stage.

`src/locate/pipeline.ts` wires the two layers: layer 1 always runs; layer 2's confirmed answer (if it ran and
found one) overrides layer 1's pick. The top candidate is re-anchored onto the current source by its exact added
line text (not just its line number, so later edits that shift lines don't break it) and handed to the existing
linker as a synthesized frame (`threePieceFromFrame` in `src/story/three-piece.ts`) — from there it flows through
the same ASKED/UNDERSTOOD/HAPPENED linking and the same `src/explain/` pipeline as a real stack frame would. The
`report.html` shows a "How the location was found" section: the extracted terms, every layer-1 candidate with its
score and matched terms, every layer-2 tool call, and which candidate was picked — even when LOCATE found nothing.

Tested with synthetic fixtures only (`tests/locate.test.ts`, `tests/explain-locate-wiring.test.ts`): a small fake
repo, a fake transcript with edits, and a fake plain-language report — no eval case data was used or created, and
the stage was not tuned on any real case. No live model calls were made; layer 2 is exercised with a mocked
provider response.

## Optional: corroboration and lesson memory

Neither of these gates the three-piece output.

- **Zetaris** federates independent sources as TEMP tables on the Zetaris cluster: `ERROR_LOG`, `CODE_EDITS` (from the transcript and git) and `APP_DB_WRITES`. It then runs SQL across them, to check that the error, the edit and the data line up. So far it has confirmed 1 dev case (vote-race). The durable File Source is blocked because it needs S3 the cluster can reach, so it uses TEMP VIEWs.
- **Meterless H-MEM** stores the lesson ("the agent was asked X, believed Y; production showed Z") and recalls it before the next agent edits that code. It's vendored unmodified from github.com/Meterless/Meterless at 1742dec and runs in-process, because upstream ships no hosted service. The upstream conformance runner passes 13/13.
- **NVIDIA Nemotron** is an alternative model for the optional belief-sentence step. It's measured, not the default.

## Quick start

```bash
npm install
npm test                      # unit tests incl. tests/three-piece.test.ts, tests/locate.test.ts
npm run why -- --error cases/heldout-vote-race/error.json --transcript <session.jsonl> [--repo <checkout>]
npm run explain-why -- --error cases/heldout-vote-race/error.json --transcript <session.jsonl> [--repo <checkout>] [--provider nemotron|anthropic] [--locate-provider nemotron|anthropic] [--no-locate-model]
scripts/three-piece-all.sh artifacts/three-piece     # all 15 dev cases
npx tsx src/bin/three-piece-github.ts --report artifacts/reframe/litellm-r4-openai/report.json --fix-url https://github.com/BerriAI/litellm/pull/42535
npx tsx src/bin/explain.ts --error cases-real/litellm-video-hook/error.json --repo <litellm clone>   # GitHub path with LLM belief step
npm run approve / npm run prevent   # Meterless lesson store / recall
npm run zetaris:ping
```

Env: `OPENAI_API_KEY` (gpt-4.1-mini, LLM steps only), `NVIDIA_API_KEY` (Nemotron), `ANTHROPIC_API_KEY` (Anthropic), `WCE_METERLESS_DIR`, `WCE_PG_PORT`. LOCATE: `WCE_LOCATE_PROVIDER` (default `nemotron`), `WCE_LOCATE_LAYER2=0` disables the model-assisted layer, `WCE_LOCATE_MAX_STEPS` (default 6) bounds its tool loop. Zetaris credentials are read from `secrets/` and never printed. Every LLM call is logged in `data/llm-calls.jsonl`.

## Safety

Transcripts are redacted (`src/scrub.ts`). Secrets are never printed. The tool itself uses no cloud agents. The feasibility spike (not the product) ran on an outside Cursor cloud agent. Nothing is pushed or made public without Lalith's OK.

## Pre-existing code

See [`docs/pre-existing-code-declaration.md`](docs/pre-existing-code-declaration.md).

## Earlier approaches we tried

These are no longer part of the product. They're kept here so the history is honest.

- **Recreating each bug in a sandbox** (`src/engine/investigate.ts`, `npm run investigate`): a model wrote a reproduction, decoys and a patch, and ran them against the real code. On 15 dev-set bugs (originally frozen as held-out sets for that engine, since burned) it confirmed the cause 2 times. It never confirmed a wrong cause in those first frozen runs, but it did on some later dev runs. It mostly couldn't recreate a production failure from the outside, so we dropped it. Details: `docs/heldout-results.md`, `docs/history/README-pre-story-reframe.md`.
- **litellm reproduction**: `corroboration/litellm_video_hook_repro.py` reruns the real litellm code with the provider mocked, and shows the 400 and 3 billed calls only with Devin's `CallTypes` lines. It was written after reading the fix, so it isn't an independent finding.
- **Before-merge checker** (`src/premerge/`): it reviewed agent PRs before merge. On a frozen set of 5 buggy and 10 clean real PRs, it caught 0 of the 5 and flagged none of the 10 (`docs/premerge-eval-results.md`). It didn't work, so we dropped it.
