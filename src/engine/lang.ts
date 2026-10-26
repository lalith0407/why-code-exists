/** Language helpers (generic): detect language by extension, find a function definition, slice its body. */
export type Lang = "ts" | "js" | "python" | "unknown";

export function langOf(file: string): Lang {
  if (/\.(ts|tsx|mts|cts)$/.test(file)) return "ts";
  if (/\.(js|jsx|mjs|cjs)$/.test(file)) return "js";
  if (/\.py$/.test(file)) return "python";
  return "unknown";
}

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Regex matching a definition of `fn` in JS/TS (function decl, const arrow, method) or Python (def / async def). */
export function defRegex(fn: string, lang: Lang = "unknown"): RegExp {
  const f = esc(fn.split(".").pop()!);
  const js = `(function\\s+${f}\\b|(const|let|var)\\s+${f}\\s*=|^\\s*[+]?\\s*(export\\s+)?(async\\s+)?${f}\\s*\\()`;
  const py = `^\\s*[+]?\\s*(async\\s+)?def\\s+${f}\\s*\\(`;
  if (lang === "python") return new RegExp(py, "m");
  if (lang === "ts" || lang === "js") return new RegExp(js, "m");
  return new RegExp(`${js}|${py}`, "m");
}

const indentOf = (l: string) => (/^[ \t]*/.exec(l)?.[0].length ?? 0);

/**
 * Given lines and the index of the definition line, return the index of the last line of the function.
 * Python: indentation. JS/TS: brace matching (strings/comments approximated), fallback to next top-level decl.
 */
export function functionEnd(lines: string[], defIdx: number, lang: Lang): number {
  if (lang === "python") {
    const base = indentOf(lines[defIdx]);
    let last = defIdx;
    let i = defIdx + 1;
    // skip multi-line signature
    while (i < lines.length && !/:\s*(#.*)?$/.test(lines[i - 1]) && i - defIdx < 30) i++;
    for (; i < lines.length; i++) {
      const l = lines[i];
      if (!l.trim()) continue;
      if (indentOf(l) <= base) break;
      last = i;
    }
    return last;
  }
  let depth = 0;
  let opened = false;
  for (let i = defIdx; i < lines.length; i++) {
    const code = lines[i].replace(/\/\/.*$/, "").replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
    for (const ch of code) {
      if (ch === "{") { depth++; opened = true; }
      else if (ch === "}") depth--;
    }
    if (opened && depth <= 0) return i;
  }
  for (let i = defIdx + 1; i < lines.length; i++) if (/^(export\s|async function|function\s)/.test(lines[i])) return i - 1;
  return lines.length - 1;
}

/** Extract a function's source from a full file. Returns 1-based range. */
export function extractFunction(src: string, fn: string, lang: Lang, nearLine?: number): { text: string; range: [number, number] } | undefined {
  const lines = src.split("\n");
  const re = defRegex(fn, lang);
  const defs = lines.map((l, i) => (re.test(l) ? i : -1)).filter((i) => i >= 0);
  if (!defs.length) return undefined;
  let pick = defs[0];
  if (nearLine) {
    const containing = defs.filter((d) => d + 1 <= nearLine && functionEnd(lines, d, lang) + 1 >= nearLine);
    if (containing.length) pick = containing[containing.length - 1];
  }
  // include decorators (python) directly above
  let start = pick;
  if (lang === "python") while (start > 0 && /^\s*@/.test(lines[start - 1])) start--;
  const end = functionEnd(lines, pick, lang);
  return { text: lines.slice(start, end + 1).join("\n"), range: [start + 1, end + 1] };
}

/** Remove common leading indentation (Python methods → module-level text). */
export function dedent(text: string): string {
  const ls = text.split("\n");
  const ind = Math.min(...ls.filter((l) => l.trim()).map(indentOf));
  return ls.map((l) => l.slice(Math.min(ind, indentOf(l)))).join("\n");
}
