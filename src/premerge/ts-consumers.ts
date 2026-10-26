/** Deterministic consumer finder for TS/JS (TypeScript compiler API AST; name resolution, not type-checked). */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

export interface Site { kind: string; file: string; line: number; why: string; entity: Entity; function: string; span: [number, number]; callees: { name: string; file: string; span: [number, number] }[] }
export interface Entity { kind: string; name: string; file: string; line: number; span?: [number, number]; cls?: string; member?: string }
const SKIP = new Set(["node_modules", ".git", "dist", "build", "out", ".next", "coverage", "vendor"]);
const isTest = (p: string) => /(^|\/)(__tests__|tests?|e2e)\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p) || /\.d\.ts$/.test(p) || /\.min\.js$/.test(p);
const EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs)$/;

function* walk(root: string, d = ""): Generator<string> {
  for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
    if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
    const r = path.join(d, e.name);
    if (e.isDirectory()) yield* walk(root, r); else if (EXT.test(e.name) && !isTest(r)) yield r;
  }
}
const lineOf = (sf: ts.SourceFile, pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;
function declName(n: ts.Node): string | undefined {
  if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isEnumDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isMethodDeclaration(n) || ts.isPropertyAssignment(n) || ts.isPropertyDeclaration(n)) && n.name && ts.isIdentifier(n.name)) return n.name.text;
  if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) return n.name.text;
  return undefined;
}
const isFnLike = (n: ts.Node) => ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n);
/** innermost named enclosing declaration chain for a position */
function enclosingNamed(sf: ts.SourceFile, pos: number): { node: ts.Node; name: string; fn?: ts.Node }[] {
  const chain: { node: ts.Node; name: string }[] = [];
  const visit = (n: ts.Node) => {
    if (pos < n.getStart(sf) || pos >= n.getEnd()) return;
    const nm = declName(n);
    if (nm) chain.push({ node: n, name: nm });
    else if (isFnLike(n)) chain.push({ node: n, name: "<anonymous fn>" });
    n.forEachChild(visit);
  };
  sf.forEachChild(visit);
  return chain;
}
function parse(root: string, p: string): ts.SourceFile | undefined {
  try { const txt = fs.readFileSync(path.join(root, p), "utf8"); if (txt.length > 800_000) return; return ts.createSourceFile(p, txt, ts.ScriptTarget.Latest, true, p.endsWith("x") ? ts.ScriptKind.TSX : undefined); } catch { return; }
}
function siteSpan(sf: ts.SourceFile, pos: number): { fn: string; span: [number, number] } {
  const ch = enclosingNamed(sf, pos);
  // prefer innermost function-like with a name (or its variable), else innermost named decl, else the line
  for (let i = ch.length - 1; i >= 0; i--) {
    const n = ch[i].node;
    if (isFnLike(n) || (ts.isVariableDeclaration(n) && n.initializer && isFnLike(n.initializer)) || ts.isPropertyAssignment(n) && isFnLike(n.initializer)) {
      let name = ch[i].name; if (name === "<anonymous fn>") { const named = [...ch.slice(0, i)].reverse().find((c) => c.name !== "<anonymous fn>"); name = (named?.name ?? "<module>") + ".<fn>"; }
      return { fn: name, span: [lineOf(sf, n.getStart(sf)), lineOf(sf, n.getEnd())] };
    }
  }
  const last = ch[ch.length - 1];
  if (last) return { fn: last.name, span: [lineOf(sf, last.node.getStart(sf)), lineOf(sf, last.node.getEnd())] };
  const l = lineOf(sf, pos); return { fn: "<module>", span: [l, l] };
}

