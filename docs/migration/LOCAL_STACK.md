# Local stack

The WSL2 checkout this service is developed in, what it needs beyond git, and how to run the CER dashboard and server beside it without the credentials this machine does not hold.
Verified end to end on 2026-09-21.

## Checkout layout

The machine was rebuilt after the 2026-09-19 incident ([`SECURITY_INCIDENT_2026-09-19.md`](SECURITY_INCIDENT_2026-09-19.md)), and this WSL checkout is the only copy; the old OneDrive checkout is gone.
The repository instructions refer to `../user-dashboard` and `../clean-earth-rovers-server`, so all three stay siblings:

```text
/home/winsy/code/clean-earth-rovers/
  repo/
    cer-demo/                    git@github.com:winzyu/cer-demo.git              (branch dev)
    user-dashboard/              git@github.com:Clean-Earth-Rovers-Technology/user-dashboard.git
    clean-earth-rovers-server/   git@github.com:Clean-Earth-Rovers-Technology/clean-earth-rovers-server.git
  incident-logs/                 recovered Claude transcripts, not a repo
```

Clone cer-demo with `git clone -b dev git@github.com:winzyu/cer-demo.git`.
Never clone the two upstream repositories with a checkout: every remote branch carries the malware, and the clean `local` branches exist only on this machine.
Recreating them means `git clone --no-checkout` and the cleanup in [`SECURITY_INCIDENT_2026-09-19.md`](SECURITY_INCIDENT_2026-09-19.md) before any working tree exists.
Before running anything in either upstream checkout, and after every clone, fetch, pull or branch switch there, check that this prints nothing:

```bash
grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .
```

## What git does not carry

State as of the 2026-09-21 rebuild.

| item | state | detail |
|---|---|---|
| `.env` | restored, secrets in | Scaffolded from `.env.example` with `PORT=8010`; the rotated secrets are in, and it sets `DEFAULT_RETRIEVAL=hybrid-slice-vector`, `SENSOR_TOOL=true` and `REPORT_TOOL=true`. Leave an unset secret **empty**, never a placeholder: `/health` reports `fireworksConfigured` as a plain `Boolean()` on the value, and a placeholder also suppresses the missing-key warning at boot. |
| corpus PDFs in `documents/` | 9 restored, 3 deliberately not | The 8 in-corpus files were downloaded from the `sourceUrl` that `DOC_META` (`src/ingestion/corpus.ts`) records for every document; the vetoed source-of-truth PDF came from tag `corpus-archive-2026-09-13` into `documents/_excluded/`. The three documents cut on 2026-08-24 were not restored. |
| `data/corpus/` | rebuilt | `npm run ingest`, which never calls Fireworks or Firestore. |
| `data/embeddings/cache.json` | rebuilt | 7.1 MB, from the paid `npm run embed:cache`; ingest does not touch it. |
| `.ocr_cache/` | rebuilt, not identical | Re-OCR'd with `pdftoppm -r 300 -gray -png` and `tesseract --psm 1 -l eng` on tesseract **4.1.1**, not the original 5.3.4, so the OCR document's chunk ids moved and anything keyed to them is void. Needs `sudo apt install -y poppler-utils tesseract-ocr`. |
| `water-quality-source-of-truth-v2.pdf` | restored, untracked | At the repo root, never in `documents/`: ingest reads every file there, and `metaFor` falls back to `{ title: filename }`, so it would silently become a 15th document. |
| `eval/fixtures-wave1/_EXIT_CRITERIA.md`, `eval/grading/phase-1d-wave1-fixture-review.html` | recovered, untracked | From the Claude transcripts. The review sheet's decisions are not in the file: the page kept them in `localStorage`, so the live artifact `https://claude.ai/code/artifact/9ee30967-633b-42ca-86b4-418cff7858e6` is the only place they exist. |
| `data/retrieval-eval/`, `data/device-fields/`, `data/backend-surface/` | lost | The last two need live device reads to re-record. |
| `serviceAccountKey.json` | lost | Regenerate in GCP if a Firestore-backed mode is needed; never commit it. |
| `.claude/settings.local.json` | lost | Re-approve prompts as they come. |

