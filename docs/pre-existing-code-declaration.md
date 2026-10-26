# Pre-existing code declaration. DRAFT for Lalith's review

> Fill in the ⟨…⟩ fields. Hackathon start date: ⟨confirm from the GenAI Works rules⟩.

## Built during the hackathon
- The `why-code-exists` engine (this repo): the deterministic three-piece linker (`src/story/`), transcript and GitHub provenance (`src/session/`), the sandbox corroboration engine (`src/engine/`, `src/prove/`), the Zetaris evidence step (`src/evidence/`, `src/engine/zetaris-step.ts`), Meterless integration (`src/lesson/`), the before-merge checker (`src/premerge/`), tests, cases, and docs. This repo's git history starts 2026-10-24 (`cc1c02e`); earlier planning docs in `/workspace/open-agent/docs/` are dated from Thu Oct 22, 2026. ⟨Confirm whether any engine code predates the start date.⟩
- **Pulseboard**, the demo app that several cases come from, was built by a Grok Build cloud agent from a plain founder prompt during the hackathon ⟨confirm date⟩. Its bugs are the agent's own; none were planted.

## Third-party or pre-existing code used
| item | origin | how used | modified? |
|---|---|---|---|
| Meterless H-MEM (`vendor/meterless-hmem`) | github.com/Meterless/Meterless @ 1742dec (sponsor reference implementation; see its LICENSE) | lesson store/recall, in-process | no |
| npm/pip dependencies (tsx, typescript, jsdom, Prisma in case apps, etc.) | public registries | build/test | no |
| **litellm** (BerriAI/litellm, local clone at a80379baf8) | public OSS | real-world case data; corroboration script runs its real code | no (read-only) |
| GitHub PRs used as case data (litellm #42354/#42535, premerge eval PRs in `docs/premerge-eval-frozen.json`) | public | inputs and ground truth | n/a |

## Pre-existing projects used as case data (not part of the submission's code)
- **Blast Radius** (`heldout3-*` cases): Lalith's earlier project and a separate Open Agent entry (Track 03). It was imported from a git bundle; three dev-set cases (`heldout3-*`, originally held-out for the old engine) come from its agent transcript. ⟨Confirm the creation date and whether it predates this hackathon.⟩
- **trading-agent-system** (`heldout-xirr-short`, `heldout2-drawdown-penny`, `heldout4-*`, `heldout5-*`): Lalith's agent-built project, used only as a source of real agent-written bugs. ⟨Confirm the date.⟩
- **Portfolio site** (`heldout6-outcome-keys`): agent-built, used as case data only. ⟨Confirm the date.⟩

## AI assistance
Code and docs in this repo were written with AI coding assistants (Grok Build / Grok Bot), under Lalith's direction. No cloud agents were used for the engine itself.
