# eval:lines — transcript line selection without hero boosts

Each section is one config, appended in the order tried. Similarity = word-level Jaccard (stopwords removed) between the model's claim and the closest check description (never shown to call A); >= 0.6 flagged COPY.

## Config v1: snippet in call A + 'directly precedes defining edit' fact

Run: 10/23/2026, 8:53:09 PM PT · model gpt-4.1-mini · temperature 0, seed 7 · WCE_HERO_BOOST off · 5 runs per bug · OpenAI call A only (no check mapping)

- invite: 0/5 hit L209; picked [L127, L127, L127, L127, L127]
- ssrf: 1/5 hit L98; picked [fallback(all_citations_invalid), L98, fallback(all_citations_invalid), fallback(all_citations_invalid), fallback(all_citations_invalid)]

| bug | run | picked | result | reasoner | max sim to check desc | claim |
|---|---|---|---|---|---|---|
| invite | 1 | L127 | MISS | openai | 0.19 | The agent believed that verifying the invite status as 'PENDING' and checking the invite expiration date was sufficient to accept an invite, so it skipped verifying that the logged-in user's email matches the invite email. |
| invite | 2 | L127 | MISS | openai | 0.15 | The agent believed that checking only the invite token validity and status was sufficient and skipped verifying that the logged-in user's email matches the invite email before creating the membership. |
| invite | 3 | L127 | MISS | openai | 0.11 | The agent believed that verifying the invite status and expiration was sufficient and therefore skipped checking if the logged-in user's email matches the invite email before creating the membership. |
| invite | 4 | L127 | MISS | openai | 0.11 | The agent believed that verifying the invite status and expiration was sufficient and therefore skipped checking if the logged-in user's email matches the invite email before creating the membership. |
| invite | 5 | L127 | MISS | openai | 0.11 | The agent believed that verifying the invite status and expiration was sufficient and therefore skipped checking if the logged-in user's email matches the invite email before creating the membership. |
| ssrf | 1 | — | MISS | heuristic (all_citations_invalid) | — | A URL pasted by a workspace member is safe for the server to fetch (availability is the only risk). |
| ssrf | 2 | L98 | HIT | openai | 0.08 | The agent believed that checking the response's content-type header for 'text/html' was sufficient to ensure the fetched URL is safe to parse, so it skipped any host or IP address validation before fetching. |
| ssrf | 3 | — | MISS | heuristic (all_citations_invalid) | — | A URL pasted by a workspace member is safe for the server to fetch (availability is the only risk). |
| ssrf | 4 | — | MISS | heuristic (all_citations_invalid) | — | A URL pasted by a workspace member is safe for the server to fetch (availability is the only risk). |
| ssrf | 5 | — | MISS | heuristic (all_citations_invalid) | — | A URL pasted by a workspace member is safe for the server to fetch (availability is the only risk). |

## Config: v2: no snippet in call A + 'last substantive (>=15 words) reasoning before defining/editing edit' fact

Run: 10/23/2026, 8:55:28 PM PT · model gpt-4.1-mini · temperature 0, seed 7 · WCE_HERO_BOOST off · 5 runs per bug · OpenAI call A only (no check mapping)

- invite: 0/5 hit L209; picked [L168, L168, L168, L168, L168]
- ssrf: 0/5 hit L98; picked [L121, L121, L121, L121, L121]

| bug | run | picked | result | reasoner | max sim to check desc | claim |
|---|---|---|---|---|---|---|
| invite | 1 | L168 | MISS | openai | 0.20 | The agent believed that if the user is already logged in, it is sufficient to accept the invite without verifying that the logged-in user's email matches the invite email, thus skipping the email match check. |
| invite | 2 | L168 | MISS | openai | 0.20 | The agent believed that if the user is already logged in, it is sufficient to accept the invite without verifying that the logged-in user's email matches the invite email, thus skipping the email match check. |
| invite | 3 | L168 | MISS | openai | 0.20 | The agent believed that if the user is already logged in, it is sufficient to accept the invite without verifying that the logged-in user's email matches the invite email, thus skipping the email match check. |
| invite | 4 | L168 | MISS | openai | 0.20 | The agent believed that if the user is already logged in, it is sufficient to accept the invite without verifying that the logged-in user's email matches the invite email, thus skipping the email match check. |
| invite | 5 | L168 | MISS | openai | 0.20 | The agent believed that if the user is already logged in, it is sufficient to accept the invite without verifying that the logged-in user's email matches the invite email, thus skipping the email match check. |
| ssrf | 1 | L121 | MISS | openai | 0.14 | The agent believed that fetching a URL preview with a timeout was sufficient to prevent SSRF, so it skipped thorough host validation checks in fetchLinkPreview. |
| ssrf | 2 | L121 | MISS | openai | 0.09 | The agent believed that fetching a URL preview with a timeout was sufficient to prevent issues, so it skipped thorough validation of the fetched host's IP address or network location. |
| ssrf | 3 | L121 | MISS | openai | 0.09 | The agent believed that fetching a URL preview with a timeout was sufficient to prevent unsafe or slow operations, so it skipped thorough validation of the fetched host's IP address or network location. |
| ssrf | 4 | L121 | MISS | openai | 0.09 | The agent believed that fetching a URL preview with a timeout was sufficient to ensure safety, so it skipped thorough validation of the fetched host's IP address or network location. |
| ssrf | 5 | L121 | MISS | openai | 0.09 | The agent believed that fetching a URL preview with a timeout was sufficient to prevent issues, so it skipped thorough validation of the fetched host's IP address or network location. |

## Config: v1 rerun (reverted as best measured; default)

Run: 10/23/2026, 8:56:18 PM PT · model gpt-4.1-mini · temperature 0, seed 7 · WCE_HERO_BOOST off · 5 runs per bug · OpenAI call A only (no check mapping)

- invite: 0/5 hit L209; picked [L127, L127, L127, L127, L127]
- ssrf: 0/5 hit L98; picked [fallback(all_citations_invalid), fallback(all_citations_invalid), fallback(all_citations_invalid), L121, fallback(all_citations_invalid)]

| bug | run | picked | result | reasoner | max sim to check desc | claim |
|---|---|---|---|---|---|---|
| invite | 1 | L127 | MISS | openai | 0.11 | The agent believed that verifying the invite status and expiration was sufficient and therefore skipped checking if the logged-in user's email matches the invite email before creating the membership. |
| invite | 2 | L127 | MISS | openai | 0.14 | The agent believed that checking the invite's status and expiration date was sufficient to accept an invite without verifying that the logged-in user's email matches the invite's email, so it skipped the email match check. |
| invite | 3 | L127 | MISS | openai | 0.11 | The agent believed that verifying the invite status and expiration was sufficient and therefore skipped checking if the logged-in user's email matches the invite email before creating the membership. |
| invite | 4 | L127 | MISS | openai | 0.10 | The agent believed that checking the invite's status and expiration date was sufficient and therefore skipped verifying that the logged-in user's email matches the invite email before creating the membership. |
| invite | 5 | L127 | MISS | openai | 0.11 | The agent believed that verifying the invite status and expiration was sufficient and therefore skipped checking that the logged-in user's email matches the invite email before creating the membership. |
| ssrf | 1 | — | MISS | heuristic (all_citations_invalid) | — | A URL pasted by a workspace member is safe for the server to fetch (availability is the only risk). |
| ssrf | 2 | — | MISS | heuristic (all_citations_invalid) | — | A URL pasted by a workspace member is safe for the server to fetch (availability is the only risk). |
| ssrf | 3 | — | MISS | heuristic (all_citations_invalid) | — | A URL pasted by a workspace member is safe for the server to fetch (availability is the only risk). |
| ssrf | 4 | L121 | MISS | openai | 0.00 | The agent assumed that a fetch timeout and abort controller would be sufficient to prevent long or malicious fetches, so it skipped more thorough validation or sandboxing of the fetched URL. |
| ssrf | 5 | — | MISS | heuristic (all_citations_invalid) | — | A URL pasted by a workspace member is safe for the server to fetch (availability is the only risk). |

## Session summary (Oct 23 2026, ~8:56–9:02 PM PT)

| config | invite (L209) | ssrf (L98) | total | notes |
|---|---|---|---|---|
| v1: snippet + "directly precedes defining edit" fact (1st run) | 0/5 (L127 ×5) | 1/5 (4 fallbacks: model quoted the code snippet) | 1/10 | |
| v2: no snippet + "last substantive (>=15 words) reasoning before defining/editing edit" fact | 0/5 (L168 ×5) | 0/5 (L121 ×5) | 0/10 | fact pointed to L124 / L98; model ignored it |
| v1 rerun (kept as default, `WCE_CALLA_CONFIG=v1`) | 0/5 (L127 ×5) | 0/5 (4 fallbacks, 1× L121) | 0/10 | 1/10 above was noise |

