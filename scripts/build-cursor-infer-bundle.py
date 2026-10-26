#!/usr/bin/env python3
"""Deterministic bundle builder for docs/cursor-infer-rule.md. No model calls.
usage: python3 scripts/build-cursor-infer-bundle.py   -> /workspace/open-agent/cursor-infer/{bundle,ground-truth,leak-log.md}"""
import json, os, re, shutil, subprocess, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = "/workspace/open-agent/cursor-infer"; B = f"{OUT}/bundle"; GT = f"{OUT}/ground-truth"
T = "/workspace/cloud-agent-transcripts"
TR = {"pulse": f"{T}/bc-25dab342-ff3b-5916-ae3f-7b0214f24784.jsonl", "trade": f"{T}/bc-a98b50df-6392-5e8e-b2f6-d2a0d4998e28.jsonl",
      "port": f"{T}/bc-cfc1fe44-a598-5ad2-9c23-b2ad05242a85.jsonl", "blast": f"{T}/bc-fe0ae5aa-6c3d-5e50-8936-0ce4a7b28bdc.jsonl"}
REPO = {"trade": "/workspace/trading-agent-system", "blast": "/workspace/open-agent/heldout3-src/blast-radius-hardened"}
def app(c):
    if c.startswith(("heldout-vote", "heldout-slack", "heldout2-webhook")): return "pulse"
    if c.startswith("heldout6"): return "port"
    if c.startswith("heldout3"): return "blast"
    return "trade"
# error.txt: observed values only. Diagnosis, our interpretation, reporter-named frames and code identifiers removed (see leak-log.md).
# Same policy for all cases; the two real exceptions keep message + frames verbatim.
ERR = {
 "heldout-slack-multiline": 'A Slack message starting with "/pulse feedback" did not create feedback.\nSlack event log: event received (HTTP 200), createdFeedbackId = null, text "/pulse feedback Export is slow\\nIt takes 2 minutes for 10k rows".',
 "heldout-xirr-short": 'Memo shows IRR as n/a. PerformanceReport.irr is None for a 10-calendar-day backtest (start equity 100000.00, end equity 106000.00, no contributions).\nCash flows: [["2024-01-02",-100000],["2024-01-12",106000]].',
 "heldout2-drawdown-penny": "Drawdown is -30.0% from peak (halt threshold -20%). A new buy of FALN at $2.10 passed the guard and filled.\nGuard notes: []",
 "heldout2-webhook-block": "'Submit feedback' spins for ~5 seconds whenever the workspace's webhook receiver is slow.\nMeasured submit latency: 5036 ms (result {\"success\":true}) with a webhook endpoint that answers after 8s.",
 "heldout2-webhook-case": "Zapier: webhook returns 404 'hook not found'.\nURL saved by the admin in workspace settings: https://hooks.zapier.com/hooks/catch/1234567/AbCdEfG/\nURL that deliveries are sent to: https://hooks.zapier.com/hooks/catch/1234567/abcdefg/",
 "heldout3-plan-injection": "For an agent's DROP TABLE of a quoted table name, the guard classified the action as drop_table and built a safe plan whose step 1 (signed, run with no conditions) is:\nDELETE FROM _deprecations WHERE target = 'tmp_import'; DROP TABLE customers; --'; INSERT INTO _deprecations VALUES('tmp_import'; DROP TABLE customers; --', 1792900319, 'via blast-radius')\nRunning that step executes DROP TABLE customers.",
 "heldout3-retype-unique": "After the guard ran a signed 'ALTER TABLE customers ALTER COLUMN tier SET DATA TYPE BIGINT' on the SQLite backend: indexes on customers = []; inserting a second row with the same email was accepted (2 rows for ana@example.com). Before, customers had a unique index on email.",
 "heldout3-schema-target": "Action 'ALTER TABLE archive.orders DROP COLUMN legacy_discount' was planned as drop_column on table orders (target orders.legacy_discount). The readers gathered are those of the production orders table, and the safe plan's backfill step runs ALTER/UPDATE on orders, not archive.orders.",
 "heldout4-caps-unknown": 'Cap check asked for a 95% weight in ZZZZ returned ok=true with weights {"ZZZZ":0.95} and violations []. The single-name cap is 0.15.',
 "heldout4-stop-minhold": "AAA is down -30% from average cost. The order builder emitted a full stop-loss sell (reason 'stop'), but the order never filled.\nGuard notes: [\"min hold blocked sell of AAA\"]",
 "heldout4-swing-batch": "Quarter swing-trade cap is 2; 1 swing exit already used. In one session the guard let through 3 full exits of positions held less than the swing-hold period; the quarter ends with 4 swing trades.\nGuard notes: []",
 "heldout5-citation-leaf": 'The citation check kept a fact claim citing weights.AAPL in a portfolio.size_position output whose weights are {"MSFT":0.05}. Claims kept: 1 of 1.',
 "heldout6-outcome-keys": None,  # real React console error: message kept, our lead-in removed
}
REAL_TRACE = {"heldout-vote-race", "heldout5-macro-leapday"}
SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "var", "tmp_test_dir", ".hypothesis", ".pytest_cache", "__pycache__", ".next", "dist", "build", ".turbo", "coverage"}
SKIP_FILE = re.compile(r"(^\.env|\.env\.|\.pem$|\.key$|\.sqlite3?$|\.db$|\.duckdb$|\.parquet$|\.csv$|\.jsonl$|\.log$|\.pkl$|\.zip$|\.tar|\.gz$)", re.I)
SECRET = re.compile(r"(sk-[A-Za-z0-9_\-]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9\-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AIza[0-9A-Za-z_\-]{35})")
BROAD = re.compile(r"(api[_-]?key|secret|password|token)\s*[=:]\s*['\"]?[A-Za-z0-9_\-]{16,}", re.I)
log = []; secrets = {}; excluded = []; tr_redacted = {}; src_redacted = {}
REDACT_KEEP = {"lib/actions/workspace-settings.ts"}
def copytree(src, dst):
    skipped = 0
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if SKIP_FILE.search(f) or os.path.getsize(os.path.join(root, f)) > 2_000_000: skipped += 1; continue
            rel = os.path.relpath(os.path.join(root, f), src); os.makedirs(os.path.dirname(os.path.join(dst, rel)), exist_ok=True)
            shutil.copy2(os.path.join(root, f), os.path.join(dst, rel))
    return skipped
