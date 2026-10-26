#!/usr/bin/env bash
# Run the dev set (no held-out cases) once each on the engine in $ENGINE (default: this checkout), in parallel (per-run harness dirs).
# usage: scripts/dev-suite.sh <out-dir> [case ...]   Measurement criteria: docs/proof-rate-criteria.md
set -uo pipefail
ENGINE=${ENGINE:-$(cd "$(dirname "$0")/.." && pwd)}
CASES_DIR=$(cd "$(dirname "$0")/.." && pwd)/cases
OUT=$(realpath -m "$1"); shift
T=/workspace/cloud-agent-transcripts
PB=$T/bc-25dab342-ff3b-5916-ae3f-7b0214f24784.jsonl
TA=$T/bc-a98b50df-6392-5e8e-b2f6-d2a0d4998e28.jsonl
PF=$T/bc-cfc1fe44-a598-5ad2-9c23-b2ad05242a85.jsonl
BR=$T/bc-fe0ae5aa-6c3d-5e50-8936-0ce4a7b28bdc.jsonl
ALL="pulseboard-invite pulseboard-ssrf pulseboard-slack-retry heldout-vote-race heldout-slack-multiline heldout-xirr-short heldout2-webhook-block heldout2-webhook-case heldout2-drawdown-penny heldout3-plan-injection heldout3-retype-unique heldout3-schema-target heldout4-swing-batch heldout4-stop-minhold heldout4-caps-unknown"
CASES=${*:-$ALL}
mkdir -p "$OUT"
for c in $CASES; do
  case $c in
    pulseboard-*|heldout-vote-race|heldout-slack-multiline|heldout2-webhook-*) a=(--transcript $PB) ;;
    heldout-xirr-short|heldout2-drawdown-penny|heldout4-*|heldout5-*) a=(--transcript $TA --repo /workspace/trading-agent-system) ;;
    heldout6-*) a=(--transcript $PF) ;;
    heldout3-*) a=(--transcript $BR --repo /workspace/open-agent/heldout3-src/blast-radius-hardened) ;;
  esac
  ( cd "$ENGINE" && npx tsx src/bin/investigate.ts --error "$CASES_DIR/$c/error.json" "${a[@]}" --out "$OUT/$c" > "$OUT/$c.log" 2>&1; echo "exit $?" >> "$OUT/$c.log" ) &
  sleep 2
done
wait
for c in $CASES; do printf '%-28s %s\n' "$c" "$(grep -m1 '^verdict:' "$OUT/$c.log" || tail -1 "$OUT/$c.log")"; done
