# Mirror and production parity

Written 2026-09-26 for the Gilligan release.
The question: what must change so that code which passes on the Firestore mirror also works when it is pointed at CER's production Firestore, with nothing else to discover on launch day.
Sources: the mirror seeder (`clean-earth-rovers-server` `mirror/e2e-p3` `37fec03`, `scripts/mirror/`), the production field census in [`BACKEND_FIELDS.md`](BACKEND_FIELDS.md), the end-to-end results and `LOCAL_STACK.md` on `docs/gcp-test-env`, the "L2 answers so far" block of `GILLIGAN_RELEASE_PLAN.md` on `docs/l2-inputs`, and the code that ships: server `task/gilligan-release-p3-p4`, `feat/service-key`, `fix/user-route-auth`, and cer-demo `feat/service-release` (`cc8a300`).
Production is read-only for this work; every production figure comes from a live read the user ran and pasted back (section 6).

## The short answer

"Only the pointer changes" is reachable for the code, not for the deployment.
The code can be made identical: the server now takes its project and database from the environment (server branch `feat/firestore-config`, `0003170`, local and unpushed), and cer-demo already does.
Some launch-day changes can never be exercised on the emulator, because they are cloud resources the emulator does not have: the `gilligan` database, its IAM grants, the secrets, the TTL policy, the indexes and the Cloud Run settings.
The aim is therefore that each of those is written down once (section 7), rehearsed in `cer-demo-2026` where it can be, and checked by a read on the day.

Severity, for launch:

- **Blocker**: Gilligan does not work at all without it.
- **High**: wrong answers, or a data or security exposure, in normal use.
- **Medium**: a failure for some users or some questions.
- **Low**: cost, tidiness, or a failure only in unusual cases.

## 1. Data shape

In plain terms: the mirror is a made-up copy of production with the same collections and field names, so the code sees familiar documents.
Where the made-up data is tidier than the real data, bugs that depend on the mess stay hidden until launch.

What already matches (the mirror copies it on purpose): the five collections, 9 organizations, 27 users by role, 15 devices with 4 merge survivors, 5 merged-away and 6 archived, 2 devices pointing at organizations that do not exist, a cross-organization merge chain, a fresh-water survivor absorbing salt-water pods, all-zero and placeholder thresholds stored as strings, a Firestore timestamp among ISO calibration dates, the `lastCalibrationData` typo, `archived` stored as the string `"true"`, the capitalised `Organization` field, integer and timestamp `registrationDate`s, 4 invited users with no password, pods with no turbidity or oxygen sensor, and the firmware's `1000000000` failure value.
The mirror's own census (the same script as production's, `scripts/exploreFirestoreParity.sh --emulator`) confirms those shapes.

What the mirror leaves out or makes tidier:

