# Meterless lessons on explain reports

## Baseline and final

Baseline commit: `66233ade972e8e9225252ee4606d6e7c1e9f6116`  
`npm test` on that tree: **150 tests, 148 passed, 2 skipped, 0 failed**.

Implementation commit: `b6d011c665a7b519cba64e40b0575f87ce5d90d7`  
`npm test` on that tree: **157 tests, 155 passed, 2 skipped, 0 failed**. `npm run typecheck` exits 0.

The runner counts 150 tests. Two of them skip because `tests/provenance.test.ts` has no external transcript in this snapshot. A Claude Code suite also skips when `/home/box/.claude/...` is absent; those two cases are not entered, which is why a count of test functions can read as 152. Nothing failed.

The same two provenance tests still skip. The seven new tests are in `tests/explain-lesson.test.ts`.

`vendor/meterless-hmem/` is unchanged. `src/locate/**`, `src/explain/verify.ts`, `src/explain/confidence.ts`, `src/explain/reasoner.ts`, and `src/explain/context.ts` are unchanged. Locate ranking, explain prompts, quote verification, and confidence capping are only read.

## What changed

- `src/lesson/explain-lesson.ts` (new). Builds a candidate lesson from an explain report, recalls related lessons, and writes only when approve asks it to.
- `src/explain/pipeline.ts`. After `explainWhy` finishes, attaches `lesson_status`. The stage order, LOCATE call, verification, and confidence cap are the same function as before (`explainWhyCore`).
- `src/bin/explain-why.ts`. Prints the lesson disposition and the recall outcome. `report.json` is still the pipeline result, so it now includes `lesson_status`.
- `src/bin/approve.ts`. Schema `why-code-exists/explain-why@1` uses the explain builder and `writeExplainReport`. Every other report still goes through the original `saveLesson` + `writeGenericReport` path.
- `src/report/explain.ts`. A Lesson section shows pending approval, stored (memory id and `new` / `dedup_existing` / `supersedes_<id>`), not created, or rejected, plus recall hits or the recall error. The old "once a reviewer approves…" paragraph is gone.
- `src/lesson/meterless.ts`. Optional write options and a test-only add/query override. Investigate callers that pass no options still use the label `approved investigation`, the same four tags, and the first key hit.
- `src/types.ts`. Optional `verified_context` on `Lesson`. Absent on investigate lessons, so their stored JSON keeps the previous keys.
- `.gitignore`. `data/meterless/`.
- `.env.example`. `WCE_METERLESS`, `WCE_METERLESS_URL`, `WCE_METERLESS_NS`, and `WCE_METERLESS_BRIDGE_DIR` are marked obsolete and are not read. `WCE_METERLESS_DIR` is the store directory.
- `tests/explain-lesson.test.ts` (new). Synthetic ribbon-counter, marble-chute, and kiln-door fixtures. No network and no model calls.

## Lesson status

An explain report always gets `lesson_status`.

A lesson is stored only after `npm run approve -- --report <report.json> --decision approve`. `explain-why` leaves `disposition: "pending"` and does not call `add`. `reject` records `approval` and `disposition: "rejected"` and does not call `add`.

When `stage !== "ok"`, or `answer.status !== "verified"`, or the verified assumption or why-it-breaks text is empty, the disposition is `not_created` and there is no lesson object. Approve then exits 1 with `refusing: not created because unverified` (or the stage reason) and leaves the file untouched.

That choice, rather than a stored lesson flagged unverified, keeps an unverified answer out of H-MEM. The report still says why, in JSON and HTML, so the absence is visible.

Fields copied into the pending lesson, and only those:

- `overlooked_assumption` → `wrong_assumption`
- `why_it_breaks` → `correct_rule` (explain reports have no patch, so `suggested_fix` is `""`)
- evidence with `verified: true` → citations `code:<file>:<line>` and `transcript#L<n>`
- asked / understood / happened pieces with `valid: true` → `verified_context.pieces`
- frame file and line, or the LOCATE pick when there is no frame → `file` and `verified_context.location`
- `three_piece.error_id`, `provider`, `confidence_cap` (copied, not recomputed)
- `located_by` is `frame` when the report had no `locate` object, otherwise `locate.method`

Unverified quotes and invalid pieces are dropped. `verdict` on an explain lesson is `verified`.

Approve rebuilds the lesson from those fields at approval time, then writes that object. The recall block already on the report is kept, so the lesson just stored is not listed as a hit of itself. The H-MEM id is `write.memory_id` (`mem-N`). A second approve of the same rule and fix returns `dedup_existing` and the same id. A later approve with the same key and a different why-it-breaks returns `supersedes_<previous id>`.