The 2026-09-19 backup drive was written by the compromised machine: copy individual files from it after looking at them, never in bulk.
Its OneDrive copy of cer-demo is not a checkout: 15 top-level files and empty subdirectories, `.git/` included.
**The recoverable project history is in the Claude state**, unpacked at `~/code/clean-earth-rovers/incident-logs/` (transcripts) and in `claude-codex-setup.tar.gz` (`file-history/` snapshots, `plans/`).
Long tool results there are truncated, so check a recovered file for a truncation marker and for line numbers covering every line.

## Claude Code state

- Project memory is keyed by path: `~/.claude/projects/-home-winsy-code-clean-earth-rovers-repo-cer-demo/`.
- `AGENTS.md`, `CLAUDE.md` and `.claude/skills/` are tracked on `dev`, not on `main`.
- `.claude/settings.json` denies edits to the upstream repositories, but its deny paths still point at the old OneDrive locations and match nothing, so that guard is inert until they are updated to the layout above.
- `gcloud` credentials did not survive the rebuild; re-authenticate as needed.

## Verify the checkout

```bash
npm ci
npm run typecheck && npm run lint
npx jest test/unit/frontendAuth.test.ts --runInBand
npm run ingest                 # 14 documents, 446 chunks, slice 26,096 chars
PORT=8010 npm run dev          # then: curl -s localhost:8010/health
```

Trust the ingest output over its exit code, which is 0 even when files are missing.
Compare each per-document char count with [`../../documents/README.md`](../../documents/README.md); a miss means the wrong edition or file.
`direct-feed slice: 0 chars` means the four Atlas datasheets are absent.

## Shape

```
browser -> user-dashboard :3000 -> clean-earth-rovers-server :5001 -> live cer-api (Cloud Run)
                                        cer-demo :8010 -> Fireworks + device API
```

The only real credentials involved are the two already in `cer-demo/.env`: `DEVICE_API_TOKEN` for pod data and `FIREWORKS_API_KEY` for the LLM.
Everything else the upstream server normally needs (Firestore, Stripe, Gemini, OpenAI, nodemailer) is avoided by forwarding those requests to the deployed API, which holds its own credentials and does its own authentication.

Both upstream repositories must be on branch `local`, which is the cleaned branch; `main` and `develop` still carry the malware and must never be built or tested.

## The dev passthrough

`clean-earth-rovers-server/src/middleware/devUpstreamProxy.ts` forwards any request it is not told to serve locally to `DEV_UPSTREAM_BASE_URL`, carrying the caller's `Authorization` header unchanged.
It is mounted on `/api/v1` and `/auth`, ahead of the JSON body parser so bodies pass through as received, and it returns `null` (mounting nothing) when `NODE_ENV=production` or when `DEV_UPSTREAM_BASE_URL` is unset.

`DEV_LOCAL_PATHS` is the switch for local development: a comma-separated list of path prefixes this server answers itself.
Empty means everything is proxied.
To develop an endpoint locally, add its prefix, for example `DEV_LOCAL_PATHS=/api/v1/water`, and restart.

Authentication is the catch.
Tokens are minted by the live API with a secret this machine does not have, so `authenticateToken` rejects them on any route served locally.
Proxied routes are unaffected because the live API verifies them.
A route moved into `DEV_LOCAL_PATHS` therefore needs one of: the real `ACCESS_TOKEN_SECRET`, a dev-only unverified decode gated behind an explicit flag, or a test token minted locally with the dev secret in `.env`.

## Env files

Both are git-ignored and written with mode 600.

`clean-earth-rovers-server/.env`: `NODE_ENV=development`, `PORT=5001`, `DB_ENVIRONMENT=main`, `DEV_BASE_URL`, `DEV_FRONTEND_URL`, a locally generated `ACCESS_TOKEN_SECRET`, `DEV_UPSTREAM_BASE_URL`, `DEV_LOCAL_PATHS`, and placeholder values for `NODEMAILER_APP_EMAIL`, `NODEMAILER_APP_PASSWORD` and `STRIPE_SECRET_KEY`.
The placeholders exist only because those services are constructed at module import; see the defect note below.

