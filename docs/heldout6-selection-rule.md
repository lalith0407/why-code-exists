# Held-out 6: case-selection rule (committed BEFORE reading any of the transcript's code)

Source: transcript bc-cfc1fe44-a598-5ad2-9c23-b2ad05242a85.jsonl, not read before this commit. Only its first user line was seen: a portfolio-site build.

1. Reconstruct the agent's tree with the engine's own `reconstructTree` (`src/engine/tree.ts`). List every agent-written function or component in the order of the transcript edit that last wrote it.
2. **Eligible:** a function whose body contains logic: if / ternary / loop / map / filter / reduce / regex / parse / arithmetic on data. This is checked by a mechanical grep on its text. Pure markup is excluded.
3. Walk eligible functions in that order. For each one, try to confirm a bug by running the real reconstructed code. Inputs come from (a) its own call sites or data files in the tree, or (b) the contract the agent stated (types, comments, its messages). **Confirmed** = an exception, or output that contradicts the agent's stated intent, reproduced by a run. Hypotheticals, style issues and planted inputs don't count.
4. Take the **first 3 confirmed bugs in walk order** and stop. Skipping a confirmed bug because it looks hard is not allowed. Every function examined gets logged with its outcome in `docs/heldout6-search-log.md`.
5. Cap: Sun Oct 25 12:00 PM PT. If fewer than 3 are confirmed by then, held-out 6 runs with what was found (n<3, disclosed). If none, no held-out 6 run.
6. No fallback source is added after reading.
7. For each case: write the scenario and capture error.json with `src/bin/capture-error.ts`. Write the ground truth in `docs/heldout6-success-criteria.md`. Commit, tag `heldout6-frozen`, then run each case once with `scripts/dev-suite.sh`. No src change between the tag and the runs.
