# Design: belief-evidence proof (replaces sandbox repro as the gate)

Status: design only, no code. Written Sun Oct 25 2026 against `generalize` @ 4bd1add.

## 1. Why change
The current gate has an LLM write a repro test + patch and requires repro passes on original / fails on patched.
Last 87 dev attempts: 9 proved (33 patch_ineffective, 16 not_reproduced, 10 harness_error, 19 gate rejects); held-out 2/15; unstable run to run.
It re-derives a failure production already demonstrated, and a pass only proves "this patch removes the harm", not "the agent believed X".

## 2. The method in one paragraph
From the edit (already found deterministically) and the transcript around it, extract the agent's **belief** as a quoted, grounded statement.
An LLM translates that belief into a **predicate**: a small, typed, falsifiable statement ("for all rows / inputs / events in scope S, P holds").
The predicate is **frozen (hashed) before any evidence is read**. A deterministic evaluator (SQL via Postgres or Zetaris, or a pure Python/TS check over recorded values) runs it against evidence that already exists and that the claim writer did not produce. Verdict = refuted / supported / no_evidence. The sandbox repro is demoted to optional corroboration.

## 3. Belief extraction format
```json
{
  "belief_id": "sha256(...)",
  "edit": {"session": "...", "turn": 41, "file": "lib/actions/invites.ts", "lines": [120,131], "commit": "abc123"},
  "statement": "An accepted invite is only ever used by the user it was addressed to.",
  "kind": "data_invariant | input_domain | ordering_concurrency | external_response",
  "grounding": [
    {"source": "transcript", "turn": 40, "quote": "<verbatim agent text>"},
    {"source": "code", "file": "...", "line": 124, "quote": "<verbatim code line>"}
  ],
  "grounding_type": "stated | enacted"
}
```
Rules (schema-validated, deterministic):
- every `quote` must be an exact substring of the transcript turn or the file at the edit commit (string match, no LLM);
- `stated` = agent said it in prose; `enacted` = only implied by code (weaker, reported as such);
- exactly one belief per claim (keeps the existing single-cause rule).

## 4. Predicate kinds
| kind | shape | evaluator | example |
|---|---|---|---|
| data_invariant | `SELECT count(*) FROM <rel> WHERE NOT (<cond>)` must be 0 | SQL (Postgres / Zetaris) | invites accepted by a user whose email != invite.email |
| input_domain | "every value of field F reaching function G satisfies P" | pure function over recorded inputs (logs, error payload args, DB column values) | `end.replace(year=y-5)` valid for every `end` |
| ordering_concurrency | "no two events E with same key K overlap / occur twice" | SQL over event log with timestamps | two `vote.create` for same (user, feedback) within window |
| external_response | "dependency D answers within T / returns shape S" | SQL/scan over request logs or recorded responses | webhook latency < N ms |

Predicate JSON:
```json
{"kind":"data_invariant","source":"zetaris:pulseboard.invite JOIN pulseboard.user",
 "scope":"accepted_at IS NOT NULL",
 "violation_query":"SELECT ... WHERE i.email <> u.email",
 "expected_if_belief_true": 0,
 "belief_id":"...", "hash":"..."}
```
Validation (no LLM): parses as read-only SELECT (single statement, no DDL/DML, allowlisted relations from the evidence catalog); referenced columns exist in the catalog; for code predicates, a pure expression in a restricted DSL (no I/O, no imports) evaluated over recorded values.

## 5. Verdicts
- **refuted** (belief shown false): violation set non-empty in an evidence source independent of the claim writer. Report the counter-example rows. Strength: `stated` + refuted by >=1 non-error source = strong; refuted only by the production error itself = "error-only".
- **supported**: violation set empty AND the scope is non-empty (the query actually covered rows). Empty scope = no_evidence, never supported.
- **no_evidence**: no catalog source covers the predicate's relations/fields, or scope empty. Reported honestly; the stack trace is still shown as the observed failure.
- **invalid**: predicate fails schema / validation / grounding. Counted as failure, not retried with result knowledge.
A belief "proven wrong" requires refuted. "supported" means the belief survived and the claim is probably wrong (useful: it rejects wrong-cause claims).

