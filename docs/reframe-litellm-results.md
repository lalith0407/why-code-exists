# Real public case: BerriAI/litellm #42354 (Devin) -> 'VideoObject' object has no attribute 'choices'

Run Sun Oct 25 2026, ~2:30-2:55 PM PT. Engine: `src/bin/explain.ts` (reframe pipeline), gpt-4.1-mini unless noted. Nothing pushed; GitHub read-only.

## Inputs
- Engine input: `cases-real/litellm-video-hook/error.json` = the error text + observed behaviour copied from the fix PR's "Before" section
  (https://github.com/BerriAI/litellm/pull/42535), observed_at = fix PR creation time, plus a local clone at a80379baf8 (parent of the fix commit).
  NOT given: the fix PR's diagnosis lines, its proxy log line (which names the call type), its diff. No stack trace exists in the public report.
- Ground truth (`ground-truth.json`, attached only after the engine output is frozen + hashed): introducing PR #42354, edit = 2 `CallTypes` lines in
  `litellm/types/utils.py` (they make `_CALL_TYPE_ENUM_MAP` route video results into `async_post_call_success_deployment_hook`); fix #42535 wraps each
  callback call in that hook in try/except (`litellm/utils.py`).

## What works (tested)
- GitHub provenance source (generic): merge commit -> PR #42354 -> agent = Devin (PR author `devin-ai-integration[bot]`, Co-Authored-By trailers),
  16 agent-text segments (PR title/body, 6 commit messages, 8 Devin review replies). Belief quotes are string-matched against these segments
  (exact / whitespace-normalized / not_found) and code quotes against the file at the edit commit.
- Corroboration on the REAL litellm code path (`corroboration/litellm_video_hook_repro.py`; provider mocked at the HTTP boundary with respx,
  aiohttp transport switched to httpx so the mock intercepts; the chat-shaped callback comes from the fix PR's repro = ground-truth-informed):

| checkout | result | provider calls |
|---|---|---|
| before #42354 (9cc5b78c33) | ok, VideoObject | 1 |
| error commit (a80379baf8) | `AttributeError: 'VideoObject' object has no attribute 'choices'` | **3** (3 billed jobs) |
| error commit minus only #42354's 2 CallTypes lines | ok | 1 |
| real fix (944f44d82b) | ok | 1 |

  This reproduces the real error and the triple billing, and pins it to the agent's 2 lines.

## Engine result vs the real fix (honest)
| run | change before run | localized edit | PR match | file match | belief | verdict |
|---|---|---|---|---|---|---|
| r1 (first, frozen) | - | #41933 (Devin, chat stream `choices` rebuild) | no | no | about chat stream `choices` | belief_contradicted_independent - **false positive** (1 of 3 weak checks "contradicted") |
| r2 | verdict needs ALL valid checks to contradict | same wrong edit | no | no | same | error_only (wrong attribution) |
| oracle (ablation, edit given from ground truth) | code quotes checked vs file at commit | #42354 types/utils.py (given) | - | - | about guardrail post-call metadata (a reviewer finding), not the 400 | belief_unverified (r3 link guard) |
| r3 | belief must share an identifier stem with the error | same wrong edit as r1 | no | no | same as r1 | error_only (**wrong attribution, still labelled as a contradiction**) |
| r3-nemotron | - | built JS chunk (non-agent PR) | no | no | - | no_agent_edit |
| r4-openai | exclude built/generated dirs | #42354 `videos/guardrail_translation/__init__.py` (maps `CallTypes.avideo_generation`) | **yes** | no (adjacent registration file) | guardrail metadata again | belief_unverified (nothing claimed) |
| r4-nemotron | same | #41550 Rust file (Devin) | no | no | quotes not_found | belief_unverified |

Bottom line: the engine did NOT recover the real belief on this case. Localization of a text-only error (no stack trace) is the weak step:
lexical ranking puts #42354 at rank 11 of 681 commits in the 7-day window, and the LLM pick flips between runs and small generic changes.
Belief extraction latched onto an unrelated reviewer-flagged issue in the same PR even with the edit given. All four rule changes above were
generic but made after seeing r1 on this n=1 case: no run after r1 is a clean test.

The real belief (my reading, not engine output; enacted, never stated by the agent): "adding `video_generation`/`avideo_generation` to
`CallTypes` only registers video for guardrail translation"; in fact `_CALL_TYPE_ENUM_MAP` gates `async_post_call_success_deployment_hook`,
so every CustomLogger written for chat responses (declared contract `LLMResponseTypes`, which has no `VideoObject`) now receives video results.

Artifacts: `artifacts/reframe/litellm-{r1,r2,oracle,oracle2,oracle3,r3,r3-nemotron,r4-openai,r4-nemotron}/` (report.html, report.json, engine-output.frozen.json).
