# Held-out 6 search log (rule: docs/heldout6-selection-rule.md)

Tree: `reconstructTree` on bc-cfc1fe44 (123 hunks, 0 failed). Walk order = transcript line of the edit that last wrote each file.
Method: every component was rendered with react-dom/client in jsdom (dev build), using its own data from `src/lib/site.ts`, recording exceptions and console.error. Pure helpers were read against their call sites and the agent's stated intent.

| # | function / file (last edit line) | eligible? | outcome |
|---|---|---|---|
| 1 | tmp-scaffold/page.tsx (31) | no | create-next-app boilerplate, markup only; scaffold dir not used by the app |
| 2 | SiteFooter (350) | yes (ternary) | rendered clean |
| 3 | layout.tsx (355) | no | markup |
| 4 | Container (445) | yes (cn) | trivial, clean |
| 5 | **SelectedWork (447)** | yes (map) | **CONFIRMED:** `key={outcome.detail}` with 3 identical stub details gives 6 React "two children with the same key" errors per render. On the home page from transcript line ~110 to ~448, then replaced by CaseStudies (which keys by index). Unreachable in the final tree. |
| 6 | About (453) | yes | rendered clean (paragraph-prefix keys unique in data) |
| 7 | HireCta (455) | yes | clean |
| 8 | ProofStrip (653) | yes | clean |
| 9 | Hero (660) | yes | clean |
| 10 | SiteHeader (662) | yes | clean (only act() harness notices from Link state) |
| 11 | Experience, Education, Projects, CaseStudies | yes | rendered clean |
| 12 | withTokens (placeholder.tsx) | yes (regex/split) | the split keeps the bracket tokens; empty parts render as empty spans (harmless); matches intent |
| 13 | work/[slug]/page.tsx: generateStaticParams, generateMetadata, field | yes | slugs match `caseStudies`; the not-found path uses notFound(); clean |
| 14 | getCaseStudy, caseStudyStub (site.ts) | yes | correct for every call site |
| 15 | hash anchors in nav (site.ts) | data | every `/#id` has a matching section id |

Result: **1 confirmed bug** (n=1 < 3). Per rule 5, held-out 6 runs with n=1 (disclosed). No fallback source.

Engine changes made while preparing the case (before the freeze tag; general harness capabilities, but **motivated by this case**, so disclosed as a leak risk):
- harness globals `dom()` (jsdom browser DOM) and `console_errors()` (util-formatted console.error capture), plus one prompt sentence describing them;
- inferred `@/` alias base: `<root>` or `<root>/src`, whichever resolves more of the tree's own `@/` imports (Next `--src-dir`);
- fallback tsconfig (`jsx: react-jsx`) when the reconstructed tree has no tsconfig.json.
