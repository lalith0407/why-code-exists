# Video script (target 2:30, max 3:00). DRAFT for Lalith

Screen: terminal plus the three-piece JSON or HTML on the left, the source (transcript or GitHub) on the right. Say "tested" only for things in `docs/three-piece-results.md`.

| time | on screen | voice-over |
|---|---|---|
| 0:00–0:15 | Title, then `git blame` output ending at a bot commit | "When agent-written code breaks, git blame stops at a bot. It can't tell you what the agent was told or what it thought it was doing." |
| 0:15–0:40 | litellm PR #42354 (Devin) → fix PR #42535 "Before" section | "This is real. Devin added video call types to litellm so guardrails would run on videos. In production, /v1/videos returned a 400, 'VideoObject has no attribute choices', and the provider billed three video jobs for one request." Caption: *source: fix PR #42535, "Before" section.* |
| 0:40–1:30 | `npm run why -- --error cases/heldout-vote-race/error.json --transcript …` → three columns | "Give it an error with a stack trace. This one we wrote ourselves, from a real run of the app. It finds the line, the agent edit that wrote it, and puts three things side by side. Asked: 'people can submit feedback, upvote…'. Understood, two lines before the edit: 'checks for an existing vote … and either deletes or creates it'. Happened: unique constraint failed at feedback.ts line 106. My reading, not the tool's: the agent planned check-then-create and never thought about a double-click. Every piece links to its source line." Caption: *interpretation is human-written.* Click a citation → transcript L121. |
| 1:30–1:45 | `scripts/three-piece-all.sh` table | "On our 15 dev cases, which we used to build it, 13 link to the exact agent edit. But reading them by hand, only 2 of 15 actually explain the bug. On a fresh held-out test with only the real error text, the rule found one case, and the tool picked the wrong PR." |
| 1:45–2:05 | **Zetaris**: `npm run zetaris:ping`, then the zetaris step output on vote-race (ERROR_LOG, CODE_EDITS, APP_DB_WRITES joined) | "Zetaris is optional corroboration. It federates the error log, the code edits, and the app's database writes, and checks that they line up. Honestly: it has confirmed one dev case so far, and it runs on temp views because the durable source needs S3." |
| 2:05–2:25 | **Meterless**: `npm run approve` then `npm run prevent` (lesson id, recall) | "Meterless H-MEM stores the lesson, what the agent believed and what production showed, and recalls it before the next agent touches that code. It runs in-process, vendored from Meterless's reference implementation." |
| 2:25–2:40 | Honest-limits card | "Limits: on litellm, with no stack trace, it found the right PR but the wrong file. Two cases were code the session didn't write. And we picked the cases ourselves. Everything you saw is cited to its source." |
| 2:40–2:50 | Title | "Why does this code exist? Now you can read the answer." |

Recording notes: run everything live and keep no hidden takes. Show the litellm result as partial if asked (right PR, wrong file). Don't show any judge score.
