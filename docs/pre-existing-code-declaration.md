# Pre-existing code declaration

Hackathon start date: Oct 22, 2026.

## Built during the hackathon
- The `why-code-exists` engine (this repo): the explain stage (`src/explain/`), the LOCATE stage (`src/locate/`), the deterministic three-piece linker (`src/story/`), transcript and GitHub provenance (`src/session/`), the sandbox corroboration engine (`src/engine/`, `src/prove/`), the Zetaris evidence step (`src/evidence/`, `src/engine/zetaris-step.ts`), Meterless integration (`src/lesson/`), the before-merge checker (`src/premerge/`), tests, cases, and docs. The private development history starts 2026-10-24 (commit `cc1c02e`); this public repo was published from it on 2026-10-26 as a fresh history, so `cc1c02e` is not in it; earlier planning docs in `/workspace/open-agent/docs/` are dated from Thu Oct 22, 2026.
- **Pulseboard**, the demo app that several cases come from, was built by a Grok Build cloud agent from a plain founder prompt during the hackathon. Its bugs are the agent's own; none were planted.

## Third-party or pre-existing code used
| item | origin | how used | modified? |
|---|---|---|---|
| Meterless H-MEM (`vendor/meterless-hmem`) | github.com/Meterless/Meterless @ 1742dec (sponsor reference implementation; see its LICENSE) | lesson store/recall, in-process | no |
| npm/pip dependencies (tsx, typescript, jsdom, Prisma in case apps, etc.) | public registries | build/test | no |
| **litellm** (BerriAI/litellm, local clone at a80379baf8) | public OSS | real-world case data; corroboration script runs its real code | no (read-only) |
| GitHub PRs used as case data (litellm #42354/#42535, premerge eval PRs in `docs/premerge-eval-frozen.json`) | public | inputs and ground truth | n/a |

## Pre-existing projects used as case data (not part of the submission's code)
- **Blast Radius** (`heldout3-*` cases): Lalith's earlier project and a separate Open Agent entry (Track 03). It was imported from a git bundle; three dev-set cases (`heldout3-*`, originally held-out for the old engine) come from its agent transcript. It was started before the hackathon (before Oct 22, 2026).
- **trading-agent-system** (`heldout-xirr-short`, `heldout2-drawdown-penny`, `heldout4-*`, `heldout5-*`): Lalith's agent-built project, used only as a source of real agent-written bugs. It was built well before the hackathon (before Oct 22, 2026).
- **Portfolio site** (`heldout6-outcome-keys`): Lalith's agent-built project, used as case data only. It was built before the hackathon (before Oct 22, 2026).

## AI assistance
Code and docs in this repo were written with AI coding assistants, under Lalith's direction.
- **Cursor cloud agents** built four parts of the product: the explain stage (bc-3518ef96), the LOCATE stage (bc-abecd3d6), the LOCATE fixes (bc-37d38e55) and the Meterless wiring into explain reports (bc-344f60b6). See `docs/sponsor-notes.md` for the commits and tags each one landed as.
- The earlier engine (linker, provenance, sandbox corroboration, Zetaris step, before-merge checker) was written with Grok Bot.
- A separate Cursor feasibility spike (bc-818eb37d, bc-2492cc8b, bc-9d124e7f) is not the product, and its numbers are not the tool's.
