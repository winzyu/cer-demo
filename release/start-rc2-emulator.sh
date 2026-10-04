#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"
export JAVA_HOME=/home/winsy/.local/opt/jdk-21.0.12.1+1
export PATH="$JAVA_HOME/bin:$PATH"
export GOOGLE_APPLICATION_CREDENTIALS="$here/no-production-credentials.json"
export CLOUDSDK_CONFIG=/home/winsy/code/clean-earth-rovers/emulator-original/no-gcloud
export HTTP_PROXY=http://127.0.0.1:9
export HTTPS_PROXY=http://127.0.0.1:9
export http_proxy="$HTTP_PROXY"
export https_proxy="$HTTPS_PROXY"
export NO_PROXY=localhost,127.0.0.1,::1
export no_proxy="$NO_PROXY"
export CI=true

snapshot="$here/rc2-emulator-data"
args=(emulators:start --only firestore --project demo-cer-mirror
  --config "$here/firebase-rc2.json" --export-on-exit "$snapshot")
if [[ -f "$snapshot/firebase-export-metadata.json" ]]; then
  args+=(--import "$snapshot")
fi
exec firebase "${args[@]}"
