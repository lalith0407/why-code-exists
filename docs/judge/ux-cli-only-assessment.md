# Product & UX — CLI-only assessment (independent)

**When:** Oct 23, 2026 ~2:00 pm PT (America/Los_Angeles).  
**Persona:** Data-Platform CTO (Open Agent Hackathon assessor).  
**Official criterion (10 pts):** *"How intuitive, accessible, and easy to use the product is for its intended users."*  
**Product on disk:** `/workspace/open-agent/why-code-exists/` — Track 02, CLI-only.  
**Intended users:** on-call / eng leads at AI-coding startups.  
**Lalith’s question:** “we don’t have any ui or ux right? … But we don’t meet the criteria right?”

Labels: **tested** = commands run this pass; **read-only** = docs/artifacts only.

---

## Evidence skimmed

| Artifact | Label |
|----------|--------|
| `README.md` Quick start + 4 npm scripts | **read-only** |
| `package.json` scripts: `demo:invite`, `demo:compare`, `demo:prevent`, `zetaris:ping`, `start` | **read-only** |
| `src/cli.ts` `--help` + `--error` / `--evidence` flags | **tested** (`npm start -- --help`) |
| `npm run demo:compare` structured JOIN ONLY vs OURS + SSRF beat | **tested** |
| `artifacts/LIVE-DEMO.md` + `live-demo-run-2026-10-22.txt` | **read-only** |
| `/workspace/open-agent/docs/demo-script.md` | **read-only** |
| Prior judge v5 UX line **8.5/10** | **read-only** (not re-binding this note) |

No web/GUI, no dashboard, no interactive TUI picker on disk.

---

## Answers

### 1. Does CLI-only FAIL Product & UX (0 / disqualify)?

**No.** Official §7 does not require a GUI. “Product & UX” scores **how usable the product is for intended users**, not whether it has pixels. A CLI **is** a product surface. Zero / disqualify would require an unusable or missing interaction path — not “terminal instead of browser.”

Hard gates that *can* fail the submission are §5–6 (Zetaris + Meterless, video, GitHub, write-ups) — **not** “must have a web UI.”

### 2. Product & UX score for THIS product (0–10)

**8 / 10.**

| What works for on-call/eng leads | What hurts |
|----------------------------------|------------|
| Four memorable commands; README copy-paste path | Demo-shaped, not a daily incident inbox |
| Terminal report is scannable (sections, prove, lesson, fidelity) | No GUI for leads who won’t open a terminal |
| `demo:compare` makes the value gap obvious without a designer | `npm start` bare path is thinner than the named demos (defaults/fixtures) |
| Honesty labels reduce confusion | Accessibility = terminal literacy only |

Not a 9–10: no progressive UI, no incident picker, install still “cd + npm + env.” Not below ~7: an eng lead can run it in under a minute from README and understand the output.

### 3. Thin UI required to be competitive on this 10?

**Not required for a mid / mid-high score.** Clear CLI + a watchable 1–4 min video is enough to land roughly **7–8.5**. A thin on-call UI would help **top** of the 10 (and Demo/Impact spillover), but is optional polish — not a meet/fail switch.

### 4. One sentence for Lalith

**You meet the Product & UX criterion with a CLI — it earns points, not a zero — but “no GUI” is not “no UX,” and you are not maxing that 10.**

---

## Verdict line

CLI-only ≠ criterion fail. Score this build **8/10** on Product & UX. Spend remaining time on the **required video**, not a panic UI rewrite, unless you specifically want to chase 9+ on this bucket.
