# Hand-grading rubric for three-piece explanations (written BEFORE grading, 2026-10-25 PDT)

Grader: Grok Bot, reading each `artifacts/three-piece/<case>.json` next to the case's known real cause (docs/heldout*-success-criteria.md, docs/heldout-results.md). The rubric is fixed by this commit and isn't changed after grading starts.

Each case gets three yes/no marks:
- **A (asked relevant):** the quoted "asked" text mentions the feature or behaviour the faulty code implements, more specifically than a generic "build the app / phase goal" paragraph.
- **U (understood shows the belief):** the quoted "understood" text states or clearly implies the specific belief or plan that turned out wrong (the faulty behaviour itself, not just "I'll write function X").
- **E (explains the error):** reading asked + understood + happened, with no extra knowledge, a reader can see why the error happened. E requires U.

A case is **explanatory** if U and E are both yes. Missing pieces mean all three marks are no. Partial marks count as no.
