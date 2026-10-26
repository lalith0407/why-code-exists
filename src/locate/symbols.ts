/**
 * Generic symbol index of a source tree (deterministic, no LLM): function/method/class definitions, exported
 * names, string literals, numeric/string constants, and route declarations (`app.get(...)`, `router.post(...)`,
 * `@app.route(...)`, `@router.get(...)`). Purely syntactic, generic regexes — no per-repo or per-framework
 * special-casing, no per-case lists. Used to (a) name the enclosing symbol of a candidate line for the report,
 * and (b) give the model-assisted layer something structured to grep/read over.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { langOf } from "../engine/lang.js";

export type SymbolKind = "function" | "export" | "string" | "const" | "route";
export interface Symbol {
  file: string;
  line: number;
  kind: SymbolKind;
  name: string;
  text: string;
}

export const SKIP_DIRS = new Set([
  ".git", "node_modules", ".venv", "venv", "dist", "build", ".next", "vendor", "coverage", ".turbo",
  "__pycache__", ".cache", "artifacts", "data", "scratch",
]);
const NONCODE = /(^|\/)(tests?|__tests__|spec|e2e|fixtures?)\/|\.min\.js$|(_test|\.test|\.spec|test_[^/]*)\.\w+$|^test_|\.d\.ts$/;
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py)$/;

export function listSourceFiles(root: string, maxFiles = 6000): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length && out.length < maxFiles) {
    const dir = stack.pop()!;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      if (out.length >= maxFiles) break;
      const p = join(dir, name);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) { if (!SKIP_DIRS.has(name) && !name.startsWith(".")) stack.push(p); continue; }
      const rel = relative(root, p);
      if (SOURCE_EXT.test(name) && !NONCODE.test(rel)) out.push(rel);
    }
  }
  return out;
}

const FN_TS = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)\s*\(/;
const CONST_FN_TS = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/;
const CLASS_TS = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;
const EXPORT_CONST = /^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[:=]/;
const CONST_NUM_TS = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[:=][^=]*?(-?\d+(?:\.\d+)?)/;

const DEF_PY = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/;
const CLASS_PY = /^\s*class\s+([A-Za-z_]\w*)/;
const CONST_NUM_PY = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?)/;

const ROUTE_CALL = /\b(?:app|router|server)\.(get|post|put|patch|delete|use)\s*\(\s*["'`]([^"'`]+)["'`]/i;
const ROUTE_DECORATOR = /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/i;

const STRING_MIN_LEN = 3;

function* stringLiterals(line: string): Generator<string> {
  const re = /(["'`])((?:\\.|(?!\1)[^\\\n]){1,120})\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) if (m[2].trim().length >= STRING_MIN_LEN) yield m[2];
}

/** Build the symbol index for a list of repo-relative files under `root`. Generic, syntactic only. */
export function buildSymbolIndex(root: string, files: string[]): Symbol[] {
  const out: Symbol[] = [];
  for (const f of files) {
    let src: string;
    try { src = readFileSync(join(root, f), "utf8"); } catch { continue; }
    const lang = langOf(f);
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const n = i + 1;
      let m: RegExpExecArray | null;
      if (lang === "python") {
        if ((m = DEF_PY.exec(line))) out.push({ file: f, line: n, kind: "function", name: m[1], text: line.trim() });
        else if ((m = CLASS_PY.exec(line))) out.push({ file: f, line: n, kind: "function", name: m[1], text: line.trim() });
        else if ((m = CONST_NUM_PY.exec(line))) out.push({ file: f, line: n, kind: "const", name: m[1], text: line.trim() });
      } else {
        if ((m = FN_TS.exec(line))) out.push({ file: f, line: n, kind: "function", name: m[1], text: line.trim() });
        else if ((m = CONST_FN_TS.exec(line))) out.push({ file: f, line: n, kind: "function", name: m[1], text: line.trim() });
        else if ((m = CLASS_TS.exec(line))) out.push({ file: f, line: n, kind: "function", name: m[1], text: line.trim() });
        else if ((m = CONST_NUM_TS.exec(line))) out.push({ file: f, line: n, kind: "const", name: m[1], text: line.trim() });
        else if ((m = EXPORT_CONST.exec(line))) out.push({ file: f, line: n, kind: "export", name: m[1], text: line.trim() });
      }
      if ((m = ROUTE_CALL.exec(line)) || (m = ROUTE_DECORATOR.exec(line))) out.push({ file: f, line: n, kind: "route", name: m[2], text: line.trim() });
      if (!/^\s*(import|from)\b/.test(line)) for (const s of stringLiterals(line)) out.push({ file: f, line: n, kind: "string", name: s, text: line.trim() });
    }
  }
  return out;
}

const sameFile = (a: string, b: string) => a === b || a.endsWith("/" + b) || b.endsWith("/" + a);

/** The nearest enclosing `function`/`export` symbol at or before `line` in `file` (generic, no language-aware body-end check). */
export function enclosingSymbolName(symbols: Symbol[], file: string, line: number): string | undefined {
  let best: Symbol | undefined;
  for (const s of symbols) {
    if (s.kind !== "function" && s.kind !== "export") continue;
    if (!sameFile(s.file, file) || s.line > line) continue;
    if (!best || s.line > best.line) best = s;
  }
  return best?.name;
}
