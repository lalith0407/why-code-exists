# Sponsor usage notes — DRAFT, local only

How each sponsor is actually used, with evidence. "Read" = from code or docs; "tested" = from a saved run output.
Paths are for branch `locate-fix` (54e01c9 and later).

## Cursor — the builder, not the inference engine
**Product built by Cursor cloud agents:**
| Agent id | What it built | Landed as |
|---|---|---|
| bc-3518ef96 | explain stage (`src/explain/`) | explain-stage branch |
| bc-abecd3d6 | LOCATE stage (`src/locate/`) | `9227de8`, author `Cursor Agent <cursoragent@cursor.com>` |
| bc-37d38e55-dc03-5d97-a93e-4461b8719e8a | LOCATE fixes (`roles.ts`, `remap.ts`, shortlist, capped confidence) | `54e01c9`, tag `locate-fix-frozen` (applied as a patch) |
| bc-344f60b6-c63a-5d93-a0d5-a75923af7cc8 | Meterless wiring into explain reports | `1746405`, tag `meterless-frozen` (applied as a patch unchanged) |

The ids are as given by Lalith's Grok Bot. Only `9227de8` carries a Cursor author in git; patches were applied under the repo's dev identity.

**Not the product: outside feasibility spike.** Cursor cloud agents `bc-818eb37d` (`docs/cursor-infer-results.md:3`), and
`bc-2492cc8b` and `bc-9d124e7f` (`docs/cursor-infer-v4-results.md:6,11`) ran the inference experiment. Their numbers are not the tool's.

- The product makes no Cursor calls at runtime (`README.md:156`).
- Transcripts the tool reads (e.g. `bc-25dab342…`, the Pulseboard builder) are inputs, not Cursor building this tool.
  `docs/pre-existing-code-declaration.md:7` says Pulseboard was built by a Grok Build cloud agent.

## NVIDIA Nemotron — explain/locate provider
- Model id: `nvidia/nemotron-3.5-lightning-30b-a3b` (`src/llm/providers.ts:22`, `NEMOTRON_TWO_STEP_MODEL`; overridable by `NEMOTRON_MODEL`).
  Provider config (`NVIDIA_API_KEY`, `integrate.api.nvidia.com`): `src/llm/providers.ts:36-42`.
- Default provider for the explain reasoning step (`src/explain/reasoner.ts:13-18`) and for LOCATE layer 2 (`src/locate/agentic.ts:21-26`).
  Optional gate in the older pipeline: `src/prove/mechanism.ts:16-18`.
- **The agentic search never confirmed an answer with Nemotron** (tested): it ended with "exhausted 6 tool steps" on all
  13 frameless dev cases (`docs/locate-results.md:26,55`) and on the unseen set (`docs/unseen-results.md:68`). So B-nemotron LOCATE = layer 1 only.
  Headline results use Anthropic for the model steps. Nemotron did complete the single-call explain step.

## Zetaris — optional corroboration in the investigate pipeline only (unchanged)
- Client: `src/evidence/zetaris.ts` (credentials from `secrets/` or env, never printed). The step that builds TEMP views
  `ERROR_LOG`, `CODE_EDITS` and `APP_DB_WRITES` and runs model-written, validated SQL lives in `src/engine/zetaris-step.ts:42-88`.
- Called from `src/engine/investigate.ts:878` (and `src/bin/zetaris-rerun.ts:14`). `npm run zetaris:ping` is in `src/bin/zetaris-ping.ts`.
- **Not used by the new stages:** `src/explain/` and `src/locate/` never call Zetaris. The explain report only *links* to it
  (`src/report/explain.ts:3-4,73`).
- **Results (tested, saved runs; the saved Zetaris results are kept private because they came from a private cluster):** vote-race `confirms` (r2 run only;
  the first run said `does_not_confirm`); webhook-block `does_not_confirm`; caps-unknown and leap-day `no_data_trace`. So
  Zetaris confirmed 1 dev case, after a re-run. The durable File Source is blocked (needs S3), so it uses TEMP views (`README.md:134`).

## Meterless H-MEM — lesson store on the explain path, advisory only (since `meterless-frozen`)
- Vendored unmodified at `vendor/meterless-hmem/` (upstream 1742dec per `README.md:135`), runs in-process. Wrapper: `src/lesson/meterless.ts`.
- **Explain stage (new, Cursor patch at 1746405):**
  - every `explain-why` report gets a `lesson_status` (`src/explain/pipeline.ts:213`), built by `explainLessonStatus` (`src/lesson/explain-lesson.ts:218`);
  - the lesson is built **only from verified fields** (`lessonFromExplainReport`, `:119`): the verified assumption and why-it-breaks,
    verified quotes as citations, valid asked/understood/happened pieces, location, and confidence cap;
  - unverified or non-ok reports get **no lesson** (`explainStoreRefusal`, `:83`);
  - the lesson is stored only on human approval: `npm run approve` detects explain reports (`src/bin/approve.ts:22`) and writes via
    `writeExplainLesson` (`src/bin/approve.ts:33`, `src/lesson/explain-lesson.ts:225`);
  - recall (`recallRelated`, `:181`) is shown in the HTML "Lesson" section (`src/report/explain.ts:40,110`).
- **Honest claim (judge M12, verbatim):** "Approved, verified explanations are stored as lessons in Meterless H-MEM (vendored, unmodified, in-process). Re-approving the same explanation is deduplicated, and unverified ones are refused. Each new report lists prior same-file-type lessons ranked by word overlap. In our small test store none of them was actually related, and recall does not change the explanation."
- **Lesson key:** the normalized verified assumption + `|` + the file extension. Near-duplicate wording makes a new key,
  so dedup only catches the same answer approved twice.
- **Similarity is word overlap, not meaning.** The vendored engine's embedder is a deterministic token-hash (`vendor/meterless-hmem/src/embeddings.ts`).
  Recall hard-filters to the same file extension and uses threshold 0. With a small store it returns every same-extension
  lesson ranked by shared words (tested: `docs/meterless-e2e.md`).
- **Investigate pipeline (older):** write after approval, `src/engine/lesson.ts:27`; recall at `src/engine/lesson.ts:37` and
  `src/engine/investigate.ts:889`. Behaviour unchanged by the patch.
- **Test boundary:** `setMeterlessBoundaryForTests` (`src/lesson/meterless.ts`, labeled `// MOCK: Meterless boundary`) is used
  only to simulate engine failure in tests. Production uses the real engine.

## Known issues (judge M12, minor, not fixed)
1. `npm run approve` rebuilds the HTML as `report.html` next to the JSON, whatever the original name was (`src/bin/approve.ts:48`).
   Related: the report's "pending approval" hint names the HTML path instead of `report.json` (`src/report/explain.ts`, `writeExplainReport`).
2. Approve rebuilds the lesson instead of storing the pending one the reviewer saw, so it gets a new UUID
   (`src/bin/approve.ts:28` → `src/lesson/explain-lesson.ts:129`). Content is the same; low risk.
3. Provenance refs are double-prefixed, e.g. `code:code:file:line` (`src/lesson/meterless.ts`, add `refs`, combined with
   `src/lesson/explain-lesson.ts` citation refs).

## Claims to avoid
- "The spike agents built the product" (they did not; see the Cursor table).
- "Nemotron finds the bug" (its agentic layer never confirmed).
- "Zetaris powers the new stages" (it doesn't). "Meterless recalls related lessons" (it lists same-file-type lessons by word overlap; none were related in our test).
- "Zetaris confirmed webhook-block" (it said `does_not_confirm`).
