/**
 * Generic file-role prior for layer 1. Docs, tests, fixtures, and lockfiles reuse the report's
 * words without being the edited logic, so they take a multiplicative down-weight. Source stays at 1.
 * A non-source hunk can still rank first when every source hunk scores zero — weight never zeroes a
 * positive score, and zero-score hunks are dropped before ranking.
 */
import type { FileRole } from "./types.js";

/** Prose often repeats the report sentence; a tenth keeps a real source hit ahead of that echo. */
export const DOC_ROLE_WEIGHT = 0.1;
/** Tests name the symbols they exercise, so they echo the report more loudly than the cause. */
export const TEST_ROLE_WEIGHT = 0.1;
/** Fixtures are canned data that copy labels and field names out of the report. */
export const FIXTURE_ROLE_WEIGHT = 0.1;
/** Lockfiles are generated dependency inventories; a name hit there is not the edited logic. */
export const LOCKFILE_ROLE_WEIGHT = 0.05;

/** Basenames ecosystems use for generated dependency locks. Not project paths. */
const LOCKFILE_BASENAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "npm-shrinkwrap.json",
  "cargo.lock",
  "gemfile.lock",
  "poetry.lock",
  "composer.lock",
  "go.sum",
  "pipfile.lock",
  "bun.lock",
  "bun.lockb",
]);

export function classifyFileRole(file: string): { role: FileRole; weight: number } {
  const norm = file.replace(/\\/g, "/").replace(/^\.\//, "");
  const base = (norm.split("/").pop() ?? norm).toLowerCase();
  const path = norm.toLowerCase();

  if (LOCKFILE_BASENAMES.has(base)) return { role: "lockfile", weight: LOCKFILE_ROLE_WEIGHT };

  // `fixture(s)` / `__fixtures__` segments, or a `*.fixture.*` basename — the usual fixture-dir convention.
  if (/(^|\/)(__fixtures__|fixtures?)(\/|$)/.test(path) || /\.fixture\./.test(base)) {
    return { role: "fixture", weight: FIXTURE_ROLE_WEIGHT };
  }

  // test/tests/__tests__/spec/e2e directories, plus `*.test.*` / `*.spec.*` / `*_test.*` / `test_*` basenames.
  if (
    /(^|\/)(tests?|__tests__|spec|e2e)(\/|$)/.test(path) ||
    /(^|\/)test_[^/]+$/.test(path) ||
    /(_test|\.test|\.spec)\.[^/]+$/.test(path)
  ) {
    return { role: "test", weight: TEST_ROLE_WEIGHT };
  }

  // Prose: md/rst/txt, docs/ and guides/ trees, and README / CHANGELOG-style basenames.
  if (
    /\.(md|rst|txt)$/.test(base) ||
    /(^|\/)(docs?|guides?)(\/|$)/.test(path) ||
    /^(readme|changelog|changes|history)(\.|$)/.test(base)
  ) {
    return { role: "doc", weight: DOC_ROLE_WEIGHT };
  }

  return { role: "source", weight: 1 };
}
