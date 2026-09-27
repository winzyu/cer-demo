# Mirror and production parity

Written 2026-09-26 for the Gilligan release.
The question: what must change so that code which passes on the Firestore mirror also works when it is pointed at CER's production Firestore, with nothing else to discover on launch day.
Sources: the mirror seeder (`clean-earth-rovers-server` `mirror/e2e-p3` `37fec03`, `scripts/mirror/`), the production field census in [`BACKEND_FIELDS.md`](BACKEND_FIELDS.md), the end-to-end results and `LOCAL_STACK.md` on `docs/gcp-test-env`, the "L2 answers so far" block of `GILLIGAN_RELEASE_PLAN.md` on `docs/l2-inputs`, and the code that ships: server `task/gilligan-release-p3-p4`, `feat/service-key`, `fix/user-route-auth`, and cer-demo `feat/service-release` (`cc8a300`).
Production is read-only for this work; every production figure comes from a live read the user ran and pasted back (section 6).

## The short answer

"Only the pointer changes" is reachable for the code, not for the deployment.
The code can be made identical: the server now takes its project and database from the environment (server branch `feat/firestore-config`, `0003170`, local and unpushed), and cer-demo already does.
Some launch-day changes can never be exercised on the emulator, because they are cloud resources the emulator does not have: the `gilligan` database, its IAM grants, the secrets, the TTL policy and the Cloud Run settings.
The indexes production's customer database needs already exist (R8), and `cer-api`'s timeout already exceeds the relay's (R9).
The data gaps that matter are the mirror being tidier than production: production pods report every 30 minutes, some fall silent for weeks, and failed readings put a billion in every metric (section 1).
The aim is therefore that each of those is written down once (section 7), rehearsed in `cer-demo-2026` where it can be, and checked by a read on the day.

Severity, for launch:

- **Blocker**: Gilligan does not work at all without it.
- **High**: wrong answers, or a data or security exposure, in normal use.
- **Medium**: a failure for some users or some questions.
- **Low**: cost, tidiness, or a failure only in unusual cases.

## 1. Data shape

In plain terms: the mirror is a made-up copy of production with the same collections and field names, so the code sees familiar documents.
Where the made-up data is tidier than the real data, bugs that depend on the mess stay hidden until launch.

What matches, confirmed by running the same census on both (R1-R6): the five collections and no others, so production has no separate events collection; 9 organizations holding only `name`; 27 users with the same password, `registrationDate`, `emailValidated`, `emailVerified` and capitalised `Organization` shapes; every user's `organization` a string, none a map; 15 devices with the same field types, 13 threshold sets of 10 string values, one device both merged and archived, `archived` once stored as the string `"true"`, one calibration date stored as a timestamp, the `lastCalibrationData` typo; readings with the same top-level fields and types, `lat` and `lon` stored as numbers in both.

What the mirror leaves out or makes tidier:

