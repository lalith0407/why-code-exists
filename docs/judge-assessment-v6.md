# Judge assessment v6 — Why-Code-Exists (Track 02)

Independent, skeptical pass. Labels: **[tested]** = I ran it on the box on Oct 23 2026, ~8:39 PM PT; **[read]** = I only read code/docs.

## What I ran
- `npm run demo:invite`: passed **[tested]**. Step 5 used `openai (gpt-4.1-mini)`, cited L209, Zetaris ui-proxy oracle returned 1 row (alice invite accepted by bob, who became ADMIN), and the Meterless lesson was written (mem-28).
- `npm run demo:prevent`: passed **[tested]**. WITHOUT accepts, WITH rejects (recall mem-14).
- `npm run demo:compare`: passed **[tested]**. Join-only vs ours plus the SSRF ablation; mem-29.
- `npm test`: **29/29** passed **[tested]** (tests force `WCE_REASONER=heuristic`, so none of them hit OpenAI).
- Report HTML: 12 KB, inline CSS, light document layout with the sections Summary / Timeline / Prevention WITHOUT-WITH / Fidelity **[tested: generated + inspected markup]**.

## Scores
| Criterion | v5 | v6 | Δ | Why |
|---|---|---|---|---|
| Impact 30 | 27.0 | 27.0 | 0 | Still two fixture incidents, with no eval across unseen bugs. |
| Technical 20 | 16.8 | 17.3 | +0.5 | Real LLM call with a strict json_schema, line-citation validation, a timeout and a fallback **[tested+read]**. Deductions: invalid quotes are silently replaced (hole 3), and no test covers the live path. |
| Innovation 15 | 12 | 12.3 | +0.3 | "LLM claim → SQL falsifies it" is now real rather than a keyword stub. The category itself is unchanged. |
| Demo 15 | 14.7 | 14.7 | 0 | **Still no recorded video** (no mp4 on the box) **[tested: ls]**. This is a hard gate. |
| Product/UX 10 | 8.5 | 8.9 | +0.4 | The report now reads like an incident doc instead of a dashboard. It is still a static file, not wired to any real alert source. |
| Sponsor 10 | 9.4 | 9.4 | 0 | Zetaris is still a TEMP VIEW over app-injected rows. Meterless recall still carries real weight. |
| **Total** | **88.4** | **89.6 → 89** | **+1** | |

## Top 5 holes (ranked)
1. **The LLM never chooses where to look, and its answer is graded by keywords. [read]** The transcript window is picked by keyword scoring plus a hard-coded `msg.line === 209 && "binding the token"` (+10) boost, and the same for L98 (`session/transcript.ts:176-183`). The prover then picks a check by `falsifies_keywords` substring match on the assumption text (`prove/check.ts:69`). So the LLM only rephrases a pre-selected line, and any phrasing that contains "email"/"invite" gets "proven". A judge will ask: "Delete the L209 boost — does it still find it?"
2. **The proof doesn't depend on the claim. [tested]** In the run output, the OpenAI assumption and the heuristic assumption were both `proven_false` by the identical Zetaris row. The oracle proves a *fact about the bug*, not the *specific belief* the model stated. A wrong but on-topic LLM claim would also come back "proven false".
3. **Citation fallback can mislabel a quote. [read]** `openai.ts`: if the model's quote isn't verbatim, the code swaps in `content.slice(0,200)` and still presents it as the citation. That violates the "citations validated" claim. The fix is to drop the item or mark it `quote_unverified`.
4. **No generalization evidence. [read/tested]** There are 2 incidents, both with hand-tagged labels (`invite-takeover`, `ssrf`) that steer extraction and checks, and there's no held-out bug. The Impact score is capped here.
5. **The required demo video is still missing, and Zetaris data is app-injected. [tested ls / read]** These carry over from v5. A Hay-type judge will call the SQL "querying your own fixture".

## Is the LLM step real? Does it generalize?
- **Real: yes [tested].** A live HTTPS call to OpenAI, strict schema, a cited line that exists in the window, and a fallback reason recorded. The model's wording ("valid invite token is enough…; email need not be checked") is better than the heuristic's.
- **Generalizes: not shown.** Retrieval (hero-line boosts plus keywords), the label-driven heuristics in `extract.ts:140-160`, and keyword check selection are all still fitted to these 2 bugs. The LLM sits inside a fitted funnel. The honest pitch is "LLM extraction, demonstrated on 2 seeded agent-written bugs".

## 3 highest-value fixes before Oct 27
1. **Record the 1–4 min video** (hard gate; Demo +0.3).
2. **Remove the hero-line boosts behind a flag and show the run still lands on L209/L98.** Let the LLM pick from the top-N keyword candidates, or from the edit-proximity window. Put that ablation in `demo:compare`. This is the single best answer to hole 1 (Tech/Innov +0.5–1).
3. **Make the proof claim-specific.** Have the LLM also output the `falsifies` predicate/check id (from an enum of available checks), and pick the check from that instead of by substring. Also drop unverified quotes instead of substituting them, and add one adversarial test where an on-topic but wrong claim must *not* be proven (Tech +0.5).

## Likely judge Q&A
- *"Would it work on a bug you haven't seen?"* Answer honestly: retrieval is still tuned. Then show fix #2.
- *"What if the LLM hallucinates?"* Citations are line-validated. Mention that unverified quotes are now dropped, once fix #3 is in.
- *"Is Zetaris doing anything a JSON filter couldn't?"* Today, no; it's a TEMP VIEW over injected rows. The pitch is federated SQL over real prod event stores.
- *"Why gpt-4.1-mini?"* It's cheap and supports strict JSON. Only a small, scrubbed window is sent, never the full transcript.
- *"Does the lesson actually prevent anything?"* `demo:prevent` WITHOUT/WITH is the evidence. It is a local checker, not a real agent run.