## How the lesson key is derived

There is still one key per concept + language, via the existing `lessonKey`:

```text
normalize(concept) + "|" + normalize(language)
```

`normalize` lowercases and turns every run of non-alphanumeric characters into a single hyphen.

Explain reports have no model-named concept and no language/framework field.

- **Concept** is the verified `overlooked_assumption` with whitespace collapsed. It is the whole verified sentence, not a topic list and not `error_id`.
- **Language** is the extension of the frame file, or of `locate.picked.file` when there is no frame. `pkg/ribbon_counter.ts` → `ts`. A file with no extension → `unknown`. There is no extension-to-language table.

So two reports share a key only when the verified assumption text normalizes to the same string and the located file has the same extension. A different wording is a different key. Recall can still surface it by similarity, with `shares_key: false`.

The key is also stored as the tag `lesson_key:<key>` and as `verified_context.lesson_key`. `error_id` is kept on the lesson record and is not part of the key.

## Recall

When a verified lesson can be built, recall runs against the vendored engine:

- Query text: the verified assumption, the file path, and the `lang:` and `file:` tags.
- Hard filter: `kind:lesson`, plus `lang:<extension>` when the extension is known.
- `file:` is not a hard filter. Each hit sets `shares_file` by comparing `record.file` to the current file, and `shares_key` by comparing the `lesson_key:` tag.
- Threshold stays 0 (the wrapper default) and `topN` is 5, so the report shows the engine's nearest lessons and their scores.
- Hits whose id is the `supersedes` target of another hit in that list are omitted, so a replaced lesson is not shown beside its replacement. The vendored engine stores `supersedes` on the new record and does not set `supersededBy`; this pass only affects the explain hit list.
- If `query` throws, `recall.ok` is false, `recall.error` is the message, and `hits` is `[]`. The HTML says `Recall failed:` and the pending lesson is still pending. Nothing is invented.
- If there is no verified assumption, recall does not run. The status says `not run: no verified assumption text to query`.

The failure test replaces `add` / `query` through `setMeterlessBoundaryForTests`. That override is marked `// MOCK: Meterless boundary` in `src/lesson/meterless.ts` and in the test. Every other test uses the real vendored engine and a temp `WCE_METERLESS_DIR`.

## Trade-offs

- **No lesson object when unverified.** The HTML can say "not created because unverified" without a second, easy-to-misread lesson. Approve cannot be talked into storing it by editing `lesson_status` alone, because approve rebuilds from `stage` and `answer.status`.
- **Full assumption text as the concept.** A shorter token list would collapse different mistakes into one key and supersede them. The full sentence supersedes only when the same assumption is approved again with a new why-it-breaks. Related but differently worded lessons stay in the store and show up through similarity.
- **Extension as language, and `lang:` as a hard filter.** `ts` does not equal an investigate lesson's `TypeScript`. Those lessons stay out of an explain recall on a `.ts` file. Dropping the filter would mix extensions in the top 5. The file tag stays a soft signal so `shares_file` can be no.
- **Empty suggested fix.** Explain reports have no patch. Dedup is therefore "same assumption text and same why-it-breaks".
- **`why_it_breaks` is stored as `correct_rule`.** That is the verified account of what actually happens. The investigate field name is reused so one H-MEM record shape serves both pipelines.
- **Approve rebuilds the lesson.** The id in `report.json` before approve is not the id inside the stored record. The memory id in `lesson_status.write` is the id that matters. Recall captured at report time is left as it was.
- **`currentOnly` on explain writes only.** After a supersede, a second approve of the new rule dedups against the replacement. Investigate writes still take the first key hit, as before. The engine does not set `supersededBy` when `supersedes` is passed; explain recall and explain dedup understand the `supersedes` pointer instead of patching the vendor.
- **Quote verification is not re-run at approve time.** Approve trusts `verified` / `valid` flags already on the report. Re-checking quotes would need the repo and the transcript, which approve does not take.

## Verify

```bash
npm run typecheck
npm test
```

Synthetic flow (fixtures are invented; no model calls). From the repo root:

```bash
set -euo pipefail
DIR=$(mktemp -d)
WORK=$(mktemp -d)
export WCE_METERLESS_DIR="$DIR"

cat > "$WORK/verified.json" << 'EOF'
{
  "schema": "why-code-exists/explain-why@1",
  "stage": "ok",
  "provider": "nemotron",
  "three_piece": {
    "schema": "why-code-exists/three-piece@1",
    "error_id": "ribbon-sample",
    "frame": { "file": "pkg/ribbon_counter.ts", "line": 4, "function": "stampInk" },
    "asked": { "text": "Count ribbons only when the stamp touches paper.", "citation": "transcript#L2", "valid": true },
    "understood": { "text": "this understood text is invalid and must not be stored", "citation": "transcript#L3", "valid": false },
    "happened": { "text": "The tally stayed at zero after an idle stamp.", "citation": "transcript#L8", "valid": true, "later_edits": [] },
    "complete": true,
    "notes": []
  },
  "answer": {
    "overlooked_assumption": "A ribbon counter resets itself whenever the ink stamp is idle.",
    "why_it_breaks": "The counter only moves when stampInk runs, so an idle stamp leaves the tally unchanged.",
    "confidence": "medium",
    "status": "verified",
    "verified_code_quotes": 1,
    "verified_transcript_quotes": 1,
    "evidence": [
      { "kind": "code", "file": "pkg/ribbon_counter.ts", "line": 4, "quote": "tally += 1", "verified": true },
      { "kind": "transcript", "line": 3, "quote": "the stamp is idle so the counter can reset", "verified": true },
      { "kind": "code", "file": "pkg/ribbon_counter.ts", "line": 9, "quote": "this quote was never in the source and must not be stored", "verified": false }
    ]
  },
  "repair": { "attempted": false, "failed_quotes": [], "outcome": "not_attempted" },
  "calls": []
}
EOF

python3 - << PY
import json
p = "$WORK/verified.json"
r = json.load(open(p))
r["three_piece"]["error_id"] = "ribbon-related"
r["answer"]["overlooked_assumption"] = "Leaving the ink stamp idle still resets the ribbon counter."
r["answer"]["why_it_breaks"] = "Idle time never calls stampInk, so the tally stays where the last stamp left it."
json.dump(r, open("$WORK/related.json", "w"))
r = json.load(open(p))
r["three_piece"]["error_id"] = "ribbon-unverified"
r["answer"]["status"] = "unverified"
r["answer"]["evidence"][0]["verified"] = False
json.dump(r, open("$WORK/unverified.json", "w"))
PY

# 2–3. approve, then approve again (dedup, same memory id)
npm run approve -- --report "$WORK/verified.json" --decision approve --by tester
npm run approve -- --report "$WORK/verified.json" --decision approve --by tester

# 4. a second, related report recalls the stored lesson
RELATED_REPORT="$WORK/related.json" npx tsx -e '
import { readFileSync } from "node:fs";
import { explainLessonStatus } from "./src/lesson/explain-lesson.ts";
const s = explainLessonStatus(JSON.parse(readFileSync(process.env.RELATED_REPORT, "utf8")));
console.log(JSON.stringify(s.recall.hits.map((h) => ({ id: h.id, shares_file: h.shares_file, shares_key: h.shares_key })), null, 2));
'

# 5. unverified: exit 1, stderr "not created because unverified", nothing stored
set +e
npm run approve -- --report "$WORK/unverified.json" --decision approve --by tester
echo "unverified exit: $?"
set -e

# 6. state.json holds the explain lesson
STATE_JSON="$DIR/state.json" node --input-type=module -e '
import { readFileSync } from "node:fs";
const state = JSON.parse(readFileSync(process.env.STATE_JSON, "utf8"));
for (const rec of state.records) {
  const body = JSON.parse(rec.content.slice(rec.content.indexOf("#record ") + 8));
  console.log(rec.id, rec.provenance.label, body.verdict, body.wrong_assumption);
}
'
```

Ran that flow on this tree: first approve printed `mem-1 (new)`, the second printed `mem-1 (dedup_existing)`, the related report recalled `mem-1` with `shares_file: true` and `shares_key: false`, the unverified approve exited 1 with `refusing: not created because unverified`, and `state.json` contained that one explain record (`provenance.label` `approved explain report`, `verdict` `verified`).

Investigate, same `WCE_METERLESS_DIR`, still the generic renderer. A `proven_false` report whose `claim` is the synthetic "ribbon tally idle reset" / "TypeScript" lesson approved as `mem-2 (new)` with label `approved investigation` and no `file:` tag:

```bash
npm run approve -- --report "$WORK/investigate.json" --decision approve --by tester
```

`investigate.json` is the `proven_false` object in `tests/explain-lesson.test.ts` (`version`, `claim`, `provenance.written_at.edit_line`, `tests.tests_sha256`, `patch.diff`). The HTML title is `why-code-exists: proven_false`.

`tests/explain-lesson.test.ts` runs this same flow, including supersede, reject, the LOCATE-pick path, pipeline `no_frame` with zero model calls, and the labeled Meterless-boundary failure.
