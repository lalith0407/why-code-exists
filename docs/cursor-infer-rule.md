# Cursor inference experiment: rule, frozen BEFORE any bundle is built (2026-10-25 PDT)

> **v2 amendment (2026-10-25 ~7:40 PM PDT, before any run; tag `cursor-infer-frozen-v2`, the original tag `cursor-infer-frozen` is kept):**
> - There are now two variants.
>   - **`bundle-blind.tgz`** has no `located_by_tool.txt`, and its prompt doesn't mention it (prompt-blind.txt). **The blind variant is the HEADLINE metric.**
>   - **`bundle-hint.tgz`** includes `located_by_tool.txt` (prompt-hint.txt, the prompt below unchanged). It's secondary. In 12/15 cases its location is the culprit file:line that we named in our own error files, so it's a hint, not an independent test.
> - Files with hard-coded secrets (a broad key/secret/password/token scan) are left out of `src/` entirely, and matching transcript values are redacted. Both are listed in leak-log.md.
> - Everything else, including the rubric, schema and baseline, is unchanged.

> **v3 amendment (2026-10-25 ~7:42 PM PDT, before any run; tag `cursor-infer-frozen-v3`; the earlier tags are kept):**
> - Removing every file that contained a hard-coded secret also deleted `lib/actions/workspace-settings.ts`, case06's culprit file. v3 changes how that file is handled:
>   - it's kept in cases 01, 02, 05 and 06;
>   - only the flagged secret value is replaced with `[REDACTED-SECRET]`, which affects 1 line per file (line 41);
>   - the culprit line (line 12) is checked to be byte-identical to the original tree.
> - `slack-test.mjs` and `tests/test_phase2.py` stay excluded. The transcript redactions stay.
> - The secret scan (both strict and broad patterns) re-run on both bundles: 0 hits.
> - Rubric, prompt, schema, baseline and the blind (headline) / hint (secondary) split are unchanged.

Frozen by tag `cursor-infer-frozen`. Approved by Lalith.

## Setup
- A Cursor cloud agent running a mid-tier model does the INFERENCE step. It gets one bundle per case and is asked what the coding agent overlooked.
- We don't run any model to prepare the bundles. The bundle builder (`scripts/build-cursor-infer-bundle.py`) is deterministic.
- Cases: the 15 dev cases (the same set as docs/explanatory-grades.md).
  - In the bundle they're renamed `case01`…`case15`, in alphabetical order of the internal case id. The internal ids describe the bug (for example "vote-race"), so they'd leak.
  - The mapping is kept only in the ground-truth folder.

## Bundle contents per case (`bundle/caseNN/`)
- **`error.txt`:** only the raw error message and stack trace.
  - Diagnosis, culprit hints, scenario descriptions and our comments are stripped.
  - For the 13 "symptom report" cases (no real stack trace), the frames we named ourselves as the reporter are dropped, and file paths, function names and code identifiers in the message are redacted. The stack frames are kept only for the 2 cases whose frames came from a real exception.
- **`src/`:** the full source tree of the app as it stood when the error happened (repo checkout, or the tree replayed from the transcript). No fix, no `.git`, no `.env*`/secrets, no `node_modules`, no data dumps or databases, and none of our case or eval files.
- **`transcript.txt`:** the full agent transcript, as numbered text. Line `Lnnn` = line nnn of the original JSONL. It includes thinking, visible messages, tool calls and tool results; very long tool results are truncated with a marker.
- **`located_by_tool.txt`:** the edit our deterministic linker found (file, line, transcript line), labelled "located by tool". If the linker found none, it says "not located".

## Ground truth
- Ground truth stays on the box in `/workspace/open-agent/cursor-infer/ground-truth/`.
- It's never in `bundle/` or `bundle.tgz`.
- It's used only for grading, after the agent's outputs are saved.

## Exact task prompt (identical for every case; no per-case hints)
```
You are investigating a bug in an app that was written by an AI coding agent.

The folder bundle/<CASE>/ contains:
  error.txt            - the error or symptom that was observed (raw text only)
  src/                 - the app's source code as it was when the error happened
  transcript.txt       - the full session of the coding agent that wrote the code; each line starts with Lnnn (its line number)
  located_by_tool.txt  - the code edit an automatic tool linked to this error (may be wrong or missing)

Task: work out what the coding agent overlooked - the specific wrong assumption or missed case in its thinking that led to this error. Use the transcript to find what the agent believed, and the source to confirm how that belief produces the error. You may read and search the files and run code locally in a sandbox. Do not use the internet. Do not look outside bundle/<CASE>/.

Answer with ONLY this JSON object, written to answers/<CASE>.json:
{
  "case": "<CASE>",
  "overlooked_assumption": "<one sentence>",
  "evidence": [
    {"kind": "transcript", "line": <Lnnn number>, "quote": "<verbatim text copied from that transcript line>"},
    {"kind": "code", "file": "<path under src/>", "line": <line number>, "quote": "<verbatim text copied from that source line>"}
  ],
  "why_it_breaks": "<how that assumption leads to the observed error>",
  "confidence": "high" | "medium" | "low"
}
Every quote must be copied exactly (it will be checked as a substring of that line). Include at least one transcript quote and one code quote. If you cannot find it, say so with confidence "low"; do not guess silently.
```
Run all 15 cases with the same prompt, one per case, with the same model. Save the raw output.

## Output schema (per case)
- `overlooked_assumption`: one sentence.
- `evidence`: a list of verbatim quotes.
  - Transcript quotes give the line number; code quotes give file:line.
  - String-checkable: each quote must be a substring of that line, after whitespace normalisation.
- `why_it_breaks`: how the assumption leads to the observed error.
- `confidence`: high, medium or low.

## Grading rubric (decided now)
- **Correct cause (yes/no, read):**
  - Yes means `overlooked_assumption` plus `why_it_breaks` name the same mechanism as the ground-truth cause (the failing condition and the reason it fails).
  - A vaguer restatement of the symptom, or a different mechanism, is no. Partial is no.
- **Grounded (yes/no, tested):**
  - Every quote verifies as a substring of the cited transcript line or source line.
  - There's at least one transcript quote and one code quote.
  - At least one code quote is on, or within 10 lines of, the line that the ground-truth fix changes.
- **Explained = correct cause AND grounded.**
- Headline: explained x/15. Correct cause and grounded are also reported separately, and every case is listed, failures included.

## Baseline to beat
2/15 explanatory, the hand-graded deterministic three-piece output (docs/explanatory-grades.md). Caveats:
- Different grader setups. The baseline used the A/U/E rubric; this test uses correct cause + grounded.
- These are dev cases that the linker was tuned on, and `located_by_tool.txt` comes from that tuned linker.