| id | gap | mirror | production (2026-09-26) | severity | fix |
|---|---|---|---|---|---|
| D1 | Reporting interval | Every pod reports every 60 minutes | Every reporting pod reports about every 30 minutes (median 29.95-30.1 minutes on all five); two pods have irregular gaps, up to 32 hours and 5.2 days | High: report audit #4 (`MIN_BUCKET_SAMPLES` against 1-hour buckets) only shows at this rate | Mirror: 30-minute readings, one pod with multi-hour and multi-day gaps |
| D2 | Silent pods | Every current pod's last reading is 5 hours old | Of the five pods that reported in the last 18 days, three reported within the hour and two stopped 280 and 323 hours (12 and 13 days) ago, and R11 shows both are current pods | High: a report can read "Normal" on two-week-old data (report audit #3) | Mirror: one current pod whose readings stop 13 days ago |
| D3 | Failure readings | Only turbidity ever reads `1000000000`, and only `turbError` is ever set | About 5 of 2,000 readings carry `1000000000` in every metric at once (oxygen, ORP, pH, conductivity, temperature, turbidity) with every error flag set | High: a reading of a billion degrees reaches any path that does not filter it; on the mirror the error-flag query in `findLastDataByDevice` never excluded anything | Mirror: whole-reading failures with all flags set, about 1 in 400 |
| D4 | Stuck or absent sensors | No non-zero value repeats more than twice; conductivity reads 0 in 10 of 2,000 readings | No non-zero value repeats more than three times either, so "stuck" shows as zeros: oxygen reads 0 in 35% of readings and conductivity in 23% | Medium | Mirror: one pod whose conductivity reads 0 for days, as Q4 expects |
| D5 | Value ranges | Oxygen 5.8-11.2 mg/L, pH 7.6-8.4, conductivity 351-49,994 µS/cm, ORP 180-300 mV, temperature 16-26 °C, turbidity code 72 always 0, `turbVolt` 0.2-1.0 | Oxygen up to 35.3 mg/L (median 12.7), pH 2.07 to the 14.00 rail, conductivity 76-177,200 µS/cm, ORP 120-818 mV, temperature 15.5-36.3 °C, code 72 reading 322-3,003 five times, `turbVolt` from -0.015 to the 5 V rail; conductivity is sometimes stored as a double | Medium: the implausible-value, rail and baseline checks never fire on the mirror | Mirror: widen ranges to production's, add pH and voltage rails, negative voltages, oxygen above 20, and non-integer conductivity |
| D6 | Volume and history | 8,640 readings over 30 days | 117,863 readings; merged-away labels reach back to 2023 with up to 19,286 rows each (`BACKEND_FIELDS.md` §4a) | Medium | Mirror: seed with `--days 365` and multi-year histories on merged-away labels, then time the one-year report and CSV export |
| D7 | Overlapping merge chains | Merged-away pods stop a month before the survivor starts | New Trinidad and Trinidad Island reported together for five months (`BACKEND_FIELDS.md` §4a) | Medium | Mirror: overlap one chain by a month and check reports do not double-count |
| D8 | Devices pointing at organizations that do not exist | Two, both retired | One (it was two on 2026-08-21): a merged-away pod last heard from about 2.9 years ago, the CWA Old case Q6 treats as having no organization (R11) | Low: the mirror's `Lakeside Legacy Pod` has the same shape | None; optionally drop the mirror's second one |
| D15 | Current pod dead for over a year | Every current pod reports | One current pod (not archived, not merged) last reported about 15 months ago (10,679 hours, R11), so it counts in "my pods" and fleet answers | Medium: fleet counts and "how are my pods" answers include a pod with no data for a year | Mirror: one current pod whose last reading is a year old |
| D16 | Age of retired histories | Merged-away and archived pods stopped 30 days ago | They stopped between 3 months and 2.9 years ago (R11), so their history never falls in a recent window | Medium: on the mirror a one-week question reaches predecessor data it never reaches in production, and a one-year question reaches none that it would | Mirror: date retired histories to production's ages |
| D9 | Superadmin with a missing organization | All 8 superadmins belong to the CER organization | 7 do; 1 superadmin's organization does not exist | Low: superadmins see every pod regardless, but they are not among the users the server alerts (`DevicesService` looks up superadmins of the CER organization) | Mirror: move one superadmin to a missing organization |
| D10 | Orphan user | One customer with an empty organization | None; every customer and admin names an existing organization | None: the mirror is deliberately stricter (finding 4) | Keep |
| D11 | Where Gilligan's own data lives | `gilligan_usage` in the customer `(default)` database, because the run set `FIRESTORE_DATABASE_ID=(default)` | Decided 2026-09-25: a dedicated `gilligan` database, so the runtime account has no grant on `(default)`; it does not exist yet (R7) | High | Mirror run: set cer-demo's `FIRESTORE_DATABASE_ID=gilligan`; the emulator serves named databases |
| D12 | Chat length | Longest chat 7 messages | Longest 31 messages (about 35 KB); 95% have 7 or fewer | Low: Gemini-era chats are neither listed nor continued (decision D2, end-to-end E group) | Mirror: one 31-message chat, to show it stays hidden |
| D13 | Merge chain arrays | `labels` arrays of 2 or 3 entries | One survivor's `labels` holds a single entry; 4 devices are merged away, not 5 | Low | Mirror: one single-entry `labels` array |
| D14 | Duplicate thresholds | One device with minimum equal to maximum | Two | Low | Mirror: a second all-zero set |

How to demonstrate: after reseeding, run `scripts/exploreFirestoreParity.sh --emulator` and compare it with the production output section by section; every production line should have a counterpart on the mirror at the same type and within the same range, except the counts in R1.

## 2. What the emulator lets through and production does not

In plain terms: the emulator is a stand-in that accepts almost anything.
Real Firestore refuses some requests the emulator accepts, and the refusals only show up in production.