def scrub_secrets(path, case):
    for root, _, files in os.walk(path):
        for f in files:
            p = os.path.join(root, f)
            try: s = open(p, encoding="utf-8").read()
            except Exception: continue
            rel = os.path.relpath(p, B)
            if "/src/" in p and BROAD.search(s):
                if rel.split("/src/", 1)[1] in REDACT_KEEP:   # v3: keep file, replace only the secret values
                    k = len(BROAD.findall(s)); s = BROAD.sub(lambda m: m.group(0)[: m.end(1) - m.start(0)] + m.group(0)[m.end(1) - m.start(0):][: len(m.group(0)) - m.end(1) + m.start(0) - len(re.search(r"[A-Za-z0-9_\-]{16,}$", m.group(0)).group(0))] + "[REDACTED-SECRET]", s)
                    open(p, "w").write(s); src_redacted[rel] = k
                else: os.remove(p); excluded.append(rel); continue   # hard-coded secret: file excluded entirely
            if f == "transcript.txt" and BROAD.search(s):
                k = len(BROAD.findall(s)); s = BROAD.sub(lambda m: m.group(1) + ": [REDACTED-SECRET]", s); open(p, "w").write(s); tr_redacted[rel] = k
            n = len(SECRET.findall(s))
            if n: open(p, "w").write(SECRET.sub("[REDACTED-SECRET]", s)); secrets[f"{case}:{os.path.relpath(p, B)}"] = n