## 6. Circularity guards (what is legitimate)
1. **Freeze first:** belief + predicate hashed and written before the evaluator opens any evidence. The LLM never sees query results; one shot, no result-conditioned retries.
2. **Independent sources:** evidence = prod DB rows, request/event logs, git history, transcript. Never the LLM's own output, never a test it wrote.
3. **Error string:** the LLM MAY read the error (it is the input that pointed us at the line; hiding it is pointless). It MAY NOT use literal values from the error inside the predicate (no `WHERE email='bob@example.com'`, no `date='2024-02-29'`). Lint: reject predicates containing any literal (string/number/date) that appears in error.json unless it also appears in the code at the edit. Predicates must be universally quantified over a scope, so the error event is just one candidate row.
4. **Error-only refutation is labeled:** if the only counter-example is the error event itself, verdict is `refuted (error-only)`; it is nearly tautological and must not be sold as independent proof. It still adds value: it ties the observed failure to the *stated* belief in a checkable form.
5. **Discrimination check (replaces patch gate):** predicate must also be non-trivial: run it on a control scope (rows before the edit's commit date, or a different code path) — if it is violated everywhere, including where the edit's code never ran, it is not about this belief -> invalid.
6. **No per-case rules:** evaluator, lint, catalog are generic; the catalog is built from schema introspection, not hand-written per case.

## 7. Sandbox repro becomes corroboration
Kept as optional `corroboration.sandbox` with today's gates. Verdict ladder: refuted(independent) > refuted(error-only)+sandbox reproduced > refuted(error-only) > no_evidence. A sandbox failure never downgrades a refuted belief.

## 8. Zetaris becomes load-bearing
Zetaris is the evidence catalog + evaluator for data_invariant / ordering / external_response: it federates the app DB (Postgres), the error/request log, and the agent-edit table in one SQL query (e.g. join invite rows to the session/edit that wrote the accept code via commit time). Today it only "confirms" after the fact; here, without it there is no verdict for those kinds.

## 9. Feasibility on paper (honest)
**Key finding (read):** every `cases/*/error.json` was produced by `src/bin/capture-error.ts` running the case's own scenario ("values recorded from a real run"). There is no separate production database, request log, or event log per case; local Postgres is not running on the box. So today's real evidence = (a) the error payload, (b) git + transcript, (c) whatever the scenario setup wrote (a seeded DB, which is synthetic). Most cases can therefore only reach `refuted (error-only)` until we build evidence fixtures — and building per-case fixtures by hand is exactly the hard-coding risk Lalith forbids.

| case | belief (likely) | kind | predicate | evidence that exists today | expected | hard-coding risk |
|---|---|---|---|---|---|---|
| pulseboard-invite | invite acceptor = invitee | data_invariant | accepted invites where acceptor email <> invite email | seeded Prisma DB in scenario; error names bob/carol | refuted (error-only) now; independent only if a real pulseboard DB snapshot exists | low if DB is genuine |
| pulseboard-ssrf | user URLs are public hosts | input_domain | every fetched preview URL resolves to non-private IP | error payload URL only; no egress log | refuted (error-only) | low |
| pulseboard-slack-retry | each Slack event delivered once | ordering | >1 delivery per event_id | error mentions request log; no log file in repo | error-only; independent if log captured | medium (log must be generic) |
| heldout-slack-multiline | command text is single-line | input_domain | all inbound texts contain no `\n` | error payload | error-only | low |
| heldout-vote-race | check-then-create is atomic | ordering | concurrent creates for same (user,feedback) | Prisma P2002 in error; Zetaris previously found 1 row orig / 0 patched (row came from sandbox) | error-only (P2002 is itself the counter-example) | low |
| heldout-xirr-short | solver converges for any flows | input_domain | solver returns non-None for valid flow sets | recorded flows in error | error-only; claim-cause ambiguity remains (step cap vs convergence) | low, but predicate can't separate causes |
| heldout2-drawdown-penny | penny names already filtered upstream | input_domain | buys with price<5 pass guard | error payload | error-only | low |
| heldout2-webhook-block | webhook is fast / fire-and-forget irrelevant | external_response | p99 webhook latency < X | latency not recorded anywhere (judge M7) | **no_evidence** | high if we invent a latency table |
| heldout2-webhook-case | URL case-insensitive | input_domain | stored URL == submitted URL | error shows both | error-only | low |
| heldout3-plan-injection | table names never contain quotes | input_domain | identifiers match `^[A-Za-z_]\w*$` | error payload | error-only | low |
| heldout3-retype-unique | SQLite ALTER preserves indexes | external_response (lib behavior) | indexes before == after | error payload | error-only | low |
| heldout3-schema-target | targets are unqualified | input_domain | no `.` in table refs | error payload; could scan action log if existed | error-only | low |
| heldout4-caps-unknown | every ticker has a securities row | data_invariant | tickers in requests NOT IN securities | trading-agent DB? (not checked: Postgres down) | refuted-independent IF securities table + request log exist; else error-only | low |
| heldout4-stop-minhold | min-hold never blocks stops | input_domain | sells with reason=stop blocked | error payload | error-only | low |
| heldout4-swing-batch | at most one exit per session | ordering | count swing exits per session >1 | error payload; ledger? | error-only | low |
| heldout5-citation-leaf | cited path exists if substring matches | input_domain | cited paths resolvable | error payload | error-only | low |
| heldout5-macro-leapday | year shift always valid date | input_domain | for all end dates d: date(d.year-5,d.month,d.day) valid | pure: domain enumeration (any Feb 29) — deterministic without data | refuted (by domain enumeration, not error-only) | low; best case |
| heldout6-outcome-keys | headings unique | data_invariant | duplicate keys in content source | content files in repo | refuted-independent (repo content) | low |

All rows above are **read** (on paper from case files), none **tested**: no predicate was run; local Postgres is down and I did not call Zetaris or any LLM.

## 10. Risks
- **Biggest:** with synthetic-capture cases, ~15/18 land at "refuted (error-only)", which a judge can fairly call circular: the error already says the belief failed. The method's real value needs genuine evidence stores (DB snapshot, request log). Building those per case = hard-coding.
- Belief extraction quality is still LLM-dependent (mid-tier); the grounding check stops fabrication but not a wrong-but-quoted belief.
- Predicates can't separate rival causes that share an observable (xirr).
- "supported" verdicts need non-empty scope; most cases have one data point, so supported will be rare and weak.
- Dropping the repro gate changes the headline metric; 2/15 history must stay disclosed, not be replaced.

## 11. Estimate
- Belief schema + grounding checker: 2h
- Predicate schema, SQL/DSL validator, literal-lint, freeze/hash: 3h
- Evaluators: Postgres + Zetaris SQL, pure-DSL over recorded values, domain enumeration for input_domain: 4h
- Evidence catalog from schema introspection (generic): 2h
- Report/README wiring, sandbox as corroboration: 2h
- Dev run + held-out run: 2h
**Total ~15h** for a working version, before video/repo/declaration. Deadline Mon Oct 27 4:45 PM PT leaves ~26h; this consumes most of it.

## 12. Held-out plan
Freeze evaluator + prompts at a commit; pre-register success = `refuted (independent)` with grounded `stated` belief matching the ground-truth cause (checked against the existing frozen success-criteria docs). Report error-only refutations separately. Run once on held-out 1-6 (not seen by the new method's design beyond this paper table — note: this doc already reasoned about them, so they are **contaminated** for tuning claims; a clean test needs held-out 7, which is blocked on fresh transcripts).
