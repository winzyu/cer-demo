#!/usr/bin/env bash
# Read-only shape census of CER's production Firestore, for docs/migration/MIRROR_PRODUCTION_PARITY.md.
#
# Prints only aggregates: document counts, field names, value types, numeric ranges, reporting
# intervals and document sizes. No document id, name, email, device label or free text is printed
# or written to disk; every response is piped straight into jq and discarded.
#
# Every call is a read: Firestore `runQuery`, `runAggregationQuery` and `listCollectionIds`, and
# gcloud `list`/`describe`. About 700 document reads in all, a fraction of a cent.
#
#   scripts/exploreFirestoreParity.sh              # production, with the caller's gcloud login
#   scripts/exploreFirestoreParity.sh --emulator   # the local mirror on 127.0.0.1:8080, no gcloud
set -euo pipefail

PROJECT=conductive-fold-343604
DATABASE='(default)'
REGION=us-central1

#   add --followup to run only R11
FOLLOWUP_ONLY=false
EMULATOR=false
for arg in "$@"; do
  case "$arg" in
    --emulator) EMULATOR=true ;;
    --followup) FOLLOWUP_ONLY=true ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if [ "$EMULATOR" = true ]; then
  MODE=emulator
  HOST="http://${FIRESTORE_EMULATOR_HOST:-127.0.0.1:8080}"
else
  MODE=production
  HOST=https://firestore.googleapis.com
fi
DOCS="$HOST/v1/projects/$PROJECT/databases/$DATABASE/documents"

# The access token goes in through a header file so it never appears in argv or in the output.
HDR="$(mktemp)"
trap 'rm -f "$HDR"' EXIT
if [ "$MODE" = emulator ]; then
  printf 'Authorization: Bearer owner\n' > "$HDR"
else
  printf 'Authorization: Bearer %s\n' "$(gcloud auth print-access-token)" > "$HDR"
fi

post() { # post <endpoint suffix> <json body>
  curl -sS --fail-with-body --max-time 120 -H @"$HDR" -H 'Content-Type: application/json' \
    -X POST "$DOCS$1" -d "$2"
}

# runQuery over one collection, optionally with a field mask, order and limit.
query() { # query <collection> [select fields json array] [extra structuredQuery json]
  local select="${2:-}" extra="${3:-{\}}"
  local body
  body="$(jq -nc --arg c "$1" --argjson extra "$extra" --arg select "$select" '
    {structuredQuery: ({from: [{collectionId: $c}]}
      + (if $select == "" then {} else {select: {fields: ($select | fromjson | map({fieldPath: .}))}} end)
      + $extra)}')"
  post ':runQuery' "$body"
}

# Shared jq helpers: the Firestore value type of a field, and a number from any numeric encoding.
JQ_LIB='
def vtype: if . == null then "missing" else (keys[0] | sub("Value$"; "")) end;
def num: (.integerValue // .doubleValue // .stringValue // null) as $v
  | if $v == null then null else ($v | tonumber? // null) end;
def hist: group_by(.) | map({key: (.[0] | tostring), value: length}) | from_entries;
def docs: [.[] | select(.document) | .document];
def stats: sort as $s | ($s | length) as $n
  | if $n == 0 then null else {n: $n, min: $s[0], p5: $s[($n * 0.05) | floor], median: $s[($n / 2) | floor],
      p95: $s[($n * 0.95) | floor], max: $s[-1]} end;
'

# R11: for each device, its registry status, whether its organization exists, and how long ago it
# last reported. Labels are read into a variable to build each query and are never printed.
followup() {
  echo
  echo "## R11 per device: status, organization reference and hours since the last reading (no labels)"
  local orgs devices label rows="" hours
  orgs="$(query organizations '["__name__"]' | jq -c "$JQ_LIB"' docs | map(.name | split("/") | last)')"
  devices="$(query devices '["label","organization","archived","mergedInto"]' | jq -c --argjson orgs "$orgs" "$JQ_LIB"'
    docs | map(.fields // {}) | map({label: .label.stringValue,
      status: (if .mergedInto != null and .archived != null then "merged-away and archived"
        elif .mergedInto != null then "merged-away" elif .archived != null then "archived" else "current" end),
      organization: (if (.organization.stringValue // "") == "" then "none"
        elif (.organization.stringValue | IN($orgs[])) then "exists" else "no such organization" end)})')"
  for i in $(seq 0 $(($(jq length <<<"$devices") - 1))); do
    label="$(jq -r ".[$i].label" <<<"$devices")"
    hours="$(query water-data '["timestamp"]' "$(jq -nc --arg l "$label" '{where: {fieldFilter: {field: {fieldPath: "device"},
        op: "EQUAL", value: {stringValue: $l}}}, orderBy: [{field: {fieldPath: "timestamp"}, direction: "DESCENDING"}], limit: 1}')" \
      | jq -c "$JQ_LIB"' docs | if length == 0 then null else (.[0].fields.timestamp | num) as $t | ((now - $t) / 3600 | floor) end')"
    rows="$rows$(jq -c --argjson h "$hours" ".[$i] | del(.label) + {hoursSinceLastReading: \$h}" <<<"$devices")"$'\n'
  done
  printf '%s' "$rows" | jq -sc 'sort_by(.status, .hoursSinceLastReading) | .[]'
}

