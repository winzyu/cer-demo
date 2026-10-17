#!/usr/bin/env bash
# Builds the CER server tree for the report-omission Mirror
# (docs/runbooks/REPORT_OMIT_MIRROR_RUNBOOK.md §3).
#
#   bash scripts/mirror/reportOmitTree.sh [target-directory]
#
# The tree is an export, not a checkout: `git archive` of server `mirror/release-rc1` (the live
# cer-api release 122136d plus the Mirror fixtures), then three patches applied with `git apply`:
#   1. local..task/gilligan-report-omit  - cer-api relays a report request's `omit` list;
#   2. report-retried.patch              - cer-api relays Gilligan's `report_retried` flag;
#   3. mirror-seed-turbidity.patch       - the seed stores turbidity in field 72, as production does.
# Nothing is committed, merged or checked out in the server repository. The script refuses an
# existing target, links the server's node_modules, copies `.env.mirror.local` without printing it,
# and runs the malware scan, which must print nothing.
set -euo pipefail

WORK="$HOME/code/work/clean-earth-rovers"
SERVER="$WORK/repo/clean-earth-rovers-server"
RETRY_PATCH="$WORK/handoff/2026-10-15/report-retried.patch"
SEED_PATCH="$(cd "$(dirname "$0")" && pwd)/mirror-seed-turbidity.patch"
MIRROR_ENV_SOURCE="$WORK/worktrees/server-release-mirror/.env.mirror.local"
TARGET="${1:-$WORK/worktrees/mirror-report-omit}"

[ ! -e "$TARGET" ] || { echo "refusing: $TARGET already exists" >&2; exit 1; }
for f in "$RETRY_PATCH" "$SEED_PATCH" "$MIRROR_ENV_SOURCE"; do
  [ -f "$f" ] || { echo "missing: $f" >&2; exit 1; }
done
[ -d "$SERVER/node_modules" ] || { echo "missing: $SERVER/node_modules" >&2; exit 1; }

echo "base: mirror/release-rc1 $(git -C "$SERVER" rev-parse --short mirror/release-rc1)"
echo "omit: task/gilligan-report-omit $(git -C "$SERVER" rev-parse --short task/gilligan-report-omit)"
mkdir -p "$TARGET"
git -C "$SERVER" archive mirror/release-rc1 | tar -x -C "$TARGET"
cd "$TARGET"
git -C "$SERVER" diff local task/gilligan-report-omit | git apply
git apply "$RETRY_PATCH"
git apply "$SEED_PATCH"
ln -s "$SERVER/node_modules" node_modules
(umask 077 && cp "$MIRROR_ENV_SOURCE" .env.mirror.local)

set +e
grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .
scan=$?
set -e
[ "$scan" -eq 1 ] || { echo "malware scan found files or failed (exit $scan): stop and report" >&2; exit 1; }
echo "tree ready: $TARGET"
