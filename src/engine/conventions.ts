/**
 * The repo's own test conventions (generic): existing test files, preferring ones that import the module under test, so the
 * test writer sees how this codebase constructs its objects and calls its functions. Read-only excerpts; nothing is executed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Lang } from "./lang.js";
import { pyModuleName } from "./sandbox.js";

const SKIP = /^(node_modules|\.git|\.next|\.wce|\.venv|venv|__pycache__|dist|build)$/;

export function listTestFiles(root: string, lang: Lang): string[] {
  const isTest = lang === "python" ? (f: string) => /^(test_.*|.*_test|conftest)\.py$/.test(f) : (f: string) => /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(f);
  const out: string[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > 6) return;
    let es: import("node:fs").Dirent[] = [];
    try { es = readdirSync(join(root, d), { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (SKIP.test(e.name)) continue;
      const r = d ? `${d}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r, depth + 1); else if (isTest(e.name)) out.push(r);
    }
  };
  walk("", 0);
  return out.sort();
}

/** Up to `n` excerpts (first `lines` lines). Files mentioning the target module/function rank first; conftest/setup files next. */
export function repoTestExamples(root: string, lang: Lang, targetFile: string, fn: string | undefined, n = 2, lines = 70): Array<{ path: string; excerpt: string }> {
  const files = listTestFiles(root, lang);
  const mod = lang === "python" ? pyModuleName(targetFile) : targetFile.replace(/\.(ts|tsx|js|mjs)$/, "");
  const base = mod.split(/[./]/).pop()!;
  const score = (p: string) => {
    const full = join(root, p);
    if (!existsSync(full) || statSync(full).size > 400_000) return -1;
    const t = readFileSync(full, "utf8");
    return (t.includes(mod) ? 4 : 0) + (fn && t.includes(fn.split(".").pop()!) ? 3 : 0) + (new RegExp(`\\b${base}\\b`).test(t) ? 1 : 0) + (/conftest|setup/.test(p) ? 0.5 : 0);
  };
  return files.map((p) => ({ p, s: score(p) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.p.localeCompare(b.p)).slice(0, n)
    .map(({ p }) => {
      const t = readFileSync(join(root, p), "utf8").split("\n");
      // Prefer the region that mentions the function, plus the file head (imports/fixtures).
      const name = fn?.split(".").pop();
      const hit = name ? t.findIndex((l) => l.includes(name)) : -1;
      const head = t.slice(0, 25);
      const body = hit > 25 ? t.slice(Math.max(25, hit - 10), hit - 10 + lines - 25) : t.slice(25, lines);
      return { path: p, excerpt: [...head, ...(hit > 25 ? ["# …"] : []), ...body].join("\n") };
    });
}
