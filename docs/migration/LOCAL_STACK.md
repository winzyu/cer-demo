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
- `gcloud` is reinstalled and logged in as of 2026-09-25; see [Google Cloud and the Firestore emulator](#google-cloud-and-the-firestore-emulator).

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

## Google Cloud and the Firestore emulator

Set up on 2026-09-25 for Gilligan release testing (release task S6 and the test-data options in `GILLIGAN_FIRESTORE_AND_TESTING_PLAN.md` §6).

### Tools

All three are user-space installs, so none needs `sudo`.

| tool | version | where |
|---|---|---|
| Google Cloud CLI | 586.0.0 | `~/.local/opt/google-cloud-sdk`, from the Linux x86_64 tarball; update with `gcloud components update` |
| Firebase CLI | 15.31.0 | `npm install -g firebase-tools` under nvm's Node 24.21 |
| Temurin JDK | 21.0.12.1 | `~/.local/opt/jdk-21.0.12.1+1`, from the Adoptium API with its SHA-256 checked |

The Firestore emulator refuses Java older than 21 (`MIN_SUPPORTED_JAVA_MAJOR_VERSION` in firebase-tools 15), and Ubuntu 20.04's apt has no JDK 21, hence the tarball.
`~/.bashrc` sets `JAVA_HOME` and puts both `bin` directories on `PATH`; a shell that skips `.bashrc` needs the full paths.
Credentials come from `gcloud auth login` and `gcloud auth application-default login`; no service-account key exists or is needed.

### Firestore emulator

Run it from a directory outside the repository holding this `firebase.json`, so nothing is added to the tree:

```json
{ "emulators": { "firestore": { "host": "127.0.0.1", "port": 8080 }, "ui": { "enabled": false }, "singleProjectMode": true } }
```

```bash
firebase emulators:start --only firestore --project demo-cer
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx jest --runInBand test/integration/firestoreQuotaStore.emulator.test.ts
```

Port 8080 does not collide with 8000 or 8010; the emulator hub also reserves 4400, 4500 and 9150.
A `demo-` project id keeps the emulator from ever reaching a real project.

Result on `feat/service-release` at `cc8a300`: at Jest's defaults the suite failed 6 of 8 runs, always in "counts every one of many simultaneous records".
That test runs 25 contended transactions on one document, which takes about 7.5 s on the emulator against Jest's 5 s default.
With `--testTimeout=120000` all 5 tests passed in 3 of 3 runs with the correct total of 2500, so the store is right and the test needs its own timeout.

### Test project

| item | value |
|---|---|
| project id | `cer-demo-2026` (display name CER-DEV; a project id cannot be renamed) |
| billing | linked; a budget of 10 USD a month on the whole billing account alerts at 50, 90 and 100 percent |
| `(default)` database | Native mode, us-west1: cer-demo's `corpus_chunks` and `corpus_documents` vector store; leave it alone |
| `gilligan-test` database | Native mode, us-central1, created 2026-09-25 for Gilligan test data |

The project holds no API keys and no downloadable keys, so it has nothing to rotate; its one service account is the Gilligan runtime identity below.
Only the `(default)` database gets Firestore's free daily quota; `gilligan-test` bills from the first read, which is pennies at test volume.
The CER server hard-codes project id `conductive-fold-343604` in `src/config/database.ts`, so pointing it at `cer-demo-2026` needs a small server change and is out of scope here.

#### Gilligan identity and secret rehearsal, 2026-09-25

This rehearses in `cer-demo-2026` the production arrangement settled at L2 (`GILLIGAN_RELEASE_PLAN.md`, "L2 answers so far"), and drafts the inventory for production.
Everything was created by the user's account (`roles/owner` on the project) through Claude, each write approved by the user in chat.
The project has no organization or folder above it, so no policy is inherited.
Nothing was deployed to Cloud Run: the relay still sends the user's JWT as `Authorization`, which a private Cloud Run service rejects, so a deployed rehearsal waits on that decision.

| resource | exact name | grant: role and condition | created by | verified by |
|---|---|---|---|---|
| APIs | `iam.googleapis.com`, `secretmanager.googleapis.com`, `policytroubleshooter.googleapis.com` | none | user via Claude | `services list --enabled` |
| service account | `cer-gilligan-runtime@cer-demo-2026.iam.gserviceaccount.com`, display name "Gilligan runtime" | none on itself: its own policy is empty, so no one can act as it | user via Claude | `iam service-accounts describe`; `keys list` shows one Google-managed key and no user-managed key; `get-iam-policy` is empty |
| secret | `cer-gilligan-fireworks-api-key`, automatic replication | Secret Manager Secret Accessor (`roles/secretmanager.secretAccessor`) for the runtime account, on this secret only | user via Claude; the value is added by the user, never through Claude | `secrets get-iam-policy` holds that single binding; troubleshooter: access granted on this secret, denied on any other secret name |
| Firestore corpus | database `(default)` | Cloud Datastore Viewer (`roles/datastore.viewer`) for the runtime account, on the project, condition `gilligan-corpus-read`: `resource.name == "projects/cer-demo-2026/databases/(default)"` | user via Claude | troubleshooter: get and list granted; create, update and delete denied |
| Firestore usage store | database `gilligan-test` | Cloud Datastore User (`roles/datastore.user`) for the runtime account, on the project, condition `gilligan-usage-rw`: `resource.name == "projects/cer-demo-2026/databases/gilligan-test"` | user via Claude | troubleshooter: get, list, create, update and delete granted; any other database denied |

The project's policy (version 3) holds exactly these two conditional bindings for the account, and nothing at project level grants it `secretmanager.versions.access` or `iam.serviceAccounts.actAs`.
Datastore Viewer is read-only on documents, including vector queries, plus database and index metadata.
Datastore User includes delete, which the usage store does not need; only a custom role could drop it.
Firestore IAM stops at the database: a condition can name a database but not a collection.

At the time of recording, the secret has no version; the user adds it from `.env` in their own terminal.
When checking `.env`, strip any surrounding quotes from the value first, because they would otherwise be stored as part of the key.

How the checks were run, since the obvious forms fail:

- `gcloud policy-troubleshoot` and `gcloud beta policy-intelligence troubleshoot-policy iam` need `--billing-project=cer-demo-2026` when no default project is set; otherwise they bill gcloud's own client project and fail with `SERVICE_DISABLED`.
- A Firestore database is not a valid troubleshooter resource: troubleshoot the project, `//cloudresourcemanager.googleapis.com/projects/cer-demo-2026`, with `--resource-name=projects/cer-demo-2026/databases/<db>`, `--resource-service=firestore.googleapis.com` and `--resource-type=firestore.googleapis.com/Database`, in the same form the condition uses; the `//firestore.googleapis.com/` form evaluates the condition as false.
- A secret must be named by project number: `//secretmanager.googleapis.com/projects/2771572559/secrets/<name>`.
- `testIamPermissions` reports the caller's permissions, not another principal's, so it cannot verify the runtime account without impersonating it, which would need an extra grant.

Decision for the production inventory, needing Michael and the supervisor (recorded 2026-09-25, not yet applied to cer-demo's configuration):
production should give Gilligan a dedicated Firestore database, for example `gilligan` in us-central1 next to Cloud Run, holding both the corpus and the usage store.
`cer-gilligan-runtime` then gets Datastore User conditioned on that database alone and no grant on `(default)`.
Otherwise, because Firestore IAM cannot narrow below a database, the usage store's write access on `(default)` would also let the runtime account write `users`, `devices` and `water-data`.

### CER's old QA database

Read on 2026-09-25 with the user's approval, metadata only; no document was read.

- `qa-db` exists in `conductive-fold-343604`: Native mode, us-west3, pessimistic concurrency, created 2024-02-22 and not reconfigured since, with no delete protection and no point-in-time recovery.
- The production `(default)` database is also in us-west3, not us-central1 where Cloud Run runs.
- Collections and document counts: `chats` 27, `devices` 3, `organizations` 22, `users` 30, `water-data` 31,905.
- `cer-api-qa` has one revision, `cer-api-qa-00001-pt8`, deployed 2024-11-19 by a contractor account, and serves all its traffic.
- Recent read and write activity is unknown: Cloud Monitoring refuses this account on the CER project, so it needs the console's Firestore Usage tab or a monitoring viewer role.

Its configuration and its server have not changed since 2024, and that server is an older codebase, which weighs against plan §6 option C.