| id | gap | mirror | production | severity | fix |
|---|---|---|---|---|---|
| D1 | Reporting interval | Every pod reports exactly every 60 minutes | Some pods report about twice an hour (report audit #4); pending R4 | High | Mirror: give one active pod a 30-minute interval and one irregular gaps |
| D2 | Silent pods | Every active pod's last reading is about 5 hours old | A pod can be silent for two weeks and still read "Normal" in a report (report audit #3); pending R4 | High | Mirror: make one active pod's readings stop 14 days ago |
| D3 | Stuck sensors | No sensor repeats a value more than twice in a row | Stuck sensors are a known production case (plan Q4); pending R4 | High | Mirror: flat-line one metric on one pod for a day |
| D4 | Value ranges and rails | Narrow, plausible ranges; conductivity only near 450 or 47,000 µS/cm | pH 14.00 rail, dissolved oxygen 19.3 mg/L against a maximum of 10, a label moving from fresh to salt water within a month, out-of-water dips (`BACKEND_FIELDS.md` §3c, §4d); pending R4 | Medium | Mirror: add a relocation block, a pH rail and an out-of-water dip |
| D5 | `water_data.lat` and `lon` types | Numbers | Pending R4. The server's `/water-data` schema wants strings and returns 500 on the mirror (preflight P5) | Medium | If production stores strings, fix the mirror; if numbers, the server schema is wrong in production too (unrelated server defect) |
| D6 | Volume and history | 8,640 readings over 30 days | About 118,000 readings; merged-away labels reach back to 2023 with up to 19,286 rows each (`BACKEND_FIELDS.md` §4a); pending R1 | Medium | Mirror: seed with `--days 365` and give merged-away labels multi-year histories, then time the one-year report and CSV export |
| D7 | Overlapping merge chains | Merged-away pods stop a month before the survivor starts | New Trinidad and Trinidad Island reported together for five months (`BACKEND_FIELDS.md` §4a) | Medium | Mirror: overlap one chain by a month and check reports do not double-count |
| D8 | Active pod with a non-existent organization | Only merged-away or archived pods point at missing organizations | `Marina Park`, an actively reporting survivor, points at an organization that does not exist (`BACKEND_FIELDS.md` §5a); pending R2 and R3 for whether any user carries that organization | Medium | Mirror: move one dangling id onto an active survivor and give it a customer; this is the case Q6 changes |
| D9 | Users' `organization` field | Always a string; one user has an empty string | No non-superadmin has a missing, empty or id-less organization (read of 2026-09-26, L2 block); whether any is a map is pending R2 | Low | None if R2 shows strings only; the mirror's orphan stays as a stricter-than-production test (finding 4) |
| D10 | Where Gilligan's own data lives | `gilligan_usage` in the customer `(default)` database (the run set `FIRESTORE_DATABASE_ID=(default)`) | Decided 2026-09-25: a dedicated `gilligan` database, so the runtime account has no grant on `(default)` | High | Mirror run: set cer-demo's `FIRESTORE_DATABASE_ID=gilligan`; the emulator serves named databases |
| D11 | Chat documents | Gemini-era chats, at most 7 messages | An average of 1.6 messages among the 20 most recent; sizes pending R5 | Low | None; new chats are written by the code under test |
| D12 | Organization fields | `{ name }` only | Pending R6 | Low | Add any field R6 shows |

How to demonstrate: run the census script on the reseeded mirror and on production, and compare section by section: every line in production's output should have a counterpart on the mirror, at the same type and within the same range.

## 2. What the emulator lets through and production does not

In plain terms: the emulator is a stand-in that accepts almost anything.
Real Firestore refuses some requests the emulator accepts, and the refusals only show up in production.

| id | gap | what production does | our code | severity | fix |
|---|---|---|---|---|---|
| E1 | Composite indexes | A query that filters on one field and sorts on another fails with `FAILED_PRECONDITION` unless a matching composite index exists; the emulator never asks for one | The server's `water-data` queries need `device` + `timestamp desc`, and `device` + five `water_data.*Error` + `timestamp desc` (`WaterAnalyticsService.ts`). All come from upstream commits (`62993fe`, `f0dd8a2` and older), not from our branches; P3's new query is a single-field equality that needs none | Blocker if missing: every pod question and report fails | Deployment: R8 lists production's indexes; any missing one is created by Michael before L6 (building takes minutes on 118,000 documents) |
| E2 | Indexes in the `gilligan` database | Same rule | The usage store reads and writes by document id, so it needs no composite index. The audit-log listing (`caller` + `timestamp`) and the Firestore corpus source (`inDirectFeedSlice` + `filename`, and the vector index) would, but the release image fixes `CORPUS_SOURCE=artifact` and `AUDIT_LOG` defaults off | Low | None for launch; if `AUDIT_LOG` or `CORPUS_SOURCE=firestore` is turned on later, create those indexes first |
| E3 | Document size, 1 MiB | A chat document cannot grow past 1 MiB | Each answer rewrites the chat's whole `messages` array, now with citations and an audit block. A long chat breaks earlier on cer-demo's 100 KB request-body limit (finding 5) | Medium | Code: send only the last `MAX_HISTORY_MESSAGES` turns from the server, and give the page a "chat too long, start a new one" message; verify with H5 |
| E4 | Transaction contention | Real Firestore locks a document during a transaction and retries on conflict | The usage store updates one document per user per day inside a transaction; only one user's own parallel questions contend. The emulator test passed 25 contended updates with the right total | Low | None; the L8 smoke asks two questions at once from one account |
| E5 | IAM | Every call is checked against the caller's grants; the emulator accepts any caller | `cer-gilligan-runtime` needs Datastore User on the `gilligan` database only, and Secret Accessor on its secrets. A missing grant makes every question 503, because the usage check fails closed (`quotaGuard.ts`) | Blocker if missing | Deployment, Michael: grants per L2. Rehearsed in `cer-demo-2026` with the policy troubleshooter; shown in production by the L6 staged smoke |
| E6 | The database itself | A named database that does not exist returns `NOT_FOUND` | cer-demo opens `FIRESTORE_DATABASE_ID` at the first question | Blocker if missing | Deployment, Michael: create `gilligan` in us-central1; checked by R7 on the day |
| E7 | TTL | Real Firestore deletes documents when a TTL field passes; the emulator ignores TTL | `gilligan_usage` needs `expireAt`, not landed (`feat/service-release`); a TTL on `updatedAt` would delete the current day's counter | Low for launch, Medium after | Code first, then a TTL policy on `gilligan_usage.expireAt`; checked by the TTL read |
| E8 | Quotas and rates | About one sustained write per second per document; 500 writes per batch; `in` takes at most 30 values | No launch path comes near these; the server slices an organization's labels to 10 for `in`, a separate pre-existing defect | Low | None |

How to demonstrate E1 beyond reading the index list: a real Firestore database refuses a query whose index is missing, with the index it wants in the error.
Seeding the mirror data into a scratch database in `cer-demo-2026` and running the server against it (now possible with `feat/firestore-config`) would show every missing index at once, for about $0.05; it needs the user's approval as a cloud write and a change to the seeder's emulator-only guard.
Recommended only if R8 leaves any doubt.

## 3. Configuration

In plain terms: the same code behaves differently depending on its settings.
Every setting that differs between the mirror run and production is listed here, with what happens if it is forgotten.

Server (`cer-api`):

| setting | mirror run | production | if forgotten | severity |
|---|---|---|---|---|
| Project | Hard-coded `conductive-fold-343604`; the emulator host is the only thing keeping the mirror off production | `conductive-fold-343604` | With `feat/firestore-config` a mirror run can use a `demo-` project id, which can never reach a real project | High for safety, none for launch |
| Database | `(default)` | `(default)` | - | - |
| `FIRESTORE_EMULATOR_HOST` | `127.0.0.1:8080` | Unset | Set in production: the server reads an empty local database | Low (Cloud Run has no such variable unless someone adds it) |
| `serviceAccountKey.json` | Absent | Absent; `.dockerignore` excludes it and Cloud Run uses its own account | - | - |
| `NODE_ENV` | Unset, so development: `ts-node-dev`, dev chat store, dev proxy and unverified-token paths reachable when their variables are set | `production` from the Dockerfile: dev paths off, `FRONTEND_URL` or `PROD_BASE_URL` required | The production build and `NODE_ENV=production` were never exercised on the mirror | Medium |
| `GILLIGAN_BACKEND` | `rag` | `rag`, set at L9 | Defaults to `gemini`, which calls the retired `gemini-pro` and fails every question | Blocker |
| `CER_RAG_BASE_URL` | `http://localhost:8010` | cer-gilligan's `run.app` URL | Defaults to localhost: every question fails | Blocker |
| `CER_RAG_SERVICE_KEY` | A random test key | A secret shared with cer-gilligan | cer-demo refuses the relay with 401 | Blocker |
| `CER_RAG_TIMEOUT_MS` | Default 120 s | Default 120 s | Must stay below cer-api's own request timeout (pending R9) and cer-gilligan's 300 s | Medium |
| `FRONTEND_URL` | `http://localhost:3000` | `https://cleanearthrovers-datahub.app` | Email links point at localhost | Low |
| CORS | `cors()` with every origin allowed | Same code | - (no parity gap; an open CORS policy is a separate hardening item) | - |
| `ACCESS_TOKEN_SECRET` | A mirror-only secret | Production's existing secret | - | - |
| `DEV_UPSTREAM_BASE_URL`, `DEV_CHAT_STORE`, `DEV_UNVERIFIED_AUTH` | Unset or empty | Unset; all three are also disabled by `NODE_ENV=production` | - | - |

cer-demo (`cer-gilligan`):

| setting | mirror run | production | if forgotten | severity |
|---|---|---|---|---|
| `FIRESTORE_PROJECT_ID` | Unset (emulator) | `conductive-fold-343604` | Inferred from the runtime account's project; works, with a warning | Low |
| `FIRESTORE_DATABASE_ID` | `(default)` | `gilligan` | Defaults to `(default)`: denied by IAM, so every question is 503 (E5), or, if someone widened the grant, usage counters land among customer data | Blocker |
| `QUERY_QUOTA`, `QUERY_QUOTA_STORE`, `QUERY_QUOTA_WINDOW` | `true`, `firestore`, `1d` | The same | Defaults are off, `memory` and per-instance: limits reset on restart or vanish | High |
| `QUERY_QUOTA_REQUESTS`, `_REPORTS`, `_TOKENS` | Unset except in the quota scenarios | 20, 5, 1,000,000 per user per day (L2) | Default unlimited (finding 2) | High |
| `CER_RAG_SERVICE_KEY` | The test key | The shared secret | cer-demo accepts any caller and ignores the user identity headers, with only a log warning | High |
| `SENSOR_TOOL`, `REPORT_TOOL` | `true` | `true` | Default off: answers carry no pod data and reports are refused | High |
| `DEVICE_API_BASE_URL` | The mirror server on port 5101 | The production API base URL ending `/api/v1` (L2) | Pod data comes from the wrong server | Blocker |
| `DEVICE_API_TOKEN` | Must be unset | Must be unset | The tools already require the caller's token, so it is not used as a fallback; leaving the superadmin token in the environment is still an unneeded secret | Low |
| `FIREWORKS_API_KEY` | `.env` | Secret Manager, pinned numeric version | Service cannot answer | Blocker |
| `CORPUS_SOURCE` | `artifact` | `artifact`, fixed in the image | - | - |
| `AUDIT_LOG` | Off | Off unless decided otherwise | - | - |
| `NODE_ENV` | Unset | `production` from the Dockerfile | - | - |

How to demonstrate: a release environment file for each service, checked in without values, that the startup log confirms line by line (cer-demo already logs its quota, tools and database settings; the server logs its project and database).
The L1 runbook takes these two tables as its variable list.

## 4. Runtime

In plain terms: on the laptop everything is one machine with no network in between; in production each piece is a separate Cloud Run service in `us-central1`, and the customer database is in `us-west3`.

| id | gap | what changes in production | severity | fix and check |
|---|---|---|---|---|
| R1 | Region hop | `cer-api` (us-central1) already reads `(default)` in us-west3, adding tens of milliseconds per query; the `gilligan` database sits next to cer-gilligan in us-central1 | Low | None; L8 records the time of a one-year report |
| R2 | Cold start | With minimum instances 0 the first question after idle waits for the container to start and load 9.5 MB of corpus and embeddings | Medium | Minimum instances 1 on demo and launch days (L2); L6 measures the first answer after a deploy |
| R3 | Timeout chain | Dashboard, then `cer-api` (its Cloud Run timeout, pending R9), then the 120 s relay, then cer-gilligan's 300 s, then the model queue's 20 s | Medium | Set `cer-api`'s timeout above 120 s if R9 shows less |
| R4 | Body size | Express's 100 KB JSON limit on both services; Cloud Run allows 32 MiB | Medium (same as E3) | Code, as E3 |
| R5 | Secrets | `.env` on the laptop, Secret Manager in production; surrounding quotes in a copied value become part of the secret | Medium | The user adds each secret version from their own terminal with quotes stripped; the staged smoke proves the key works |
| R6 | Instances | Maximum instances 1 until the Firestore usage store is verified live, then 2 (L2) | Low | None |
| R7 | Production build | The mirror ran the server with `ts-node-dev` and cer-demo with its dev runner; production runs the compiled images | Medium | Rerun the mirror preflight (P1-P7) and G1-G3 against both Docker images built locally, with `NODE_ENV=production`, before L5 |

A Cloud Run rehearsal in `cer-demo-2026` would measure R2 and R3 and prove the runtime account's IAM (E5) before production; it is optional and needs approval, and the L6 staged revision in production covers the same ground a day later.

## 5. Gap register

Owner "Claude" means work in cer-demo, the mirror or a local server branch; "user" means a cloud action or decision by the user; "Michael" means a grant only the project admin can make.

| id | severity | fix in | owner | how verified | status |
|---|---|---|---|---|---|
| E1 composite indexes | Blocker if missing | deployment | Michael (user reads) | R8 shows each needed index `READY` | pending R8 |
| E5 runtime IAM | Blocker if missing | deployment | Michael | Troubleshooter in production as in `cer-demo-2026`; L6 staged smoke answers a question | open |
| E6 `gilligan` database | Blocker if missing | deployment | Michael | R7 lists it in us-central1 | open |
| C `GILLIGAN_BACKEND`, `CER_RAG_BASE_URL`, service key, `DEVICE_API_BASE_URL`, `FIREWORKS_API_KEY`, `FIRESTORE_DATABASE_ID` | Blocker | deployment | user | Startup logs of both staged revisions; L8 smoke | open |
| D10 Gilligan data in `(default)` on the mirror | High | mirror run settings | Claude | Mirror rerun of G1-G3 with `FIRESTORE_DATABASE_ID=gilligan`; census shows no `gilligan_usage` in `(default)` | open |
| D1-D3 cadence, silent pods, stuck sensors | High | mirror | Claude | Census of reseeded mirror shows production's interval, age and repeat patterns; report audit #3 and #4 reproduce on the mirror | pending R4 |
| C quota limits and store | High | deployment | user | Startup log; G1 on staging with a limit of 20 | open |
| Mirror runs under the production project id | High (safety) | server code, mirror | Claude, user decides whether it ships | `feat/firestore-config` unit test 4/4 and emulator probe; mirror README updated | code done, mirror open |
| D4-D8 ranges, lat type, volume, overlap, active dangling organization | Medium | mirror | Claude | Census comparison; one-year report and CSV export timed on the mirror | pending R2-R4 |
| E3 and R4 chat size and body limit | Medium | code | Claude (cer-demo), user (server) | H5 rerun shows a readable message instead of "request entity too large" | open |
| R7 production build never run on the mirror | Medium | test procedure | Claude | Preflight and G1-G3 pass against both images | open |
| R2, R3 cold start and timeouts | Medium | deployment | user | R9; first-answer time at L6 | pending R9 |
| E7 TTL on usage documents | Low at launch | code, then deployment | Claude, then Michael | TTL read shows the policy on `expireAt` | open |
| E2, E4, E8, R1, R6, D9, D11, D12 | Low | none | - | As in their sections | - |

## 6. Live reads

`scripts/exploreFirestoreParity.sh` runs every production read below with the user's own `gcloud` login and prints only aggregates: counts, field names, value types, numeric ranges, reporting intervals and document sizes.
No document id, name, email, device label or free text is printed or written to disk.
It was first run against the local emulator only, which produced the mirror column.

| read | what it asks | mirror (2026-09-26) | production |
|---|---|---|---|
| R1 | Collections and document counts | `chats` 87 (52 seeded plus end-to-end runs), `devices` 15, `gilligan_usage` 9, `organizations` 9, `users` 27, `water-data` 8,640 | pending |
| R2 | Users' `organization` type and whether it names an existing organization, by role | All strings: 8 superadmin, 4 admin and 14 customer name existing organizations, 1 customer is empty | pending |
| R3 | Device field types and organization references | 13 existing, 2 missing organizations; 1 device merged and archived | pending |
| R4 | The 2,000 newest readings: types, ranges, intervals, last-reading age, repeated values | 5 pods, every interval 60 minutes, last reading 5 hours old, no value repeated more than twice; `lat` and `lon` are doubles | pending |
| R5 | Chat sizes and message fields | Largest about 1.0 MB (the padded H5 chat), median 3 KB | pending |
| R6 | Organization field types | `name` only | pending |
| R7 | Databases: location, mode, protection | - | pending |
| R8 | Composite indexes, field overrides and TTL on `(default)` | - | pending |
| R9 | `cer-api` timeout, concurrency, resources, scaling, environment variable names | - | pending |
| R10 | Cloud Run service names in us-central1 | - | pending |

## 7. Launch-day changes

Everything that differs from the last mirror run, in order; nothing else should change.

1. Michael, before L5: create the `gilligan` database in us-central1; create `cer-gilligan-runtime`; grant it Datastore User conditioned on `gilligan` and Secret Accessor on its two secrets; create any index R8 shows missing; allow unauthenticated invocation of `cer-gilligan`; disable the `cer-ui` build trigger.
2. User, L5: add the Fireworks key and the shared service key as secret versions; deploy `cer-gilligan` with the cer-demo settings in section 3 and minimum instances 1.
3. User, L6: deploy the server revision with no traffic and the server settings in section 3; `cer-api`'s default compute account also needs Secret Accessor on the shared service key.
4. L8 staged smoke, then L9: route traffic and set `GILLIGAN_BACKEND=rag`, as the release plan orders it.

Rollback remains routing traffic back to the previous revisions; there is no working Gemini fallback (decision D9).
