> Historical development notes; linked run outputs are not included in the public repo.

# Cursor-infer v4 results (blind run, Sonnet 5)

Graded 2026-10-25 (PT). The cloud agent did the inference. I didn't run any model.

## Provenance (read and tested)
- **Answers** come from transcript bc-9d124e7f, copied verbatim from the agent's `read_file` results after its commit (transcript lines 152–183).
  - Tested: all 16 files match byte-for-byte (after trimming) the copies the agent printed in its final message.
- **No repairs.** Read: the agent made 4 `search_replace` calls. Three edited its scratch script `verify_quotes.py`, which it later deleted. One created `answers/_notes.md`.
  - None of them touched `caseNN.json`. case07's size before the commit (2551 B) equals the committed size.
  - `_notes.md` reports the agent's own quote errors (case02, case12) without fixing them.
- **Frozen v4 files** come from transcript bc-2492cc8b. Each file was created once as a `/dev/null` diff and rebuilt from the `+` lines: `fix-lines-v4.md` (L239), `grading-v4.md` (L250), `fix-lines-v4.json` (L253), `grade.py` (L259).
  - The `.md` was committed at L240, before the rest at L277.
  - The anchors were not changed. Copies are in `artifacts/cursor-infer/v4-blind-sonnet5/eval-frozen/`.
- **Bundle:** `cursor-infer/v4/x/`.

## Grader path issue (tested)
The frozen `grade.py` resolves `file` relative to `caseNN/src/`. The blind orchestrator's own subagent prompts gave the example `src/app/foo.ts`, which is relative to the bundle. The frozen `prompt-blind.txt` contains no such example (checked). 12 of 15 answers followed the orchestrator's convention.
- **As-is:** grounded **3/15** (cases 11, 14, 15).
- **Path-normalized:** I stripped one leading `src/` only when the path doesn't exist but the stripped one does, which is the same both-forms fix used in v3, and matches what the blind orchestrator told its subagents. This was done in a copy of the answers (`answers-pathnorm/`). `grade.py` is unchanged. Result: grounded **11/15**.
- I treat the normalized number as the headline, because it matches the v3 handling and the prompt. Both numbers are reported.

## Per-case results
Correct cause and belief are my reading against `ground-truth/` (read). Grounded is tested.

| case | correct cause | grounded as-is | grounded norm | explained (norm) | transcript quote states belief | notes |
|---|---|---|---|---|---|---|
| 01 | yes | no | yes | yes | partly (test claim, not single-line belief) | |
| 02 | yes | no | no | no | partly | transcript cites physical row 250; text is on L121 |
| 03 | yes | no | yes | yes | yes ("Short windows may yield no IRR…") | |
| 04 | yes | no | yes | yes | partly | |
| 05 | yes | no | yes | yes | partly (L178 is code shown in the transcript) | |
| 06 | yes | no | yes | yes | no | |
| 07 | **no**: blames auto-approve of "allow with no plan"; GT is the f-string splice in `_deprecation_step` (base.py:17-18) | no | no (proximity) | no | no | |
| 08 | yes | no | yes | yes | yes ("only handles simple schemas…") | |
| 09 | yes | no | yes | yes | yes ("no canonical mismatch there") | |
| 10 | yes | no | yes | yes | no (code line) | |
| 11 | yes | yes | yes | yes | yes | |
| 12 | yes | no | no | no | partly | transcript L315 should be L20; portfolio.py:266 should be 267 |
| 13 | **no**: blames `validate_claims` not resolving `json_path`; GT is `_keep_after_reopen` `quote in payload` (loop.py:250). Same miss as v3 | no | no (proximity) | no | no | |
| 14 | yes | yes | yes | yes | no (code line) | |
| 15 | yes | yes | yes | yes | yes ("indexed keys… prevent duplicate-key warnings") | |

## Totals and comparison
| | v3 | v4 |
|---|---|---|
| Correct cause | 14/15 | **13/15** (07 regressed, 13 still wrong) |
| Grounded | 4/15 | **grounded 11/15 (3/15 before the path-prefix fix); belief quoted 5/15** |
| Belief yes / partly / no | 8 / 2 / 5 | 5 / 5 / 5 (yes = 03, 08, 09, 11, 15) |

Grounded is not the same as explained. Among the 11 grounded answers, only 5 quote the coding agent's own words stating the mistaken belief. Cases 06, 10 and 14 quote only code or setup. I don't report an "explained" number for v4.

## Leakage (read)
The reports name no file, function or fix, except in the real stack traces. They still hint at the cause:
- case02 and case14: real stack traces whose frame is the fix line (feedback.ts:106, replay.py:322). case02 also says "double-clicked", which points to a race. case14 says "February 29 of a leap year".
- case10:4: "first time the fund has taken a position in KVXR" points to missing metadata.
- case05:3: "endpoint was deliberately made to take 8 seconds" gives the diagnosis away.
- case07:3: mentions "quote characters" and "safe to run with no conditions", which hints at injection. The answer still missed it. The v4 report no longer includes the injected SQL, which plausibly explains the regression.
- case06:3: says the settings field "still shows the value they originally pasted". Ground truth says the stored URL is lowercased, so this report likely contradicts ground truth.
- case15: gives the duplicate key string.
- No answer repeats information that is only in ground truth.

## Anchor sanity check (read; anchors NOT changed)
- I checked every v4 anchor against the code in `v4/x` and the ground-truth scenarios. All point at the true fault line. Examples: case07 base.py:17-18 is the splice; case13 loop.py:250 is `quote in payload`; case06 validations.ts:46 is `.toLowerCase()`.
- I found no wrong anchors.
- **Caveat:** many v4 anchors equal the lines the v3 answers cited (for example 03:60, 04:276, 11:279, 12:263, 15:69). The dev workspace contained the v3 answers. I can't rule out that the anchor choice was influenced by them, though each anchor is defensible from code alone.
- The grounding gain v3→v4 is mostly the anchor change (frame line → fault line) plus path normalization, not better answers.

## Judge's major findings (M10)
- **Grader tuned after seeing results:** the dev agent ran `grade.py` and the v4 anchors on the v3 answers (dev transcript bc-2492cc8b L273/274: "Grounded (mechanical): 14/15"). It committed `grade.py`, `grading-v4.md` and `fix-lines-v4.json` only after that. `fix-lines-v4.md` was committed first and the `.json` matches it, so the anchors didn't move. But the rubric and grader were finalized after being scored on the same model's answers to the same 15 cases.
- **Freeze can't be verified:** the v4 reports, anchors and `grade.py` were not committed or tagged in this repo before the run. They arrived with the results in 9a0ad0f. The ordering rests only on commit hashes in the dev agent's separate repo, as shown in its transcript, which can't be checked locally.

## Caveats
- One run, n=15. The cases are the same dev cases the rubric was revised on.
- "Correct cause" and "belief" are single-grader judgments.
- The headline depends on path normalization, which the frozen grader lacks.
- The blind agent pushed its answers to its own draft repo's origin. I pushed nothing.
