#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-https://token-derby.mauricode.co.uk/api}"
echo "Base URL: $BASE"

# Handle macOS (BSD date) vs Linux (GNU date) for relative times
if date -u -v-1M >/dev/null 2>&1; then
  START=$(date -u -v-1M +%Y-%m-%dT%H:%M:%SZ)
  END=$(date -u -v+1H +%Y-%m-%dT%H:%M:%SZ)
else
  START=$(date -u -d '1 minute ago' +%Y-%m-%dT%H:%M:%SZ)
  END=$(date -u -d '1 hour' +%Y-%m-%dT%H:%M:%SZ)
fi

echo
echo "── 1. Create race ──"
RACE=$(curl -sX POST "$BASE/races" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Smoke Test\",\"start_time\":\"$START\",\"end_time\":\"$END\",\"tz\":\"Europe/London\"}")
echo "$RACE" | jq .
JOIN=$(echo "$RACE" | jq -r .join_code)
ADMIN=$(echo "$RACE" | jq -r .admin_code)

echo
echo "── 2. Join race ($JOIN) ──"
HORSE=$(curl -sX POST "$BASE/races/$JOIN/join" \
  -H 'content-type: application/json' \
  -d '{"horse":{"name":"SmokeHorse","colors":{"body":"#8B4513","mane":"#000","tail":"#000","saddle":"#C0392B"}}}')
echo "$HORSE" | jq .
HORSE_ID=$(echo "$HORSE" | jq -r .horse_id)
HB_TOKEN=$(echo "$HORSE" | jq -r .heartbeat_token)

echo
echo "── 3. Heartbeat ──"
curl -sX POST "$BASE/races/$JOIN/horses/$HORSE_ID/heartbeat" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $HB_TOKEN" \
  -d '{"current_tokens":1500}' | jq .

echo
echo "── 4. Read race state ──"
curl -s "$BASE/races/$JOIN" | jq '{status, horses: .horses | map({name, rank, current_tokens, crashed})}'

echo
echo "── 5. End race ──"
curl -sX DELETE "$BASE/races/admin/$ADMIN" | jq .

echo
echo "── 6. Confirm finished + final_tokens ──"
curl -s "$BASE/races/$JOIN" | jq '{status, horses: .horses | map({name, final_tokens})}'

echo
echo "✓ Smoke test complete"
