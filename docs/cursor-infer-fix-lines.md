# Fix-changed lines for the grounding check (my reading; recorded BEFORE opening any answer; not adjusted afterwards)

Source: each case's culprit frame. That's the reporter-named frame for symptom cases and the app frame for real exceptions. For many cases the frame points at a function definition, so 'within 10 lines' is generous for short functions and strict for long ones.

| case | file:line |
|---|---|
| case01 | app/api/slack/events/[slug]/route.ts:31 |
| case02 | lib/actions/feedback.ts:106 |
| case03 | src/ta/sim/metrics.py:38 |
| case04 | src/ta/harness/caps.py:242 |
| case05 | lib/actions/feedback.ts:15 |
| case06 | lib/actions/workspace-settings.ts:12 |
| case07 | blast_radius/reasoner/base.py:20 |
| case08 | world/db.py:101 |
| case09 | blast_radius/models.py:160 |
| case10 | src/ta/harness/caps.py:39 |
| case11 | src/ta/harness/caps.py:242 |
| case12 | src/ta/harness/caps.py:242 |
| case13 | src/ta/agents/loop.py:230 |
| case14 | src/ta/replay.py:322 |
| case15 | src/components/selected-work.tsx:8 |
