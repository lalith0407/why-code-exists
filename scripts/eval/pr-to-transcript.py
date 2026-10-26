#!/usr/bin/env python3
"""Generic PR -> session-transcript adapter (docs/unseen-eval-rule.md). No per-case logic.
usage: pr-to-transcript.py <pr.json> <pr.diff> > transcript.jsonl
Line 1: the user's request is unknown, so a fixed neutral user line. Line 2: assistant message = PR title + body.
Then one `apply_patch` tool message per file in the diff, carrying that file's unified diff (as an edit tool's result)."""
import json, re, sys
pr = json.load(open(sys.argv[1])); diff = open(sys.argv[2], errors="replace").read()
out = [{"role": "user", "text": "(PR-derived transcript: the original request is not public.)"},
       {"role": "assistant", "text": f"{pr.get('title','')}\n\n{pr.get('body') or ''}"}]
for block in re.split(r"(?m)^(?=diff --git )", diff):
    m = re.match(r"diff --git a/(\S+) b/(\S+)", block)
    if not m or "\n@@ " not in block: continue  # binary / rename-only / no hunks
    path = m.group(2); body = block[block.index("\n@@ ") + 1:]
    out.append({"role": "tool", "tool_name": "apply_patch", "tool_args": {"path": path},
                "tool_result": f"--- a/{path}\n+++ b/{path}\n{body}"})
for o in out: print(json.dumps(o))