echo "# Firestore parity census ($MODE, database $DATABASE), $(date -u +%Y-%m-%dT%H:%MZ)"

if [ "$FOLLOWUP_ONLY" = true ]; then
  followup
  exit 0
fi

echo
echo "## R1 collections and document counts"
collections="$(post ':listCollectionIds' '{"pageSize": 100}' | jq -r '.collectionIds[]?')"
for c in $collections; do
  n="$(post ':runAggregationQuery' "$(jq -nc --arg c "$c" \
    '{structuredAggregationQuery: {structuredQuery: {from: [{collectionId: $c}]}, aggregations: [{alias: "n", count: {}}]}}')" \
    | jq -r '.[0].result.aggregateFields.n.integerValue')"
  echo "$c $n"
done

echo
echo "## R2 users: organization and role shapes (role values are fixed words, not personal data)"
org_ids="$(query organizations '["__name__"]' | jq -c "$JQ_LIB"' docs | map(.name | split("/") | last)')"
query users '["organization","Organization","role","password","registrationDate","emailValidated","emailVerified"]' \
  | jq -c --argjson orgs "$org_ids" "$JQ_LIB"'
    docs | map(.fields // {}) | map({
      role: (.role.stringValue // ("non-string " + (.role | vtype))),
      organization: (.organization | vtype),
      orgDetail: (if .organization.stringValue == "" then "empty string"
        elif .organization.stringValue then (if (.organization.stringValue | IN($orgs[])) then "exists" else "no such organization" end)
        elif .organization.mapValue then "map keys: " + ((.organization.mapValue.fields // {}) | keys | join(","))
        else "-" end),
      capitalOrganization: (.Organization | vtype),
      password: (.password | vtype),
      registrationDate: (.registrationDate | vtype),
      emailValidated: (.emailValidated | vtype),
      emailVerified: (.emailVerified | vtype)
    }) | {users: length,
      byRoleAndOrganization: (map("\(.role) / \(.organization) / \(.orgDetail)") | hist),
      capitalOrganization: (map(.capitalOrganization) | hist),
      password: (map(.password) | hist),
      registrationDate: (map(.registrationDate) | hist),
      emailValidated: (map(.emailValidated) | hist),
      emailVerified: (map(.emailVerified) | hist)}'

echo
echo "## R3 devices: field types, organization references, merge and archive shapes"
query devices | jq -c --argjson orgs "$org_ids" "$JQ_LIB"'
  docs | map(.fields // {}) | {devices: length,
    fieldTypes: (map(to_entries | map("\(.key): \(.value | vtype)")) | add | hist),
    organization: (map(if .organization.stringValue == null then "not a string: " + (.organization | vtype)
      elif .organization.stringValue == "" then "empty string"
      elif (.organization.stringValue | IN($orgs[])) then "exists" else "no such organization" end) | hist),
    archived: (map(.archived | if . == null then "missing" else "\(vtype)=\(.booleanValue // .stringValue)" end) | hist),
    mergedAndArchived: (map(select(.mergedInto != null and .archived != null)) | length),
    labelsLength: (map(.labels.arrayValue.values // [] | length) | hist),
    thresholdKeys: (map(.thresholds.mapValue.fields // {} | keys | length) | hist),
    thresholdValueTypes: (map(.thresholds.mapValue.fields // {} | to_entries[] | .value | vtype) | hist),
    thresholdMinEqualsMax: (map(.thresholds.mapValue.fields // {} | select(length > 0)
      | [(.minPH | num), (.maxPH | num)] | select(.[0] != null and .[0] == .[1])) | length)}'

echo
echo "## R4 water-data: the 2,000 most recent readings (types, ranges, intervals, stuck values)"
query water-data '' '{"orderBy": [{"field": {"fieldPath": "timestamp"}, "direction": "DESCENDING"}], "limit": 2000}' \
  | jq -c "$JQ_LIB"'
    docs | map(.fields // {}) as $d
    | ($d | map(select(.timestamp | num != null))) as $timed
    | ($timed | group_by(.device.stringValue)) as $byDevice
    | ["97", "98", "99", "100", "102", "72", "turbVolt", "NCvoltage", "NCtemp"] as $metrics
    | {readings: ($d | length),
      devicesInSample: ($byDevice | length),
      spanHours: (($timed | map(.timestamp | num)) as $t | if ($t | length) > 0 then ((($t | max) - ($t | min)) / 3600 | floor) else null end),
      topLevelTypes: ($d | map(to_entries | map("\(.key): \(.value | vtype)")) | add | hist),
      waterDataTypes: ($d | map(.water_data.mapValue.fields // {} | to_entries | map("\(.key): \(.value | vtype)")) | add | hist),
      ranges: ($metrics | map(. as $m | {key: $m, value: ($d | map(.water_data.mapValue.fields[$m] | num)
        | map(select(. != null)) | {zeros: map(select(. == 0)) | length, failureValue1e9: map(select(. >= 1e9)) | length,
          nonzero: (map(select(. != 0 and . < 1e9)) | stats)})}) | from_entries),
      errorFlagsNonZero: (["doError", "ecError", "orpError", "phError", "rtdError", "turbError"]
        | map(. as $f | {key: $f, value: ($d | map(.water_data.mapValue.fields[$f] | num) | map(select(. != null and . != 0)) | length)}) | from_entries),
      intervalMinutesPerDevice: ($byDevice | map(map(.timestamp | num) | sort | [range(1; length) as $i | .[$i] - .[$i - 1]]
        | map(. / 60) | stats | if . == null then null else {median, p95, max} end) | map(select(. != null))),
      hoursSinceLastReadingPerDevice: (now as $now | $byDevice | map(map(.timestamp | num) | max | ($now - .) / 3600 | floor) | sort),
      longestRepeatedValueRun: ($metrics[0:5] | map(. as $m | {key: $m, value: ($byDevice | map(sort_by(.timestamp | num)
        | map(.water_data.mapValue.fields[$m] | num) | reduce .[] as $v ({run: 0, best: 0, prev: null};
          if $v != null and $v != 0 and $v == .prev then .run += 1 else .run = 1 end | .prev = $v | .best = ([.best, .run] | max)) | .best) | max)}) | from_entries)}'

echo
echo "## R5 chats: document sizes and message shapes (text is measured, never printed)"
query chats | jq -c "$JQ_LIB"'
  docs | {chats: length,
    approxJsonBytes: (map(.fields | tojson | length) | stats),
    messagesPerChat: (map(.fields.messages.arrayValue.values // [] | length) | stats),
    topLevelFields: (map(.fields | to_entries | map("\(.key): \(.value | vtype)")) | add | hist),
    messageFields: (map(.fields.messages.arrayValue.values // [] | .[] | .mapValue.fields // {} | keys | join(",")) | hist),
    answerFields: (map(.fields.messages.arrayValue.values // [] | .[] | .mapValue.fields.answer.mapValue.fields // {} | keys | join(",")) | hist)}'

echo
echo "## R6 organizations: field types"
query organizations | jq -c "$JQ_LIB"'docs | map(.fields // {}) | {organizations: length,
  fieldTypes: (map(to_entries | map("\(.key): \(.value | vtype)")) | add // [] | hist)}'

followup

if [ "$MODE" = emulator ]; then
  echo
  echo "(emulator: R7-R10 are gcloud metadata reads and are skipped)"
  exit 0
fi

echo
echo "## R7 databases (metadata)"
gcloud firestore databases list --project="$PROJECT" --format=json \
  | jq -c '.[] | {database: (.name | split("/") | last), locationId, type, concurrencyMode,
    pointInTimeRecoveryEnablement, deleteProtectionState, databaseEdition}'

echo
echo "## R8 composite and vector indexes, single-field overrides, TTL policies on $DATABASE (metadata)"
gcloud firestore indexes composite list --project="$PROJECT" --database="$DATABASE" --format=json \
  | jq -c '.[] | {collectionGroup: (.name | split("/")[-3]), queryScope, state,
    fields: [.fields[] | "\(.fieldPath) \(.order // .arrayConfig // (if .vectorConfig then "vector dim=\(.vectorConfig.dimension)" else "?" end))"]}'
gcloud firestore indexes fields list --project="$PROJECT" --database="$DATABASE" --format=json \
  | jq -c '.[] | select(.name | endswith("/fields/*") | not) | {field: (.name | split("/") | .[-3] + "." + .[-1]),
    indexes: [.indexConfig.indexes[]? | "\(.queryScope) \(.order // .arrayConfig)"], ttl: (.ttlConfig.state // null)}'

echo
echo "## R9 cer-api Cloud Run configuration (names and limits only, no values)"
gcloud run services describe cer-api --region="$REGION" --project="$PROJECT" --format=json \
  | jq -c '{latestReadyRevision: .status.latestReadyRevisionName,
    image: (.spec.template.spec.containers[0].image | sub("@.*"; "")),
    commitLabel: (.spec.template.metadata.labels["commit-sha"] // .metadata.labels["commit-sha"] // null),
    timeoutSeconds: .spec.template.spec.timeoutSeconds,
    containerConcurrency: .spec.template.spec.containerConcurrency,
    resources: .spec.template.spec.containers[0].resources,
    scaling: (.spec.template.metadata.annotations // {} | with_entries(select(.key | test("autoscaling|cpu-throttling|startup-cpu-boost|execution-environment")))),
    serviceAccountIsDefaultCompute: ((.spec.template.spec.serviceAccountName // "default") | test("-compute@|^default$")),
    env: [.spec.template.spec.containers[0].env[]? | "\(.name) (\(if .valueFrom then "secret" else "literal" end))"],
    volumes: [.spec.template.spec.volumes[]? | "\(.name) (\(if .secret then "secret" else "other" end))"]}'

echo
echo "## R10 Cloud Run services in $REGION (names only)"
gcloud run services list --region="$REGION" --project="$PROJECT" --format='value(metadata.name)'
