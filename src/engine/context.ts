/**
 * Code context for the test writer and patcher (generic): the app modules the frame file imports (resolved inside the app tree)
 * and the bare external packages it imports. Lets the model call REAL helpers instead of guessing them.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Lang } from "./lang.js";

export interface CodeContext { app_modules: Array<{ path: string; source: string }>; external_packages: string[]; reachable_external_packages: Array<{ package: string; imported_by: string[]; import_lines: string[] }> }

function resolveTs(root: string, fromFile: string, spec: string, aliasAt: boolean | string): string | undefined {
  const base = spec.startsWith(".") ? join(dirname(join(root, fromFile)), spec) : spec.startsWith("@/") && aliasAt !== false ? join(root, typeof aliasAt === "string" ? aliasAt : "", spec.slice(2)) : undefined;
  if (!base) return undefined;
  for (const c of [base, ...[".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js"].map((e) => base + e)])
    if (existsSync(c) && statSync(c).isFile()) return relative(root, c);
  return undefined;
}

function resolvePy(root: string, mod: string): string | undefined {
  const p = mod.split(".").join("/");
  for (const c of [`src/${p}.py`, `src/${p}/__init__.py`, `${p}.py`, `${p}/__init__.py`]) if (existsSync(join(root, c))) return c;
  return undefined;
}

export function importsOf(root: string, file: string, lang: Lang, aliasAt: boolean | string): { app: string[]; external: string[] } {
  const src = readFileSync(join(root, file), "utf8");
  const app = new Set<string>(), ext = new Set<string>();
  if (lang === "python") {
    for (const m of src.matchAll(/^\s*(?:from\s+([.\w]+)\s+import|import\s+([\w.]+))/gm)) {
      let mod = m[1] ?? m[2];
      if (mod.startsWith(".")) { const pkg = file.replace(/^src\//, "").split("/").slice(0, -1); const ups = /^\.+/.exec(mod)![0].length; mod = [...pkg.slice(0, pkg.length - ups + 1), mod.slice(ups)].filter(Boolean).join("."); }
      const r = resolvePy(root, mod);
      if (r) app.add(r); else ext.add(mod.split(".")[0]);
    }
  } else {
    for (const m of src.matchAll(/(?:^|\n)\s*import\s+(?:type\s+)?[^;]*?from\s+["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g)) {
      if (/^\s*import\s+type\b/.test(m[0].trim())) continue;
      const spec = m[1] ?? m[2];
      const r = resolveTs(root, file, spec, aliasAt);
      if (r) app.add(r); else if (!spec.startsWith(".") && !spec.startsWith("@/")) ext.add(spec);
    }
  }
  return { app: [...app], external: [...ext] };
}

export function codeContext(root: string, file: string, lang: Lang, aliasAt: boolean | string, maxModules = 8, maxChars = 5000): CodeContext {
  const { app, external } = importsOf(root, file, lang, aliasAt);
  const app_modules = app.slice(0, maxModules).map((p) => { const s = readFileSync(join(root, p), "utf8"); return { path: p, source: s.length > maxChars ? s.slice(0, maxChars) + "\n/* …truncated… */" : s }; });
  // Every bare package reachable through app imports (BFS), so stubs can target the package that needs a runtime, not app code.
  const seen = new Set([file]), queue = [file], reach = new Map<string, Set<string>>(), lines = new Map<string, Set<string>>();
  while (queue.length && seen.size < 60) {
    const f = queue.shift()!;
    const im = importsOf(root, f, lang, aliasAt);
    const src = readFileSync(join(root, f), "utf8").split("\n");
    for (const e of im.external) {
      (reach.get(e) ?? reach.set(e, new Set()).get(e)!).add(f);
      const ls = lines.get(e) ?? lines.set(e, new Set()).get(e)!;
      for (const l of src) if (ls.size < 8 && (l.includes(`"${e}"`) || l.includes(`'${e}'`) || new RegExp(`^\\s*(from|import)\\s+${e.replace(/[.]/g, "\\.")}\\b`).test(l))) ls.add(l.trim());
    }
    for (const a of im.app) if (!seen.has(a)) { seen.add(a); queue.push(a); }
  }
  return { app_modules, external_packages: external, reachable_external_packages: [...reach].map(([pkg, by]) => ({ package: pkg, imported_by: [...by], import_lines: [...(lines.get(pkg) ?? [])] })) };
}

/**
 * Source of the LOCAL helpers the frame file imports, followed breadth-first through app imports (TS/JS and Python),
 * bounded by depth, file count and size. For the claim step, so it can see the callee where the actual mistake may live.
 */
export function helperSources(root: string, file: string, lang: Lang, aliasAt: boolean | string, o: { depth?: number; maxFiles?: number; maxChars?: number; totalChars?: number } = {}): Array<{ path: string; depth: number; source: string; truncated: boolean }> {
  const depth = o.depth ?? 2, maxFiles = o.maxFiles ?? 8, maxChars = o.maxChars ?? 4000, total = o.totalChars ?? 20000;
  const out: Array<{ path: string; depth: number; source: string; truncated: boolean }> = [];
  const seen = new Set([file]);
  let frontier = [file], used = 0;
  for (let d = 1; d <= depth && frontier.length; d++) {
    const next: string[] = [];
    for (const f of frontier) for (const a of importsOf(root, f, lang, aliasAt).app) {
      if (seen.has(a)) continue; seen.add(a); next.push(a);
      if (out.length >= maxFiles || used >= total) continue;
      const s = readFileSync(join(root, a), "utf8");
      const cap = Math.min(maxChars, total - used);
      out.push({ path: a, depth: d, source: s.length > cap ? s.slice(0, cap) + "\n/* …truncated… */" : s, truncated: s.length > cap });
      used += Math.min(s.length, cap);
    }
    frontier = next;
  }
  return out;
}