export function tsConsumers(root: string, changed: Record<string, [number, number][]>, maxSites = 40) {
  const entities: Entity[] = []; const raw: Omit<Site, "function" | "span" | "callees">[] = [];
  const files = [...walk(root)]; const sfs = new Map<string, ts.SourceFile>();
  for (const p of files) { const sf = parse(root, p); if (sf) sfs.set(p, sf); }
  for (const [p, ranges] of Object.entries(changed)) {
    if (!EXT.test(p)) continue;
    const sf = sfs.get(p) ?? parse(root, p); if (!sf) continue;
    const lines = sf.getLineStarts();
    for (const [s, e] of ranges) for (let ln = s; ln <= e; ln++) {
      if (ln - 1 >= lines.length) continue;
      const lineText = sf.text.slice(lines[ln - 1], lines[ln] ?? sf.text.length);
      const firstNon = lineText.search(/\S/); if (firstNon < 0) continue;
      const ch = enclosingNamed(sf, lines[ln - 1] + firstNon).filter((c) => c.name !== "<anonymous fn>");
      // top-level-ish named decl (outermost) and innermost
      const outer = ch[0]; const inner = ch[ch.length - 1];
      if (!outer) { entities.push({ kind: "module_code_changed", name: "<module>", file: p, line: ln }); continue; }
      const kindOf = (n: ts.Node) => ts.isEnumDeclaration(n) ? "enum_changed" : ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n) ? "type_changed" : ts.isClassDeclaration(n) ? "class_changed" : ts.isVariableDeclaration(n) && n.initializer && !isFnLike(n.initializer) ? "value_changed" : "function_changed";
      entities.push({ kind: kindOf(outer.node), name: outer.name, file: p, line: ln, span: [lineOf(sf, outer.node.getStart(sf)), lineOf(sf, outer.node.getEnd())] });
      if (inner !== outer && (ts.isMethodDeclaration(inner.node) || (ts.isVariableDeclaration(inner.node) && inner.node.initializer && isFnLike(inner.node.initializer)) || ts.isFunctionDeclaration(inner.node)))
        entities.push({ kind: "function_changed", name: inner.name, file: p, line: ln, span: [lineOf(sf, inner.node.getStart(sf)), lineOf(sf, inner.node.getEnd())] });
    }
  }
  const seen = new Set<string>(); const ents = entities.filter((e) => { const k = e.kind + e.name + e.file; if (seen.has(k)) return false; seen.add(k); return true; });
  for (const e of ents) raw.push({ kind: "self", file: e.file, line: e.line, why: `changed code (${e.kind} ${e.name})`, entity: e });
  const byName = new Map(ents.filter((e) => e.name !== "<module>" && e.name.length > 2).map((e) => [e.name, e]));
  for (const [p, sf] of sfs) {
    const visit = (n: ts.Node) => {
      if (ts.isIdentifier(n) && byName.has(n.text)) {
        const e = byName.get(n.text)!; const parent = n.parent;
        const isDecl = parent && declName(parent) === n.text && (parent as any).name === n;
        const isImport = parent && (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isExportSpecifier(parent));
        if (!isDecl && !isImport && !(p === e.file && e.span && lineOf(sf, n.getStart(sf)) >= e.span[0] && lineOf(sf, n.getStart(sf)) <= e.span[1])) {
          const call = ts.isCallExpression(parent) && parent.expression === n || ts.isPropertyAccessExpression(parent) && parent.name === n && ts.isCallExpression(parent.parent) && parent.parent.expression === parent;
          const iter = ts.isCallExpression(parent) && /^Object\.(values|keys|entries)$/.test(parent.expression.getText(sf)) || ts.isForInStatement(parent) || ts.isForOfStatement(parent);
          const kind = e.kind === "function_changed" ? (call ? "calls_changed_function" : "references_changed_function") : e.kind === "enum_changed" ? (iter ? "iterates_enum" : "uses_changed_enum") : e.kind === "type_changed" ? "uses_changed_type" : e.kind === "value_changed" ? (iter ? "iterates_changed_value" : "uses_changed_value") : "uses_changed_class";
          raw.push({ kind, file: p, line: lineOf(sf, n.getStart(sf)), why: `${kind.replace(/_/g, " ")}: ${n.text} (changed in ${e.file}:${e.line})`, entity: e });
        }
      }
      n.forEachChild(visit);
    };
    sf.forEachChild(visit);
  }
  const order = ["self", "iterates_enum", "iterates_changed_value", "calls_changed_function", "uses_changed_value", "uses_changed_enum", "uses_changed_type", "references_changed_function", "uses_changed_class"];
  const byKind: Record<string, number> = {}; const out: Site[] = []; const dd = new Set<string>();
  for (const s of raw.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.file.localeCompare(b.file) || a.line - b.line)) {
    byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
    const sf = sfs.get(s.file)!; const { fn, span } = siteSpan(sf, sf.getLineStarts()[s.line - 1]);
    const k = `${s.file}|${fn}|${s.kind === "self"}`; if (dd.has(k)) continue; dd.add(k);
    out.push({ ...s, function: fn, span, callees: [] });
  }
  const kept = out.slice(0, maxSites);
  // one-hop callees defined in repo (same file preferred)
  const defs = new Map<string, { file: string; span: [number, number] }[]>();
  for (const [p, sf] of sfs) { const v = (n: ts.Node) => { const nm = declName(n); if (nm && (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || (ts.isVariableDeclaration(n) && n.initializer && isFnLike(n.initializer)))) { const a = defs.get(nm) ?? []; a.push({ file: p, span: [lineOf(sf, n.getStart(sf)), lineOf(sf, n.getEnd())] }); defs.set(nm, a); } n.forEachChild(v); }; sf.forEachChild(v); }
  for (const s of kept) {
    const sf = sfs.get(s.file)!; const cands: [number, string][] = [];
    const v = (n: ts.Node) => { if (ts.isCallExpression(n)) { const l = lineOf(sf, n.getStart(sf)); if (l >= s.span[0] && l <= s.span[1]) { const ex = n.expression; const nm = ts.isIdentifier(ex) ? ex.text : ts.isPropertyAccessExpression(ex) ? ex.name.text : undefined; const d = nm ? defs.get(nm) : undefined; if (nm && d && nm !== s.function && (d.length <= 3 || d.some((x) => x.file === s.file))) cands.push([Math.abs(l - s.line), nm]); } } n.forEachChild(v); };
    sf.forEachChild(v);
    const names = [...new Set(cands.sort((a, b) => a[0] - b[0]).map((c) => c[1]))].slice(0, 3);
    s.callees = names.map((nm) => { const d = defs.get(nm)!; const x = d.find((y) => y.file === s.file) ?? d[0]; return { name: nm, file: x.file, span: x.span }; });
  }
  return { entities: ents, sites: kept, coverage: { ts_files_parsed: sfs.size, ts_files_total: files.length, sites_found: out.length, sites_kept: kept.length, max_sites: maxSites, by_kind: byKind, method: "TypeScript compiler API AST: changed line -> enclosing declaration (function/enum/type/class/value) -> references by identifier across repo (imports excluded), enum/value iteration, callers; one-hop callees; not type-checked" } };
}
