#!/usr/bin/env bash
# Frozen eval runner for docs/explain-stage-eval-rule.md. Usage: explain-stage-eval.sh <nemotron|anthropic>
set -u
P=$1; X=/workspace/open-agent/cursor-infer/v4/x; T=/workspace/cloud-agent-transcripts
PB=$T/bc-25dab342-ff3b-5916-ae3f-7b0214f24784.jsonl; TA=$T/bc-a98b50df-6392-5e8e-b2f6-d2a0d4998e28.jsonl
PF=$T/bc-cfc1fe44-a598-5ad2-9c23-b2ad05242a85.jsonl; BR=$T/bc-fe0ae5aa-6c3d-5e50-8936-0ce4a7b28bdc.jsonl
for n in $(seq -w 1 15); do
  c=case$n
  case $n in 01|02|05|06) tr=$PB;; 03|04|10|11|12|13|14) tr=$TA;; 07|08|09) tr=$BR;; 15) tr=$PF;; esac
  out=artifacts/explain-stage/$P/$c; mkdir -p $out
  node scripts/eval/report-to-error.mjs $X/$c/error.txt $c > $out/error.json
  npx tsx src/bin/explain-why.ts --error $out/error.json --transcript $tr --repo $X/$c/src --out $out --provider $P > $out/stdout.txt 2> $out/stderr.txt
  echo "$c exit=$? $(head -1 $out/stdout.txt)"
done