Earlier single-call configs (before the two-step flow) were measured once per bug only: frame-grounded single call gave invite L209 hit, ssrf L121 miss; ungrounded single call gave invite L168 miss, ssrf L98 hit. n=1 each, so not comparable.

Honest conclusion: without hero boosts, the LLM does not reliably pick the documented hero line on either bug. Keyword ranking alone (no LLM) puts L209 and L98 first. The model's claims are in its own words (max Jaccard to check descriptions 0.00–0.20; none copied).

## Config: v3: provenance (deterministic written_at) + why-mode belief pick (no snippet/facts, generic candidates)

Run: 10/23/2026, 9:13:33 PM PT · model gpt-4.1-mini · temperature 0, seed 7 · WCE_HERO_BOOST off · 5 runs per bug · OpenAI call A only (no check mapping)

- invite: written_at 5/5 = L129 (deterministic); belief 2/5 hit L209; picked [L168, L168, L209, fallback(all_citations_invalid), L209]
- ssrf: written_at 5/5 = L100 (deterministic); belief 0/5 hit L98; picked [L2, L2, L2, L2, L2]

Note: the 'belief' target (L209 / L98) is debatable — it is our reading of where the belief is most clearly stated; other cited messages may also be defensible. written_at is the hard, deterministic answer.

| bug | run | written_at | belief pick | vs target | reasoner | max sim to check desc | claim |
|---|---|---|---|---|---|---|---|
| invite | 1 | L129 (silent) | L168 | MISS | openai | 0.12 | The AI believed that the invite acceptance code could safely skip verifying that the actor's email matches the invite email because it assumed the invite token alone was sufficient to authorize membership creation without risk of workspace takeover. |
| invite | 2 | L129 (silent) | L168 | MISS | openai | 0.16 | The AI believed that the invite acceptance code could safely skip verifying that the actor's email matches the invite email because it assumed the invite acceptance page already checks the logged-in user's email against the invited email before showing the join button. |
| invite | 3 | L129 (silent) | L209 | HIT | openai | 0.09 | The AI believed that the invite acceptance action for existing logged-in users could safely proceed without additional formData validation because the token is bound as an argument directly in the form, so it skipped explicit formData checks in the action. |
| invite | 4 | L129 (silent) | — | MISS | heuristic (all_citations_invalid) | — | Holding a valid invite token and being logged in is sufficient to accept the invite; the current user's email need not match invite.email. |
| invite | 5 | L129 (silent) | L209 | HIT | openai | 0.09 | The AI believed that the server action for accepting an invite could rely on the client-side form binding the token as an argument, so explicit formData parsing or additional email verification was unnecessary. |
| ssrf | 1 | L100 | L2 | MISS | openai | 0.23 | The AI believed that the URL fetched for the link preview would always be safe and publicly accessible, so it skipped checking whether the host was private or internal before fetching. |
| ssrf | 2 | L100 | L2 | MISS | openai | 0.19 | The AI believed that the URL fetched for the link preview would always be safe and publicly accessible, so it skipped checking whether the host was private or local before fetching. |
| ssrf | 3 | L100 | L2 | MISS | openai | 0.19 | The AI believed that the URL fetched for the link preview would always be safe and publicly accessible, so it skipped checking whether the host was private or local before fetching. |
| ssrf | 4 | L100 | L2 | MISS | openai | 0.19 | The AI believed that the URL fetched for the link preview would always be safe and publicly accessible, so it skipped checking whether the host was private or local before fetching. |
| ssrf | 5 | L100 | L2 | MISS | openai | 0.19 | The AI believed that the URL fetched for the link preview would always be safe and publicly accessible, so it skipped checking whether the host was private or local before fetching. |

## Session summary (updated, v3 provenance architecture)

| Config | written_at (deterministic) | belief / line hit vs L209+L98 |
|---|---|---|
| v1 | — | 1/10 |
| v2 | — | 0/10 |
| v1 rerun | — | 0/10 |
| v3 provenance + why-mode | **10/10** (invite L129 silent, SSRF L100) | 2/10 (invite 2/5, SSRF 0/5) |

The belief target is debatable: v3 picks L168 for invite (the page-level email check plan) and L2 for SSRF (the link-preview plan), and both can be defended. Live demos after the eval: demo:invite picked L209, but the claim ("skip explicit formData validation") was mapped by call B to `none`, so nothing was proven. demo:compare (run twice, the second time by accident) picked L168 for invite and L2 for SSRF.

## Config v4: claim grounded in written-at edit (call A = error + frame + written-at code + reasoning-before/'silent'), call B unchanged

Run: 10/23/2026, 9:18:20 PM PT · gpt-4.1-mini · temp 0, seed 7 · 3 runs per bug · calls A+B per run · supporting-quote pick off · no lessons persisted · invite proven via Zetaris SQL oracle, SSRF via local predicate

- invite: claim cites written-at 3/3; right check chosen 3/3; proven 3/3
- ssrf: claim cites written-at 3/3; right check chosen 3/3; proven 3/3

| bug | run | written_at | claim cites | reasoner | check chosen (✓ = expected) | proof | claim |
|---|---|---|---|---|---|---|---|
| invite | 1 | L129 | L129 | openai | membership_row_wrong_user ✓ | PROVEN | The agent believed that verifying the invite token's existence, status, and expiration was sufficient and did not need to check that the accepting user's email matches the invite's email. |
| invite | 2 | L129 | L129 | openai | membership_row_wrong_user ✓ | PROVEN | The agent believed that verifying the invite token's existence, status, and expiration was sufficient and did not need to check that the accepting user's email matches the invite's email. |
| invite | 3 | L129 | L129 | openai | membership_row_wrong_user ✓ | PROVEN | The agent believed that verifying the invite token's existence, status, and expiration was sufficient and did not need to check that the accepting user's email matches the invite's email. |
| ssrf | 1 | L100 | L100 | openai | ssrf_preview_internal ✓ | PROVEN | The agent believed that checking the content type and HTTP response status was sufficient to ensure the URL was safe to fetch, so it omitted any validation to block or restrict fetching private or localhost IP addresses. |
| ssrf | 2 | L100 | L100 | openai | ssrf_preview_internal ✓ | PROVEN | The agent believed that checking the content type and HTTP response status was sufficient to ensure the URL was safe to fetch, so it omitted any validation to block or restrict fetching private or localhost IP addresses. |
| ssrf | 3 | L100 | L100 | openai | ssrf_preview_internal ✓ | PROVEN | The agent believed that simply fetching the URL and checking the content type for 'text/html' was sufficient to prevent SSRF, so it omitted any validation to block or restrict requests to private or localhost IP addresses. |

### v4 notes

- I asked for 5 runs per bug but ran 3. The 20-call cap was the limit: demo:invite used 3 calls (A + B + the supporting-quote pick) and demo:compare used 4. Both demos used the same A+B config, so counting them gives **invite 5/5** (eval 3 + demo:invite + compare) and **SSRF 4/4** (eval 3 + compare) for right check chosen and proven.
- demo:invite passed on its first try. The supporting "Agent later said" pick produced no verbatim quote (`all_citations_invalid`), so it was omitted, as designed. It never gates the proof.
- Changes from v3: the claim is grounded in the written-at edit (L129 / L100), not in a belief message. The v3 belief-message hit rate (2/10 vs L209/L98) is now informational only.

## eval:wrong-claims — on-topic wrong claims through live call B + proof (decoys present)

Run: 10/23/2026, 9:29:19 PM PT · gpt-4.1-mini · temp 0, seed 7 · 1 call B per bug · invite proof via Zetaris SQL oracle, SSRF via local predicate

- invite: wrong claims proven 1/2 (pass bar 0/2) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0)
- ssrf: wrong claims proven 0/2 (pass bar 0/2) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0)

