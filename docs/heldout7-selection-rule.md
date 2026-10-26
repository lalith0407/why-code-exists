# Held-out 7 selection rule (written 2026-10-25, BEFORE searching Claude Code transcripts)

Source: every Claude Code transcript on the box (`~/.claude/projects/**/*.jsonl`) not used in held-out 1-6 or dev.

A case is eligible only if ALL hold:
1. The transcript contains at least one successful agent Write/Edit/MultiEdit (non-error tool_result) to a source file.
2. The edited file's code can be reconstructed by `reconstructTree` from the transcript alone (or from the repo at the transcript's cwd).
3. A real defect in agent-written lines is confirmed by running code (a failing executable check), not by reading only.
4. A production-like error/symptom can be stated without citing the fix.

Order: enumerate files -> filter by rule 1 mechanically (no reading of content beyond tool names) -> apply 2-4 in file-sort order -> stop at first 3-5 eligible cases.
If fewer than 3 qualify, held-out 7 is NOT frozen and no tag is made. No fallback source may be added after the search.
