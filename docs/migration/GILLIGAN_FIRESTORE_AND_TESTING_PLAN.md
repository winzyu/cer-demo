# Gilligan on the live site: Firestore, test data and end-to-end testing

Draft for the user's review, written 2026-09-25 at `dev` `c4fe461`.
Nothing here has been executed against a live system; every live read, write or deploy below still needs its own approval.
It builds on the Firestore framework sent to the supervisor ([`GILLIGAN_FIRESTORE_FRAMEWORK.md`](GILLIGAN_FIRESTORE_FRAMEWORK.md), release plan F1), the live test plan and ledger ([`LIVE_TEST_DATA.md`](LIVE_TEST_DATA.md), T1) and the runbook ([`GILLIGAN_DEPLOYMENT_RUNBOOK.md`](GILLIGAN_DEPLOYMENT_RUNBOOK.md)).
Task IDs are the release plan's ([`GILLIGAN_RELEASE_PLAN.md`](GILLIGAN_RELEASE_PLAN.md)).

## 1. Summary

- Three pieces reach the site: the new Gilligan service (`cer-gilligan` on Cloud Run), the CER server (`cer-api`) with the relay and the P3 fix, and the dashboard page.
  Each is staged as a version with no traffic, tested from localhost, then given traffic.
- Testing climbs five levels, from offline fixtures to a production smoke; levels 1 and 2 can start today.
- Firestore needs one new collection (`gilligan_usage`) and extra fields on the existing `chats` messages.
  Two corrections to the framework table are needed before the supervisor approves it (§4.3).
- The recommendation for test data: run the isolation matrix on a local backend backed by the Firestore emulator (no approval needed), ask the supervisor for a fresh test database for the staged stack, and keep live test records to the minimum only production can prove, deleted before launch.
  The old `qa-db` is a fallback: its server runs an older codebase and its contents are unverified (§6).
  A "hide test records" flag is not recommended for launch.

## 2. Getting it onto the site

### 2.1 What exists and what is left

| piece | ready today | left before staging |
|---|---|---|
| `cer-gilligan` (this repo) | `dev` with Q1 and the approved catalogue | Land `feat/service-release` (S1-S4: packaged corpus and cache, service key, Firestore usage store, model-call gate); Q3 and Q4; freeze the release candidate (L4); build the image locally, then with Cloud Build |
| `cer-api` (server) | `feature/gilligan-rag-assistant` pushed (`b2074b8`) | Push P3/P4 (`task/gilligan-release-p3-p4`, `ccc759e`) and the service key (`feat/service-key`, `9ef59b7`) onto the feature branch |
| dashboard | `feature/gilligan-rag-assistant` pushed (`da5412f`) | U1, U2, U6, P5 (must), U4 and U5 if ready; P4's turbidity fixes (`9b1ed78`) |
| runbook | Draft for a third-party operator | L1 rewrite for the user as operator; L2 inputs |

### 2.2 The deployment sequence

1. Freeze the candidate: cer-demo commit, server commit, dashboard commit, image digest.
2. Deploy `cer-gilligan` with no public access and, the first time, no caller wired to it (L5).
   Check health, one document question and one tools-on question through its tagged URL.
3. Deploy a `cer-api` revision with `--no-traffic --tag=candidate`, carrying `GILLIGAN_BACKEND=rag`, `CER_RAG_BASE_URL` set to the Gilligan service URL, and the shared service key from Secret Manager (L6).
   The live revision keeps all traffic, so customers see nothing yet.
4. Point a local dashboard at the tagged `cer-api` URL and test (level 3 below); the supervisor demo runs the same way (L7).
5. Deploy the dashboard as a staged version by the same no-traffic method, if it runs on Cloud Run (the old `cer-ui-qa` service suggests the dashboard is `cer-ui`; confirm in L2).
6. Staged smoke and test-data cleanup (L8, T3), then route traffic on both, server first (L9).

Rollback is routing traffic back to the previous revisions; there is no working Gemini fallback (architecture decision D9).

### 2.3 Release environment checklist for `cer-gilligan`

Every guard in the service defaults to off or unlimited, so a variable missing from the release environment file fails open.
The file must set at least:

