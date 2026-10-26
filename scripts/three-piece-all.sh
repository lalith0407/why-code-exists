#!/usr/bin/env bash
# Run the deterministic three-piece explanation on every held-out case. usage: scripts/three-piece-all.sh <out-dir>
set -uo pipefail
R=$(cd "$(dirname "$0")/.." && pwd); OUT=$(realpath -m "${1:-$R/artifacts/three-piece}"); mkdir -p "$OUT"
T=/workspace/cloud-agent-transcripts
for c in $(ls "$R/cases" | grep '^heldout'); do
  rp=()
  case $c in
    heldout-vote-race|heldout-slack-multiline|heldout2-webhook-*) tr=$T/bc-25dab342-ff3b-5916-ae3f-7b0214f24784.jsonl ;;
    heldout-xirr-short|heldout2-drawdown-penny|heldout4-*|heldout5-*) tr=$T/bc-a98b50df-6392-5e8e-b2f6-d2a0d4998e28.jsonl; rp=(--repo /workspace/trading-agent-system) ;;
    heldout6-*) tr=$T/bc-cfc1fe44-a598-5ad2-9c23-b2ad05242a85.jsonl ;;
    heldout3-*) tr=$T/bc-fe0ae5aa-6c3d-5e50-8936-0ce4a7b28bdc.jsonl; rp=(--repo /workspace/open-agent/heldout3-src/blast-radius-hardened) ;;
  esac
  (cd "$R" && npx tsx src/bin/three-piece.ts --error cases/$c/error.json --transcript $tr "${rp[@]}" > "$OUT/$c.json" 2> "$OUT/$c.err")
  python3 -c "import json,sys;r=json.load(open('$OUT/$c.json'));g=lambda k:('ok' if r.get(k) and r[k]['valid'] else ('INVALID' if r.get(k) else 'missing'));print(f\"{'$c':28} asked={g('asked'):8} understood={g('understood'):8} happened={g('happened'):8} complete={r['complete']}\", '|', '; '.join(r['notes'])[:140])"
done
