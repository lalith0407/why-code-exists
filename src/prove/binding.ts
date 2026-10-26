/**
 * Generic claim-binding checks (no case knowledge):
 *  - locateCited: find the claim's verbatim cited lines in the files it was shown (file + 1-based line).
 *  - patchTouchedLines: original-file line numbers a find/replace edit removes or modifies (insertions map to neighbours).
 *  - overlaps: whether a patch touches cited code (±tol lines, same file).
 *  - noopMutant: the attributed function with its body returning immediately (decoy vacuity control).
 */
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

export type Cited = { file: string; line: number; text: string };

/** Each cited line is located verbatim. If it occurs inside one of the preferred spans (the attributed function, the chosen
 * helper), only those occurrences count; otherwise it must be unambiguous (at most 2 occurrences), else it is dropped. */
export function locateCited(cited: string[], files: Record<string, string>, prefer: Array<{ file: string; range: [number, number] }> = []): Cited[] {
  const out: Cited[] = [];
  for (const c0 of cited ?? []) {
    const c = norm(c0);
    if (c.length < 4) continue;
    const hits: Cited[] = [];
    for (const [file, text] of Object.entries(files)) {
      text.split("\n").forEach((l, i) => { const n = norm(l); if (n && (n === c || (n.length >= 6 && (n.includes(c) || (c.includes(n) && n.length >= c.length * 0.6))))) hits.push({ file, line: i + 1, text: l.trim() }); });
    }
    const inPref = hits.filter((h) => prefer.some((p) => p.file === h.file && h.line >= p.range[0] && h.line <= p.range[1]));
    out.push(...(inPref.length ? inPref : hits.length <= 2 ? hits : []));
  }
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(`${x.file}:${x.line}`) ? false : (seen.add(`${x.file}:${x.line}`), true)));
}

/** Line numbers (1-based, in the original file) that the edit removes/modifies; a pure insertion yields the lines around it. */
export function patchTouchedLines(orig: string, find: string, replace: string): number[] {
  const at = orig.indexOf(find);
  if (at < 0) return [];
  const startLine = orig.slice(0, at).split("\n").length; // 1-based line where find starts
  const x = find.split("\n"), y = replace.split("\n");
  const m = x.length, n = y.length;
  const L: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = norm(x[i]) === norm(y[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const touched = new Set<number>();
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && norm(x[i]) === norm(y[j])) { i++; j++; }
    else if (j < n && (i >= m || L[i][j + 1] >= L[i + 1][j])) { touched.add(startLine + Math.max(0, i - 1)); if (i < m) touched.add(startLine + i); j++; }
    else { touched.add(startLine + i); i++; }
  }
  return [...touched].sort((a, b) => a - b);
}

export function overlaps(cited: Cited[], file: string, touched: number[], tol = 1): Cited[] {
  return cited.filter((c) => c.file === file && touched.some((t) => Math.abs(t - c.line) <= tol));
}

/** Insert an immediate return as the first body statement of the function whose definition spans [start,end] (1-based). */
export function noopMutant(src: string, range: [number, number], lang: "python" | "ts" | string): string | undefined {
  const lines = src.split("\n");
  let d = range[0] - 1;
  if (lang === "python") {
    while (d < range[1] && /^\s*@/.test(lines[d])) d++;
    // signature ends at the first line (from def) whose code ends with ':' at bracket depth 0
    let depth = 0;
    for (let k = d; k < range[1]; k++) {
      const code = lines[k].replace(/#.*$/, "");
      for (const ch of code) { if ("([{".includes(ch)) depth++; else if (")]}".includes(ch)) depth--; }
      if (depth <= 0 && /:\s*$/.test(code)) {
        const next = lines.slice(k + 1, range[1]).find((l) => l.trim());
        const defIndent = /^\s*/.exec(lines[d])![0];
        const ind = next ? /^\s*/.exec(next)![0] : defIndent + "    ";
        if (ind.length <= defIndent.length) return undefined; // one-line def body
        const body = `${ind}return None  # wce noop mutant`;
        return [...lines.slice(0, k + 1), body, ...lines.slice(k + 1)].join("\n");
      }
    }
    return undefined;
  }
  // TS/JS: first '{' at paren depth 0 after the parameter list closes
  const text = lines.slice(d, range[1]).join("\n");
  let depth = 0, seenParams = false;
  for (let p = 0; p < text.length; p++) {
    const ch = text[p];
    if (ch === "(") { depth++; seenParams = true; }
    else if (ch === ")") depth--;
    else if (ch === "{" && depth === 0 && seenParams && /[)\w>]/.test(text.slice(0, p).trimEnd().slice(-1))) {
      const before = lines.slice(0, d).join("\n") + (d ? "\n" : "");
      const mutated = text.slice(0, p + 1) + " return undefined; /* wce noop mutant */" + text.slice(p + 1);
      return before + mutated + (range[1] < lines.length ? "\n" + lines.slice(range[1]).join("\n") : "");
    }
    else if (ch === "=" && text[p + 1] === ">" && depth === 0) {
      const rest = text.slice(p + 2).trimStart();
      if (!rest.startsWith("{")) return undefined; // expression-bodied arrow
    }
  }
  return undefined;
}