| variable | release value | default if missing |
|---|---|---|
| `QUERY_QUOTA` | `true` | `false`, no limits at all |
| `QUERY_QUOTA_STORE` | `firestore` | `memory`, resets on restart and per instance |
| `QUERY_QUOTA_WINDOW` | `1d` | `30d` |
| `QUERY_QUOTA_REQUESTS`, `QUERY_QUOTA_REPORTS`, `QUERY_QUOTA_TOKENS` | `20`, `5`, `1000000` | unlimited |
| `DEFAULT_RETRIEVAL` | `hybrid-slice-vector` | `stub`, no document answers |
| `CORPUS_SOURCE` | `artifact` | see runbook §3 |
| `SENSOR_TOOL`, `REPORT_TOOL` | `true` | `false`, no pod data or reports |
| `CATALOGUE_PROMPT` | `true` | `false` |
| `CER_RAG_SERVICE_KEY` | from Secret Manager | unset; production refuses to boot without it (`feat/service-release`) |
| `FIRESTORE_PROJECT_ID`, `FIRESTORE_DATABASE_ID` | production project, database per §4.3 | unset, `(default)` |
| `FIREWORKS_API_KEY` | CER's own key from Secret Manager (S5) | none |

The L5 check should read the effective configuration back (for example from `/api/v1/usage` showing a limit of 20) rather than trust the file.

## 3. Testing end to end

| level | setup | proves | cannot prove | needs |
|---|---|---|---|---|
| 0. Offline | Jest fixtures: `test/fixtures/pod-scope/` on the server, the quota and gate suites here | Isolation rules, merge chains, quota arithmetic, retries | Real tokens, real data, the browser | nothing |
| 1. Local stack, superadmin | Dashboard :3000, server :5001 with Gilligan served locally and everything else proxied to live, cer-demo :8010 (`LOCAL_STACK.md`, `run-local` skill) | The page, chat, tools, reports, citations, tables, disclaimer against real readings | Customer isolation (the token is superadmin), persistent history and quotas (memory stores) | Live reads, announced |
| 1b. Local stack with the Firestore emulator | As level 1, with `gilligan_usage` and `chats` in the emulator (S6) | Counters survive a restart and are shared by two local instances; long chats against the 1 MiB document cap | Production IAM | S6 (Java and `firebase-tools`) |
| 2. Local stack as a customer | Log in as a test member through the proxied live login; the local server reads the real token's claims | Isolation with real accounts: own pods answer, other pods and empty organizations refuse | The deployed P3 fix (the proxied `/water/period` is still production's) | Test users (§5); live writes approved per batch |
| 3. Staged cloud | Local dashboard against the tagged `cer-api` and `cer-gilligan` URLs | The deployed stack: IAM, service key, Firestore usage store, P3 on the real server, cold start, latency | Real customer traffic | L5, L6; spend for the smoke |
| 4. Production smoke | After traffic moves, one real member account | That customers get the new page | Anything not already proved | L9 |

Level 1 and the browser checklist ([`REPORT_BROWSER_CHECK.md`](REPORT_BROWSER_CHECK.md)) can run as soon as the dashboard session lands U1-U6; a level-1 pass on today's branches is also useful now as the baseline.
A dedicated end-to-end session should script levels 1 and 2 as a checklist with expected answers, so level 3 and the demo repeat the same questions.

## 4. Firestore plan

### 4.1 Collections for launch

| collection | database | document | fields | written by | notes |
|---|---|---|---|---|---|
| `chats` (existing) | production `(default)` | one conversation | as today, plus per answer `citations`, `audit`, `reports`, `tool_calls`, `tool_round_cap_reached` | CER server | Kept indefinitely; the author only reads it (O5). One document per conversation, so the 1 MiB cap needs the size measurement F1 promised. |
| `gilligan_usage` (new) | see §4.3 | `<userId>_<YYYY-MM-DD>` | `userId`, `organizationId`, `day`, `questions`, `reports`, `tokens`, `updatedAt`, plus `expireAt` (§4.3) | `cer-gilligan`, one transaction per question or report | Read by document id only, so no composite index. |

The existing `users`, `organizations`, `devices` and water-data collections are read by the CER server as today and never written by Gilligan.

### 4.2 Planned after launch

| addition | purpose | when |
|---|---|---|
| `gilligan_feedback` | Thumbs up or down and a note per answer, keyed to chat and message (Task C feedback loop) | after launch |
| `gilligan_org_usage` | Organization monthly token budget (release plan §5) | after launch |
| `corpus_documents`, `corpus_chunks` | Only if the library moves out of the image into Firestore | not planned |
| a `test` marker on organizations | Only if a permanent test organization is kept after launch (§6) | after launch, if chosen |

