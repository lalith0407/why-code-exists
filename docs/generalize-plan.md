# Generalize plan: from "3 Pulseboard bugs" to "any error + repo + agent transcript"

Written Sat Oct 24 2026, ~7:30 PM PT, branch `nemotron-h3`. This was a read-only audit: no code changed. Restore tag `pre-nemotron-h3-2026-10-24` is untouched.
Note: the working tree already had uncommitted edits (`src/evidence/zetaris.ts`, reports, Meterless ledger) from the parallel doc and code run. Commit or stash those before starting the refactor.

## Verdict (blunt)
The front half is mostly generic: transcript indexing, the written-at provenance and the call A/B prompts. The back half (prove, Zetaris, lesson and prevent) is a lookup table for three bugs. The "agent" doesn't decide what to test. It picks from a menu of 6 human-written checks whose predicates are TypeScript `switch` cases named after the bugs. A judge who opens `src/prove/check.ts` sees that in about 30 seconds. To fix it, the agent has to **write the falsification check itself**, then we gate it so the check can't just agree with the model.

## 1) Hard-coding inventory
B = blocks generalization, C = cosmetic or demo-only.

| file:line | what | sev |
|---|---|---|
| src/prove/check.ts:26-34 | Predicate enum `membership_email_mismatch`, `ssrf_internal_fetch`, `membership_role_escalation`, `membership_token_reusable`, `ssrf_non_http_scheme`, `preview_markup_injection` | B |
| src/prove/check.ts:111-158 | `runPredicate` switch with per-bug field names (invite_email, actor_email, fetch_host, ADMIN/MEMBER, private-IP regex) | B |
| src/prove/check.ts:164 | summary keys invite_email/fetch_host | C |
| src/prove/check.ts:3,181-260 | Zetaris oracle only for predicates in `MEMBERSHIP_QUERIES` | B |
| fixtures/*-evidence.json | 12 human-written checks (`falsifies`, `measures`, `observed`, decoy flags), with observed values hand-shaped ("fixture_replay_shaped_as_prod") | B |
| fixtures/*-error.json | Synthetic prod errors. The invite note says "Live exploit not yet run". Labels like `invite-takeover`, `hero` drive code paths | B |
| fixtures/*-commit.json | Fixture commit metadata in place of real git | C |
| src/assume/extract.ts:158 | Topic regex `token|invite|email|auth|fetch|url|preview` | B |
| src/assume/extract.ts:164-168 | "binding the token / logged-in user" sentence gets score 0.95 | B |
| src/assume/extract.ts:180-195 | Injects a canned invite assumption (`source: fixture_boost`) | B |
| src/assume/extract.ts:198-216 | Canned SSRF assumption | B |
| src/assume/extract.ts:227-231, 258-272 | normalizeAssumption and scoring branches for invite/ssrf | B |
| src/session/transcript.ts:14 | Default transcript path is the Pulseboard transcript | C |
| src/session/transcript.ts:256-317 | hero boosts L209/L98 (off by default; ablation only) | C (delete) |
| src/pipeline.ts:48-290 | `investigateInviteDemo` is its own pipeline, separate from `investigateCase` | B |
| src/pipeline.ts:93, 298, 309 | Per-case session keywords (`invite`, `cheerio`, `slack`...) | B |
| src/pipeline.ts:296-312 | `investigateSsrfDemo`, `investigateSlackDemo` wrappers | C |
| src/pipeline.ts:466-485 | `if (cs.name === "slack")`: Slack-only Zetaris branch, reads `slack-retry-h3-live.json`, check id `slack_event_duplicated` | B |
| src/pipeline.ts:51 | invite live evidence path `invite-h1-live.json` | B |
| src/pipeline.ts:534-720 | compare/ablation formatters assume invite hero + SSRF | C |
| src/evidence/zetaris.ts:23, 285-420 | `WCE_MEMBERSHIP_EVENTS` schema, `MEMBERSHIP_QUERIES` WHERE clauses | B |
| src/evidence/zetaris.ts:554-600 | `WCE_SLACK_EVENTS`, `SlackEventRow`, `SLACK_DUP_SQL` | B |
| src/evidence/zetaris.ts:260 | ping = `NY_TAXI.taxi_zones` (sample data) | C |
| (in progress) the cross-source join planned for zetaris.ts | if written as membership-events JOIN error log, it's a 4th hard-code | B risk |
| src/lesson/store.ts:76-111 | Regex classify isSlack/isInvite/isSsrf → canned "correct belief", canned fix text, concept names | B |
| src/lesson/meterless.ts:88 | Lesson key = `bug_id|check_id` (bug-instance, not concept) | B |
| src/demo/prevent.ts:21-105 | `PREVENTION_CONCEPT="invite-accept-email-bind"`, Bob/Alice fixture, hand-coded `acceptWithLesson` that regex-checks rule text | B |
| src/demo/prevent.ts:278,287 | Hard-coded "cloud A 6/6 green / cloud B 3/3" strings | C (honesty risk) |
| src/demo/invite-chain.ts (whole), src/bin/demo-invite.ts, demo-compare.ts | Static scripted chain with literal strings (bob@, invites.ts:139) | C, but delete or label as storyboard |
| src/demo-*.ts, demo-compare.ts:24-25 | Expected lines 209/98, per-bug fail messages | C |
| src/bin/eval-lines.ts:31-32, eval-bugs.ts:4, eval-gate-replay.ts:54, eval-wrong-claims.ts:25+ | Eval harness per bug (fine for evals, but there's no "unseen bug" eval) | C |
| src/gitmap/blame.ts:15-28 | Pulseboard checkout paths, `WCE_PULSEBOARD_GIT` | C |
| src/assume/openai.ts:274 | Call-B prompt example "(both involve invites, roles, or URLs)" leaks domain | C (minor leak) |
| src/report/html.ts | `writeInviteReport`/`writeSlackReport`, per-bug titles | C |
| src/session/provenance.ts:79 (`defRe`) and transcript.ts:78 | Function-definition regex is JS/TS-only. Python `def`/class methods aren't detected | B for a 2nd language |
| src/ingest/error.ts:13-18 | Frame filter `node_modules`/`node:` only | C |

## 2) What already generalizes (verified by reading)
- **Written-at provenance** (`src/session/provenance.ts`): it's deterministic, uses no LLM and has no per-bug constants. It parses unified diffs embedded in edit tool results, finds the edit whose added lines define the frame function and cover the frame line, then records later edits and the reasoning before it. Caveats: JS-only definition regex, and it assumes the Cursor transcript's diff format.
- **Transcript loading and indexing** (`transcript.ts` loadTranscript, frameContext, candidateSignals): generic, keyed on frame file and function. Only the default path and opt-in hero boosts are specific.
- **Call A, picking the session moment** (`openai.ts` buildCandidateWindows, definitionFacts, schema): generic inputs (frame, candidate windows, facts).
- **Call B, claim mapping** (`mapClaimsToChecks`): generic over *any* check list with `measures` text. One prompt example leaks the domain.
- **Mechanism gate** (`src/prove/mechanism.ts`): quote-verifies the claim against the written-at `fn_text`. No bug ids (previously grepped, and re-read: none).
- **Reasoner abstraction** (OpenAI/Nemotron provider config), **scrub.ts**, **Meterless client transport**, and **Zetaris transport** (`runSql`, `uiProxyQuery`, TEMP VIEW creation) are generic. Only the schemas and queries on top are specific.
- `investigateCase` (pipeline.ts:315+) is already ~80% generic: error, provenance, A, B, prove. It's held back by keywords, fixture names and the Slack branch.

## 3) Redesign options

### Option A: Agent-drafted falsification checks, with counterfactual trust guards (recommended core)
Input: `error.json` (any stack trace) + repo path + transcript. Pipeline:
1. Provenance (existing) → `fn_text` the agent wrote, plus the call A reasoning moment.
2. Claim: the model states the wrong assumption (existing call A/B claim step).
3. **Check drafting (new):** the model writes ONE executable test (vitest/pytest) that exercises the frame function and asserts the *correct* behavior the claim violates, plus **2 decoy checks**: tests for plausible neighboring assumptions the claim does NOT make.
4. **Freeze:** hash the test files and record them in the report *before* any run.
5. **Patch:** the model writes a minimal patch of the frame function implementing the corrected belief (≤N lines changed, confined to the function).
6. **Counterfactual gate.** The claim is "proven" only if all of these hold:
   - the check FAILS on the original code (the agent's version, from git or a transcript reconstruction);
   - it PASSES on the minimal patch;
   - the decoys behave as decoys (pass on both, or otherwise don't flip);
   - a mutation control holds: the check still fails when the patch is reverted line by line, so it's actually testing the patch. This step is optional.
   - the mechanism gate (existing) holds: the claim's quoted mechanism appears in `fn_text`.
7. Sandbox: run in a temp copy of the repo (`git worktree`), with network off and a timeout. Optional human approve step: show the frozen test in the report.

Why it's trustworthy: the model can write a test that agrees with itself, but it can't easily write one that fails on the original AND passes on a minimal patch for the wrong reason. The decoys catch "the test fails for everything". This also directly answers the judge's #1 hole ("humans write the checks").
- **Feasibility:** ~10-14 h total. Sandbox runner 2 h, drafting prompt + schema 2 h, patch + counterfactual harness 3 h, wiring into `investigateCase` + report 2 h, porting the 3 bugs 2 h, buffer 2 h. Doable by Sun night if we start tomorrow morning.
- **Riskiest piece:** getting a runnable test against a Next.js server action (Prisma, auth session) without the app booted. Pulseboard tests need a DB.
- **1-hour spike:** in a Pulseboard worktree, hand the model only the provenance `fn_text` + error for the invite bug, ask for a vitest test with Prisma mocked via a generated in-memory stub, and measure: does it run, does it fail on the original and pass on a 3-line patch? Repeat once for Slack. If neither runs within the hour, fall back to Option A′: the model drafts a **standalone harness** that imports only the function file with injected fakes. The `pulseboard-repro/*.mjs` files prove that this shape works.
- **Demo shows:** a new error arrives. The agent finds the edit, states the belief, *writes the test live* (shown frozen with a hash), runs it red on the agent's code and green on its patch, and the decoys stay neutral. Then the lesson is saved.
- **Judge view:** this is the strongest possible answer to "is it hard-coded". Risk: if the test is flaky on camera, it looks worse than the current fixtures. Record from a cached run with live-run evidence.

### Option B: Agent-drafted SQL over federated evidence (Zetaris made real)
Register sources generically in Zetaris: (1) prod error/log table (the error JSON or log lines → a table), (2) app DB snapshot (Pulseboard SQLite/Postgres rows from the repro run → tables), (3) event or webhook log. A schema catalog (`information_schema`/DESCRIBE) is given to the model. It drafts a SQL query whose non-empty result falsifies the claim (e.g. rows where an effect exists without the precondition the claim skipped), plus decoy queries. Same guards: freeze the SQL first, then run it on "original" data (from repro of the agent's code) and on "patched" data (repro re-run with the minimal patch). The query must return rows only on the original.
- **Feasibility:** ~6-8 h on top of A's patch step, or ~8 h standalone if the evidence rows come from the existing repro scripts. A generic "load these N tables as TEMP VIEWs" loader replaces `WCE_MEMBERSHIP_EVENTS`/`WCE_SLACK_EVENTS` (~2 h). The real cross-source join (error log × app DB × events) falls out naturally, so no fourth hard-code is needed.
- **Riskiest piece:** the Zetaris session model. TEMP VIEWs live per auth session, VALUES size limits apply, and there's no durable File Source until the S3 bucket exists (Lalith's item 1). Also, data only exists for bugs with a repro, so SQL alone doesn't generalize to "any bug" without A's repro step.
- **1-hour spike:** write a generic loader that takes `{table: rows[]}` → TEMP VIEWs, load error-log + membership + invite tables from the existing invite repro, have the model draft the falsifying JOIN from DESCRIBE output alone, and run it. Check it returns rows on original and 0 on patched repro data.
- **Demo/judge:** "the agent wrote this cross-source SQL itself" is a much better sponsor story than our canned WHERE clauses. Judges flagged Zetaris as thin, and this is the fix.

### Option C: Generic lessons + prevention (Meterless)
Key lessons by `{concept, language, framework, api_surface}` where the *model* names the concept from the frozen check plus patch (e.g. "authz: bind token to identity", "webhook idempotency"). Tags are generic: `bug_class`, `framework`, `file_glob`, `function_signature_hash`. Store the frozen test as the regression artifact. Prevention: on a new diff or PR, recall by embedding of diff + tags, and the model checks whether the diff repeats the stored belief, citing the lesson. Delete `store.ts:76-111`, the canned prevent logic and the Bob/Alice fixture.
- **Feasibility:** 3-4 h. **Risk:** recall quality on unseen code (embedding miss). **Spike (1 h):** store the 3 existing lessons with model-written concepts, then query with a fresh hand-written vulnerable diff from the held-out repo and see if recall hits.
- **Judge:** shows Meterless doing memory work, not acting as a log.

## 4) Feasibility summary (deadline Mon Oct 27 4:45 PM PT, about 45 working hours away; the video takes 2-3 h and is Lalith's)
| | hours | riskiest | spike | demo |
|---|---|---|---|---|
| A checks+counterfactual | 10-14 | runnable test without booting app | invite+slack drafted test, red/green | live-written test, red→green |
| B federated SQL | 6-8 (after A) | Zetaris session/size, repro data | generic loader + drafted JOIN | agent-written cross-source SQL |
| C generic lessons | 3-4 | recall on unseen diff | recall on held-out diff | prevention on a new diff |
| Cleanup (delete fallbacks, one pipeline `investigate(error, repo, transcript)`) | 3 | regressions in 81 tests | n/a | `npx wce investigate --error x --repo y --transcript z` |

## 5) Proof-of-generality plan (no code change between runs)
Freeze the code at a tag (e.g. `generic-v1`) first, then run only on cases never used in development:
1. **Pulseboard, new bugs from the same transcript** (`/workspace/cloud-agent-transcripts/bc-25dab342-…jsonl`, 559 lines). Mine 2 more real agent-written bugs (candidates to inspect: upvote double-count/race, comment authz across workspaces, open redirect after login, missing rate limit). Write the error JSON only, with no checks.
2. **Second repo, second language:** `/workspace/trading-agent-system` (Python) with transcript `bc-a98b50df-…jsonl` (9,128 lines; heavy edits to `src/ta/data/store.py`, `agents/loop.py`, `data_audit.py`, `replay.py`) and an existing pytest suite. Not a git repo, so provenance must come from the transcript (good, since that's our claim). **Blocker:** `defRe` is JS-only, so add Python `def` support *before* the freeze. That's a generic fix, not a per-case one.
3. Optional third: `bc-fe0ae5aa` (Blast Radius, Python, 282 lines) or `bc-cfc1fe44` (portfolio, Next.js, 1,045 lines). The latter has few logic bugs.
4. Also available: `/home/box/sand-data/agent-transcripts/ae7a2a69…jsonl` (unknown content, needs a look).
Protocol: someone other than the pipeline author (a subagent judge) picks the bugs and writes the error JSON. Pre-register the success criteria: written-at edit correct, check frozen, counterfactual red/green, decoys neutral. Report every case including failures, and `git diff generic-v1` must be empty.

## 6) Recommendation
**Must (Sat night to Sun):**
1. One generic entrypoint `investigate({error, repo, transcript})`. Delete the canned assumptions (extract.ts:158-272 heuristics/fixture_boost), the regex lesson classifier (store.ts:76-111), the `cs.name==="slack"` branch, the per-case keywords and the hero boosts.
2. Option A with the counterfactual gate (spike first thing; go/no-go after 1 h).
3. Python definition support in provenance, then the held-out run on trading-agent-system + 1 new Pulseboard bug, reporting honest numbers.
4. Generic Zetaris loader (rows → TEMP VIEWs) so evidence from any repro lands in Zetaris. Keep the existing 3 cases as regression tests only.

**Nice (Sun evening to Mon AM):** Option B drafted cross-source SQL. Option C generic lesson keys + prevention on a held-out diff. Optional human-approve step in the report UI.

**Cut:** the static `invite-chain.ts` storyboard, Bob/Alice prevent fixture, "cloud A/B 6/6" strings, compare/ablation formatters tied to invite+SSRF, hand-written decoy fixtures (keep them as a baseline eval only), the S3 durable table unless the bucket lands by Sun, and any further tuning on the old near-miss sets.

**Honest risks:** A can fail on the spike (frameworks with heavy runtime deps). If so, the fallback is the harness-with-fakes approach, which is still agent-written but less impressive. The held-out run may score poorly, and we must ship those numbers anyway. The deck and video wait until Sun night at the earliest.
