# Pre-merge eval results (frozen set, Sun Oct 25 2026, run ~3:10-3:30 PM PT)

Frozen list: docs/premerge-eval-frozen.json (tag premerge-eval-frozen). Engine: tag premerge-engine-eval (run 1), premerge-engine-eval2 (run 2).
Models: gpt-4.1-mini per site; Nemotron second check only on candidate flags. Max 24 sites per PR. No tuning on eval cases.

## Run 1 (premerge-engine-eval) — INVALID (input leakage), reported for transparency
- Positives 1/5 flagged (soberliving #13, flag_both, site = the fixed function, cause = swallowed NEXT_REDIRECT — matches fix #14).
- Negatives 0/10 flagged.
- Leak: the engine's agent-text input included Devin comments posted AFTER merge (17:42/17:44Z vs merge 17:40Z), in which Devin itself
  confirms the bug ("The catch-all was swallowing `NEXT_REDIRECT`…"). The one hit came from that. Not a before-merge result.
- Fix (generic, not tuning): only agent comments created before `merged_at` are used (src/session/github.ts `commentsBefore`).
  Note: the litellm dev runs r1-r4 also had post-merge Devin replies in their input and still missed.

## Run 2 (premerge-engine-eval2) — the valid result
| class | PR | sites judged (found) | flags |
|---|---|---|---|
| pos | [vexor-terminal #32](https://github.com/Vexorterminal0111/vexor-terminal/pull/32) -> [fix #33](https://github.com/Vexorterminal0111/vexor-terminal/pull/33) | 5 (5) | 0 — MISS |
| pos | [fluxocaixa #19](https://github.com/jotamano/fluxocaixa/pull/19) -> [#20](https://github.com/jotamano/fluxocaixa/pull/20) | 16 (16) | 0 — MISS |
| pos | [xuantoi #127](https://github.com/hoathienmenh-01/xuantoi/pull/127) -> [#129](https://github.com/hoathienmenh-01/xuantoi/pull/129) | 6 (6) | 0 — MISS (fix is in a .vue file the TS parser skips) |
| pos | [soberliving #13](https://github.com/arborstarjax-bot/soberliving/pull/13) -> [#14](https://github.com/arborstarjax-bot/soberliving/pull/14) | 2 (2) | 0 — MISS (site was shown; judge said ok) |
| pos | [securenexus #416](https://github.com/prathamesh-ops-sudo/securenexus/pull/416) -> [#417](https://github.com/prathamesh-ops-sudo/securenexus/pull/417) | 24 (183) | 0 — MISS |
| neg | vexor-terminal #35, #31 | 5, 4 | 0, 0 |
| neg | fluxocaixa #21, #22 | 2, 9 | 0, 0 |
| neg | xuantoi #109, #70 | 5, 9 | 0, 0 |
| neg | soberliving #16, #17 | 24 (165), 6 | 0, 0 |
| neg | securenexus #419, #415 | 24 (38), 2 | 0, 0 |

**Recall 0/5. False alarms 0/10.** Across 143 judged sites the model answered breaks=true 0 times; i.e. the reviewer is silent, not
discriminating. 158 LLM calls, 0 errors. Every flag listed: none.

## Caveats
- Eval repos are small personal repos (all Devin); 4/5 fixes were prompted by Devin Review (a post-merge review bot), so the "bug" was
  found by another model, not a user. Small n; 0/5 vs 0/10 says nothing about discrimination.
- Consumer map is name-based AST, not type-checked; .vue SFCs not parsed; fan-out cut at 24 sites on 3 PRs.
