# Pre-merge pivot — progress log (times PT, Sun Oct 25 2026)

- 2:48 PM restore point: tag `pre-premerge-2026-10-25` + /workspace/open-agent/wce-pre-premerge-2026-10-25.tgz (excl. node_modules).
- 2:50 PM docs/premerge-selection-rule.md written and committed BEFORE any search.
- ~3:00 PM search + negatives; list frozen in docs/premerge-eval-frozen.json, tag `premerge-eval-frozen` (5 positives, 10 negatives; all
  Devin PRs in small/personal repos — no big OSS project matched the strict "fix names the agent PR" rule in the time-box).
- 3:05-3:45 PM engine built (src/premerge/*, src/bin/premerge.ts, src/report/premerge.ts):
  - Python consumers: stdlib ast. TS consumers: TypeScript compiler API AST. Name/attribute resolution, not type inference.
  - Assumptions: stated (verbatim quote, string-match checked against PR text segments) + implied (diff-line cited).
  - Judge: gpt-4.1-mini per site; Nemotron second check only on candidate flags; flag only if cited diff lines AND site lines validate.

## Dev case litellm #42354 (inspired the design; dev only)
- Consumer map: TESTED, works. From the 2 added `CallTypes` lines it deterministically reaches `_CALL_TYPE_ENUM_MAP` (utils.py:257,
  built by iterating CallTypes) -> its 2 uses -> `client.wrapper_async` (utils.py:2023) -> callee `async_post_call_success_deployment_hook`
  (utils.py:1383, with `cast(LLMResponseTypes, ...)`) -> the 4 callback overrides (2nd hop). That is the real failure path. 2,730 py files parsed, 19 s.
- Judge: MISSES in all 4 dev runs (r1-r4). It sees the newly-reached hook but concludes the new call types are "handled", because nothing in
  the shown code says a video call returns a `VideoObject` (not a chat response). Dev changes made (all generic, no per-repo logic):
  deterministic "behaviour delta" note for enum-widening consumers; 2nd-hop polymorphic callees; judge must list newly-reaching values with
  concrete types first. None flipped the verdict. Stopped tuning at r4 to keep time for the frozen run.

## Frozen eval (see docs/premerge-eval-results.md)
- Run 1 had input leakage (post-merge Devin comments) -> 1/5 hit came from the leak; discarded. Fix: pre-merge agent text only.
- Run 2 (valid): recall 0/5, false alarms 0/10; judge said "breaks" on 0 of 143 sites. The judge step is the failure, as on litellm.
- (Times above in this file before this section were estimates; git commit times are authoritative.)
