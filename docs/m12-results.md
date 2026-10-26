# M12 results — patch_ineffective (gen-v18-patch-revision)

All numbers are **tested** (dev suite, 15 cases per run, run one at a time) unless marked *read*.

## Diagnosis (*read*, docs/m12-diagnosis.md)
I went through 23 patch_ineffective cases from v16a/b and v17a/b:
- A. Patch at the cited lines, harm still observed: 13
- B. Patch at the cited lines, a decoy broke: 2
- C. Patch off the cited lines: 6
- D. Patch off the cited lines and a decoy broke: 2

Root cause: the patch writer never sees what the repro observes.

## Fix (v18, generic)
- If the repro still passes after the patch, the engine makes one bounded patch revision. The revision gets the previous diff and the repro's observed output (not the test body). It must stay in the same file, edit at most maxChanged lines and still touch the claim's cited lines.
- The draft-tests call now retries invalid JSON up to twice (`invalidRetries: 2`). If a redraft is still unparseable, the engine keeps the previous draft.

## Before / after (tested)
| run | patch_ineffective | harness_error | correct proofs | false proofs |
|---|---|---|---|---|
| v16a | 4 | 3 | 1 | 0 |
| v16b | 6 | 3 | 2 | 0 |
| v17a | 8 | 1 | 1 | 0 |
| v17b | 5 | 0 | 2 | 0 |
| v18a | 5 | 0 (+1 crash) | 1 (plan-injection) | **1 (xirr-short)** |
| v18b | 5 | 3 | 1 (stop-minhold) | 0 |

- **Revision effectiveness:** 7 revisions were applied across v18a and v18b, and **0 of them rescued a case**. Rejections: v18a 1 (cited lines not changed); v18b 2 (cited lines not changed; 92 lines > 19).
- **False proof (v18a xirr-short):** the claim was "the solver doesn't converge". The real cause is the step clamp. The revision was not involved. Disclosed; dev false proofs are no longer 0.
- **v18a swing-batch crash:** the patch call returned unparseable JSON. The patch call does not use `invalidRetries` yet. This is a follow-up.

## Conclusion
The v18 revision did not reduce patch_ineffective (5 and 5, against 4–8 before). The draft retry runs, but harness_error is unchanged overall. Held-out is unchanged at 2/15 proven, 0 false.