### 4.3 Two corrections before the supervisor approves F1

1. **The retention field.**
   F1 says `gilligan_usage` documents expire 90 days after `updatedAt`, and the code comments on `feat/service-release` say the same.
   A Firestore TTL policy deletes a document once its TTL field is in the past, so a policy on `updatedAt` would delete today's counter within about a day of writing it, resetting that user's limits.
   Fix: write `expireAt = updatedAt + 90 days` and put the policy on `expireAt`.
2. **Access scope.**
   F1 says the Gilligan service account gets read and write on `gilligan_usage` only.
   Firestore IAM cannot grant access to a single collection; the Datastore User role covers every collection in a database.
   Two ways to make the promise true:
   - put `gilligan_usage` in its own Firestore database (for example `gilligan`) and grant the role with an IAM condition on that database's name, so Gilligan cannot touch customer data at all (recommended; verify the condition syntax when setting up);
   - or grant the role on `(default)` and rely on the code only writing `gilligan_usage`, and say so in F1.
   `FIRESTORE_DATABASE_ID` already selects the database, so the first option costs no code.

## 5. Test users and organizations

Names start with "CER Gilligan Test" so they are recognizable in every list, and emails are plus-addresses on one mailbox the user controls.

| record | where | purpose |
|---|---|---|
| Organization Test A, admin A1, member A2 | live, or `qa-db` (§6) | Own-pod answers, per-user limits (A1 and A2 do not share counts) |
| Organization Test B, admin B1, no devices | live, or `qa-db` | Empty organization sees nothing; before-and-after evidence for P3 |
| A device for Test A with no real hardware | live, or `qa-db` | The no-data path |
| In `qa-db` only: copies of real pods with fabricated readings, a null-organization predecessor merged into a Test A pod, a predecessor owned by Test B merged into a Test A pod, eleven or more pods in one organization | `qa-db` | The positive path with real-shaped readings, the CWA Old rule, cross-organization chains, and the ten-label slice defect; none of these can be made on live without touching customer pods |

Every created id goes in the ledger in `LIVE_TEST_DATA.md` before the next record is created.
Cleanup covers everything a test user causes, not only what we create directly: their `chats` and `gilligan_usage` documents, invitation records from the team flow, and the verification mail.

## 6. Keeping test data out of sight: three options

| | A. Live, named, deleted before launch | B. Live, hidden by a flag | C. A development backend on `qa-db` |
|---|---|---|---|
| How | Create through the normal endpoints; delete from the ledger on Sep 30 (T3) | Add an `isTest` field and filter it out of every list endpoint and dashboard view | A `cer-api` revision with `DB_ENVIRONMENT=qa` and its own URL tag, and a `cer-gilligan` revision whose device API points at it |
| Approved | Yes (2026-09-24) | No | Not asked directly; the supervisor was asked in question B2 whether the old QA setup is usable, and did not answer that part |
| Who sees the records | Superadmins in the organization and user lists, and anyone calling `GET /api/v1/users/all`, which has no authentication (§8) | Anyone calling an endpoint the filter misses | Nobody outside the QA database |
| Covers | Real login, real production data paths | Same as A | Everything in §5, including fabricated readings and merge chains |
| Cost | Low; cleanup must be complete | Code changes in the server and dashboard days before launch, and every missed filter leaks | About a day of setup; seeding; a live read to see what `qa-db` holds today |
| Risks | A record missed in cleanup stays visible | A filter bug hides a real customer or shows test data | See below |

Option C's conditions:

- The QA revision needs its own `ACCESS_TOKEN_SECRET`.
  The server trusts the role and organization inside a token (`src/middleware/auth.ts`), so with the shared secret a superadmin created in `qa-db` would hold a token production accepts.
- Email and payment keys in that revision must be placeholders or test keys, so it cannot mail customers or charge anyone.
- It is never given traffic, and its tag is removed after launch.

### What is known about `qa-db` (checked 2026-09-25)

- This machine has no Google Cloud credentials: no `gcloud`, no Firebase CLI, and the service-account key is lost, so the database itself could not be read.
- The old QA server is still deployed at `https://cer-api-qa-98242557946.us-central1.run.app`.
  It answers with a NestJS-style error body and has none of today's routes (`/api/v1/*`, `/health`, `/test-db` are 404; `/devices` is 401), so it runs a different, older server codebase than the Express server on the feature branch.
  `qa-db` may therefore hold an older document shape than today's `users`, `organizations`, `devices` and water-data collections.