| id | gap | what production does | our code | severity | fix |
|---|---|---|---|---|---|
| E1 | Composite indexes | A query that filters on one field and sorts on another fails with `FAILED_PRECONDITION` unless a matching composite index exists; the emulator never asks for one | The server's `water-data` queries need `device` + `timestamp desc`, and `device` + five `water_data.*Error` + `timestamp desc` (`WaterAnalyticsService.ts`). All come from upstream commits (`62993fe`, `f0dd8a2` and older), not from our branches; P3's new query is a single-field equality that needs none | Blocker if missing: every pod question and report fails | None: R8 shows all needed indexes `READY` (`device` + `timestamp desc`, and `device` + the five error flags + `timestamp desc`, which also serve the range and `in` forms); closed |
| E2 | Indexes in the `gilligan` database | Same rule | The usage store reads and writes by document id, so it needs no composite index. The audit-log listing (`caller` + `timestamp`) and the Firestore corpus source (`inDirectFeedSlice` + `filename`, and the vector index) would, but the release image fixes `CORPUS_SOURCE=artifact` and `AUDIT_LOG` defaults off | Low | None for launch; if `AUDIT_LOG` or `CORPUS_SOURCE=firestore` is turned on later, create those indexes first |
| E3 | Document size, 1 MiB | A chat document cannot grow past 1 MiB | Each answer rewrites the chat's whole `messages` array, now with citations and an audit block. A long chat breaks earlier on cer-demo's 100 KB request-body limit (finding 5) | Medium | Code: send only the last `MAX_HISTORY_MESSAGES` turns from the server, and give the page a "chat too long, start a new one" message; verify with H5 |
| E4 | Transaction contention | Real Firestore locks a document during a transaction and retries on conflict | The usage store updates one document per user per day inside a transaction; only one user's own parallel questions contend. The emulator test passed 25 contended updates with the right total | Low | None; the L8 smoke asks two questions at once from one account |
| E5 | IAM | Every call is checked against the caller's grants; the emulator accepts any caller | `cer-gilligan-runtime` needs Datastore User on the `gilligan` database only, and Secret Accessor on its secrets. A missing grant makes every question 503, because the usage check fails closed (`quotaGuard.ts`) | Blocker if missing | Deployment, Michael: grants per L2. Rehearsed in `cer-demo-2026` with the policy troubleshooter; shown in production by the L6 staged smoke |
| E6 | The database itself | A named database that does not exist returns `NOT_FOUND` | cer-demo opens `FIRESTORE_DATABASE_ID` at the first question | Blocker if missing | Deployment, Michael: create `gilligan` in us-central1; checked by R7 on the day |
| E7 | TTL | Real Firestore deletes documents when a TTL field passes; the emulator ignores TTL | `gilligan_usage` needs `expireAt`, not landed (`feat/service-release`); a TTL on `updatedAt` would delete the current day's counter | Low for launch, Medium after | Code first, then a TTL policy on `gilligan_usage.expireAt`; checked by the TTL read |
| E8 | Quotas and rates | About one sustained write per second per document; 500 writes per batch; `in` takes at most 30 values | No launch path comes near these; the server slices an organization's labels to 10 for `in`, a separate pre-existing defect | Low | None |

E1 is settled by the index list, so the scratch-database test in `cer-demo-2026` (seeding the mirror into a real database to make it refuse unindexed queries) is not needed for launch.
It becomes worth its $0.05 if a later change adds a query that filters on one field and sorts on another.

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
| `CER_RAG_TIMEOUT_MS` | Default 120 s | Default 120 s | Must stay below `cer-api`'s own request timeout, 300 s (R9), and cer-gilligan's 300 s; it does | - |
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
| R3 | Timeout chain | Dashboard, then `cer-api` (300 s, R9), then the 120 s relay, then cer-gilligan's 300 s, then the model queue's 20 s | - | None: the chain is ordered correctly; closed |
| R4 | Body size | Express's 100 KB JSON limit on both services; Cloud Run allows 32 MiB | Medium (same as E3) | Code, as E3 |
| R5 | Secrets | `.env` on the laptop, Secret Manager in production; surrounding quotes in a copied value become part of the secret | Medium | The user adds each secret version from their own terminal with quotes stripped; the staged smoke proves the key works |
| R6 | Instances | Maximum instances 1 until the Firestore usage store is verified live, then 2 (L2) | Low | None |
| R7 | Production build | The mirror ran the server with `ts-node-dev` and cer-demo with its dev runner; production runs the compiled images | Medium | Rerun the mirror preflight (P1-P7) and G1-G3 against both Docker images built locally, with `NODE_ENV=production`, before L5 |

