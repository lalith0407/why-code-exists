# M7 wrong-cause gate: criteria (written before any measurement, Sun Oct 25 2026 PT)

Change under test (gen-v12, generic; no case knowledge):
1. **Claim cites code.** The claim step returns `cited_lines`: 1-4 lines copied verbatim from the attributed function or a helper text it was shown. The engine locates them (file + line number); unlocated lines are dropped. No located line → verdict `claim_uncited`.
2. **Patch must touch the cited code.** The original-file lines the patch removes or modifies (an insertion counts at its neighbouring original lines) must be within ±1 line of at least one located cited line, in the same file. Otherwise → `patch_off_claim`.
3. **Repro must assert the claimed cause.** An independent gate model (the mechanism-gate provider, not the test writer) reads the claim, the cited lines and the frozen reproduction body. It answers whether the harm condition would ALSO hold for a different defect of the same function. If so (`claim_specific=false`) → `repro_not_claim_specific`.
4. **Decoys must not be vacuous.** Each decoy also runs against a no-op mutant of the attributed function (body returns immediately). A decoy that still passes there does not observe the function (e.g. it passes on "fetch failed" or "skipped" paths). It is redrafted once with that feedback and must pass on the original AND fail on the mutant. Otherwise → `decoy_vacuous`. If the mutant can't be built, that's recorded and not blocking (disclosed per run).

Measurement: full 15-case dev suite (`scripts/dev-suite.sh`), one run, engine gen-v12, compared with the recorded gen-v11f runs p4 and p4b.
- Correct proof = proven_false with a claim matching ground truth (same strict rule as `docs/proof-rate-criteria.md`).
- **Primary (must hold): false proofs = 0.**
- Secondary (reported, not tuned to): correct proofs vs v11f's 3 and 4.
- If false proofs > 0, report it and do not tune to the specific case.
- If correct proofs drop to 0, report that the gate is too strict, not a success.
- No per-case changes after the measurement starts. Any later change is a new version, measured again in full.