| bug | claim | check chosen | oracle | result | wrong claim |
|---|---|---|---|---|---|
| invite | 1 | membership_row_wrong_user (real check) | zetaris_sql_temp_view | PROVEN ✗ | The agent believed that workspace admins can accept any invite, so the accept action never needed to check the actor's role in the target workspace. |
| invite | 2 | membership_role_escalated (decoy) | zetaris_sql_temp_view | not proven ✓ | The agent believed accepting an invite can only ever grant the role written on the invite, so it never re-checked the membership role against invite.role. |
| ssrf | 1 | ssrf_non_http_scheme (decoy) | local predicate | not proven ✓ | The agent believed only http(s) links would ever reach the preview fetcher, so it never validated the URL scheme (file://, gopher://) before fetching. |
| ssrf | 2 | preview_markup_injection (decoy) | local predicate | not proven ✓ | The agent believed Open Graph titles from fetched pages are plain text, so it stored and rendered them without escaping. |

## Config v5 (6 options + none: 2 right + 4 decoys): claim grounded in written-at edit, call B unchanged

Run: 10/23/2026, 9:29:57 PM PT · gpt-4.1-mini · temp 0, seed 7 · 3 runs per bug · calls A+B per run · supporting-quote pick off · no lessons persisted · invite proven via Zetaris SQL oracle, SSRF via local predicate

- invite: claim cites written-at 3/3; right check chosen 3/3; proven 3/3
- ssrf: claim cites written-at 3/3; right check chosen 3/3; proven 3/3

| bug | run | written_at | claim cites | reasoner | check chosen (✓ = expected) | proof | claim |
|---|---|---|---|---|---|---|---|
| invite | 1 | L129 | L129 | openai | membership_row_wrong_user ✓ | PROVEN | The agent believed that verifying the invite token's existence, status, and expiration was sufficient and did not need to check that the accepting user's email matches the invite's email. |
| invite | 2 | L129 | L129 | openai | membership_row_wrong_user ✓ | PROVEN | The agent believed that verifying the invite token's existence, status, and expiration was sufficient and did not need to check that the accepting user's email matches the invite's email. |
| invite | 3 | L129 | L129 | openai | membership_row_wrong_user ✓ | PROVEN | The agent believed that verifying the invite token's existence, status, and expiration was sufficient and did not need to check that the accepting user's email matches the invite's email. |
| ssrf | 1 | L100 | L100 | openai | ssrf_preview_internal ✓ | PROVEN | The agent believed that checking the content type and HTTP response status was sufficient to ensure the URL was safe to fetch, so it omitted any validation to block or restrict fetching private or localhost IP addresses. |
| ssrf | 2 | L100 | L100 | openai | ssrf_preview_internal ✓ | PROVEN | The agent believed that checking the content type and HTTP response status was sufficient to ensure the URL was safe to fetch, so it omitted any validation to block or restrict fetching private or localhost IP addresses. |
| ssrf | 3 | L100 | L100 | openai | ssrf_preview_internal ✓ | PROVEN | The agent believed that checking the content type and HTTP response status was sufficient to ensure the URL was safe to fetch, so it omitted any validation to block or restrict fetching private or localhost IP addresses. |

### v5 summary (decoys, Plan 2)

| eval | invite | SSRF | pass bar | result |
|---|---|---|---|---|
| eval:claims (right claims, 3 runs each) | right check 3/3, proven 3/3 | right check 3/3, proven 3/3 | 3/3 each | **pass**; no decoy picked for a correct claim |
| eval:wrong-claims (2 wrong claims each) | proven **1/2** | proven 0/2 | 0/2 each | **invite fails**, SSRF passes |

- **Options:** every bug's check list has 6 options plus `none`: the 2 real checks (invite email mismatch, SSRF private host) and 4 decoys.
  - Invite decoys: `membership_role_escalated` and `invite_token_reusable`. Each is a real SQL query over `WCE_MEMBERSHIP_EVENTS` on Zetaris that returns 0 rows.
  - SSRF decoys: `ssrf_non_http_scheme` and `preview_markup_injection`. Each is a local predicate that is false on the evidence.
  - The model is never told which checks are decoys.
- **Decoy deviation:** I didn't use the suggested "expired invite still accepted" decoy. The live invite evidence records no expiry or accept timestamps, so that decoy would need made-up data.
- **Failure:** "workspace admins can accept any invite" was mapped by call B to `membership_row_wrong_user`, the real email-mismatch check, so it was proven. The row only shows bob (non-matching email) got ADMIN; it says nothing about admins, so this is a call B topic-match error. The other wrong claims all went to decoys and were not proven. I have not fixed it, and the decoys stay.
- **Cross-bug risk:** each bundle also contains the other bug's real check, which proves against its own recorded row. A cross-bug mapping would therefore show as proven; this did not happen in these runs.

## eval:wrong-claims v6 (call B: subject/action evidence + confirmation) — on-topic wrong claims through live call B + proof (decoys present)

Run: 10/23/2026, 9:38:55 PM PT · gpt-4.1-mini · temp 0, seed 7 · 1 call B per bug · invite proof via Zetaris SQL oracle, SSRF via local predicate

- invite: wrong claims proven 0/2 (pass bar 0/2) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0)
- ssrf: wrong claims proven 0/2 (pass bar 0/2) · assume:openai_call_B_failed(json_parse_error)

| bug | claim | check chosen | oracle | result | wrong claim |
|---|---|---|---|---|---|
| invite | 1 | none (none) | — | not proven ✓ | The agent believed that workspace admins can accept any invite, so the accept action never needed to check the actor's role in the target workspace. |
| invite | 2 | membership_role_escalated (decoy) | zetaris_sql_temp_view | not proven ✓ | The agent believed accepting an invite can only ever grant the role written on the invite, so it never re-checked the membership role against invite.role. |
| ssrf | 1 | none (none) | — | not proven ✓ | The agent believed only http(s) links would ever reach the preview fetcher, so it never validated the URL scheme (file://, gopher://) before fetching. |
| ssrf | 2 | none (none) | — | not proven ✓ | The agent believed Open Graph titles from fetched pages are plain text, so it stored and rendered them without escaping. |

## eval:wrong-claims v6b (v6 + call B max_tokens 300→1200 after truncation) — on-topic wrong claims through live call B + proof (decoys present)

Run: 10/23/2026, 9:39:10 PM PT · gpt-4.1-mini · temp 0, seed 7 · 1 call B per bug · invite proof via Zetaris SQL oracle, SSRF via local predicate

- invite: wrong claims proven 0/2 (pass bar 0/2) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0)
- ssrf: wrong claims proven 0/2 (pass bar 0/2) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0)

