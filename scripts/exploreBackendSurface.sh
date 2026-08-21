#!/usr/bin/env bash
# Read-only probe of the backend surface this chatbot might build on:
# merge/archive continuity, organizations, Gilligan quota + chat history, billing.
#
# Reads DEVICE_API_BASE_URL / DEVICE_API_TOKEN from .env. Token is never printed
# and never appears in argv. Raw bodies recorded under data/backend-surface/.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE_URL="$(grep -E '^DEVICE_API_BASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')"
TOKEN="$(grep -E '^DEVICE_API_TOKEN=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')"
[ -n "$BASE_URL" ] && [ -n "$TOKEN" ] || { echo "DEVICE_API_BASE_URL / DEVICE_API_TOKEN missing from .env" >&2; exit 1; }

OUT="data/backend-surface/$(date -u +%Y%m%dT%H%M%SZ)"; mkdir -p "$OUT"
HDR="$(mktemp)"; trap 'rm -f "$HDR"' EXIT
printf 'Authorization: Bearer %s\n' "$TOKEN" > "$HDR"

probe() { # probe <label> <path> [jq-filter]
  local name="$1" path="$2" filt="${3:-.}"
  local f="$OUT/$(echo "$name" | tr -c 'a-zA-Z0-9' '_').json"
  local code
  code="$(curl -sS --max-time 30 -H @"$HDR" "$BASE_URL$path" -o "$f" -w '%{http_code}')"
  echo "── $name   [GET $path]  http $code"
  if [ "$code" = "200" ]; then jq -r "$filt" "$f" 2>/dev/null | head -25 || head -c 300 "$f"
  else head -c 300 "$f"; echo; fi
  echo
}

echo "############ 1. MERGE CONTINUITY ############"
echo "Does a survivor's /water/period return rows from its merged-in labels,"
echo "or only from its own label? (Old Woman Creek 2026 merged 3 labels.)"
echo
probe "OWC period 1 week"  "/water/period/1/week?device=dev:351077454567580" \
  '"rows: \(length)", "distinct device values: \([.[]|.data.device]|unique|join(", "))"'
probe "OWC-old-label CWA Old period 1 year" "/water/period/1/year?device=dev:868050040248466" \
  '"rows: \(length)", "distinct device values: \([.[]|.data.device]|unique|join(", "))"'
probe "Marina Park survivor period 1 month" "/water/period/1/month?device=dev:351077454591408" \
  '"rows: \(length)", "distinct device values: \([.[]|.data.device]|unique|join(", "))"'

echo "############ 2. ORGANIZATIONS ############"
probe "organizations" "/organizations" \
  '"count: \(length)", (.[]? | "\(.id // "-")\t\((.data//.).name // (.data//.) | tostring)")'

echo "############ 3. GILLIGAN (existing product) ############"
probe "gilligan check-quota" "/gilligan/check-quota"
probe "gilligan chats"       "/gilligan/chats" '"type: \(type)", "count: \(length)", (.[0]? // "empty")'

echo "############ 4. BILLING / SUBSCRIPTION ############"
probe "payments check-subscription" "/payments/check-subscription"
probe "payments devices-quantity"   "/payments/devices-quantity"
probe "payments product"            "/payments/product"
probe "payments next-invoice-date"  "/payments/next-invoice-date"

echo "recorded under: $OUT"
