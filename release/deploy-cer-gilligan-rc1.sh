#!/usr/bin/env bash
# L5: deploy cer-gilligan from the locally tested image (cer-demo release/rc2 ddd6292).
# Runbook §6.1. Run it yourself from cer-demo: bash release/deploy-cer-gilligan-rc1.sh
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

gcloud run deploy cer-gilligan \
  --project=conductive-fold-343604 --region=us-central1 \
  --image=gcr.io/conductive-fold-343604/cer-gilligan@sha256:1d2c0bc1c5f462f1d5d3687f19f708301c2abd2abd095a3833058c8d29e5b3f4 \
  --service-account=cer-gilligan-runtime@conductive-fold-343604.iam.gserviceaccount.com \
  --env-vars-file="$here/cer-gilligan.env.yaml" \
  --set-secrets=FIREWORKS_API_KEY=cer-gilligan-fireworks-api-key:2,CER_RAG_SERVICE_KEY=cer-gilligan-service-key:1 \
  --cpu=1 --memory=1Gi --timeout=300 --concurrency=8 \
  --min-instances=0 --max-instances=1 \
  --no-allow-unauthenticated \
  --tag=rc1