def transcript_txt(src, dst, cap=20000):
    with open(dst, "w") as o:
        for i, line in enumerate(open(src), 1):
            try: m = json.loads(line)
            except Exception: o.write(f"L{i} [unparsed]\n"); continue
            parts = []
            if m.get("thinking"): parts.append("THINKING: " + m["thinking"])
            if m.get("text"): parts.append(m["text"])
            for tc in m.get("tool_calls") or []: parts.append(f"TOOL_CALL {tc.get('tool_name')}: " + json.dumps(tc.get("tool_args"), ensure_ascii=False))
            if "tool_result" in m: parts.append(f"TOOL_RESULT {m.get('tool_name')}: " + json.dumps(m["tool_result"], ensure_ascii=False))
            body = "\n".join(parts)
            if len(body) > cap: body = body[:cap] + f"\n[... truncated {len(body)-cap} chars ...]"
            o.write(f"L{i} [{m.get('role','?')}] " + body.replace("\n", f"\nL{i}| ") + "\n")
cases = sorted(c for c in os.listdir(f"{R}/cases") if c.startswith("heldout"))
assert len(cases) == 15
shutil.rmtree(B, ignore_errors=True); shutil.rmtree(GT, ignore_errors=True); os.makedirs(B); os.makedirs(GT)
trees = {}
for a in ("pulse", "port"):
    d = f"{OUT}/.tree-{a}"; shutil.rmtree(d, ignore_errors=True)
    subprocess.run(["npx", "tsx", f"{R}/scratch/tree.mts", TR[a], d], cwd=R, check=True, capture_output=True); trees[a] = d
trees.update(REPO)
mapping = {}
for n, c in enumerate(cases, 1):
    cid = f"case{n:02d}"; mapping[cid] = c; d = f"{B}/{cid}"; os.makedirs(d); a = app(c)
    e = json.load(open(f"{R}/cases/{c}/error.json"))
    if c in REAL_TRACE:
        txt = e["message"] + "\n" + "\n".join(f"    at {f.get('function','?')} ({f['file']}:{f['line']})" for f in reversed(e["frames"]))
        note = "real exception: message and frames verbatim"
    elif c == "heldout6-outcome-keys":
        txt = e["message"][e["message"].index("Encountered"):]; txt = "React (browser dev build), rendering the Selected work section, 6 console errors:\n" + txt
        note = "lead-in with component name and our history note removed; React message verbatim; reporter-named frame dropped"
    else:
        txt = ERR[c]; note = "symptom report written by us: rewritten to observed values only; reporter-named frames dropped; code identifiers redacted"
    open(f"{d}/error.txt", "w").write(txt + "\n")
    log.append((cid, c, note, e["message"], txt))
    skipped = copytree(trees[a], f"{d}/src")
    transcript_txt(TR[a], f"{d}/transcript.txt")
    tp = json.load(open(f"{R}/artifacts/three-piece/{c}.json")); h = tp.get("happened") or {}
    L = re.findall(r"#L(\d+)", h.get("citation", ""))
    if L:
        loc = f"LOCATED BY TOOL (automatic, may be wrong)\nfile: {tp['frame']['file']}\nline: {tp['frame']['line']}\nwritten by transcript line: L{L[0]}\n"
    else:
        loc = "LOCATED BY TOOL (automatic): not located - the tool found no transcript edit that wrote the failing line.\n"
    open(f"{d}/located_by_tool.txt", "w").write(loc)
    scrub_secrets(d, cid)
    shutil.copy(f"{R}/cases/{c}/error.json", f"{GT}/{cid}.{c}.error.json"); shutil.copy(f"{R}/cases/{c}/scenario.json", f"{GT}/{cid}.{c}.scenario.json")