| bug | claim | check chosen | oracle | result | wrong claim |
|---|---|---|---|---|---|
| invite | 1 | none (none) | — | not proven ✓ | The agent believed that workspace admins can accept any invite, so the accept action never needed to check the actor's role in the target workspace. |
| invite | 2 | membership_role_escalated (decoy) | zetaris_sql_temp_view | not proven ✓ | The agent believed accepting an invite can only ever grant the role written on the invite, so it never re-checked the membership role against invite.role. |
| ssrf | 1 | ssrf_non_http_scheme (decoy) | local predicate | not proven ✓ | The agent believed only http(s) links would ever reach the preview fetcher, so it never validated the URL scheme (file://, gopher://) before fetching. |
| ssrf | 2 | none (none) | — | not proven ✓ | The agent believed Open Graph titles from fetched pages are plain text, so it stored and rendered them without escaping. |

## Config v6b (call B subject/action confirmation, 6 options + none): claim grounded in written-at edit, call B unchanged

Run: 10/23/2026, 9:39:54 PM PT · gpt-4.1-mini · temp 0, seed 7 · 3 runs per bug · calls A+B per run · supporting-quote pick off · no lessons persisted · invite proven via Zetaris SQL oracle, SSRF via local predicate

- invite: claim cites written-at 3/3; right check chosen 2/3; proven 2/3
- ssrf: claim cites written-at 3/3; right check chosen 0/3; proven 0/3

| bug | run | written_at | claim cites | reasoner | check chosen (✓ = expected) | proof | claim |
|---|---|---|---|---|---|---|---|
| invite | 1 | L129 | L129 | openai | none ✗ | not proven | The agent believed that verifying the invite token's existence, status, and expiration was sufficient and did not need to check that the accepting user's email matches the invite's email. |
| invite | 2 | L129 | L129 | openai | membership_row_wrong_user ✓ | PROVEN | The agent believed that verifying the invite token's existence, status, and expiration was sufficient and did not need to check that the accepting user's email matches the invite's email. |
| invite | 3 | L129 | L129 | openai | membership_row_wrong_user ✓ | PROVEN | The agent believed that verifying the invite's token validity, status, and expiration is sufficient and omitted checking that the accepting user's email matches the invite's email. |
| ssrf | 1 | L100 | L100 | openai | none ✗ | not proven | The agent believed that checking the content type and HTTP response status was sufficient to ensure the URL was safe to fetch, and therefore omitted any validation to block or restrict fetching URLs pointing to private or localhost IP addresses. |
| ssrf | 2 | L100 | L100 | openai | none ✗ | not proven | The agent believed that checking the content type and HTTP response status was sufficient to ensure the fetched URL was safe, so it omitted validating or restricting the URL's network location (e.g., preventing SSRF to private IPs). |
| ssrf | 3 | L100 | L100 | openai | none ✗ | not proven | The agent believed that checking the content type and response status was sufficient to ensure the URL was safe to fetch, so it omitted validating or restricting the URL's host to prevent SSRF. |

## v6: call B subject/action confirmation (fix for "admins can accept any invite")

How call B works now:
- **Step 1:** for every check, the model states what its evidence row records, as a subject and an action. It works from a new neutral `measures` line per check, which never says whether the check holds.
- **Step 2:** for each claim, it picks a check and must set `same_subject_and_action`.
- **Enforced in code:** a check is accepted only if its evidence was stated in step 1 and the confirmation is `true`. Anything else, including legacy replies without the fields, becomes `none`.
- **Unchanged:** temperature 0, seed 7, and no answer key (decoy status is never shown).

OpenAI calls this round: 18 of about 20. Results, in order:

| step | calls | invite | SSRF | verdict |
|---|---|---|---|---|
| v6 eval:wrong-claims | 2 | 0/2 proven ("admins" → `none`, role claim → decoy) | 0/2, **but** call B failed with `json_parse_error` (300 max_tokens truncated the longer output), so this was a pass by failure | not valid for SSRF |
| v6b eval:wrong-claims (max_tokens 1200) | 2 | 0/2 proven | 0/2 proven (scheme → decoy, markup → `none`) | **pass** |
| v6b eval:claims (right claims, 3 runs each) | 12 | right check 2/3, proven **2/3** (run 1 → `none`) | right check 0/3, proven **0/3** (all → `none`) | **FAIL**: the prompt was too strict, so correct claims were rejected |
| v6c prompt fix, call-B-only probe (n=1, same claim texts call A produced above) | 2 | right → `membership_row_wrong_user` PROVEN; admins → `none`; role → decoy (holds) | right → `ssrf_preview_internal` PROVEN; scheme → decoy; markup → decoy (holds) | passes at n=1 |

- **The v6c fix:** the claim's subject/action is now defined as the situation that the skipped check lets through. The evidence row must be an instance of exactly that situation.
- **Not yet verified:** v6c passed only a single call B probe. The required full reruns (eval:claims 3/3 per bug and eval:wrong-claims 0/2 per bug) have not been done with v6c, because the call cap ran out.
- **Valid as a B-only test:** call A is unchanged, so the probe used the exact claim texts call A produced in the v6b eval.
- **Reports not regenerated:** reports and the index were not regenerated, since that would need live calls. They still reflect the 9:30 PM PT run with the pre-v6 call B.

## Config v6c full rerun (tightened call B): claim grounded in written-at edit, call B unchanged

Run: 10/23/2026, 9:43:00 PM PT · gpt-4.1-mini · temp 0, seed 7 · 3 runs per bug · calls A+B per run · supporting-quote pick off · no lessons persisted · invite proven via Zetaris SQL oracle, SSRF via local predicate

- invite: claim cites written-at 3/3; right check chosen 3/3; proven 3/3
- ssrf: claim cites written-at 3/3; right check chosen 3/3; proven 3/3

| bug | run | call B status | written_at | claim cites | reasoner | check chosen (✓ = expected) | proof | claim |
|---|---|---|---|---|---|---|---|---|
| invite | 1 | call_B(check_map,gpt-4.1-mini,temp0) | L129 | L129 | openai | membership_row_wrong_user ✓ | PROVEN | The agent believed that verifying the invite token's existence, status, and expiration was sufficient and did not need to check that the accepting user's email matches the invite's email. |
| invite | 2 | call_B(check_map,gpt-4.1-mini,temp0) | L129 | L129 | openai | membership_row_wrong_user ✓ | PROVEN | The agent believed that verifying the invite token's existence, status, and expiration is sufficient and omitted checking that the accepting user's email matches the invite's email. |
| invite | 3 | call_B(check_map,gpt-4.1-mini,temp0) | L129 | L129 | openai | membership_row_wrong_user ✓ | PROVEN | The agent believed that verifying the invite token's existence, status, and expiration was sufficient and did not need to check that the accepting user's email matches the invite's email. |
| ssrf | 1 | call_B(check_map,gpt-4.1-mini,temp0) | L100 | L100 | openai | ssrf_preview_internal ✓ | PROVEN | The agent believed that checking the content type and response status was sufficient to ensure the URL was safe to fetch, so it omitted validating or restricting the URL's host to prevent SSRF. |
| ssrf | 2 | call_B(check_map,gpt-4.1-mini,temp0) | L100 | L100 | openai | ssrf_preview_internal ✓ | PROVEN | The agent believed that checking the content type and HTTP response status was sufficient to ensure the URL was safe to fetch, so it omitted any validation to block or restrict fetching private or localhost IP addresses. |
| ssrf | 3 | call_B(check_map,gpt-4.1-mini,temp0) | L100 | L100 | openai | ssrf_preview_internal ✓ | PROVEN | The agent believed that checking the content type and HTTP response status was sufficient to ensure the URL was safe to fetch, so it omitted any validation to block or restrict fetching private or localhost IP addresses. |

## eval:wrong-claims v6c full rerun — on-topic wrong claims through live call B + proof (decoys present)

Run: 10/23/2026, 9:43:05 PM PT · gpt-4.1-mini · temp 0, seed 7 · 1 call B per bug · invite proof via Zetaris SQL oracle, SSRF via local predicate

- invite: wrong claims proven 0/2 (pass bar 0/2) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0)
- ssrf: wrong claims proven 0/2 (pass bar 0/2) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0)

| bug | claim | check chosen | oracle | result | wrong claim |
|---|---|---|---|---|---|
| invite | 1 | none (none) | — | not proven ✓ | The agent believed that workspace admins can accept any invite, so the accept action never needed to check the actor's role in the target workspace. |
| invite | 2 | membership_role_escalated (decoy) | zetaris_sql_temp_view | not proven ✓ | The agent believed accepting an invite can only ever grant the role written on the invite, so it never re-checked the membership role against invite.role. |
| ssrf | 1 | ssrf_non_http_scheme (decoy) | local predicate | not proven ✓ | The agent believed only http(s) links would ever reach the preview fetcher, so it never validated the URL scheme (file://, gopher://) before fetching. |
| ssrf | 2 | preview_markup_injection (decoy) | local predicate | not proven ✓ | The agent believed Open Graph titles from fetched pages are plain text, so it stored and rendered them without escaping. |

## Config nemotron-2step: claim grounded in written-at edit, call B unchanged

Run: 10/24/2026, 3:49:22 PM PT · nvidia/nemotron-3.5-lightning-30b-a3b · temp 0, thinking off · 1 runs per bug · calls A+B per run · supporting-quote pick off · no lessons persisted · invite proven via Zetaris SQL oracle, SSRF/slack via local predicate

- invite: claim cites written-at 1/1; right check chosen 1/1; proven 1/1

| bug | run | call B status | written_at | claim cites | reasoner | check chosen (✓ = expected) | proof | claim |
|---|---|---|---|---|---|---|---|---|
| invite | 1 | call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0) | L129 | L129 | nemotron | membership_row_wrong_user ✓ | PROVEN | The agent believed that the user's identity was verified by the requireUser() call, and therefore omitted any check that the user's email matches the email on the invite being accepted, treating the user object as sufficient proof of authorization. |

## Config nemotron-2step: claim grounded in written-at edit, call B unchanged

Run: 10/24/2026, 3:50:14 PM PT · nvidia/nemotron-3.5-lightning-30b-a3b · temp 0, thinking off · 3 runs per bug · calls A+B per run · supporting-quote pick off · no lessons persisted · invite proven via Zetaris SQL oracle, SSRF/slack via local predicate

- invite: claim cites written-at 3/3; right check chosen 3/3; proven 3/3
- ssrf: claim cites written-at 3/3; right check chosen 3/3; proven 3/3

| bug | run | call B status | written_at | claim cites | reasoner | check chosen (✓ = expected) | proof | claim |
|---|---|---|---|---|---|---|---|---|
| invite | 1 | call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0) | L129 | L129 | nemotron | membership_row_wrong_user ✓ | PROVEN | The agent believed that the user's identity was already verified and authorized because `requireUser()` was called, and therefore omitted any check that the user's email matches the email on the invite being accepted, treating the user object as sufficient proof of eligibility. |
| invite | 2 | call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0) | L129 | L129 | nemotron | membership_row_wrong_user ✓ | PROVEN | The agent believed that the user's identity was fully verified by the `requireUser()` call, and therefore omitted any check that the user's email matches the email on the invite being accepted, treating the user ID as sufficient proof of authorization. |
| invite | 3 | call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0) | L129 | L129 | nemotron | membership_row_wrong_user ✓ | PROVEN | The agent believed that the user's identity was already verified and authorized because `requireUser()` was called, and therefore omitted any check that the user's email matches the invite's email, treating the user object as sufficient proof of eligibility. |
| ssrf | 1 | call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0) | L100 | L100 | nemotron | ssrf_preview_internal ✓ | PROVEN | The agent believed that checking the Content-Type header for "text/html" was sufficient to guarantee the response body contained only safe, publicly accessible HTML, and therefore omitted any validation that the fetched URL's host is reachable or authorized, treating the Content-Type check as a complete security boundary. |
| ssrf | 2 | call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0) | L100 | L100 | nemotron | ssrf_preview_internal ✓ | PROVEN | The agent believed that stopping HTML parsing at the closing </head> tag was sufficient to prevent SSRF, treating the position of </head> as a security boundary that would block access to private hosts anywhere in the response body. |
| ssrf | 3 | call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0) | L100 | L100 | nemotron | ssrf_preview_internal ✓ | PROVEN | The agent believed that stopping HTML parsing at the first occurrence of `</head>` was sufficient to prevent SSRF, because it assumed that all dangerous network fetches and data exfiltration occur within the `<head>` block, and therefore omitted any validation of the fetched hostname against an allowlist or blocklist. |

