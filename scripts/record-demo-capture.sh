#!/usr/bin/env bash
# Capture demo CLI output for the 1–4 min Devpost video (no secrets).
# Narration: follow /workspace/open-agent/docs/demo-script.md while screen-recording this terminal.
# Flow (~3 min): VP → invite → compare (hero + SSRF beat) → prevent → optional ping.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/artifacts/demo-capture-$(date +%Y-%m-%d-%H%M%S).txt}"
mkdir -p "$(dirname "$OUT")"
cd "$ROOT"
{
  echo "=== why-code-exists demo capture $(date) PT ==="
  echo "VP: Stop fixing AI bugs twice — name the wrong assumption, prove it, teach the next agent."
  echo
  echo "=== npm test ==="
  npm test
  echo
  echo "=== zetaris:ping ==="
  npm run zetaris:ping
  echo
  echo "=== demo:invite ==="
  npm run demo:invite
  echo
  echo "=== demo:compare (hero + SSRF ablation) ==="
  npm run demo:compare
  echo
  echo "=== demo:prevent ==="
  npm run demo:prevent
  echo "=== end ==="
} 2>&1 | tee "$OUT"
echo "Wrote $OUT"
