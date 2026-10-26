# Explain-why stage: eval rule (frozen before any live model call)

Written 2026-10-25 PT, before any live call to the explain-why stage. Tag: `explain-stage-frozen`.
Code under test: branch `explain-stage` (Cursor's patch 5e469fe + instrumentation 9999e4b that only keeps
the first-pass and repair replies in report.json). No code or prompt changes after this tag.

## Input per case (case01..15)
- Report: `/workspace/open-agent/cursor-infer/v4/x/caseNN/error.txt` (the v4 user-voice report), wrapped by
  `scripts/eval/report-to-error.mjs`: message = full text; frames = every `path.ext:line` matched by one
  generic regex. Plain reports have no frames.
- Code: `--repo /workspace/open-agent/cursor-infer/v4/x/caseNN/src`.
- Transcript: the product reads session JSONL, not the rendered `transcript.txt`. We pass the source JSONL that
  `v4/x/caseNN/transcript.txt` was rendered from (same session; its `Lnnn` labels equal JSONL line numbers;
  checked line counts match). Mapping is the one in `scripts/dev-suite.sh`.
- No ground truth, no `located_by_tool`, no hints. Whatever the linker finds is what the stage gets.
  A linker failure (`no_frame`, `no_edit`) is a miss. A `model_error` or `no_credentials` is a miss.

## Providers, one run each
- Headline: NVIDIA Nemotron (default model in `src/llm/providers.ts`).
- Secondary: Anthropic, `ANTHROPIC_MODEL` unset (code default), only if the key works.
- One run per provider via `scripts/eval/explain-stage-eval.sh <provider>`. At most one retry of a case for a
  transient network error, disclosed. Note: `llmJson` has a built-in single re-ask on invalid JSON; that is part
  of the product and is counted as-is.
- Outputs: `artifacts/explain-stage/<provider>/caseNN/` (error.json, report.json, report.html, stdout, stderr).

## Grading
- Linker found the edit: stage is past `no_frame`/`no_edit`.
- Verified: the product's own status (`verified` = >=1 verified code + >=1 verified transcript quote).
  Reported before repair (first-pass answer) and after repair (adopted answer).
- Grounded: frozen v4 `grade.py` and `fix-lines-v4.json` from
  `artifacts/cursor-infer/v4-blind-sonnet5/eval-frozen/`, with the same one-leading-`src/` path normalization,
  against `v4/x`. Transcript `line` = the `Lnnn` label.
- Correct cause: read against `cursor-infer/ground-truth/` (same mechanism, not just symptom; partial = no).
- Belief quoted: yes / partly / no, by reading the transcript quote(s).
- A case with no answer scores no on all of these.
- Compare to the product baseline (explains why 2/15, hand-graded) and the outside spike (13/15 correct cause;
  not the product).