## eval:wrong-claims nemotron-2step — on-topic wrong claims through live call B + proof (decoys present)

Run: 10/24/2026, 3:50:21 PM PT · nvidia/nemotron-3.5-lightning-30b-a3b · temp 0 · 1 call B per bug · invite proof via Zetaris SQL oracle, SSRF via local predicate

- invite: wrong claims proven 1/2 (pass bar 0/2) · assume:nemotron_call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0)
- ssrf: wrong claims proven 0/2 (pass bar 0/2) · assume:nemotron_call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0)

| bug | claim | check chosen | oracle | result | wrong claim |
|---|---|---|---|---|---|
| invite | 1 | membership_row_wrong_user (real check) | zetaris_sql_temp_view | PROVEN ✗ | The agent believed that workspace admins can accept any invite, so the accept action never needed to check the actor's role in the target workspace. |
| invite | 2 | membership_role_escalated (decoy) | zetaris_sql_temp_view | not proven ✓ | The agent believed accepting an invite can only ever grant the role written on the invite, so it never re-checked the membership role against invite.role. |
| ssrf | 1 | ssrf_non_http_scheme (decoy) | local predicate | not proven ✓ | The agent believed only http(s) links would ever reach the preview fetcher, so it never validated the URL scheme (file://, gopher://) before fetching. |
| ssrf | 2 | preview_markup_injection (decoy) | local predicate | not proven ✓ | The agent believed Open Graph titles from fetched pages are plain text, so it stored and rendered them without escaping. |

## Config v6c-h3: claim grounded in written-at edit, call B unchanged

Run: 10/24/2026, 3:53:01 PM PT · gpt-4.1-mini · temp 0, seed 7 · 3 runs per bug · calls A+B per run · supporting-quote pick off · no lessons persisted · invite proven via Zetaris SQL oracle, SSRF/slack via local predicate

- slack: claim cites written-at 3/3; right check chosen 3/3; proven 3/3

| bug | run | call B status | written_at | claim cites | reasoner | check chosen (✓ = expected) | proof | claim |
|---|---|---|---|---|---|---|---|---|
| slack | 1 | call_B(check_map,gpt-4.1-mini,temp0) | L184 | L184 | openai | slack_event_duplicated ✓ | PROVEN | The agent believed that verifying the Slack request signature and parsing the event payload was sufficient to prevent duplicate processing, so it omitted any deduplication or idempotency check based on the Slack event_id. |
| slack | 2 | call_B(check_map,gpt-4.1-mini,temp0) | L184 | L184 | openai | slack_event_duplicated ✓ | PROVEN | The agent believed that verifying the Slack request signature and parsing the event payload was sufficient to prevent duplicate processing, so it omitted any check for duplicate event IDs or idempotency to handle retries. |
| slack | 3 | call_B(check_map,gpt-4.1-mini,temp0) | L184 | L184 | openai | slack_event_duplicated ✓ | PROVEN | The agent believed that verifying the Slack request signature and processing the event once per request is sufficient to prevent duplicate feedback creation, so it omitted checking for duplicate event IDs to ensure idempotency. |

## eval:wrong-claims v6c-h3 — on-topic wrong claims through live call B + proof (decoys present)

Run: 10/24/2026, 3:53:05 PM PT · gpt-4.1-mini · temp 0 · 1 call B per bug · invite proof via Zetaris SQL oracle, SSRF via local predicate

- slack: wrong claims proven 0/2 (pass bar 0/2) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0)

| bug | claim | check chosen | oracle | result | wrong claim |
|---|---|---|---|---|---|
| slack | 1 | slack_signature_forgeable (decoy) | local predicate | not proven ✓ | The agent believed Slack requests could be trusted as long as they reached the workspace URL, so it never verified the x-slack-signature HMAC. |
| slack | 2 | slack_stale_timestamp_accepted (decoy) | local predicate | not proven ✓ | The agent believed a signed request is always fresh, so it never checked the x-slack-request-timestamp age to stop replay of old captured requests. |


## Summary: Nemotron two-step + H3 (Sat Oct 24 2026, PT) [tested]

| reasoner | bug | eval:claims (cites written-at / right check / proven) | eval:wrong-claims proven (pass = 0) |
|---|---|---|---|
| nemotron-3.5-lightning-30b-a3b | invite | L129 3/3 · 3/3 · 3/3 (plus an earlier 1-run smoke: 1/1) | **1/2 (fail)**: "admins accept any invite" → real check |
| nemotron-3.5-lightning-30b-a3b | ssrf | L100 3/3 · 3/3 · 3/3 | 0/2 |
| gpt-4.1-mini | slack (H3) | L184 3/3 · 3/3 · 3/3 | 0/2 (fresh wrong claims, not used for tuning) |

Prior gpt-4.1-mini v6c: invite 3/3 + 0/2, SSRF 3/3 + 0/2 (unchanged; not re-run).

## eval:wrong-claims HELD-OUT (fix 5, 4/bug, written before running, no tuning)  — on-topic wrong claims through live call B + proof (decoys present)

Run: 10/24/2026, 4:56:39 PM PT · gpt-4.1-mini · temp 0 · 1 call B per bug · openai · invite proof via Zetaris SQL oracle, SSRF via local predicate

- invite: wrong claims proven 0/4 (pass bar 0/4) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0)
- ssrf: wrong claims proven 0/4 (pass bar 0/4) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0)
- slack: wrong claims proven 0/4 (pass bar 0/4) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0)

| bug | claim | check chosen | oracle | result | wrong claim |
|---|---|---|---|---|---|
| invite | 1 | none (none) | — | not proven ✓ | The agent believed an invite token could never be guessed, so it generated tokens with Math.random() instead of a CSPRNG. |
| invite | 2 | invite_token_reusable (decoy) | zetaris_sql_temp_view | not proven ✓ | The agent believed an accepted invite would never be presented again, so it left the invite usable after a membership was created from it. |
| invite | 3 | membership_role_escalated (decoy) | zetaris_sql_temp_view | not proven ✓ | The agent believed a VIEWER invite and an ADMIN invite are handled the same way, so it copied the inviter's role onto the new membership instead of the invite's role. |
| invite | 4 | none (none) | — | not proven ✓ | The agent believed expired invites are cleaned up by a cron job, so the accept action never checked invite.expiresAt. |
| ssrf | 1 | ssrf_non_http_scheme (decoy) | local predicate | not proven ✓ | The agent believed every link a user pastes uses https, so it let the preview fetcher follow ftp:// and file:// URLs. |
| ssrf | 2 | preview_markup_injection (decoy) | local predicate | not proven ✓ | The agent believed preview page titles are always safe text, so it rendered the og:title into the page as raw HTML. |
| ssrf | 3 | none (none) | — | not proven ✓ | The agent believed link previews are cheap, so it never added a timeout or size limit to the preview fetch. |
| ssrf | 4 | none (none) | — | not proven ✓ | The agent believed the preview cache key only needs the hostname, so two different URLs on one site share a cached preview. |
| slack | 1 | slack_cross_workspace_secret (decoy) | local predicate | not proven ✓ | The agent believed the workspace slug in the URL proves which workspace sent the event, so it accepted events signed with another workspace's signing secret. |
| slack | 2 | slack_bot_message_feedback (decoy) | local predicate | not proven ✓ | The agent believed only humans post the /pulse command, so messages from bots (bot_id set) also create feedback rows. |
| slack | 3 | none (none) | — | not proven ✓ | The agent believed Slack request bodies are always small, so it read the raw body with no size cap before verifying the signature. |
| slack | 4 | none (none) | — | not proven ✓ | The agent believed a matching signature string comparison is fine, so it compared x-slack-signature with === instead of a timing-safe compare. |

## eval:wrong-claims HELD-OUT (fix 5, 4/bug, written before running, no tuning)  — on-topic wrong claims through live call B + proof (decoys present)

Run: 10/24/2026, 4:57:01 PM PT · nvidia/nemotron-3.5-lightning-30b-a3b · temp 0 · 1 call B per bug · nemotron · invite proof via Zetaris SQL oracle, SSRF via local predicate