- An authenticated read of its device list was not made; it needs the user's approval, because it is a read against the production project with the superadmin token.
- Still unknown: whether `qa-db` still exists, its mode (it must be Native mode for the server's library), its collections and counts, and its last activity.

To answer those, the user runs, after installing `gcloud` and logging in:

```bash
gcloud firestore databases describe --database=qa-db --project=conductive-fold-343604   # exists, mode, location, created and updated times
curl -s -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  https://firestore.googleapis.com/v1/projects/conductive-fold-343604/databases/qa-db/documents:listCollectionIds -d '{}'
gcloud run revisions list --service=cer-api-qa --region=us-central1 --project=conductive-fold-343604   # last deploy
```

Last read and write activity is on the console's Firestore page: select `qa-db`, then the Usage tab (Cloud Monitoring keeps about six weeks).
Firestore records no per-database "last accessed" time beyond that; document `updateTime` values give the last write to each document.

### Two more options: a backend of our own

| | D. Local backend on the Firestore emulator | E. A new named database |
|---|---|---|
| How | Run the CER server fully locally (nothing proxied) with `FIRESTORE_EMULATOR_HOST` set and its own `ACCESS_TOKEN_SECRET`; seed users, organizations, devices and readings from `test/fixtures/pod-scope/`; point cer-demo's device API at it; the dashboard logs in against it | Create a database such as `gilligan-test` in the production project, or in a project the user owns, and point a staged server revision and `cer-gilligan` at it |
| Approval | None; nothing leaves the machine (S6 installs Java and `firebase-tools`) | Supervisor, for a new resource in their project; none for the user's own project, but see the cost below |
| Covers | Every row of §5, including fabricated readings, merge chains, the CWA Old rule and the ten-label slice, with real logins and the dashboard | The same, plus the deployed IAM, service key and Cloud Run behaviour (level 3) |
| Does not cover | Cloud Run, IAM, Secret Manager, the real production data | Real production data |
| Cost | Free | Pennies at test volume; only one database per project gets the free quota |
| Catches | If `FIRESTORE_EMULATOR_HOST` is unset by mistake the server falls back to real credentials, if any exist; the server hard-codes the project id, so a run should use a start-up check that refuses without the emulator | The server hard-codes the project id (`src/config/database.ts`), so a database in another project needs a small server change to read the project from the environment; a new database also needs its own seed |

**Recommendation, revised:** build option D now as the level-2 backend, since it needs no approval and covers the whole isolation matrix.
For level 3, ask the supervisor for option E in the production project (a clean database we create, seed and delete) rather than option C, since `qa-db` belongs to an older codebase and its state is unknown; fall back to C only if its checks above come back clean and current.
Keep option A for the minimum only production can show: one test member on the staged stack sees nothing from a real organization, and the empty organization B1 checks P3 on the real server.
Leave option B until after launch, and only if CER wants a permanent test organization.

## 7. Decisions and next steps

| # | decision or step | who |
|---|---|---|
| 1 | Ask the supervisor: may we create a test database in the project for the staged stack (option E), or use `qa-db` (option C)? Run the §6 `qa-db` checks first if C is still in play | user |
| 2 | Before F2: correct the retention field and the access scope in F1 (§4.3), and choose between a separate `gilligan` database and `(default)` | user, then the service session |
| 3 | Tell the service session to add `expireAt` to the usage document | orchestrator |
| 4 | S6: install the Firestore emulator; it backs both level 1b and the option D local backend | user |
| 5 | Run a level-1 baseline on today's branches (live reads, announced) | an end-to-end session |
| 6 | Build the option D local backend with the §5 test set; keep live test users (T1) to the option A minimum, each batch approved | an end-to-end session |
| 7 | L1 runbook: fold in §2.2 and the §2.3 checklist | L1 session |

## 8. Found while writing this

- `GET /api/v1/users/all` and `GET /api/v1/users/:id` in the server (`src/routes/userRoutes.ts` lines 17 and 72) have no authentication and return every user's email, role, organization and devices; found by reading the code on `feature/gilligan-rag-assistant`, not by calling production.
- `GET /api/v1/test-db` (`src/routes/testDbRoutes.ts`, mounted in `src/routes/index.ts`) has no authentication and reports the project id, database and whether the users collection is reachable.
- The server hard-codes the project id `conductive-fold-343604` (`src/config/database.ts`), which answers the L2 question about the exact project id, subject to a check in the console.