A Cloud Run rehearsal in `cer-demo-2026` would measure R2 and R3 and prove the runtime account's IAM (E5) before production; it is optional and needs approval, and the L6 staged revision in production covers the same ground a day later.

## 5. Gap register

Owner "Claude" means work in cer-demo, the mirror or a local server branch; "user" means a cloud action or decision by the user; "Michael" means a grant or resource only the project admin can create.

| id | severity | fix in | owner | how verified | status |
|---|---|---|---|---|---|
| E1 composite indexes on `(default)` | Blocker if missing | deployment | - | R8: every index the server's queries need is `READY` | closed 2026-09-26 |
| E5 runtime IAM | Blocker if missing | deployment | Michael | Troubleshooter in production as in `cer-demo-2026`; L6 staged smoke answers a question | open |
| E6 `gilligan` database | Blocker if missing | deployment | Michael | R7 lists it in us-central1 | open (R7: not created yet) |
| C server Gilligan settings: `GILLIGAN_BACKEND`, `CER_RAG_BASE_URL`, `CER_RAG_SERVICE_KEY` | Blocker | deployment | user | R9 lists them on the new revision; startup log; L8 smoke | open (R9: none of the three is set today) |
| C cer-gilligan settings: `DEVICE_API_BASE_URL`, `FIREWORKS_API_KEY`, `FIRESTORE_DATABASE_ID`, service key | Blocker | deployment | user | Startup log of the staged revision; L8 smoke | open |
| D1-D3 cadence, silent pods, whole-reading failures | High | mirror | Claude | Census of the reseeded mirror matches R4 and R11; report audit #3 and #4 reproduce on the mirror | open |
| D11 Gilligan data in `(default)` on the mirror | High | mirror run settings | Claude | Mirror rerun of G1-G3 with `FIRESTORE_DATABASE_ID=gilligan`; the census shows no `gilligan_usage` in `(default)` | open |
| C quota limits and store | High | deployment | user | Startup log; G1 on staging with a limit of 20 | open |
| Mirror runs under the production project id | High for safety | server code, mirror | Claude; the user decides whether the server change ships | `feat/firestore-config` unit test 4/4 and the emulator probe; mirror README and scripts updated | code done, mirror open |
| D4-D7, D15, D16 zeros, ranges, volume, overlap, a year-dead current pod, retired-history ages | Medium | mirror | Claude | Census comparison including R11; one-year report and CSV export timed on the mirror | open |
| E3 and R4 chat size and body limit | Medium | code | Claude (cer-demo), user (server) | H5 rerun shows a readable message instead of "request entity too large" | open |
| R7 production build never run on the mirror | Medium | test procedure | Claude | Preflight and G1-G3 pass against both images | open |
| R2 cold start | Medium | deployment | user | First-answer time at L6 | open |
| R3 timeout chain | Medium | deployment | - | R9: `cer-api` allows 300 s, above the 120 s relay | closed 2026-09-26 |
| D5 `lat` type | - | - | - | R4: numbers in both; the `/water-data` 500 is a server defect in production too (below) | closed 2026-09-26 |
| E7 TTL on usage documents | Low at launch | code, then deployment | Claude, then Michael | TTL read on `gilligan` shows the policy on `expireAt` | open |
| D8, D9, D12-D14, E2, E4, E8, R1, R6 | Low | mirror or none | Claude | As in their sections | open or none |

Observed outside this task's scope, reported and not fixed here:

- Server `/water-data` validates `water_data.lat` as a string, but production stores numbers, so the route likely returns 500 in production as it does on the mirror (preflight P5).
- Production `(default)` has point-in-time recovery and delete protection off (R7), so an accidental delete of the customer database or a bad bulk write cannot be undone; worth raising with Michael.
- `cer-api` sets no `OPENAI_API_KEY` (R9) although `WaterAnalyticsService` reads one, and none of the `STRIPE_GILLIGAN_STANDARD_*` or `_PRO_*` ids the payment code reads; whichever features use them presumably fail today.
- The server's legacy `src/api/api_methods/db_config.js` still hard-codes the production project; nothing in the app imports it.
- `GilliganService` rewrites a chat's whole `messages` array without a transaction, so two answers finishing together in one chat can lose one.

## 6. Live reads

`scripts/exploreFirestoreParity.sh` runs every production read below with the user's own `gcloud` login and prints only aggregates: counts, field names, value types, numeric ranges, reporting intervals and document sizes.
No document id, name, email, device label or free text is printed or written to disk.
It was run first against the local emulator, then by the user against production on 2026-09-26 at 08:18 UTC.
R11 was added after that run; `--followup` runs it alone.