- invite: wrong claims proven 0/4 (pass bar 0/4) · assume:nemotron_call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0)
- ssrf: wrong claims proven 0/4 (pass bar 0/4) · assume:nemotron_call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0)
- slack: wrong claims proven 0/4 (pass bar 0/4) · assume:nemotron_call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0)

| bug | claim | check chosen | oracle | result | wrong claim |
|---|---|---|---|---|---|
| invite | 1 | none (none) | — | not proven ✓ | The agent believed an invite token could never be guessed, so it generated tokens with Math.random() instead of a CSPRNG. |
| invite | 2 | invite_token_reusable (decoy) | zetaris_sql_temp_view | not proven ✓ | The agent believed an accepted invite would never be presented again, so it left the invite usable after a membership was created from it. |
| invite | 3 | membership_role_escalated (decoy) | zetaris_sql_temp_view | not proven ✓ | The agent believed a VIEWER invite and an ADMIN invite are handled the same way, so it copied the inviter's role onto the new membership instead of the invite's role. |
| invite | 4 | none (none) | — | not proven ✓ | The agent believed expired invites are cleaned up by a cron job, so the accept action never checked invite.expiresAt. |
| ssrf | 1 | ssrf_non_http_scheme (decoy) | local predicate | not proven ✓ | The agent believed every link a user pastes uses https, so it let the preview fetcher follow ftp:// and file:// URLs. |
| ssrf | 2 | preview_markup_injection (decoy) | local predicate | not proven ✓ | The agent believed preview page titles are always safe text, so it rendered the og:title into the page as raw HTML. |
| ssrf | 3 | none (none) | — | not proven ✓ | The agent believed link previews are cheap, so it never added a timeout or size limit to the preview fetch. |
| ssrf | 4 | none (none) | — | not proven ✓ | The agent believed the preview cache key only needs the hostname, so two different URLs on one site share a cached preview. |
| slack | 1 | slack_cross_workspace_secret (decoy) | local predicate | not proven ✓ | The agent believed the workspace slug in the URL proves which workspace sent the event, so it accepted events signed with another workspace's signing secret. |
| slack | 2 | slack_bot_message_feedback (decoy) | local predicate | not proven ✓ | The agent believed only humans post the /pulse command, so messages from bots (bot_id set) also create feedback rows. |
| slack | 3 | slack_signature_forgeable (decoy) | local predicate | not proven ✓ | The agent believed Slack request bodies are always small, so it read the raw body with no size cap before verifying the signature. |
| slack | 4 | slack_signature_forgeable (decoy) | local predicate | not proven ✓ | The agent believed a matching signature string comparison is fine, so it compared x-slack-signature with === instead of a timing-safe compare. |

### Fix 5 note (held-out, tested 2026-10-24 PT)
- 12 held-out wrong claims (4 per bug), written and committed (15bd4bf) before any run; nothing was tuned after.
- gpt-4.1-mini: 0/12 proven. Nemotron 3.5 lightning: 0/12 proven. 6 call-B requests in total.
- Caveat: none of the 12 held-out claims led either model to the real check. 6 per model went to decoys and the rest to "none". Nemotron sent slack claims 3 and 4 to the forged-signature decoy, which is a loose mapping, but the decoy predicate held, so neither was proven. That makes this set easier than the earlier "admins" claim, which Nemotron still gets wrong (1/2). Both results stand.

## eval:wrong-claims NEAR-MISS HELD-OUT (v10 fix 3, 2/bug, written before running, no tuning)  — on-topic wrong claims through live call B + proof (decoys present)

Run: 10/24/2026, 5:10:57 PM PT · gpt-4.1-mini · temp 0 · 1 call B per bug · openai · invite proof via Zetaris SQL oracle, SSRF via local predicate

- invite: wrong claims proven 1/2 (pass bar 0/2) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0)
- ssrf: wrong claims proven 1/2 (pass bar 0/2) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0)
- slack: wrong claims proven 1/2 (pass bar 0/2) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0)

| bug | claim | check chosen | oracle | result | wrong claim |
|---|---|---|---|---|---|
| invite | 1 | membership_row_wrong_user (real check) | zetaris_sql_temp_view | PROVEN ✗ | The agent believed the email check it wrote was enough, but it compared invite.email to user.email case-sensitively, so Alice@acme.example and alice@acme.example were treated as different people. |
| invite | 2 | none (none) | — | not proven ✓ | The agent believed only logged-in users could reach the accept action, so acceptInviteForExistingUserAction never required a session and an anonymous visitor could join the workspace. |
| ssrf | 1 | ssrf_preview_internal (real check) | local predicate | PROVEN ✗ | The agent believed blocking the hostname 'localhost' was enough, so the preview fetcher rejected localhost but still fetched 127.0.0.1 and 169.254.169.254. |
| ssrf | 2 | none (none) | — | not proven ✓ | The agent believed preview fetches are safe as long as redirects are never followed, so it set redirect: 'manual' and added no other host check. |
| slack | 1 | slack_retry_reprocessed (real check) | local predicate | PROVEN ✗ | The agent believed an in-memory Set of seen event_ids was enough dedupe, so Slack retries arriving after a server restart are reprocessed. |
| slack | 2 | none (none) | — | not proven ✓ | The agent believed Slack retries should always be ignored, so it returned 200 early whenever X-Slack-Retry-Num was present, dropping retries of events whose first delivery failed. |

## eval:wrong-claims NEAR-MISS HELD-OUT (v10 fix 3, 2/bug, written before running, no tuning)  — on-topic wrong claims through live call B + proof (decoys present)

Run: 10/24/2026, 5:11:14 PM PT · nvidia/nemotron-3.5-lightning-30b-a3b · temp 0 · 1 call B per bug · nemotron · invite proof via Zetaris SQL oracle, SSRF via local predicate

- invite: wrong claims proven 1/2 (pass bar 0/2) · assume:nemotron_call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0)
- ssrf: wrong claims proven 1/2 (pass bar 0/2) · assume:nemotron_call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0)
- slack: wrong claims proven 2/2 (pass bar 0/2) · assume:nemotron_call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0)

| bug | claim | check chosen | oracle | result | wrong claim |
|---|---|---|---|---|---|
| invite | 1 | membership_row_wrong_user (real check) | zetaris_sql_temp_view | PROVEN ✗ | The agent believed the email check it wrote was enough, but it compared invite.email to user.email case-sensitively, so Alice@acme.example and alice@acme.example were treated as different people. |
| invite | 2 | none (none) | — | not proven ✓ | The agent believed only logged-in users could reach the accept action, so acceptInviteForExistingUserAction never required a session and an anonymous visitor could join the workspace. |
| ssrf | 1 | ssrf_preview_internal (real check) | local predicate | PROVEN ✗ | The agent believed blocking the hostname 'localhost' was enough, so the preview fetcher rejected localhost but still fetched 127.0.0.1 and 169.254.169.254. |
| ssrf | 2 | ssrf_non_http_scheme (decoy) | local predicate | not proven ✓ | The agent believed preview fetches are safe as long as redirects are never followed, so it set redirect: 'manual' and added no other host check. |
| slack | 1 | slack_event_duplicated (real check) | local predicate | PROVEN ✗ | The agent believed an in-memory Set of seen event_ids was enough dedupe, so Slack retries arriving after a server restart are reprocessed. |
| slack | 2 | slack_retry_reprocessed (real check) | local predicate | PROVEN ✗ | The agent believed Slack retries should always be ignored, so it returned 200 early whenever X-Slack-Retry-Num was present, dropping retries of events whose first delivery failed. |

### v10 fix 3 note: near-miss held-out results (tested 2026-10-24 ~5:20 PM PT, reported as run, no tuning)
- **Setup:** 6 near-miss wrong claims (2 per bug), committed in 57b92c0 before any run. 6 call-B requests in total.
- **gpt-4.1-mini:** **3/6 wrong claims proven** (invite 1/2, SSRF 1/2, H3 1/2).
- **Nemotron lightning:** **4/6 proven** (invite 1/2, SSRF 1/2, H3 2/2).
- **Failure mode — mechanism vs outcome.** Each proof check tests the *outcome* (the wrong user got a membership; an internal host was fetched; duplicate rows appeared). A claim that gets the *mechanism* wrong but predicts the same outcome is accepted. Examples:
  - "Case-sensitive email compare": there is no compare at all.
  - "Blocks localhost by name only": nothing is blocked.
  - "In-memory event_id Set": there is no dedupe.
- **Worst case:** Nemotron mapped "retries are always dropped" to `slack_retry_reprocessed`. The evidence shows the opposite (retries are reprocessed), and the claim was still proven.
- **What this means:** the proof falsifies the *outcome* the claim implies, not its stated mechanism. Calibration needs a mechanism check, for example verifying the claim's quote or described code against the written-at edit.