`user-dashboard/.env.local`: `NEXT_PUBLIC_API_BASE_URL=http://localhost:5001` and `API_PROXY_TARGET=http://localhost:5001`.
`NEXT_PUBLIC_GOOGLE_MAP_API` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are absent, so maps render blank and billing screens fail; nothing else depends on them.

## Running it

```bash
cd clean-earth-rovers-server && npm run dev     # :5001
cd user-dashboard && yarn dev -p 3000           # :3000
```

Node 24.21 and npm 11.19 work for both; yarn 1.22 comes from `corepack enable`.
The dashboard runs Next 13.5.11.
Ports 8010 (cer-demo) and 8000 stay as they are; never kill 8000.

Smoke test, which is a live read:

```bash
TOKEN=$(grep -m1 '^DEVICE_API_TOKEN=' cer-demo/.env | cut -d= -f2-)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5001/api/v1/devices     # 5 pods
curl -s -L -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/devices  # same, through the dashboard
```

Unauthenticated, `/api/v1/devices` returns 401 from the live API, and `/api/v1/` returns its placeholder message with 200.

## Defect found while setting this up

`src/routes/userRoutes.ts` constructs `UserController` at module import, which constructs `UserService` and then `EmailService`, whose constructor throws when `NODEMAILER_APP_EMAIL` or `NODEMAILER_APP_PASSWORD` is missing.
The whole server therefore fails to boot over credentials that only the password-reset mail path needs.
`PaymentService` does the same with `STRIPE_SECRET_KEY`, though it is constructed lazily enough not to block boot.
The fix is to construct these services on first use rather than at import; the placeholders above are the workaround, not the answer.

## Serving Gilligan locally (roadmap R3)

To take the Gilligan routes away from the live API and serve them from the local server, set `DEV_LOCAL_PATHS=/api/v1/gilligan` and restart.
Everything else keeps proxying, so pods, water data, organizations and login still come from live.

The dashboard calls, from `user-dashboard/src/app/services/gilligan.js` through the `/api/v1` axios instance:

- `GET /gilligan/question?question=<text>&chatId=<uuid>`
- `GET /gilligan/chats`
- `GET /gilligan/check-quota`
- `POST /gilligan/report` with `{ time_range, device? }`, answered with the PDF (added 2026-09-22; relays to cer-demo's `POST /api/v1/reports`, which needs `REPORT_TOOL=true`)

cer-demo answers on `POST /api/v1/chat` with `{ query, history?, device?, stream?, retrieval? }` and returns `{ answer, model, citations, usage, tool_calls?, tool_round_cap_reached? }`, plus `GET /api/v1/usage` for the remaining allowance.
It reads the caller's bearer token for the sensor tool and applies its own quota guard.

The shapes are mapped by the relay added in R3, so this no longer waits on R1: see [`GILLIGAN_R3_PORT.md`](GILLIGAN_R3_PORT.md) for the relay, the swap seam and what was verified.

Both servers read these at boot only.
`ts-node-dev` watches source files and not `.env`, so a change here needs a real restart, and a server left running from before an edit will silently keep proxying Gilligan to the live API.

`clean-earth-rovers-server/.env`, all local-development only:

```
DEV_LOCAL_PATHS=/api/v1/gilligan
GILLIGAN_BACKEND=rag
CER_RAG_BASE_URL=http://localhost:8010
DEV_UNVERIFIED_AUTH=true
DEV_CHAT_STORE=memory
```

`DEV_UNVERIFIED_AUTH=true` accepts a token's claims without verifying its signature, which is how the authentication boundary above is crossed; it is refused in production, refuses a non-JWT, and warns on every request it serves.
`DEV_CHAT_STORE=memory` serves the chat collections from process memory, so no Firestore credentials are needed and history resets on restart.

`cer-demo/.env` needs `DEFAULT_RETRIEVAL=hybrid-slice-vector` with `CORPUS_SOURCE=artifact`.
An empty `DEFAULT_RETRIEVAL` resolves to `stub`, and `data/embeddings/` must exist (`npm run embed:cache`) or every request fails.
