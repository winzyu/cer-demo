#!/usr/bin/env bash
# Read-only field census of the Clean Earth device registry.
#
# Answers "what fields does a device document actually carry right now?" —
# specifically the merge/archive fields added after ../clean-earth-rovers-server
# was last synced, which exist only in live data.
#
# Reads DEVICE_API_BASE_URL and DEVICE_API_TOKEN from .env. The token is never
# printed, never passed on a command line, and never written to the recording.
# Raw bodies land in data/device-fields/<timestamp>/ (data/ is git-ignored).
set -euo pipefail

cd "$(dirname "$0")/.."

[ -f .env ] || { echo "no .env found" >&2; exit 1; }

# Pull just the two values we need; avoids sourcing the whole file.
BASE_URL="$(grep -E '^DEVICE_API_BASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')"
TOKEN="$(grep -E '^DEVICE_API_TOKEN=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')"

[ -n "$BASE_URL" ] || { echo "DEVICE_API_BASE_URL not set in .env" >&2; exit 1; }
[ -n "$TOKEN" ]    || { echo "DEVICE_API_TOKEN not set in .env" >&2; exit 1; }

OUT="data/device-fields/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT"

echo "base: $BASE_URL"
echo "out:  $OUT"
echo

# Token goes in via a header file so it never appears in argv / ps output.
HDR="$(mktemp)"
trap 'rm -f "$HDR"' EXIT
printf 'Authorization: Bearer %s\n' "$TOKEN" > "$HDR"

fetch() { # fetch <path> <outfile>
  curl -sS --max-time 30 -H @"$HDR" "$BASE_URL$1" -o "$2" -w '%{http_code}'
}

echo "=== GET /devices ==="
CODE="$(fetch /devices "$OUT/devices.json")"
echo "http $CODE"
if [ "$CODE" != "200" ]; then
  echo "--- body ---"; head -c 500 "$OUT/devices.json"; echo; exit 1
fi

echo
echo "=== device count ==="
jq 'length' "$OUT/devices.json"

echo
echo "=== field census: every key seen across all device docs, with count ==="
jq -r '[.[] | .data // . | keys[]] | group_by(.) | map({k:.[0], n:length})
       | sort_by(-.n)[] | "\(.n)\t\(.k)"' "$OUT/devices.json"

echo
echo "=== top-level (non-data) keys ==="
jq -r '[.[] | keys[]] | unique[]' "$OUT/devices.json"

echo
echo "=== devices: id / name / label / org / env, plus any merge|archive field ==="
jq -r '.[] | (.data // .) as $d
       | [ .id,
           ($d.name // "-"),
           ($d.label // "-"),
           ($d.organization // "-"),
           ($d.operatingEnvironment // "-"),
           ( $d | to_entries
                 | map(select(.key|test("merge|archiv|parent|previous|supersed|active|status";"i")))
                 | map("\(.key)=\(.value|tostring)") | join(" ") )
         ] | @tsv' "$OUT/devices.json"

echo
echo "=== thresholds: shape on the first device that has them ==="
jq -r 'map(.data // .) | map(select(.thresholds != null)) | .[0].thresholds // "none found"' "$OUT/devices.json"

echo
echo "=== full raw doc of one device (for eyeballing unknown fields) ==="
jq '.[0]' "$OUT/devices.json"

echo
echo "recorded: $OUT/devices.json"