json.dump(mapping, open(f"{GT}/mapping.json", "w"), indent=1)
shutil.copy(f"{R}/docs/explanatory-grades.md", f"{GT}/explanatory-grades.md")
# ---- leak check: ground-truth words from scenario/ground-truth files ----
STOP = set("the a an of to and or in on for is was with that this from by as at be it not are has have no yes true false none null ok out def import return check record app lambda json".split())
def gt_terms(c):
    s = json.load(open(f"{R}/cases/{c}/scenario.json"))
    terms = set(w for w in re.split(r"[^A-Za-z]+", c.split("-", 1)[1]) if len(w) > 2)  # case-id words
    for m in re.findall(r'check\([^,]+,\s*"([^"]+)"\)', s.get("body", "")): terms.add(m)  # check descriptions
    grade = next((l for l in open(f"{R}/docs/explanatory-grades.md") if l.startswith(f"| {c} ")), "")
    for q in re.findall(r'"([^"]{6,})"', grade): terms.add(q)
    return sorted(terms)
hits = []
for cid, c in mapping.items():
    for t in gt_terms(c):
        for fn in ("error.txt", "located_by_tool.txt", "transcript.txt"):
            p = f"{B}/{cid}/{fn}"; k = len(re.findall(re.escape(t), open(p, errors="ignore").read(), re.I))
            if k: hits.append((cid, c, t, fn, k))
        r = subprocess.run(["rg", "-c", "-i", "-F", t, f"{B}/{cid}/src"], capture_output=True, text=True).stdout.strip().splitlines()
        if r: hits.append((cid, c, t, "src/", sum(int(x.rsplit(":", 1)[1]) for x in r)))
# our own artefacts / case names anywhere in the bundle
own = subprocess.run(["rg", "-l", "-i", r"heldout|why-code-exists|scenario\.json|capture-error|ground.truth|" + "|".join(re.escape(c) for c in cases), B], capture_output=True, text=True).stdout.split()
with open(f"{OUT}/leak-log.md", "w") as o:
    o.write("# Leak log (bundle builder)\n\n## error.txt rewrites (original is ground truth, not in bundle)\n")
    for cid, c, note, orig, new in log: o.write(f"\n### {cid} ({c})\n- policy: {note}\n- original:\n```\n{orig}\n```\n- in bundle:\n```\n{new}\n```\n")
    o.write("\n## Ground-truth term hits (case-id words, scenario check strings, grade quotes)\n| case | term | file | count |\n|---|---|---|---|\n")
    for h in hits: o.write(f"| {h[0]} | {h[2]} | {h[3]} | {h[4]} |\n")
    o.write(f"\n## Own-artefact / case-name matches in bundle: {len(own)} files\n" + "".join(f"- {x}\n" for x in own))
    o.write(f"\n## Secrets redacted (counts only, values never printed): {sum(secrets.values())} in {len(secrets)} files\n" + "".join(f"- {k}: {v}\n" for k, v in secrets.items()))
    o.write(f"\n## Files excluded for hard-coded secrets (broad scan): {len(excluded)}\n" + "".join(f"- {x}\n" for x in sorted(excluded)))
    o.write(f"\n## Source files kept with secret values redacted (v3): {sum(src_redacted.values())}\n" + "".join(f"- {k}: {v}\n" for k, v in sorted(src_redacted.items())))
    o.write(f"\n## Transcript lines redacted (broad scan; transcript kept): {sum(tr_redacted.values())}\n" + "".join(f"- {k}: {v}\n" for k, v in sorted(tr_redacted.items())))
# ---- two variants ----
for v in ("hint", "blind"):
    d = f"{OUT}/bundle-{v}"; shutil.rmtree(d, ignore_errors=True); shutil.copytree(B, f"{d}/bundle")
    if v == "blind":
        for cid in mapping: os.remove(f"{d}/bundle/{cid}/located_by_tool.txt")
    subprocess.run(["tar", "czf", f"{OUT}/bundle-{v}.tgz", "-C", d, "bundle"], check=True)
print(json.dumps({"src_redacted": src_redacted, "excluded": sorted(excluded), "transcript_redactions": tr_redacted}, indent=1))
print(json.dumps({"cases": mapping, "hits": len(hits), "own": own, "secrets": sum(secrets.values())}, indent=1))
