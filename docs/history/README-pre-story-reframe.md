> Historical development notes; linked run outputs are not included in the public repo.

# Why does this code exist?

**Open Agent Hackathon · Track 02: The Agent That Can Explain Why**

When AI-written code breaks in production, `git blame` names a bot commit. The real cause is usually an assumption the agent made in a session (or PR) that nobody re-reads. This tool starts from a production error and finds the agent's edit and the belief behind it, quoted in the agent's own words, next to the evidence that contradicts it.

**error → exact agent edit → the agent's belief at that edit (verbatim quote, string-match checked) → contradicting evidence, labelled by kind**

## Reframe (2026-10-25): what the tool claims now

We no longer claim "proof". The output is: the agent's edit, the belief quoted from the agent's own text, and evidence against it, labelled honestly:
- `belief_contradicted_independent`: every valid deterministic check over the repo code (written and hashed before it runs) contradicts the belief.
- `belief_contradicted_error_only`: only the error itself contradicts it (weaker; close to restating the error).
- `belief_unverified`: quotes do not match the agent's text/code, or the belief shares no identifier with the error; nothing is claimed.
The sandbox repro/patch step is optional corroboration only. It never gates or downgrades a report.

Provenance sources: Cursor transcripts, Claude Code transcripts (replay tested on a labelled sample only), and **GitHub** (`src/session/github.ts`: blame/log on a local clone → PR → agent authorship from bot author / Co-Authored-By trailers → PR body, commit messages and the agent's review replies as quotable text). CLI: `npx tsx src/bin/explain.ts --error <error.json> --repo <clone>`.

### Real public case: litellm #42354 (Devin), results in docs/reframe-litellm-results.md
- Real error `'VideoObject' object has no attribute 'choices'` (from the fix PR #42535), no stack trace. The fix PR is ground truth and is never shown to the engine.
- **Corroborated on the real litellm code** (provider mocked at the HTTP boundary): the exact error and 3 billed provider calls appear only with the agent's 2 `CallTypes` lines; before the PR, without those lines, and on the real fix: OK with 1 call.
- **Engine vs the real fix: miss.** The first frozen run blamed the wrong Devin PR (#41933) and its weak checks produced a false "independent" label. After generic tightening, one later run found the right PR (#42354), but in an adjacent file. The extracted belief was about a different reviewer-flagged issue, so nothing was claimed. Text-only localization and belief extraction are the weak steps. Every run after the first is post-hoc (n=1).
- Story-only example (engine can't run C#): [dotnet/efcore #37302](https://github.com/dotnet/efcore/pull/37302) (Copilot) → customer `InvalidCastException` [#37516](https://github.com/dotnet/efcore/issues/37516) → fix [#37762](https://github.com/dotnet/efcore/pull/37762).
- Supply is thin: 3 usable cases in ~20 GitHub searches (docs/github-cases-search-log.md).

### Existing 18 cases re-labelled (docs/reframe-relabel.md, no re-run, no tuning)
All were captured from their own scenarios, so none has independent evidence: 14 `belief_contradicted_error_only (scenario-captured)`, 4 `belief_unverified`, 0 independent.

## Sandbox proof history (kept, now corroboration only)

### Measured status (2026-10-24 PDT; all numbers come from committed artifacts)

| set | who picked the cases | runs | proven |
|---|---|---|---|
| Dev (Pulseboard invite, ssrf, slack-retry, plus the 3 held-out-1 cases after they were burned) | builder | **7** runs on gen-v7 (`artifacts/m3a/`), including a re-run of `pulseboard-invite-settle` after the settle fix (7ab9ba2) | **0/7** (0 harness errors) |
| Held-out 1 (tag `generalize-frozen`) | builder | 3, one each | 0/3 |
| Held-out 2 (tag `heldout2-frozen`) | builder | 3, one each | 1/3 (webhook-block) |
| Held-out 3 (tag `heldout3-frozen`, non-Pulseboard: Blast Radius, Python) | builder | 3, one each | **0/3**: 2 no_provenance (my frame choice hit a provenance limit), 1 aborted on an OpenAI 429 |
| Held-out 4 (tag `heldout4-frozen`, trading-agent-system, Python, Nemotron only — OpenAI credits exhausted) | builder | 3, one each | **0/3**: 2 harness_error, 1 not_reproduced; claim correct in 2/3 |
| Void re-runs after the OpenAI quota failure (heldout3 retype-unique; heldout4 ×3; on their frozen tags, gpt-4.1-mini restored) — **not held-out results** | builder | 4, once each (after one disclosed parallel attempt that collided) | 0/4; claims correct in 3/4; failures were harness bugs fixed in gen-v10 |
| Dev check of gen-v10 helper selection (heldout3 schema-target, plan-injection; dev only) | builder | 3 | 0/3; schema-target claim now right, decoy failed |
| Held-out 5 (tag `heldout5-frozen`, trading-agent-system, Python, engine gen-v11f) | builder | 2, one each | **1/2** (macro-leapday); citation-leaf had the right claim but a 16-line patch (patch_not_minimal) |
| Dev re-measurement, gen-v11 proof-step work (15 burned cases) — **not held-out** | builder | see docs/heldout-results.md | baseline 1/15 → gen-v11f 3/15 and 4/15 (two runs), strict claim match |

**Clean held-out total: 2/15 proven, 0 false proofs** (sets 1–6; held-out 6 was 0/1, n=1; held-out 7 not formed in M9: 0 eligible transcripts, docs/heldout7-search-log.md). M9–M11 dev (gen-v14–v17, 8 runs): 0 false proofs (docs/m9-, m10-, m11-results.md). M12 dev (gen-v18, 2 runs): 1 false proof (v18a xirr-short), patch revision rescued 0 (docs/m12-results.md). Void re-runs and dev runs are reported separately and never added to it. **Dev false proofs (burned cases):** gen-v11f 2, gen-v12b 1, gen-v13 2 across 4 measurement runs (docs/m8-results.md). Under gen-v13 the two held-out proofs did not both hold: macro-leapday 0/2 re-runs, webhook-block 2/4.

The builder chose every case. The builder knows the engine, so these sets are not independent benchmarks. The one success (webhook-block) was the easiest case in its set. The same proof re-ran on engine gen-v8 (`artifacts/m4/dev-webhook-block/`) and gave proven_false again. `npx tsx src/bin/rerun-harness.ts --report <report.json> --both` re-checks any recorded proof without model calls.

## How it works (engine `src/engine/investigate.ts`, PROMPT_VERSION `gen-v13-rival-cause`)

1. **Provenance:** maps the top app frame to the transcript edit that introduced that function (TS and Python).
2. **Claim:** gpt-4.1-mini gets the error, the frame function, the agent's written code and belief quotes, plus the source of the **local helpers it imports** (breadth-first over local imports: depth 2, at most 8 files, character caps). It returns a claim about the wrong assumption.
3. **Tests:** 1 reproduction plus 2 decoys, frozen and hashed before any run. Repairs may change only setup or stubs, never the assertions.
4. **Real runs:** the real app modules (from a `--repo` checkout or the transcript replay), with a real PostgreSQL per test for Prisma apps. Only bare external packages are stubbed. Framework boundaries (Next.js `headers()`, `auth()`, `after()` and similar) are generic shims built from the real package exports. These are labeled stand-ins.
5. **Patch:** the patch may change only the frame function (a known limitation). The repro must flip on the patched tree and the decoys must still pass.
6. **Mechanism gate:** Nemotron (`WCE_GATE_PROVIDER`) checks that the claim, test and patch describe the same mechanism. It sees the helper sources too.
7. **Zetaris (cross-source SQL, see below)** and **Meterless H-MEM** lesson recall and storage.

Verdicts: `proven_false`, `patch_ineffective`, `not_reproduced`, `decoy_failed`, `harness_error`.

## Zetaris: what it does and doesn't show

- It loads only **independent** sources as TEMP tables:
  - `ERROR_LOG`: the prod error plus its context fields.
  - `CODE_EDITS`: transcript edits, plus `git log` of the frame file when the app is a repo.
  - `APP_DB_WRITES`: real rows the app wrote during the original and patched runs.
- It never loads test outcomes or recorded pass/fail values.
- The model's SQL is checked against the schema before it runs. A repair loop of up to 3 attempts sees only validation or engine errors, never row counts.
- "confirms" requires rows > 0 on the original run, 0 on the patched run, and a test proof.
- **Result so far (M8):** after fixing a transcript-path parsing bug (CODE_EDITS never matched the frame file) and requiring the only patch-dependent source (APP_DB_WRITES), Zetaris returned its first `confirms`, on dev vote-race (1 row original, 0 patched: the original left a dangling Vote row after concurrent toggles). Caveat: the rows come from the scenario the model-written repro drove, independent of the test verdict but not of the test's inputs. webhook-block: 1/1 rows, `does_not_confirm` (latency is not recorded). macro-leapday and caps-unknown: `no_data_trace` (the code writes no rows; nothing to query). It has never confirmed a held-out proof.
- The durable Zetaris File Source remains blocked. The engine uses TEMP VIEWs instead.

## Meterless

H-MEM is vendored unmodified from github.com/Meterless/Meterless at commit 1742dec. Upstream ships it as a reference architecture ("you implement the services") with no hosted service. It therefore runs **in-process**. The upstream conformance runner passes 13/13 against the vendored copy. Label: *in-process, vendored, conformance-verified*.

## Quick start

```bash
npm install
npm test            # unit tests
npm run typecheck
npm run investigate -- --error cases/<case>/error.json --transcript <session.jsonl> [--repo <checkout>] --out artifacts/<dir>
npx tsx src/bin/rerun-harness.ts --report artifacts/<dir>/report.json --both   # no model calls
npx tsx src/bin/zetaris-rerun.ts --report artifacts/<dir>/report.json           # Zetaris step only
npm run approve / npm run prevent   # lesson approval and recall
npm run zetaris:ping
```

`src/bin/capture-error.ts` builds a case's `error.json` from a real run of its `scenario.json`.

## Env

| var | use |
|---|---|
| `OPENAI_API_KEY` | claim, tests, patch, SQL (gpt-4.1-mini) |
| `NVIDIA_API_KEY`, `WCE_GATE_PROVIDER` | Nemotron mechanism gate |
| `WCE_METERLESS_DIR` | location of the vendored H-MEM |
| `WCE_PG_PORT` | local PostgreSQL for Prisma apps |
| `WCE_MAX_PATCH_LINES`, `WCE_CALL_BUDGET` | patch size limit and LLM call budget |

Zetaris credentials are read from `secrets/` and never printed. Every LLM call is logged in `data/llm-calls.jsonl`.

## Layout

`src/bin` CLIs · `src/engine` (investigate, context/helper following, frameworks shims, zetaris-step) · `src/evidence` · `src/ingest` (transcripts) · `src/lesson` · `src/llm` · `src/prove` · `src/report` · `src/session` · `cases/` · `artifacts/m2,m3a,m3b,m4,m5` · `docs/` (criteria, held-out results, judge write-ups).

## Known limits

- Since gen-v11b the patch may edit an imported local helper (one find/replace edit, size-limited).
- On dev, gen-v11f certified 2 wrong causes (xirr, vote-race). gen-v13 adds a single-cause parse, a rival-cause counterfactual and an error-consistency check, but still certified a wrong lead cause in 1 of 4 dev runs (vote-race) and an inverted repro in another (before its gate existed). The cause check is still partly model-judged.
- Fake-free race reproduction is limited.
- A test can't see latency inside `after()` (the shim awaits it).
- Zetaris has confirmed one dev proof (vote-race) and no held-out proof.
- Cases are chosen by the builder.

## Safety

- Transcripts are redacted.
- Secrets are never printed.
- Nothing is pushed or made public without Lalith's OK.
- No cloud agents.

## History

Earlier README text, demo scripts and judge scores (v1–v13) came from an earlier engine that ran shimmed code. They are kept in `docs/history/README-pre-m4.md` and `docs/judge-assessment-*.md` as history only.