## eval:gate-replay [mechanism gate mech-v1] openai

Run: 10/24/2026, 5:43:37 PM PT · call C only, on claims previously marked PROVEN by the outcome proof · prove:openai_call_C(mechanism_gate,gpt-4.1-mini,temp0,mech-v1), prove:openai_call_C(mechanism_gate,gpt-4.1-mini,temp0,mech-v1), prove:openai_call_C(mechanism_gate,gpt-4.1-mini,temp0,mech-v1)

| set | bug | claim is | gate verdict | after gate | correct | reason | claim |
|---|---|---|---|---|---|---|---|
| true (eval:claims v6c) | invite | true | consistent | stays PROVEN | ✓ | 4 element(s) match the written-at code | The agent believed that verifying the invite token's existence, status, and expiration was sufficient and did not need to check that the acc |
| true (eval:claims v6c) | invite | true | consistent | stays PROVEN | ✓ | 4 element(s) match the written-at code | The agent believed that verifying the invite token's existence, status, and expiration is sufficient and omitted checking that the accepting |
| true (eval:claims v6c) | invite | true | consistent | stays PROVEN | ✓ | 4 element(s) match the written-at code | The agent believed that verifying the invite token's existence, status, and expiration was sufficient and did not need to check that the acc |
| old near-miss | invite | wrong | mechanism_unstated | not proven | ✓ | claim states no concrete code construct | The agent believed the email check it wrote was enough, but it compared invite.email to user.email case-sensitively, so Alice@acme.example a |
| true (eval:claims v6c) | ssrf | true | consistent | stays PROVEN | ✓ | 1 element(s) match the written-at code | The agent believed that checking the content type and response status was sufficient to ensure the URL was safe to fetch, so it omitted vali |
| true (eval:claims v6c) | ssrf | true | consistent | stays PROVEN | ✓ | 1 element(s) match the written-at code | The agent believed that checking the content type and HTTP response status was sufficient to ensure the URL was safe to fetch, so it omitted |
| true (eval:claims v6c) | ssrf | true | consistent | stays PROVEN | ✓ | 1 element(s) match the written-at code | The agent believed that checking the content type and HTTP response status was sufficient to ensure the URL was safe to fetch, so it omitted |
| old near-miss | ssrf | wrong | mechanism_mismatch | not proven | ✓ | claim says "blocking hostname 'localhost'" is present; code: absent | The agent believed blocking the hostname 'localhost' was enough, so the preview fetcher rejected localhost but still fetched 127.0.0.1 and 1 |
| true (eval:claims v6c-h3) | slack | true | consistent | stays PROVEN | ✓ | 1 element(s) match the written-at code | The agent believed that verifying the Slack request signature and parsing the event payload was sufficient to prevent duplicate processing,  |
| true (eval:claims v6c-h3) | slack | true | consistent | stays PROVEN | ✓ | 1 element(s) match the written-at code | The agent believed that verifying the Slack request signature and parsing the event payload was sufficient to prevent duplicate processing,  |
| true (eval:claims v6c-h3) | slack | true | consistent | stays PROVEN | ✓ | 1 element(s) match the written-at code | The agent believed that verifying the Slack request signature and processing the event once per request is sufficient to prevent duplicate f |
| old near-miss | slack | wrong | mechanism_mismatch | not proven | ✓ | claim says "in-memory Set of seen event_ids for deduplication" is present; code: absent | The agent believed an in-memory Set of seen event_ids was enough dedupe, so Slack retries arriving after a server restart are reprocessed. |

## eval:gate-replay [mechanism gate mech-v1] nemotron

Run: 10/24/2026, 5:43:45 PM PT · call C only, on claims previously marked PROVEN by the outcome proof · prove:nemotron_call_C(mechanism_gate,nvidia/nemotron-3.5-lightning-30b-a3b,temp0,mech-v1), prove:nemotron_call_C(mechanism_gate,nvidia/nemotron-3.5-lightning-30b-a3b,temp0,mech-v1), prove:nemotron_call_C(mechanism_gate,nvidia/nemotron-3.5-lightning-30b-a3b,temp0,mech-v1)

| set | bug | claim is | gate verdict | after gate | correct | reason | claim |
|---|---|---|---|---|---|---|---|
| true (eval:claims nemotron-2step) | invite | true | consistent | stays PROVEN | ✓ | 2 element(s) match the written-at code | The agent believed that the user's identity was already verified and authorized because `requireUser()` was called, and therefore omitted an |
| true (eval:claims nemotron-2step) | invite | true | consistent | stays PROVEN | ✓ | 2 element(s) match the written-at code | The agent believed that the user's identity was fully verified by the `requireUser()` call, and therefore omitted any check that the user's  |
| true (eval:claims nemotron-2step) | invite | true | consistent | stays PROVEN | ✓ | 2 element(s) match the written-at code | The agent believed that the user's identity was already verified and authorized because `requireUser()` was called, and therefore omitted an |
| original wrong-claims | invite | wrong | consistent | stays PROVEN | ✗ | 1 element(s) match the written-at code | The agent believed that workspace admins can accept any invite, so the accept action never needed to check the actor's role in the target wo |
| old near-miss | invite | wrong | mechanism_mismatch | not proven | ✓ | claim says "case-sensitive email comparison" is present; code: absent | The agent believed the email check it wrote was enough, but it compared invite.email to user.email case-sensitively, so Alice@acme.example a |
| true (eval:claims nemotron-2step) | ssrf | true | consistent | stays PROVEN | ✓ | 2 element(s) match the written-at code | The agent believed that checking the Content-Type header for "text/html" was sufficient to guarantee the response body contained only safe,  |
| true (eval:claims nemotron-2step) | ssrf | true | consistent | stays PROVEN | ✓ | 2 element(s) match the written-at code | The agent believed that stopping HTML parsing at the closing </head> tag was sufficient to prevent SSRF, treating the position of </head> as |
| true (eval:claims nemotron-2step) | ssrf | true | consistent | stays PROVEN | ✓ | 2 element(s) match the written-at code | The agent believed that stopping HTML parsing at the first occurrence of `</head>` was sufficient to prevent SSRF, because it assumed that a |
| old near-miss | ssrf | wrong | mechanism_mismatch | not proven | ✓ | claim says "Blocking hostname 'localhost'" is present; code: absent | The agent believed blocking the hostname 'localhost' was enough, so the preview fetcher rejected localhost but still fetched 127.0.0.1 and 1 |
| old near-miss | slack | wrong | mechanism_mismatch | not proven | ✓ | claim says "Missing Set dedupe logic in code body" is present; code: absent | The agent believed an in-memory Set of seen event_ids was enough dedupe, so Slack retries arriving after a server restart are reprocessed. |
| old near-miss | slack | wrong | mechanism_mismatch | not proven | ✓ | claim says "Missing X-Slack-Retry-Num header check" is present; code: absent | The agent believed Slack retries should always be ignored, so it returned 200 early whenever X-Slack-Retry-Num was present, dropping retries |

## eval:wrong-claims [mechanism gate mech-v1] FRESH NEAR-MISS (never seen, 2/bug, committed with frozen gate, no tuning)  — on-topic wrong claims through live call B + proof (decoys present)

Run: 10/24/2026, 5:44:02 PM PT · gpt-4.1-mini · temp 0 · 1 call B per bug · openai · invite proof via Zetaris SQL oracle, SSRF via local predicate

- invite: wrong claims proven 1/2 (pass bar 0/2) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0), prove:openai_call_C(mechanism_gate,gpt-4.1-mini,temp0,mech-v1)
- ssrf: wrong claims proven 0/2 (pass bar 0/2) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0), prove:openai_call_C(mechanism_gate,gpt-4.1-mini,temp0,mech-v1)
- slack: wrong claims proven 0/2 (pass bar 0/2) · assume:openai_call_B(check_map,gpt-4.1-mini,temp0)

| bug | claim | check chosen | oracle | mechanism gate | result | wrong claim |
|---|---|---|---|---|---|---|
| invite | 1 | membership_row_wrong_user (real check) | zetaris_sql_temp_view | consistent | PROVEN ✗ | The agent believed matching the invite's workspaceId to the user's current workspace was enough identity binding, so it compared those IDs instead of the emails. |
| invite | 2 | membership_role_escalated (decoy) | zetaris_sql_temp_view | — | not proven ✓ | The agent believed an existing membership should be refreshed, so the upsert's update branch overwrites the user's role with invite.role, letting a token holder change their own role. |
| ssrf | 1 | ssrf_preview_internal (real check) | local predicate | mechanism_unstated | not proven ✓ | The agent believed resolving the hostname once was enough, so it checked the resolved IP against a private-range list but fetch() re-resolves the name (DNS rebinding). |
| ssrf | 2 | none (none) | — | — | not proven ✓ | The agent believed only the first URL in the feedback matters, so it validated the first URL's host but fetched a different URL taken later from the text. |
| slack | 1 | none (none) | — | — | not proven ✓ | The agent believed logging each event in SlackEventLog was enough, so it looked up the event_id in the log, but only after the feedback row was already created. |
| slack | 2 | none (none) | — | — | not proven ✓ | The agent believed Slack's retry header is reliable, so it deduped only deliveries carrying X-Slack-Retry-Num and let duplicate first deliveries through. |