| read | what it asks | mirror (2026-09-26) | production (2026-09-26) |
|---|---|---|---|
| R1 | Collections and document counts | `chats` 87 (52 seeded, the rest from end-to-end runs), `devices` 15, `gilligan_usage` 9, `organizations` 9, `users` 27, `water-data` 8,640 | `chats` 52, `devices` 15, `organizations` 9, `users` 27, `water-data` 117,863; no other collection |
| R2 | Users' `organization` type and whether it names an existing organization, by role | All strings; 8 superadmin, 4 admin and 14 customer name existing organizations, 1 customer is empty | All strings; 7 superadmin, 4 admin and 15 customer name existing organizations, 1 superadmin names a missing one |
| R3 | Device field types and organization references | 13 existing, 2 missing organizations; 5 merged away; `labels` lengths 2, 2, 2, 3; 1 set with minimum equal to maximum | 14 existing, 1 missing; 4 merged away; `labels` lengths 1, 2, 2, 3; 2 such sets; otherwise identical types and counts |
| R4 | The 2,000 newest readings | 5 pods, every interval 60 minutes, newest reading 5 hours old on all 5, failures only in turbidity | 5 pods, intervals about 30 minutes, newest readings 0, 0, 0, 280 and 323 hours old, whole-reading failures with all error flags, wider ranges (section 1) |
| R5 | Chat sizes and message fields | Largest about 1.0 MB (the padded H5 chat), median 3 KB, up to 7 messages | Largest about 35 KB, median 4 KB, up to 31 messages; answers hold only `date` and `text`; no `assistant` field |
| R6 | Organization field types | `name` only | `name` only |
| R7 | Databases | - | `(default)` and `qa-db`, both Native mode in us-west3, pessimistic concurrency, point-in-time recovery off, delete protection off; no `gilligan` database yet |
| R8 | Composite indexes, field overrides and TTL on `(default)` | - | Four `READY` indexes on `water-data`: `device` + `timestamp desc`; `device` + the five error flags + `timestamp desc`; `device` + `date` in each direction; no single-field overrides, no TTL policy |
| R9 | `cer-api` configuration | - | Revision `cer-api-00061-xeq`, image `gcr.io/conductive-fold-343604/cer-api` with no commit label, timeout 300 s, concurrency 80, 1 CPU and 2 GiB, up to 100 instances, startup CPU boost, default compute account; 13 variables: `NODE_ENV`, `PROD_BASE_URL`, `FRONTEND_URL`, `DB_ENVIRONMENT`, `NODEMAILER_APP_EMAIL`, four Stripe ids, and as secrets `ACCESS_TOKEN_SECRET`, `STRIPE_SECRET_KEY`, `NODEMAILER_APP_PASSWORD`, `GEMINI_API_KEY` |
| R10 | Cloud Run services in us-central1 | - | `cer-api`, `cer-api-qa`, `cer-ui`, `cer-ui-qa`, `triggerendpoint`; no `cer-gilligan` yet |
| R11 | Per device: status, organization reference, hours since the last reading | 5 current pods at 5 hours; retired pods at 725 hours or never | 6 current pods: 3 within the hour, 2 at 281 and 324 hours, 1 at 10,679 hours; 5 archived at 2,224-9,842 hours; 3 merged away at 9,589-25,433 hours, the oldest the one with a missing organization; 1 merged and archived at 15,562 hours (read 2026-09-26 08:28 UTC) |

## 7. Launch-day changes

Everything that differs from the last mirror run, in order; nothing else should change.

1. Michael, before L5: create the `gilligan` database in us-central1; create `cer-gilligan-runtime`; grant it Datastore User conditioned on `gilligan` and Secret Accessor on its two secrets; allow unauthenticated invocation of `cer-gilligan`; disable the `cer-ui` build trigger.
2. User, L5: add the Fireworks key and the shared service key as secret versions; deploy `cer-gilligan` with the cer-demo settings in section 3 and minimum instances 1.
3. User, L6: deploy the server revision with no traffic and the server settings in section 3; `cer-api`'s default compute account also needs Secret Accessor on the shared service key.
4. L8 staged smoke, then L9: route traffic and set `GILLIGAN_BACKEND=rag`, as the release plan orders it.

Rollback remains routing traffic back to the previous revisions; there is no working Gemini fallback (decision D9).
