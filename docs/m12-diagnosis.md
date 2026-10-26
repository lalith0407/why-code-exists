> Historical development notes; linked run outputs are not included in the public repo.

# M12 diagnosis: why patches are ineffective (read-only analysis of existing artifacts; labeled READ)
Source: every `patch_ineffective` report in artifacts/m10-v16a, m10-v16b, m11-v17a and m11-v17b (23 cases across 4 runs). No engine changes were made before this was written.

| category | n | evidence (read) |
|---|---|---|
| A. Patch at the cited lines, harm still observed | 13 | slack-multiline ×4 (the regex changed in opposite directions across runs: drop optional slash / require slash / normalize), drawdown-penny ×3 (identical `<=`→`<` each time), plan-injection ×2 (quote escaping), xirr ×2, swing-batch, slack-retry |
| B. Patch at the cited lines, a decoy also broke | 2 | webhook-case (v16a), stop-minhold (v17a) |
| C. Patch off the cited lines (wrong site), harm still observed | 6 | retype-unique ×3 (adds index recreation above the cited lines), schema-target, xirr ×2 |
| D. Patch off the cited lines and a decoy broke | 2 | plan-injection v16b, webhook-case v17a |

Reading of A (the largest, 13/23 = 57%):
- The patch writer never sees what the reproduction actually observes. In every case it wrote one blind edit. Where the same edit repeats (drawdown-penny), the claim's boundary concept is probably not the real cause: the claim may be wrong, and a revision cannot fix that.
- Where the edits disagree with each other (slack-multiline), the writer is guessing the direction of the fix.
- These cannot be separated without the reproduction's observed output on the patched tree.
