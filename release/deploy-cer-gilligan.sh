#!/usr/bin/env bash
# Stage a new cer-gilligan revision with no traffic (runbook §6.1), matching the live service's
# settings as of L9 (landing doc §7 item 18): Fireworks key :3, service key :1, one instance.
# Run it yourself from cer-demo, with the image digest from runbook §3.3 and the next free tag:
#   IMAGE=gcr.io/conductive-fold-343604/cer-gilligan@sha256:<digest> TAG=rc3 bash release/deploy-cer-gilligan.sh
# --env-vars-file and --set-secrets replace the revision's whole environment and secret list, so
# cer-gilligan.env.yaml and the two secrets below must stay the complete set.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${IMAGE:?set IMAGE to the image digest from runbook §3.3}"
: "${TAG:?set TAG to the next free revision tag, e.g. rc3}"

gcloud run deploy cer-gilligan \
  --project=conductive-fold-343604 --region=us-central1 \
  --image="$IMAGE" \
  --service-account=cer-gilligan-runtime@conductive-fold-343604.iam.gserviceaccount.com \
  --env-vars-file="$here/cer-gilligan.env.yaml" \
  --set-secrets=FIREWORKS_API_KEY=cer-gilligan-fireworks-api-key:3,CER_RAG_SERVICE_KEY=cer-gilligan-service-key:1 \
  --cpu=1 --memory=1Gi --timeout=300 --concurrency=8 \
  --min-instances=1 --max-instances=1 \
  --no-traffic \
  --tag="$TAG"
