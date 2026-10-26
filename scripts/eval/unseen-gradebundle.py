#!/usr/bin/env python3
"""Build the grading bundle the frozen grade.py expects (dirs named case*, transcript.txt rendered with the same
transcript_txt() renderer as scripts/build-cursor-infer-bundle.py, src -> repo checkout), plus a fix-lines copy keyed
the same way. Plumbing only; written after the pre-fix runs when grade.py found 0 cases (its glob is case*)."""
import json, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
src = open(f"{ROOT}/scripts/build-cursor-infer-bundle.py").read()
ns = {"json": json}; exec(re.search(r"(?ms)^def transcript_txt.*?(?=^\S)", src).group(0), ns)
G = "/workspace/open-agent/unseen-eval/gradebundle"
fl = json.load(open(f"{ROOT}/eval/unseen-ground-truth/fix-lines-unseen.json")); out = {}
for c in [f"u0{i}" for i in range(1, 9)]:
    d = f"{G}/case_{c}"; os.makedirs(d, exist_ok=True)
    if not os.path.islink(f"{d}/src"): os.symlink(f"/workspace/open-agent/unseen-eval/repos/{c}", f"{d}/src")
    ns["transcript_txt"](f"{ROOT}/eval/unseen/transcripts/{c}.jsonl", f"{d}/transcript.txt")
    out[f"case_{c}"] = {"file": fl[c]["file"], "lines": fl[c]["lines"]}
json.dump(out, open(f"{G}/fix-lines-gradebundle.json", "w"), indent=1)