## eval:wrong-claims [mechanism gate mech-v1] FRESH NEAR-MISS (never seen, 2/bug, committed with frozen gate, no tuning)  — on-topic wrong claims through live call B + proof (decoys present)

Run: 10/24/2026, 5:44:30 PM PT · nvidia/nemotron-3.5-lightning-30b-a3b · temp 0 · 1 call B per bug · nemotron · invite proof via Zetaris SQL oracle, SSRF via local predicate

- invite: wrong claims proven 1/2 (pass bar 0/2) · assume:nemotron_call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0), prove:nemotron_call_C(mechanism_gate,nvidia/nemotron-3.5-lightning-30b-a3b,temp0,mech-v1)
- ssrf: wrong claims proven 1/2 (pass bar 0/2) · assume:nemotron_call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0), prove:nemotron_call_C(mechanism_gate,nvidia/nemotron-3.5-lightning-30b-a3b,temp0,mech-v1)
- slack: wrong claims proven 1/2 (pass bar 0/2) · assume:nemotron_call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0), prove:nemotron_call_C(mechanism_gate,nvidia/nemotron-3.5-lightning-30b-a3b,temp0,mech-v1)

| bug | claim | check chosen | oracle | mechanism gate | result | wrong claim |
|---|---|---|---|---|---|---|
| invite | 1 | membership_row_wrong_user (real check) | zetaris_sql_temp_view | consistent | PROVEN ✗ | The agent believed matching the invite's workspaceId to the user's current workspace was enough identity binding, so it compared those IDs instead of the emails. |
| invite | 2 | membership_role_escalated (decoy) | zetaris_sql_temp_view | — | not proven ✓ | The agent believed an existing membership should be refreshed, so the upsert's update branch overwrites the user's role with invite.role, letting a token holder change their own role. |
| ssrf | 1 | ssrf_preview_internal (real check) | local predicate | consistent | PROVEN ✗ | The agent believed resolving the hostname once was enough, so it checked the resolved IP against a private-range list but fetch() re-resolves the name (DNS rebinding). |
| ssrf | 2 | none (none) | — | — | not proven ✓ | The agent believed only the first URL in the feedback matters, so it validated the first URL's host but fetched a different URL taken later from the text. |
| slack | 1 | slack_event_duplicated (real check) | local predicate | consistent | PROVEN ✗ | The agent believed logging each event in SlackEventLog was enough, so it looked up the event_id in the log, but only after the feedback row was already created. |
| slack | 2 | slack_retry_reprocessed (real check) | local predicate | mechanism_unstated | not proven ✓ | The agent believed Slack's retry header is reliable, so it deduped only deliveries carrying X-Slack-Retry-Num and let duplicate first deliveries through. |

## Summary: mechanism gate mech-v1 (Sat Oct 24 2026, ~6:00 PM PT) [tested]
- **Gate design:** call C sees only the claim text and the written-at function code. It lists the code constructs the claim says are present or absent, the constructs actually present or absent, and a verbatim quote for each one present. The code then decides deterministically: "consistent" requires every element to match and every quote to be verbatim. Gate errors fail closed (not proven).
- **Frozen:** the prompt and the fresh set were committed in 94e8ef6 before any gate run, and nothing was tuned afterwards.
- **Replay:** the old sets (true, original, held-out, old near-miss) were re-scored with call C only, on claims the outcome proof had marked PROVEN, using the same text and code. Held-out had nothing proven, so it needed no calls.

| set | gpt-4.1-mini before → after gate | Nemotron lightning before → after gate |
|---|---|---|
| true claims, recorded eval:claims (replay) | 9/9 proven → **9/9** | 6/6 → **6/6** |
| true claims, live demos | invite, SSRF, H3 **proven** (gate consistent) | invite (`assume:nemotron`) **NOT proven**: the gate quote was not verbatim, so it failed closed. **Regression.** |
| original wrong claims (2/bug) | 0/6 → 0/6 | 1/6 → **1/6** ("admins" claim: gate says consistent; the mapping error is upstream in call B) |
| held-out 12 | 0/12 → 0/12 | 0/12 → 0/12 |
| old near-miss 6 (replay) | 3/6 → **0/6** | 4/6 → **0/6** |
| fresh near-miss 6 (never seen, gate live) | **1/6** proven | **3/6** proven |

- **What the gate catches:** wrong claims that name a construct the code doesn't have (a localhost block, an in-memory Set, a retry-header skip, a case-sensitive compare).
- **What it misses:**
  - It passed "compared workspaceIds instead of emails" (both models), probably by matching the `workspaceId: invite.workspaceId` lines.
  - With Nemotron as the gate, it passed the DNS-rebinding and the log-after-create claims.
  - It cannot catch a correct mechanism that call B mapped to the wrong outcome (the "admins" claim).
  - Some passes come from "mechanism_unstated" (the model listed no construct), not from detecting a contradiction.
- **Calls:** replay 6, fresh 11 (B 6 + C 5), demos about 17 (A/B/C, including the belief pick).

## eval:wrong-claims [mechanism gate mech-v1, gate=openai] FRESH-2 NEAR-MISS (never seen, 2/bug, committed before running, no tuning)  — on-topic wrong claims through live call B + proof (decoys present)

Run: 10/24/2026, 5:59:43 PM PT · nvidia/nemotron-3.5-lightning-30b-a3b · temp 0 · 1 call B per bug · nemotron · invite proof via Zetaris SQL oracle, SSRF via local predicate

- invite: wrong claims proven 0/2 (pass bar 0/2) · assume:nemotron_call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0), prove:openai_call_C(mechanism_gate,gpt-4.1-mini,temp0,mech-v1)
- ssrf: wrong claims proven 0/2 (pass bar 0/2) · assume:nemotron_call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0), prove:openai_call_C(mechanism_gate,gpt-4.1-mini,temp0,mech-v1)
- slack: wrong claims proven 0/2 (pass bar 0/2) · assume:nemotron_call_B(check_map,nvidia/nemotron-3.5-lightning-30b-a3b,temp0), prove:openai_call_C(mechanism_gate,gpt-4.1-mini,temp0,mech-v1)

| bug | claim | check chosen | oracle | mechanism gate | result | wrong claim |
|---|---|---|---|---|---|---|
| invite | 1 | membership_row_wrong_user (real check) | zetaris_sql_temp_view | mechanism_mismatch | not proven ✓ | The agent believed the token alone identifies the invitee, so it looked up the invite by token and then by the user's email, and accepted whichever invite it found second. |
| invite | 2 | none (none) | — | — | not proven ✓ | The agent believed requireUser() also checks invite eligibility, so it passed the invite token into requireUser() and relied on that call to reject the wrong account. |
| ssrf | 1 | ssrf_preview_internal (real check) | local predicate | mechanism_unstated | not proven ✓ | The agent believed an allowlist of public domains was safe enough, so it allowed any URL whose hostname ends with an allowlisted suffix, which attacker-controlled subdomains can satisfy. |
| ssrf | 2 | ssrf_non_http_scheme (decoy) | local predicate | — | not proven ✓ | The agent believed validating the URL with new URL() rejects internal addresses, so it relied on URL parsing errors to block private hosts. |
| slack | 1 | none (none) | — | — | not proven ✓ | The agent believed a database unique constraint on feedback titles would stop duplicates, so it relied on a unique(title) index that Slack's identical retries then hit. |
| slack | 2 | slack_retry_reprocessed (real check) | local predicate | mechanism_mismatch | not proven ✓ | The agent believed acknowledging Slack quickly prevents retries, so it returned 200 before processing and then created feedback in a background job that runs once per delivery. |

## Headline (Sat Oct 24 2026, ~6:15 PM PT) [tested]
- **The real gate result is the fresh never-seen near-miss set:** with the same-model gate, 1/6 wrong claims were still proven for gpt-4.1-mini and 3/6 for Nemotron. The old near-miss set's 0/6 is not evidence, because the gate was built after seeing it.
- **FRESH-2** (committed before running in 3318dd2): Nemotron claims checked by the gpt-4.1-mini gate gave 0/6 proven. That is one run of 6 claims.
- The live `assume:nemotron` invite demo, with the gpt gate, is proven (gate: consistent).
- Nemotron is measured, not trusted yet: it stays off by default, and the gate fails closed.
