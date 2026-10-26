# Held-out set 3: success criteria (written and committed before any run)

Source: transcript `bc-fe0ae5aa` (Blast Radius SQL-guard hardening, Python), which is **not Pulseboard**. App tree: `blast-radius.bundle` at dev 7b62ee9, plus all 26 transcript edits replayed (`/workspace/open-agent/heldout3-src/blast-radius-hardened`, a local git repo). Every bug is in code written by that agent session, and each was confirmed by running the real code (`capture-error.ts`).

**Disclosure:** the builder picked these 3 bugs after reading the code, and knows the engine. They were not looked at during engine development (gen-v8 was frozen before this selection). The engine runs once per case with no code changes in between.

| case | frame given to engine | ground-truth cause | success = |
|---|---|---|---|
| heldout3-plan-injection | `safe_plan` (reasoner/base.py) | `_deprecation_step` interpolates `action.target` into SQL string literals with an f-string (no escaping or parameters), so a `'` in a quoted identifier injects statements into plan step 1 | claim names unescaped interpolation of the target in the deprecation SQL; verdict proven_false |
| heldout3-retype-unique | `_sqlite_script` (world/db.py) | `_retype_column_sqlite` rebuilds the table (create new, copy, drop, rename) without recreating its indexes, so UNIQUE indexes are lost | claim names indexes not being recreated in the table rebuild; proven_false |
| heldout3-schema-target | `parse_action` (models.py) | `_name()` keeps only the last dotted part, so `archive.orders` becomes `orders` | claim names schema-qualifier stripping in name extraction; proven_false |

A case succeeds only if the verdict is proven_false, the gate is consistent, **and** the claim matches the ground-truth cause. Partial credit is not counted. Zetaris confirmation is reported separately and is not required.

Hard expectations stated in advance:
- Plan-injection needs a payload-aware repro.
- Retype-unique needs SQLite index introspection.
- Schema-target has its cause in a helper (`_name`) in the same file.
