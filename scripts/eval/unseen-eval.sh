#!/usr/bin/env bash
# Frozen runner for docs/unseen-eval-rule.md. Usage: unseen-eval.sh <A|B-nemotron|B-anthropic> <out_base>
# Same configs/flags as scripts/eval/locate-eval.sh. Repo = fix-PR base sha checkout; transcript = eval/unseen/transcripts/uNN.jsonl.
set -u
C=$1; OUT=$2; B=/workspace/open-agent/unseen-eval/bundle
case $C in
  A) flags=(--provider nemotron --no-locate-model);;
  B-nemotron) flags=(--provider nemotron --locate-provider nemotron);;
  B-anthropic) flags=(--provider anthropic --locate-provider anthropic);;
  *) echo bad config; exit 2;;
esac
for c in u01 u02 u03 u04 u05 u06 u07 u08; do
  out=$OUT/$C/$c; mkdir -p $out
  node scripts/eval/report-to-error.mjs eval/unseen/$c/error.txt $c > $out/error.json
  timeout 900 npx tsx src/bin/explain-why.ts --error $out/error.json --transcript eval/unseen/transcripts/$c.jsonl --repo $B/$c/src --out $out "${flags[@]}" > $out/stdout.txt 2> $out/stderr.txt
  echo "$c exit=$? $(head -2 $out/stdout.txt | tr '\n' ' ')"
done
