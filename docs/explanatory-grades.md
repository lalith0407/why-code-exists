# Hand-graded explanatory score, dev set of 15 (rubric: docs/explanatory-rubric.md, committed before grading in 82c8050)

Graded by hand (read, not tested) from `artifacts/three-piece/*.json` against the known causes. Strict reading: partial marks count as no.

| case | A asked relevant | U shows the belief | E explains the error | note |
|---|---|---|---|---|
| heldout-slack-multiline | yes (Slack "/pulse feedback") | no (silent edit, 8 words) | no | |
| heldout-vote-race | yes ("upvote") | yes (check-then-create plan stated) | no | no mention of concurrent clicks; the reader must supply "double-click", which is human interpretation |
| heldout-xirr-short | no (Phase 0 goal) | no | no | |
| heldout2-drawdown-penny | no | yes, buried ("new high-risk buys are blocked once equity falls 20%") | no | the key sentence is one of ~5,251 words; the reader must find it |
| heldout2-webhook-block | yes (feedback + webhook URL) | yes ("I should await the webhook send too … accepting the extra latency") | **yes** | |
| heldout2-webhook-case | yes (webhook URL settings) | no | no | the real `.toLowerCase()` is in a callee |
| heldout3-plan-injection | no | no | no | not linked (pre-existing code) |
| heldout3-retype-unique | no (a "HOLD" merge note) | yes (rebuild tables from PRAGMA table_info) | no | needs SQLite knowledge to see that the indexes get lost |
| heldout3-schema-target | no | no | no | not linked |
| heldout4-caps-unknown | no | no | no | |
| heldout4-stop-minhold | no | no | no | |
| heldout4-swing-batch | no | no | no | |
| heldout5-citation-leaf | yes (citation pass via match_quote) | no | no | |
| heldout5-macro-leapday | no | no | no | |
| heldout6-outcome-keys | no | yes (says it's switching keys to indices; the code keys on text) | **yes** | |

**Explanatory (U and E): 2 / 15.** U alone: 5/15. A relevant: 5/15. The judge estimated 4–5/15 from a 6-case sample. My strict grading is lower; under a lenient reading, vote-race, drawdown-penny and retype-unique would add up to 3 more (5/15). Single grader, not blind.
