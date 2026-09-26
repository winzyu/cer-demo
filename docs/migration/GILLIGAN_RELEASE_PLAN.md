# Gilligan release plan, September 24-30

Current at `dev` `621da45` plus this edit (2026-09-25, late, after the user's decisions on the open items). Written 2026-09-24, after the supervisor's answers to the stakeholder questions and the marked-up catalogue review (`review-marked-up.html`, untracked at the repo root).
The goal is unchanged from [`RELEASE_GOAL_AND_PLAN.md`](RELEASE_GOAL_AND_PLAN.md); this file replaces the dates in [`GILLIGAN_TARGET_ARCHITECTURE.md`](GILLIGAN_TARGET_ARCHITECTURE.md) §4 for the last six days.
Task IDs (P1, Q2, ...) are for this plan only.

## 1. What the answers decided

| topic | answer | consequence for the plan |
|---|---|---|
| Goal and answer types | Data answers, cited education or approved guidance, clarifying questions, honest refusals, one-pod PDF reports; never another organization's data. | Matches the existing goal; no scope change. |
| Quality floor | Block or refuse a question Gilligan cannot answer well. | Architecture decision D3 settles on refusal over caveat for weak classes found by R4 (E3). |
| Usage limits | 20 messages and 5 reports per user per day; token cap to be decided. | Daily windows, reports 5 not 3, token cap 1,000,000 per user per day as a configurable guard (O3, S3). |
| Chat features | Pod picker, question visible while waiting, formatted tables, citations, near-limit message, saved history; extras reviewed at the demo. | Dashboard work U1-U5. |
| Disclaimer | "Content is AI generated, be sure to double check answers, turbidity is qualitative." | U1. |
| Live backend writes | Allowed for test users and organizations, deleted before launch. | Live isolation test data (T1-T3); every created ID goes in a cleanup ledger. |
| New GCP service | Allowed. | cer-rag deploys to Cloud Run in the production project (L5-L7). |
| New Firestore collections | Allowed after the supervisor sees a table of the data framework. | F1 blocks the persistent usage store and any Firestore corpus. |
| Deployment path | Create a version, test it from localhost, then route traffic to it. | Stage revisions with no traffic, test, then switch (L6-L8). |
| Period-query data hole | Fix it if legitimate; permission granted. | P3 is release-blocking. |
| Gemini-era chats | Not answered. | Architecture decision D2 stands: ignore them. |
| Wide alert limits | Unintentional; the supervisor fixes them in the superadmin view. | Q5: until fixed, a limit wider than the sensor's range reads "not assessed". |
| CWA Old pod | Still Cleveland Water Alliance's; its old organization should be null because the pod merged into the new one. | Q6 verifies the merge chain with a null organization. **2026-09-25:** an organization id that does not exist counts as null too (user decision), so CWA Old merges into OWC 2026. |
| Pod moved between sites | Default to the current site, unless the user asks otherwise; reports cover the current site. **Tightened 2026-09-25 (supervisor, through the user):** chat and reports cover only the current site; readings recorded elsewhere are never reported. | Q3, release-blocking for OWC 2026: the merged chain is about 70% North Carolina and Utah rows, so the merge (Q6) and the site filter (Q3) ship together. |
| Turbidity hardware | Every pod is Keyestudio; a superadmin checkbox will record the sensor later. | Items 3, 4, 11 and 18 close; no sensor-model work for launch. |
| Missing turbidity | Failing sensors read a flat 0 or 1005 with no variance; Gilligan should call that abnormal. | Q4 generalizes the all-zero flag to stuck runs at 0 or 1005. |
| Chat retention | Keep chats. | Indefinite retention; who may read them is still open (O5). |
| Catalogue questions | All four supervisor questions answered in the marked-up review. | C1 applies the edits; C3 still needs the supervisor's per-entry approval. |

## 2. Still open

Each has a default so work does not wait.

| # | question | who | default if unanswered by |
|---|---|---|---|
| O1 | Which CER support contact do referrals and fault messages use? | supervisor | **Answered 2026-09-24:** sales@cleanearthrovers.com, or the customer's existing CER contact |
| O2 | How are the dashboard and server deployed today (platform, who merges, who deploys)? | user | **Answered 2026-09-24:** the user merges and deploys; platform details go in the runbook's §2 inputs |
| O3 | Token cap per user per day. | user | **Answered 2026-09-24:** 1,000,000 tokens per user per UTC day as a runaway guard, as an environment variable; the 20-message cap is the working limit (`timeline.md`) |
| O4 | Catalogue decisions marked "your decision". | user | **Answered 2026-09-24:** every entry approved, marked-up ones as edited (50% confidence, both referral renames); the "Industrial" label rename and the inland entry were review notes, not entry edits, and were not applied |
| O5 | Who may read saved chats (support staff, organization admins)? | supervisor | Only the author; nobody else has an access path at launch |
| O6 | R1 scope (the last item in STATUS "The user's" list). | user | **Answered 2026-09-24:** the default, S1-S6 as written, with `/gilligan/answer` and identity tokens after launch |
| O7 | Did the malware ever run on a build machine (Cloud Build, App Engine)? | user | **Answered 2026-09-24:** yes; the user was told every credential has been rotated. Build and deploy only from the clean feature branches, with no build cache or image from before the cleanup |
| O8 | Relax the `CLAUDE.md` rule against checking out `main` or `develop` now that their tips are clean. | user | Keep the rule; P1 proposes wording |

## 3. Tasks

Priority: **must** blocks launch, **should** ships if ready by Sep 28, **after** is post-launch.
"Session" names the starting prompts given on 2026-09-24 (#1-#5).

### Eval (R4), session #1

| id | task | owner | priority | depends on | due |
|---|---|---|---|---|---|
| E1 | **done 2026-09-24** (`1cc508e`, `30eb285`). `--run` support in `grade:packet` and the judge; build the 32-row calibration packet | Claude | must | none | Sep 25 |
| E2 | **done 2026-09-25** (`387cbce` on `eval/wave1-corrections`). The user graded the packet; after a judge-prompt fix (`49e28ae`) and Claude's adjudication of four rows at the user's request, correctness kappa is 0.849 against the 0.70 bar; on a 12-row held-out round (`309da6c`) it agrees on 9/12 exactly, all within one point | user | must | E1 | Sep 26 |
| E3 | **done 2026-09-25** (`4e74603` on `eval/wave1-corrections`). Final two-arm capture judged twice with `--final`: correctness 1.01 on gold context and 0.58-0.59 on `hybrid-slice-vector`, both failing the Tier 2 gates; about $3.38, R4 about $11.30 of $20. `dev` was not re-merged: its tools-off prompt is byte-identical to the merge base's | Claude, user approves | must | E2, Q1 | Sep 27 |
| E4 | For each class under the bar, add a refusal (or a caveat where the answer is sound but partial). The 2026-09-25 improvement round (reranker 0.62, reasoning `high` 0.88 against 1.00) raised no class; three outside reviews of rubric strictness await the user's synthesis (`eval/reviews/phase3-2026-09-23/HANDOFF.md` on `eval/wave1-corrections`) | Claude | must | E3 | Sep 28 |
| E5 | Tools-on live smoke with the release configuration (live reads, approval) | Claude | must | Q1-Q5, C4 | Sep 28 |
| E6 | R4 report, top-k 20 into `SPECS.md`, decisions into `timeline.md`, land `eval/wave1-corrections` on `dev` | Claude | should | E4 | Sep 29 |

### Answer quality, session #2 and a follow-on

Q1 is session #2; Q2-Q6 follow in the same or a new worktree cut from `dev` once Q1 lands, because they touch the same tool files.
All stay inside tools-on prompt blocks and tool results, so R4's tools-off captures are unaffected.

| id | task | owner | priority | depends on | due |
|---|---|---|---|---|---|
| Q1 | **done, landed on `dev` 2026-09-24.** QA findings 1-5 and 7: today's date in the prompt, reading age in `list_pods` and `query_sensor_data`, the parameter behind `generate_report`'s status, guidance to use min or series for claimed spikes and to relay tool notes | Claude | must | none | Sep 25 |
| Q2 | **done 2026-09-24.** Record the answers: `STAKEHOLDER_QUESTIONS.md` (items 1-4, 10, 11, 18, 21, 22), decisions in `timeline.md`, quota and deploy changes in `GILLIGAN_TARGET_ARCHITECTURE.md` | Claude | must | none | Sep 25 |
| Q3 | Current-site filtering (**scope changed 2026-09-25**: current site only, no option for earlier sites): split a device's readings, including merged-chain history, into sites by coordinates; every query, comparison and report uses only the latest site; answers and reports may say that readings from an earlier location were excluded but never report them; verify first that `/water/period` rows carry coordinates for every pod, and define the behaviour for rows without them  **Implemented 2026-09-26** by Codex on `task/q3-q5` (`847f4c8`, merged with Q6 in `4f359d3`), not landed: review follow-ups pending (bounded reads with cached site boundaries instead of a one-year read per question; the live coordinate audit across the five pods; two Q6 tests fail once the site filter applies) | Codex, Claude reviews | must | Q1 | Sep 26 |
| Q4 | Stuck-sensor detection: a sustained zero-variance run at 0 or 1005 is flagged as a likely failed sensor in tool results and reports, and is excluded before report pattern matching (the catalogue's engine check)  **Implemented 2026-09-26** on `task/q3-q5`, not landed: the sustained run must span at least 24 hours with continuous sampling, not three samples | Codex, Claude reviews | must | Q1 | Sep 26 |
| Q5 | Limits wider than the sensor's range read "not assessed" in `get_pod_thresholds` and reports, not "within limits"  **Implemented 2026-09-26** on `task/q3-q5`, not landed | Codex, Claude reviews | should | Q1 | Sep 27 |
| Q6 | CWA Old merges into OWC 2026 (**decided 2026-09-25**: an organization id that does not exist counts as null): server follow-up to P3 on a new branch from `task/gilligan-release-p3-p4`, plus cer-demo's chain expansion; fixture tests that its readings merge into OWC 2026, are visible only to CWA, and that a predecessor registered to another existing organization stays withheld  **Implemented 2026-09-26:** cer-demo `task/gilligan-cwa-old` (`b149379`, merged into `task/q3-q5`) and server `task/gilligan-cwa-old` (`510cf00`, pushed 2026-09-26, 10/10 scope tests, `tsc` clean). Before landing, `query_sensor_data` must withhold a predecessor the route refuses instead of failing, and the cer-demo hand-off must stay off until the patched server takes all cer-api traffic (server-first activation) | Claude | must | P3 | Sep 27 |
| Q7 | Near-limit field in the usage status (for U3) | Claude | should | S3 | Sep 27 |
| Q8 | Gaps left by Q1's paid re-check (`CONVERSATION_QA_2026-09-24.md`): relay the withheld-history note, paraphrase the water-type note accurately, and flag implausibly high dissolved oxygen with a saturation-aware check in the tool | Claude | should | Q1 | Sep 28 |

The 2026-09-25 report audit ([`REPORT_AUDIT_2026-09-25.md`](REPORT_AUDIT_2026-09-25.md)) lists 20 findings from 15 live reports; those not covered by Q3-Q5 need owners, above all the missing reading age in the PDF and the empty 1-day series on thin data (both high).

### Catalogue (R2)

| id | task | owner | priority | depends on | due |
|---|---|---|---|---|---|
| C1 | **done 2026-09-24.** Apply the marked-up edits and O4 decisions to `src/catalogue/catalogue.json` as a new version, then regenerate `docs/catalogue/review.html` from its generator | Claude | should | O4, O1 | Sep 25 |
| C2 | **not needed: the supervisor approved directly.** Send the regenerated review for per-entry sign-off (approve as written, with edits, or reject) | user | should | C1 | Sep 25 |
| C3 | **done 2026-09-24.** Supervisor signs off | supervisor | should | C2 | Sep 27 |
| C4 | **done 2026-09-24 except the deployment flag, which the runbook carries (L1).** Record approvals in the catalogue, turn on `CATALOGUE_PROMPT`, rerun catalogue and narrative suites | Claude | should | C3 | Sep 28 |

The catalogue is approved (`2026-09-24.1`), so the release runs `CATALOGUE_PROMPT=true`; the block adds about 21,000 characters to every chat prompt.

### cer-rag service and packaging (R1)

Worktree cut from `dev`; none of these files overlap Q1-Q7.

| id | task | owner | priority | depends on | due |
|---|---|---|---|---|---|
| F1 | **done 2026-09-24.** Firestore framework table for the supervisor: existing chat collections and the `audit` field, one new usage collection, and the corpus and chunk collections as optional (launch ships the corpus inside the image, so Firestore corpus is not needed) | Claude, then user sends | must | none | Sep 25 |
| F2 | **Approved 2026-09-25**, including the dedicated Gilligan database; the user is waiting for the technical permissions on the live Firestore, so Firestore work targets the local emulator mirror until then | supervisor | must | F1 | Sep 26 |
| S1 | Image packaging: ship `data/corpus/` and `data/embeddings/cache.json` in the image, `CORPUS_SOURCE=artifact`; build proof without local Docker (Cloud Build or a machine with Docker)  The Cloud Build route needs a `.gcloudignore` on `feat/service-release` that uploads `data/corpus/` and `data/embeddings/cache.json`; without one, `gcloud builds submit` falls back to `.gitignore`, drops `data/` and the Dockerfile copy fails (runbook §3.3) | Claude, user builds | must | O7 | Sep 26 |
| S2 | Service check between cer-api and cer-rag per runbook §5 (Cloud Run invoker IAM, or a shared secret header if §5's forwarding problem bites) The server half, `feat/service-key` (`9ef59b7`, sends the service key and verified user on every relay call), was pushed 2026-09-25 | Claude | must | none | Sep 26 |
| S3 | Firestore usage store with daily windows: 20 questions, 5 reports, O3 tokens per user per UTC day; keys from verified identity | Claude | must | F2 | Sep 27 |
| S4 | Fireworks 429/503 retry once, then "busy"; concurrency limit 8 | Claude | should | none | Sep 27 |
| S5 | Fireworks payment method and spending cap; `max-instances=1` if S3 slips. **Decided 2026-09-24:** CER replaces the cer-demo key with a key from its own paid Fireworks account, stored in Secret Manager; the in-app token cap, concurrency limit and instance ceiling are the other guards **2026-09-25:** the key swap and the credential rotation happen after the user has tested on the local mirror and approved the demo; behaviour fixes are verified on the mirror until then | user | must | none | Sep 26 |
| S6 | **Done 2026-09-25** (`LOCAL_STACK.md` on `docs/gcp-test-env`): Java 21, `firebase-tools` and `gcloud` installed; the usage-store emulator suite passes once its concurrency test gets a longer timeout. Firestore emulator (Java, `firebase-tools`) for S3 tests, or approval to test S3 against a live test collection | user | must | F2 | Sep 26 |

### Upstream server and dashboard, sessions #3 and #4 and a UX session

| id | task | owner | priority | depends on | due |
|---|---|---|---|---|---|
| P1 | **done 2026-09-24:** server `b2074b8` and dashboard `da5412f` pushed to `feature/gilligan-rag-assistant`; PRs held back (`UPSTREAM_PR_BODIES.md`). Publish: fetch and scan, cherry-pick `local` onto dashboard `origin/main` and server `origin/develop`, secrets and passthrough audit, push feature branches and draft PRs with named commands; propose the malware-rule update (O8) | Claude, user approves pushes | must | none | Sep 25 |
| P2 | The user merges the PRs after the demo (O2) | user | must | P1, L7 | Sep 29 |
| P3 | **Pushed 2026-09-25** (reviewed 2026-09-24): server `ccc759e` on local branch `task/gilligan-release-p3-p4` (fetched from the temporary clone) adds the null-organization rule for an explicit `null`; an organization id that does not exist (CWA Old) is still withheld on this branch and becomes null under Q6. Task E (1): membership check in `findPeriodWaterData` with organization-isolation tests from `test/fixtures/pod-scope/` | Codex, Claude reviews | must | P1 | Sep 26 |
| P4 | **Pushed 2026-09-25** (reviewed 2026-09-24): server `ccc759e` (`.eslintrc.js` reverted) and dashboard `9b1ed78` (charts and dial keep missing turbidity as a gap), same branch name. Task E (2) lazy `EmailService` and `PaymentService`; (3) ESLint parser if small; `turbVoltToNTU.ts` null; dashboard dial to 345/795 | Codex, Claude reviews | should | P1 | Sep 26 |
| P5 | Check the dashboard `confirm-email` "Attempted import error" does not break a production build | Claude | must | P1 | Sep 26 |
| P6 | **Pushed 2026-09-25** (reviewed that day): server `fix/user-route-auth` (`f9607bd`) closes the unauthenticated `/users/all`, `/users/:id` and `/test-db` routes (`SECURITY_FINDINGS.md` §8) | Claude | must | P1 | Sep 27 |
| U1 | Disclaimer line on the Gilligan page with the approved wording | Claude | must | P1 | Sep 26 |
| U2 | Question stays visible while the answer loads; verify on the rebuilt page first, fix only if it still disappears | Claude | must | P1 | Sep 26 |
| U3 | Near-limit message from the usage status | Claude | should | Q7 | Sep 27 |
| U4 | Tables render in answers (`remark-gfm` is installed; check styling and width) | Claude | should | P1 | Sep 26 |
| U5 | Citation titles end to end instead of addresses | Claude | should | P1 | Sep 27 |
| U6 | Pod picker and saved history: confirm both on the rebuilt page in the full local stack | Claude | must | P1 | Sep 26 |

U1-U6 share `src/app/gilligan/` and run in one Claude session after P1, in a worktree from the published dashboard branch; P4's dial change touches a different file.

### Live isolation testing

Live writes are approved for test data only; each creation is announced in chat and logged.

| id | task | owner | priority | depends on | due |
|---|---|---|---|---|---|
| T1 | **done 2026-09-24.** Plan the test set (two organizations with members, one with no pods) and a cleanup ledger in `docs/migration/` listing every created ID | Claude | must | none | Sep 25 |
| T2 | Offline first: a fabricated Firestore mirror in the local emulator (server `mirror/firestore-emulator` `7dc36e2`, run from `mirror/e2e-p3` with P3/P4) has passed its preflight (`GILLIGAN_E2E_RESULTS_2026-09-25.md` on `docs/gcp-test-env`); phase 1 ran 2026-09-25 (46 scenarios, 43 pass, 3 fail after bot-defect reruns: the orphan sees every pod in A1 and D4, invited-user login 500 in A3; also a chat past about 100 KB of history gets 413 from cer-demo's default body limit); the user approved $10 for the mirror's model calls on 2026-09-25. What must be re-checked on live data is [`LIVE_TEST_LIST.md`](LIVE_TEST_LIST.md). Live: create the test data; run isolation checks through the local stack: own pods answer, the other organization's pods refuse, the empty organization sees nothing, direct `/water/period` calls are refused once P3 is deployed | Claude, user approves each write batch | must | T1, P3 | Sep 27 |
| T3 | Delete every ledger entry and confirm none remain | Claude, user confirms | must | L8 smoke | Sep 30, before traffic |

### Deployment and launch (L)

| id | task | owner | priority | depends on | due |
|---|---|---|---|---|---|
| L1 | Rewrite the runbook for the user deploying, with the stage-then-route flow and the rollback for each service  **Done 2026-09-26** (`fa4103f`): stage-then-route for cer-gilligan, cer-api and cer-ui with a rollback for each; open L2 inputs are `[FILL]` markers | Claude | must | O2 | Sep 26 |
| L2 | Fill runbook §2 inputs; partly answered 2026-09-24 (below), more gathered 2026-09-25 with the dedicated Gilligan database decision on `docs/l2-inputs` (`9d448f8`, not on `dev`), the rest in an interview session with the user | user | must | L1 | Sep 27 |
| L3 | Hygiene session #5 (the `deviceApi` test, `git-plan` copy, settings paths); four commits on `chore/hygiene-2026-09-24` reviewed 2026-09-24, land when the session reports done | Codex, Claude reviews | should | none | Sep 25 |
| L4 | Freeze a release candidate on `dev` (all must tasks merged, typecheck, lint, named suites) | Claude | must | E4, Q1-Q4, S1-S3 | Sep 28 |
| L5 | Deploy cer-rag as a no-traffic revision; health, retrieval and one tools-on question against it | user, Claude assists | must | L4, L2 | Sep 28 |
| L6 | Deploy the server and dashboard branches as staged versions per O2; run the dashboard on localhost against them  The server needs one commit combining `feature/gilligan-rag-assistant`, `task/gilligan-release-p3-p4`, `fix/user-route-auth`, `feat/service-key` and `task/gilligan-cwa-old`, which diverge from `d12ad6d`; the user makes it before L6, not after the demo. Never use the repositories' own deploy scripts, which route all traffic at once (runbook §3) | user | must | P2 or staging access, L5 | Sep 29 |
| L7 | Supervisor demo on the staged stack | user, supervisor | must | L6 | Sep 29 |
| L8 | Staged smoke: one pod per test organization, a report, the limits, the disclaimer; then T3 | user, Claude | must | L7 | Sep 30 morning |
| L9 | Route traffic, set `GILLIGAN_BACKEND=rag`, production smoke with a real member account | user | must | L8, T3 | Sep 30 |

L2 answers so far (2026-09-24 and 2026-09-25):

- Project and region: the production project is `conductive-fold-343604` (confirmed 2026-09-25), project number `98242557946`; the live CER server is the Cloud Run service `cer-api` in `us-central1`.
- Cutover: the server is on Cloud Run, so staging is a revision deployed with no traffic, then a traffic switch.
- Device API: the same production base URL the local stack uses (`DEVICE_API_BASE_URL`, ending `/api/v1`).
- Image: the user builds the image locally first, then through Cloud Build before anything is pushed to the production project.
- Service name: `cer-gilligan` (proposed).
- Capacity, proposed until L5 measures it: 1 vCPU, 1 GiB memory, 300 s request timeout, request concurrency 8 (matching the model-call limit), minimum instances 0 (1 on demo and launch days to avoid a cold start), maximum instances 1 until the Firestore usage store (S3) is verified live, then 2.
- Caller identity (confirmed 2026-09-25): `cer-api` runs as the project's default compute account, `98242557946-compute@developer.gserviceaccount.com`, as do `cer-api-qa`, `cer-ui`, `cer-ui-qa` and `triggerendpoint`.
  Granting that account Cloud Run Invoker on `cer-gilligan` therefore lets all five services call it; accepted for launch because cer-gilligan fetches data with the caller's user token, so the exposure is Fireworks spend, not data.
  After launch, give `cer-api` a dedicated account and move the grant to it.
- Runtime identity: `cer-gilligan-runtime@conductive-fold-343604.iam.gserviceaccount.com`, to be created at L5.
- Operator permissions (checked 2026-09-25 with `testIamPermissions` and the audit log): on 2026-09-23 the project admin, Michael (`michael@cleanearthrovers.com`), replaced the user's Editor role with Cloud Run Developer, Cloud Build Editor, Datastore Viewer and Logs Viewer.
  The user can therefore build, deploy no-traffic revisions, switch traffic, read Firestore and read logs, but cannot create service accounts, act as one, grant IAM on services, touch Secret Manager, write Firestore or create indexes.
  Michael does the one-time setup before L5: create `cer-gilligan-runtime` and let the user act as it; store the Fireworks key and grant the runtime account access to it; grant the runtime account its Firestore reads and usage-store writes; seed the corpus and create its index (or grant the user rights to); and, once `cer-gilligan` exists, grant the default compute account Invoker on it.
  The user also cannot act as the default compute account (`testIamPermissions` on it returned nothing, 2026-09-25), so cannot deploy `cer-api` either; Michael grants the user Service Account User on that account before L6, or deploys the server revision themselves.
- Firestore (confirmed 2026-09-25): `(default)` and `qa-db`, both Native mode in `us-west3`; Gilligan uses `(default)`.
  The cross-region hop from `us-central1` adds tens of milliseconds per read, negligible beside a model call.
- Image registry: past builds push to `gcr.io/conductive-fold-343604/` (the `cer-ui` image); cer-gilligan's image goes to `gcr.io/conductive-fold-343604/cer-gilligan`, pushed by Cloud Build under its own account.
- Dashboard hosting: users reach it at `https://cleanearthrovers-datahub.app` (the server's `FRONTEND_URL`), a Google-hosted Next.js site; the dashboard's `cloudbuild.yaml` builds the `cer-ui` image and the Cloud Run service `cer-ui` has a continuous-deployment trigger, so the dashboard is `cer-ui` on Cloud Run (domain mapping not yet confirmed).
- Build trigger (found 2026-09-25): Cloud Build trigger `8ad67b17-5439-4507-9718-5b2b5eb4abe9` (`rmgpgab-cer-ui-us-central1-…`) builds `Clean-Earth-Rovers-Technology/user-dashboard` on every push to `main`, the branch that carries malware at HEAD.
  Its builds have failed since 2026-08-26, including on 2026-09-15, 09-23 and 09-24, so nothing reached `cer-ui` through it; the last successful `cer-ui` build (2026-08-26) was started by hand.
  Ask Michael to disable the trigger before launch; the L6 dashboard deploy is a manual Cloud Build from the clean branch, deployed with no traffic, never a push to `main`.
- Michael's reply (2026-09-25): he will revert the IAM changes so the user has what they need.
  If that means Editor again, it restores service-account creation, "act as", secrets, Firestore writes and the registry, but not IAM grants; Michael still grants the runtime account its secret and Firestore access and the default account Invoker at L5, and should disable the `cer-ui` trigger.
- Fireworks: the key is stored in Secret Manager as `cer-gilligan-fireworks-api-key`; `cer-gilligan-runtime` gets Secret Accessor on that one secret, and the service reads a pinned numeric version at startup.
- Release owner and incident contact: the user runs the release and is first contact; Michael is escalation for IAM and the upstream services.
- Capacity: the proposal above is accepted until L5 measures it.
- Test identities: isolation testing moves to the Firestore mirror's personas (`GILLIGAN_E2E_TEST_TICKET.md` on `docs/gcp-test-env`), so no test organizations are created on production and T2 and T3 shrink to nothing; the production smoke (L8, L9) uses the superadmin and one real member account.
  The identity and secret setup is rehearsed first in the user's project `cer-demo-2026`, then repeated in production.
- Gilligan's data (decided 2026-09-25): all of it lives in a dedicated Firestore database; the corpus ships inside the image (`CORPUS_SOURCE=artifact`, `MIRROR_PRODUCTION_PARITY.md` §3), so today that is only the usage store, (for example `gilligan`, in `us-central1`), so `cer-gilligan-runtime` has no grant on the customer `(default)` database; it reads pod data only through the server with the caller's token.
  Firestore IAM stops at the database, so a grant on `(default)` would let the runtime write users and devices.
  The new database needs Michael and the supervisor (as F1 does for new collections), and cer-demo needs a database setting for the corpus and usage store.
- Service-to-service check at launch (decided 2026-09-25): the shared service key (S2; server `feat/service-key` `9ef59b7`, cer-demo `requireServiceKey` on `feat/service-release`), which passed the mirror end-to-end run.
  Cloud Run's own IAM check stays off for launch, so `cer-gilligan` allows unauthenticated invocation and refuses any request without the key; the Invoker grant to the default compute account, and the runbook §5 identity-token change, move to after launch.
  This replaces the Invoker grant in Michael's list with two items: allow public invocation on `cer-gilligan` (an IAM change Editor cannot make; an organization policy may forbid it, to check), and store the key as a secret readable by both `cer-gilligan-runtime` and cer-api's default compute account; both reader grants are IAM changes, so Michael makes them (`MIRROR_PRODUCTION_PARITY.md` §7 step 3 lists the second under the user).
- Usage limits must be set explicitly in `cer-gilligan`'s configuration (20 messages, 5 reports, 1,000,000 tokens per user per day): the mirror run showed the quota store is unlimited when no limit is set.
- Empty-organization exposure (mirror finding 4, `GILLIGAN_E2E_RESULTS_2026-09-25.md`): a read-only query of production `users` on 2026-09-26, selecting only `organization` and `role`, found 27 users and no non-superadmin whose organization is missing, null, empty or an object without an id, so no current user sees every pod.
  The server still treats an empty organization as unfiltered, so the fix stays on the server list for after launch, or before it if any account is created without an organization.
- Still open: a structured inventory of every resource and grant, who creates it (the user or Michael) and how each is demonstrated, before anything is created in production.

There is still no working rollback to the Gemini backend (architecture decision D9); rollback means routing traffic back to the previous dashboard revision, which hides the new page.

## 4. Day by day

| day | Claude and Codex | user and supervisor |
|---|---|---|
| Thu Sep 24 | Start sessions #1 (E1), #2 (Q1), #3 (P1), #5 (L3) | O2, O3, O4, O6, O7; S5 |
| Fri Sep 25 | E1, Q1 land; Q2; C1; F1; T1; P1 pushes; start S1, S2; start #4 (P3, P4) | Approve P1 pushes; send C2 and F1; answer O1, O5 |
| Sat Sep 26 | Q3, Q4; S1, S2; P3 review; U1, U2, U4, U6; P5; L1 | E2 grading; F2; S6; build the image (S1) |
| Sun Sep 27 | E3 capture; S3, S4; Q5-Q7; U3, U5; T2 | Approve E3 spend and T2 writes; L2; C3 |
| Mon Sep 28 | E4, E5, C4; L4 release candidate; L5 | L5 deploy |
| Tue Sep 29 | E6; fixes from the demo | L6, L7; P2 merges |
| Wed Sep 30 | L8 support, T3 | L8, L9 launch |

Slack: Sep 29 absorbs one slipped day; anything "should" still open on Sep 28 moves to after launch.

## 5. After launch

- `/gilligan/answer` and identity tokens (R1 remainder), organization monthly token budget.
- Task C later slices: series chart, input controls, pod-status bar, error UX, time-range chips, feedback loop.
- Quantitative turbidity once the superadmin sensor checkbox exists.
- Phase 1e retrieval work, the slice-coverage overshoot, `ADVICE_TIER`.
- Dashboard `useSearchParams` Suspense fix; ESLint parser if P4 deferred it.
- Firestore corpus re-seed, only if a Firestore-backed corpus is chosen over the image.
