#!/usr/bin/env bash
# Spin up the derbymarket board against a live production race, without
# deploying. Prices locally (read-only against prod DynamoDB) because
# /api/races/:code/markets does not exist in the deployed API yet.
#
#   ./scripts/derbymarket-live.sh LSRNA7          full build + serve + open
#   ./scripts/derbymarket-live.sh LSRNA7 --data   re-price only (server keeps running)
set -euo pipefail

JOIN_CODE="${1:?usage: derbymarket-live.sh <JOIN_CODE> [--data]}"
PORT=4173
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export AWS_PROFILE="${AWS_PROFILE:-personal}"
export AWS_REGION="${AWS_REGION:-eu-west-2}"
export TABLE_NAME="${TABLE_NAME:-token-derby}"

price() { npx tsx api/scripts/preview-live-market.ts "$JOIN_CODE"; }

if [ "${2:-}" = "--data" ]; then
  price
  echo "reload http://localhost:$PORT/preview-live"
  exit 0
fi

npm -w site run build >/dev/null
npx esbuild site/src/preview-live.ts --bundle --format=esm --target=es2022 \
  --outfile=site/dist/preview-live.js >/dev/null
price

npx serve site/dist -l "$PORT" --no-clipboard >/dev/null 2>&1 &
until curl -sf -o /dev/null "http://localhost:$PORT/preview-live"; do sleep 0.3; done
open "http://localhost:$PORT/preview-live"
echo "serving on $PORT (pid $!) — ctrl-c to stop; add ?row=N to deep-link a chart"
wait
