#!/usr/bin/env python3
"""Deterministic consumer finder for Python (stdlib ast only; name/attribute resolution, not type inference).
stdin JSON: {root, changed: {relpath: [[start,end],...]} (head-side line ranges), max_sites}
stdout JSON: {entities, sites, coverage}"""
import ast, json, os, sys

SKIP_DIRS = {"node_modules", ".git", "dist", "build", "venv", ".venv", "__pycache__", "site-packages", "vendor"}
def is_test(p): b = os.path.basename(p); return "/tests/" in "/" + p or b.startswith("test_") or b.endswith("_test.py") or "/test/" in "/" + p

def walk_py(root):
    for d, ds, fs in os.walk(root):
        ds[:] = [x for x in ds if x not in SKIP_DIRS and not x.startswith(".")]
        for f in fs:
            if f.endswith(".py"):
                p = os.path.relpath(os.path.join(d, f), root)
                if not is_test(p): yield p

def parse(root, p):
    try:
        src = open(os.path.join(root, p), encoding="utf8", errors="replace").read()
        return ast.parse(src), src.splitlines()
    except Exception:
        return None, None

def scopes(tree):
    """list of (node, qualname) for defs/classes with parent chain"""
    out = []
    def rec(n, prefix):
        for c in ast.iter_child_nodes(n):
            if isinstance(c, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                q = prefix + c.name
                out.append((c, q)); rec(c, q + ".")
            else:
                rec(c, prefix)
    rec(tree, ""); return out

def enclosing(sc, line):
    best = None
    for n, q in sc:
        if n.lineno <= line <= n.end_lineno and (best is None or n.lineno >= best[0].lineno): best = (n, q)
    return best

def is_enumlike(cls):
    names = [getattr(b, "id", getattr(b, "attr", "")) for b in cls.bases]
    return any("Enum" in x or x in ("str",) and len(cls.bases) > 1 for x in names)

def main():
    a = json.load(sys.stdin); root = a["root"]; max_sites = a.get("max_sites", 40)
    entities, sites = [], []
    def add_site(kind, file, line, why, ent):
        sites.append(dict(kind=kind, file=file, line=line, why=why, entity=ent))
    # 1. entities from changed lines
    for p, ranges in a["changed"].items():
        if not p.endswith(".py"): continue
        tree, lines = parse(root, p)
        if tree is None: continue
        sc = scopes(tree)
        for (s, e) in ranges:
            for ln in range(s, e + 1):
                enc = enclosing(sc, ln)
                if enc and isinstance(enc[0], ast.ClassDef) and is_enumlike(enc[0]):
                    for st in enc[0].body:
                        if isinstance(st, ast.Assign) and st.lineno == ln and isinstance(st.targets[0], ast.Name):
                            entities.append(dict(kind="enum_member_added", cls=enc[0].name, member=st.targets[0].id, value=(st.value.value if isinstance(st.value, ast.Constant) else None), file=p, line=ln))
                elif enc and isinstance(enc[0], (ast.FunctionDef, ast.AsyncFunctionDef)):
                    entities.append(dict(kind="function_changed", name=enc[0].name, qual=enc[1], file=p, line=ln, span=[enc[0].lineno, enc[0].end_lineno]))
                elif enc and isinstance(enc[0], ast.ClassDef):
                    entities.append(dict(kind="class_changed", name=enc[0].name, file=p, line=ln, span=[enc[0].lineno, enc[0].end_lineno]))
                else:
                    for st in tree.body:
                        if isinstance(st, (ast.Assign, ast.AnnAssign)) and st.lineno <= ln <= st.end_lineno:
                            t = st.targets[0] if isinstance(st, ast.Assign) else st.target
                            if isinstance(t, ast.Name): entities.append(dict(kind="module_value_changed", name=t.id, file=p, line=ln))
    # dedupe entities
    seen, ents = set(), []
    for x in entities:
        k = (x["kind"], x.get("name") or x.get("member"), x.get("cls"), x["file"])
        if k in seen: continue
        seen.add(k); ents.append(x)
    entities = ents
    for x in entities: add_site("self", x["file"], x["line"], f"changed code ({x['kind']})", x)
    enum_classes = {x["cls"]: x for x in entities if x["kind"] == "enum_member_added"}
    added = {}
    for x in entities:
        if x["kind"] == "enum_member_added": added.setdefault(x["cls"], []).append(f"{x['cls']}.{x['member']}" + (f"={x['value']!r}" if x.get("value") is not None else ""))
    def delta(cls, where):
        return f" BEHAVIOUR DELTA (deterministic): this PR adds {', '.join(added[cls])}. Before the PR these members were absent from {where}, so lookups/membership tests/loops for them found nothing (e.g. .get() returned None and guarded branches were skipped); after the PR, code here now RUNS for those inputs."
    values = {x["name"]: x for x in entities if x["kind"] == "module_value_changed"}
    funcs = {x["name"]: x for x in entities if x["kind"] in ("function_changed",)}
    classes = {x["name"]: x for x in entities if x["kind"] == "class_changed"}
    files = list(walk_py(root)); parsed = 0
    derived = {}  # name -> (origin entity, file, line)
    trees = {}
    for p in files:
        tree, lines = parse(root, p)
        if tree is None: continue
        parsed += 1; trees[p] = tree
        # enum iteration / derived containers
        for n in ast.walk(tree):
            it = None
            if isinstance(n, (ast.For, ast.comprehension)): it = n.iter
            elif isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in ("list", "set", "tuple", "frozenset", "sorted", "dict") and n.args: it = n.args[0]
            elif isinstance(n, ast.Attribute) and n.attr in ("__members__", "_value2member_map_", "_member_map_"): it = n.value
            if it is not None and isinstance(it, ast.Name) and it.id in enum_classes:
                add_site("iterates_enum", p, getattr(n, "lineno", getattr(it, "lineno", 0)), f"iterates over every {it.id} member (now includes the added members)." + delta(it.id, "this iteration"), enum_classes[it.id])
        for st in ast.walk(tree):
            if isinstance(st, (ast.Assign, ast.AnnAssign)):
                t = st.targets[0] if isinstance(st, ast.Assign) else st.target
                if isinstance(t, ast.Name) and st.value is not None:
                    for n in ast.walk(st.value):
                        if isinstance(n, ast.comprehension) and isinstance(n.iter, ast.Name) and n.iter.id in enum_classes:
                            derived[t.id] = (enum_classes[n.iter.id], p, st.lineno)
                        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in ("list","set","tuple","frozenset") and n.args and isinstance(n.args[0], ast.Name) and n.args[0].id in enum_classes:
                            derived[t.id] = (enum_classes[n.args[0].id], p, st.lineno)
    for p, tree in trees.items():
        for n in ast.walk(tree):
            if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load):
                if n.id in derived:
                    add_site("uses_derived_container", p, n.lineno, f"reads {n.id}, which is built by iterating {derived[n.id][0]['cls']} ({derived[n.id][1]}:{derived[n.id][2]})." + delta(derived[n.id][0]['cls'], n.id), derived[n.id][0])
                if n.id in values and not (p == values[n.id]["file"] and n.lineno == values[n.id]["line"]):
                    add_site("uses_changed_value", p, n.lineno, f"reads module value {n.id} changed by the PR", values[n.id])
                if n.id in classes and p != classes[n.id]["file"]:
                    add_site("uses_changed_class", p, n.lineno, f"uses class {n.id} changed by the PR", classes[n.id])
            if isinstance(n, ast.Call):
                fn = n.func.id if isinstance(n.func, ast.Name) else n.func.attr if isinstance(n.func, ast.Attribute) else None
                if fn in funcs:
                    add_site("calls_changed_function", p, n.lineno, f"calls {fn}() whose body the PR changed", funcs[fn])
            if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and n.value.id in enum_classes:
                # dispatch on sibling members (compares / match / dict keys) — sibling = defined within 6 lines of an added member
                pass
    # rank: self, iterates_enum, uses_derived_container, uses_changed_value, calls_changed_function, uses_changed_class
    order = ["self", "iterates_enum", "uses_derived_container", "uses_changed_value", "calls_changed_function", "uses_changed_class"]
    # dedupe by (file, enclosing function)
    out, seen = [], set()
    total_by_kind = {}
    for s in sorted(sites, key=lambda s: (order.index(s["kind"]), s["file"], s["line"])):
        total_by_kind[s["kind"]] = total_by_kind.get(s["kind"], 0) + 1
        tree = trees.get(s["file"]) or parse(root, s["file"])[0]
        enc = enclosing(scopes(tree), s["line"]) if tree else None
        if enc and isinstance(enc[0], ast.ClassDef) and s["kind"] != "self": span = [s["line"], s["line"]]; fn = enc[1]
        elif enc: span = [enc[0].lineno, enc[0].end_lineno]; fn = enc[1]
        else: span = [s["line"], s["line"]]; fn = "<module>"
        k = (s["file"], fn, s["kind"] == "self")
        if k in seen: continue
        seen.add(k); s["function"] = fn; s["span"] = span; out.append(s)
    kept = out[:max_sites]
    # one-hop callees defined in repo, for kept sites
    defs = {}
    for p, tree in trees.items():
        for n, q in scopes(tree):
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)): defs.setdefault(n.name, []).append((p, n.lineno, n.end_lineno))
    for s in kept:
        tree = trees.get(s["file"])
        cal = []
        if tree:
            for n in ast.walk(tree):
                if isinstance(n, ast.Call) and s["span"][0] <= n.lineno <= s["span"][1]:
                    fn = n.func.id if isinstance(n.func, ast.Name) else n.func.attr if isinstance(n.func, ast.Attribute) else None
                    if fn and fn in defs and (len(defs[fn]) <= 3 or any(d[0] == s["file"] for d in defs[fn])) and fn != s["function"].split(".")[-1] and not fn.startswith("__"):
                        cal.append((abs(n.lineno - s["line"]), fn))
        cal.sort(); names = []
        for _, fn in cal:
            if fn not in names: names.append(fn)
        s["callees"] = [dict(name=fn, file=d[0], span=[d[1], d[2]]) for fn in names[:3] for d in ([x for x in defs[fn] if x[0] == s["file"]] or defs[fn])[:1]]
        # second hop: polymorphic dispatch inside the first callee (obj.method(...) with several in-repo implementations)
        hop2 = []
        for c in s["callees"][:2]:
            t2 = trees.get(c["file"])
            if not t2: continue
            for n in ast.walk(t2):
                if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and c["span"][0] <= n.lineno <= c["span"][1]:
                    m = n.func.attr
                    if m in defs and 2 <= len(defs[m]) <= 6 and not m.startswith("_"):
                        for d in defs[m]:
                            if (d[0], d[1]) != (c["file"], c["span"][0]) and len(hop2) < 4: hop2.append(dict(name=m, file=d[0], span=[d[1], d[2]], via=c["name"], hop=2))
        seen2 = set(); s["callees"] += [h for h in hop2 if not ((h["file"], h["span"][0]) in seen2 or seen2.add((h["file"], h["span"][0])))]
    json.dump(dict(entities=entities, sites=kept, coverage=dict(py_files_parsed=parsed, py_files_total=len(files), sites_found=len(out), sites_kept=len(kept), max_sites=max_sites, by_kind=total_by_kind, derived_containers={k: f"{v[1]}:{v[2]}" for k, v in derived.items()}, method="python stdlib ast: changed-line -> entity (enum member / function / module value / class); consumers by name+attribute resolution, enum-iteration and containers derived from it, callers by call name; not type-inferred")), sys.stdout)
main()
