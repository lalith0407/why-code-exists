# Demo video script (2–3 min) — DRAFT, local only

Story: one demo bug (dev **case05**, the Pulseboard "webhook-block" bug) and one proof case the tool never saw during
development (**unseen u06**, VS Code `simpleFileDialog.ts:514`).

- **case05 is contaminated.** The example report given to Cursor while it wrote LOCATE paraphrases it, so it is
  excluded from every metric (`docs/locate-results.md:11`). In the video it is **only a story**, never a score.
- **u06 is the evidence.** The Open Agent Judge re-ran it and got the same answer at the fix line, `simpleFileDialog.ts:514`
  (`docs/judge/m11.md:45`, verified).
- Every beat names the exact command to capture. Model output is non-deterministic, so record the live run and cut
  to the saved artifact named under each beat if the live run differs. Never show `secrets/` or env values.

Setup, not on camera (run from the `locate-fix` checkout, e.g. `/workspace/open-agent/wt-fix`; needs `ANTHROPIC_API_KEY` set, not shown):
```bash
T=/workspace/cloud-agent-transcripts/bc-25dab342-ff3b-5916-ae3f-7b0214f24784.jsonl   # Pulseboard builder agent transcript
X=/workspace/open-agent/cursor-infer/v4/x; U=/workspace/open-agent/unseen-eval/bundle
mkdir -p /tmp/demo/case05 /tmp/demo/u06    # write to /tmp so saved artifacts are not overwritten
```

## Beats

| # | Time | Beat |
|---|---|---|
| 1 | 0:00–0:15 | Hook |
| 2 | 0:15–0:35 | The bug report (case05, no stack trace) |
| 3 | 0:35–1:10 | Run: LOCATE finds the agent's line, then explains it |
| 4 | 1:10–1:30 | The report: asked / understood / happened, and how it was found |
| 5 | 1:30–2:05 | Proof on an unseen case: u06 |
| 6 | 2:05–2:20 | Sponsors, honestly |
| 7 | 2:20–2:50 | The honest numbers |

### 1. Hook (0:00–0:15)
Capture: title card, no command.
> "AI agents write code that ships. When it breaks, nobody knows *why* the agent wrote it. Why-Code-Exists takes a plain
> bug report, finds the agent's own edit, and shows what the agent was asked, what it understood and what actually happened, all quoted."

### 2. The bug report (0:15–0:35)
Capture:
```bash
cat $X/case05/error.txt
```
Shows: "clicking 'Submit feedback' makes the button spin for several seconds … whenever the workspace's configured
notification endpoint is slow … 5036 ms".
> "No stack trace, just a user complaint. Disclosure: this case leaked into the tool's development, so it's a demo,
> not a score."

### 3. Run (0:35–1:10)
Capture:
```bash
node scripts/eval/report-to-error.mjs $X/case05/error.txt case05 > /tmp/demo/case05/error.json
npx tsx src/bin/explain-why.ts --error /tmp/demo/case05/error.json --transcript $T --repo $X/case05/src \
  --out /tmp/demo/case05 --provider anthropic --locate-provider anthropic
```
Expected (saved run `artifacts/locate/B-anthropic/case05/stdout.txt`, B-anthropic at locate-stage; this exact
command was not re-run for this script):
```
locate: layer2_agentic -> lib/actions/feedback.ts:58
status: verified (code quotes 2, transcript quotes 1)
overlooked_assumption: The agent assumed that awaiting the webhook call and then logging its result was acceptable, but did not consider that this blocks the user's feedback submission response until the slow webhook completes.
```
> "It searched only the agent's own edits, landed on feedback.ts line 58, and every quote it uses was checked against the code and the transcript."

### 4. The report (1:10–1:30)
Capture: `xdg-open /tmp/demo/case05/report.html` (fallback: `artifacts/locate/B-anthropic/case05/report.html`). Scroll
through "How the location was found", "The three pieces (deterministic, no LLM)", "Why it broke … verified" and the
"LLM calls" list.

### 5. Unseen proof: u06 (1:30–2:05)
Capture:
```bash
cat eval/unseen/u06/error.txt
node scripts/eval/report-to-error.mjs eval/unseen/u06/error.txt u06 > /tmp/demo/u06/error.json
npx tsx src/bin/explain-why.ts --error /tmp/demo/u06/error.json --transcript eval/unseen/transcripts/u06.jsonl \
  --repo $U/u06/src --out /tmp/demo/u06 --provider anthropic --locate-provider anthropic
```
Expected (saved `artifacts/unseen/post/B-anthropic/u06/stdout.txt`; the judge reproduced it):
```
locate: layer1_deterministic -> src/vs/workbench/services/dialogs/browser/simpleFileDialog.ts:514
status: verified (code quotes 2, transcript quotes 2)
overlooked_assumption: The agent assumed that checking for a trailing path separator would correctly distinguish between typing a drive root (Q:\) and navigating into a child folder, but on Windows drive roots like Q:\ are both valid folder URIs and have trailing separators.
```
> "A real agent-authored VS Code PR that later needed a fix. We never looked at it while building. It lands on the line the fix changed."
Say plainly: here the deterministic layer 1 found the line, not the model's agentic search.

### 6. Sponsors and the lesson memory (2:05–2:20)
Capture (store dir is gitignored; use a fresh one for recording):
```bash
export WCE_METERLESS_DIR=/tmp/demo/meterless
npm run approve -- --report /tmp/demo/case05/report.json --decision approve --by Lalith
npm run approve -- --report /tmp/demo/case05/report.json --decision approve --by Lalith   # dedup
```
Expected (tested 2026-10-26 on a saved report, `docs/meterless-e2e.md`): `"lesson":"mem-1 (new)"`, then `"lesson":"mem-1 (dedup_existing)"`.
Then show the "Lesson" section of `/tmp/demo/case05/report.html` (stored, memory id, verified citations).
> "Built with Cursor. A verified explanation becomes a lesson in Meterless memory, but only after a person approves
> it. Unverified answers are refused. The next report shows related past lessons."
Say plainly: related lessons are matched by **shared words**, not meaning. In our test an unrelated lesson also showed up.
Nemotron is a supported provider. Zetaris is not used in the new stages.
Optional: saved Zetaris result for this bug, `artifacts/m8-zetaris/m8-v13f_heldout2-webhook-block.json` (`"verdict": "does_not_confirm"`);
do not claim Zetaris confirmed it.

### 7. Honest numbers (2:20–2:50)
Capture: text card, verbatim (judge's wording, `docs/judge/m11.md`):
> "On 8 real agent-authored PRs that later needed production fixes (not seen during development; transcripts rebuilt
> from each PR), our LOCATE fix raised top-3 location hits from 3 to 4 and correct root cause (single reader) from 1 to
> 4 of 8. It also cut grounded answers on our 14-case dev set from 7 to 5 in one run each, so it failed our pre-registered rule."
Add: "Nemotron's agentic search never confirmed an answer in our evals; our results come from Anthropic for the model steps."

## Do not use
`scripts/record-demo-capture.sh` is stale: it calls `npm run demo:invite`, `demo:compare` and `demo:prevent`, which
no longer exist in `package.json`.
