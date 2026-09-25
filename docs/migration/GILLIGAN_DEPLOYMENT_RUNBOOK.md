# Gilligan deployment and handover runbook

Drafted 2026-09-23 for the September 30 release.
This is a preparation and execution checklist, not evidence that deployment is ready or authorization to deploy.
Local source inspection used cer-demo `50adac0` and clean-earth-rovers-server `local` at `1f4703d`; concurrent work must be reconciled against the chosen release commits before execution.
No cloud resources, production data, credentials, or paid model calls were accessed while preparing this document.

The intended release is defined in [target architecture](GILLIGAN_TARGET_ARCHITECTURE.md), especially §2, §4 and decisions D7-D12.
This document describes the deployment dependencies revealed by current code and the checks needed to close them.
The upstream owner executes cloud changes, or explicitly authorizes a named operator to execute them.
Production writes, paid evaluation, publishing and cutover require their respective approvals; writing this runbook grants none of them.

## 1. Readiness and immediate handover

**Do not cut over while the required implementation and verification rows below are open.**
Owners are proposed roles, not confirmed assignments.
The release owner must name a person for each role and record completion evidence in §9.

| prerequisite | observed state or remaining evidence | proposed owner | completion condition |
|---|---|---|---|
| Release sources | Multiple local workstreams are active; upstream changes have not been approved for publication | Release owner | Exact commits for all three repositories and an approved clean build source |
| Retrieval packaging | `Dockerfile` copies `dist/` but no embedding cache; `.dockerignore` excludes `data/` | Backend/build implementer | Release image contains the approved cache and passes offline validation |
| Internal answer contract | Relay calls `POST /api/v1/chat`; intended `/api/v1/gilligan/answer` is absent from the inspected route aggregator | R1 implementer | Relay and service agree on the implemented contract and pass contract tests |
| Service identity | Relay sends the user JWT only; application-level service-token verification is not wired in `src/app.ts` | R1 implementer and IAM owner | Cloud Run IAM and D12 application verification both pass positive and negative tests |
| Persistent quotas | Usage endpoint exists, but the store is in memory and keys are token hashes or IPs | R1 implementer | Verified user/org keys, persistent counters, agreed windows and restart/multiple-instance tests |
| Concurrency and retries | Architecture's model-call limiter and retry policy remain implementation requirements | R1 implementer | Bounded queue, refusal behavior and retry accounting demonstrated |
| Catalogue | Customer-visible content needs supervisor approval | Supervisor/release owner | Approved catalogue version, or explicit reduced-content release decision |
| Quality | Eval agent owns fresh baseline runs and fixes | Eval owner | Results identify the exact prompt, corpus, model and release candidate; weaknesses have an accepted disposition |
| Organization isolation | Upstream explicit-device and empty-organization holes are documented in [security findings](SECURITY_FINDINGS.md) §1 | Upstream backend owner | Fix/test evidence or explicit release decision describing remaining exposure; local pod checks alone do not close the upstream holes |
| Browser acceptance | Dashboard agent owns the browser pass | Dashboard owner | Results for final dashboard/relay commits, including reports and citations |
| Cloud prerequisites | Target project, database, region, service identities and current grants have not been verified here | Upstream IAM owner | Values and scoped permissions in §2 confirmed |
| Recovery | Existing Gemini path is recorded broken in architecture D9 | Release/operations owner | Named incident operator and agreed containment procedure; a tested prior RAG revision if one exists |

Proposed schedule checkpoints, to be accepted by the release owner:

- By September 25: assign owners, request access, settle catalogue scope, and agree the packaging/authentication implementation work.
- By September 28: demonstrate working access, finish required code, and rehearse the packaged candidate with isolated test identities and data where available.
- September 29: review the exact candidate's quality, isolation, browser and deployment evidence and make the go/no-go decision.
- September 30: perform the approved production smoke and cutover with an incident operator available.

These are planning checkpoints, not promises from other agents.
If required controls or access are still missing, the release owner must change the scope or date explicitly; a completed runbook does not satisfy those gates.

## 2. Operator inputs and permissions

Complete this table before preparing executable cloud commands.
Do not infer the deployment project or database from a developer's `.env` or historical census.

| input | required value/evidence |
|---|---|
| Release owner and incident operator | Names and escalation contact |
| Project and region | Confirmed project ID, deployment region and any networking constraints |
| Firestore | Project, database ID, location, approved corpus destination and R1 usage-store collection/schema |
| Image registry | Approved Artifact Registry repository and builder/publisher identity |
| cer-rag service | Cloud Run service name and, after creation, canonical service URL |
| Runtime identity | Dedicated cer-rag service-account email |
| Caller identity | Actual cer-api runtime service-account email and its hosting environment |
| Device API | Production base URL including `/api/v1`; connectivity from cer-rag |
| Fireworks | Upstream-owned secret resource and numeric version, exact chat model ID, embedding model matching the cache, approved spending budget |
| Capacity | CPU, memory, request timeout, request concurrency and instance ceiling, selected from measured candidate behavior |
| Test identities | Authorized non-superadmin users in two organizations, plus an empty organization in a suitable test environment |
| Cutover control | Exact upstream deployment/configuration mechanism, authorized operator, and containment mechanism |

The deployer needs Cloud Run deployment access, permission to act as the runtime service account, and access to the image repository.
Google lists Cloud Run Developer, Service Account User and Artifact Registry Reader for the ordinary deployment path; IAM changes, secret configuration and image publishing require additional scoped permissions held by the appropriate owner.
See [container deployment permissions](https://docs.cloud.google.com/run/docs/deploying).

The IAM owner grants cer-api's service account `roles/run.invoker` on cer-rag and checks that public invocation and broader inherited access do not defeat the intended restriction.
See [service-to-service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service).

Grant the runtime identity Secret Manager Secret Accessor on the specific Fireworks secret and pin the numeric secret version for the release.
Use the attached runtime identity for Google API access rather than packaging a service-account key.
See [Cloud Run secret configuration](https://docs.cloud.google.com/run/docs/configuring/services/secrets).

The seeding operator needs Firestore write access and the index operator needs permission to create the required index, as described in [corpus seeding](CORPUS_SEEDING.md) §3.
Runtime Firestore permissions must cover corpus reads and, once implemented, usage-store operations; confirm the final R1 schema before granting them.
The owner must also confirm Cloud Run, Artifact Registry, Secret Manager and Firestore are available in the selected project, with an approved build path.
No current grant, API enablement or cloud resource was verified for this draft.

## 3. Release artifacts and packaging

### 3.1 Freeze an identifiable candidate

Record the three repository commits, image digest, catalogue version, model IDs, corpus SHA-256 and cache SHA-256 in §9.
Use the reviewed corpus artifact rather than re-ingesting as a routine deployment step: OCR/chunking changes can invalidate evaluation labels and cache compatibility.
Do not rebuild paid embeddings unless the approved artifact is unavailable or incompatible and the rebuild is authorized.

From the release checkout, these local read-only checks identify the two data artifacts:

```bash
git rev-parse HEAD
sha256sum data/corpus/corpus.json data/embeddings/cache.json
```

Expected: one commit and two hashes matching the handover record.
Missing files or mismatched hashes stop packaging.
Neither file travels with an ordinary clone.

### 3.2 Close the image packaging gap

**Implemented 2026-09-24 on `feat/service-release`, superseding the recommendation below:** the image carries both `data/corpus/corpus.json` and `data/embeddings/cache.json` with `CORPUS_SOURCE=artifact`, so no Firestore corpus seeding is needed; the build checks both against `release/artifacts.sha256`, and `scripts/dockerContext.ts` lists the build context without Docker (see the Dockerfile's comments and `timeline.md` 2026-09-24).

Current evidence: [Dockerfile](../../Dockerfile), [.dockerignore](../../.dockerignore), [retrieval registration](../../src/retrieval/index.ts), and [LocalVectorAdapter](../../src/retrieval/adapters/LocalVectorAdapter.ts).
Production `hybrid-slice-vector` combines a Firestore document slice with dense retrieval over `data/embeddings/cache.json` relative to the process working directory.
The cache includes chunk text; runtime dense retrieval does not need to read the corpus artifact again.
The current image's working directory is `/app`, so the expected cache location is `/app/data/embeddings/cache.json`.

Recommended implementation: include only that approved cache in the immutable release image through a narrowly scoped build-context exception and explicit copy.
The build owner must implement and review this change; this runbook does not modify Docker packaging.
Do not broadly copy `data/`, developer `.env` files, backup files or credentials into the build context.
The corpus artifact is required on the seeding machine; with `CORPUS_SOURCE=firestore`, it is not required in the serving image for this retrieval path.

The build owner must produce an offline image check that loads the cache through `validateEmbeddingCache`, verifies its model/dimensions and confirms its chunk IDs and text correspond to the frozen corpus.
Structural validation alone does not prove the cache is from the chosen corpus.
Also verify the compiled catalogue JSON, report-rendering dependencies, startup command and configured port in the actual image.
Record the chosen base image and build/test results; the inspected Dockerfile uses `node:18-alpine`, whose suitability must be reviewed before selecting the release image.
Do not claim a successful local TypeScript check proves the container works.

### 3.3 Seed and verify the document slice

Follow [corpus seeding](CORPUS_SEEDING.md) §2-§4 for `npm run seed:firestore`, the composite index and the post-seed adapter query, using owner-approved credentials and destination.
That document includes historical direct-feed-only instructions: retain `DEFAULT_RETRIEVAL=hybrid-slice-vector` for this release.
Its sentence grouping `embed:cache` with Firestore chunk seeding is obsolete for D7: `embed:cache` builds the local cache, while `seed:firestore-chunks` writes the separate `corpus_chunks` collection.
Do not run `seed:firestore-chunks` for this production retrieval configuration.

Before writing, record the target project/database and the expected document and slice counts from the approved artifact.
On an existing destination, inventory stale entries and obtain approval for any `--prune` deletion; export affected data through the owner's approved backup procedure before destructive reseeding.
The intended slice query filters `inDirectFeedSlice == true` and orders by `filename`; verify its index is ready.
After seeding, compare sorted slice filenames and document text with the frozen artifact through `FirestoreCorpusSource.loadSlice()`.
An index error and an empty result are different failures; neither is a passing check.
Do not rely on the old guide's historical counts or its conflicting description of missing-index behavior.

## 4. Runtime configuration

Configuration names below exist in [src/config/index.ts](../../src/config/index.ts).
Prepare a reviewed non-secret environment file for the release; do not copy the developer `.env` wholesale.

| setting | release requirement |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Use Cloud Run's injected port; application already reads it |
| `DEFAULT_RETRIEVAL` | `hybrid-slice-vector`; never empty or `stub` |
| `CORPUS_SOURCE` | `firestore` under the current architecture |
| `FIRESTORE_PROJECT_ID`, `FIRESTORE_DATABASE_ID` | Explicit owner-confirmed values |
| `FIREWORKS_API_KEY` | Secret Manager reference, not plaintext in the configuration file |
| `LLM_MODEL` | Exact model ID used by accepted release evaluation |
| `EMBEDDING_MODEL` | Exact cache model ID |
| `DEVICE_API_BASE_URL` | Confirmed upstream URL including `/api/v1` |
| `SENSOR_TOOL`, `REPORT_TOOL` | Both `true` for the agreed product release |
| `QUERY_QUOTA` | `true`; does not itself make the store persistent |
| `QUERY_QUOTA_REQUESTS`, `QUERY_QUOTA_TOKENS`, `QUERY_QUOTA_REPORTS` | Explicit finite approved limits; the existing defaults are unlimited |
| `QUERY_QUOTA_WINDOW`, `QUERY_QUOTA_SCOPE` | Reconcile with final R1 implementation; current code has one shared window and `caller`/`global` scopes only |
| `CATALOGUE_DRAFTS` | `false` |
| `CATALOGUE_PROMPT` | Enable only for the approved catalogue and accepted prompt evaluation; reports also consume catalogue guidance independently |
| `AUDIT_LOG`, `DEBUG_RETRIEVAL` | `false` unless a reviewed operational requirement changes them |
| `LLM_MAX_TOKENS`, `MAX_TOOL_ROUNDS`, `DEVICE_API_TIMEOUT_MS` | Record explicit tested bounds |
| `WATER_TYPE` | Review the deployment default and per-pod handling against the release's supported sites |

Do not supply a deployment-wide `DEVICE_API_TOKEN` to answer customer requests.
The request-scoped device client must receive the user's JWT.
The planned user/day and organization/month limits cannot be represented by merely filling today's quota variables; publish the final R1 settings here after implementation.

For cer-api, record `CER_RAG_BASE_URL`, `CER_RAG_TIMEOUT_MS` and the eventual `GILLIGAN_BACKEND=rag` cutover.
The inspected relay defaults to a 120,000 ms timeout; align Cloud Run and upstream timeout budgets with tested worst-case requests.
Set upstream `NODE_ENV=production` and remove local-only `DEV_UNVERIFIED_AUTH`, `DEV_CHAT_STORE`, `DEV_UPSTREAM_BASE_URL` and `DEV_LOCAL_PATHS` configuration.
Validate real JWT verification and persistent chat storage rather than the local passthrough path.

## 5. Service authentication implementation gate

The current relay's `transport()` in `clean-earth-rovers-server/src/services/CerRagService.ts` sends `Authorization: Bearer <user JWT>`.
Cloud Run IAM expects a Google-signed service identity token, so this transport is not ready for the intended private service.
Apply the service authentication change to answer, report and usage requests consistently.

Cloud Run supports a service token in `X-Serverless-Authorization` while preserving the application's `Authorization` header.
Its audience remains the canonical service URL even when calling a tagged revision.
Google documents that the platform removes the signature from the serverless authorization token before forwarding it to the container.
See [authentication header behavior](https://docs.cloud.google.com/run/docs/authenticating/service-to-service).

Therefore D12's independent application verification needs an intact signed token delivered separately, or another explicitly reviewed header arrangement.
The R1 implementer must choose and document that contract, validate audience and allowed service-account identity, preserve the user's JWT for device calls, and exclude tokens from logs.
Do not assume decoding the platform-forwarded token satisfies signature verification.

Required evidence includes an authorized service call, rejection without service identity, rejection of the wrong service account/audience, rejection of forged user/org identity, and preservation of the caller's data scope.
Exercise application-level rejection through an isolated test harness; do not make production public to test D12.

## 6. Ordered deployment procedure

These are operator procedures for an approved candidate, not commands executed during document preparation.
Do not run the cloud template until §1 gates and §2 inputs are complete.

1. Record the clean release commits and required check results from each workstream.
   Upstream builds must use reviewed clean sources descended from `local`, never the known infected `main`/`develop` heads.
   Follow the repository malware scan after clone, fetch, pull or branch switch, and resolve findings before installing or building.
2. Package and test the cache-bearing image as in §3, publish it only to the approved registry, and record its immutable digest.
3. Configure owner-approved service identities, secret access, Firestore access and networking.
   Seed and verify the approved corpus before serving retrieval requests.
4. Deploy cer-rag privately, with the reviewed environment file and pinned secret version.
   For a first deployment, keep the upstream relay disconnected from the new service until verification completes.
   For an existing service, deploy a candidate with no normal traffic and a tag, preserving the known-good revision.
5. Confirm private invocation policy and run the checks in §7 using the authorized operator/relay identity.
6. Deploy the compatible upstream relay and dashboard through their owners' approved pipeline.
   Record the exact deployment revisions and validate production authentication/chat storage before enabling customer traffic.
7. Obtain the release owner's go decision, promote the accepted cer-rag revision if needed, and set the approved relay destination with `GILLIGAN_BACKEND=rag`.
   Restart/redeploy the upstream process so the new environment takes effect.
8. Perform the authorized production smoke, observe failures/latency/usage and follow §8 if a gate fails.

Cloud Run deployment template, with every variable supplied from the approved release record:

```bash
gcloud run deploy "$CER_SERVICE" \
  --project="$CER_PROJECT" --region="$CER_REGION" \
  --image="$CER_IMAGE_DIGEST" \
  --service-account="$CER_RUNTIME_SA" \
  --no-allow-unauthenticated \
  --env-vars-file="$CER_ENV_FILE" \
  --set-secrets="FIREWORKS_API_KEY=$CER_FIREWORKS_SECRET:$CER_SECRET_VERSION" \
  --cpu="$CER_CPU" --memory="$CER_MEMORY" \
  --timeout="$CER_TIMEOUT" --concurrency="$CER_CONCURRENCY" \
  --max-instances="$CER_MAX_INSTANCES"
```

For an update to an existing service, add `--no-traffic --tag=candidate` and record the returned revision and tagged URL.
The image reference must include `@sha256:...`; the environment file contains no secrets and must include the final R1 authentication settings once implemented.
The template omits project-specific ingress/networking and final R1 configuration until the owners supply them; resolve these before execution.
Cloud Run request concurrency is a capacity setting, not a substitute for the planned application model-call limiter or durable quotas.
See [deployment](https://docs.cloud.google.com/run/docs/deploying), [secret configuration](https://docs.cloud.google.com/run/docs/configuring/services/secrets), and [revision traffic management](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration).

## 7. Verification and release gates

Use isolated test data and mocks for negative authorization, saturation and quota-boundary tests before deployment.
There is no QA mirror of the production device API.
Announce production device reads, obtain the required paid-call approval, and agree a finite smoke budget before live verification.
Do not use a superadmin token as evidence of customer organization isolation.

| check | passing evidence | failure action |
|---|---|---|
| Packaged startup | Candidate image starts, binds the configured port and loads its catalogue/cache | Stop; repair packaging/configuration |
| Liveness | Authenticated `GET /health` returns `status: ok` | Inspect startup logs; do not cut over |
| Dependencies | Actual Firestore slice query and approved model/retrieval request succeed | Resolve permissions, corpus/index/cache or model configuration |
| Authentication | Missing/wrong service identity refused; intended relay succeeds on answer/report/usage paths | Keep relay disconnected |
| Document answer | Known datasheet question produces the expected source; a manual question exercises dense retrieval | Stop on stub, empty or mismatched evidence |
| Customer scope | Each of two ordinary users sees only their organization; foreign labels and unavailable predecessor history remain withheld | Stop and investigate isolation |
| Upstream empty organization | Backend test demonstrates an organization without pods cannot obtain unfiltered readings | Require upstream owner disposition before release |
| Quotas | Usage display agrees with enforcement; refusals precede work; counters survive restart and multiple instances | Stop or obtain explicit changed release scope |
| Concurrency/retries | Queue bounds, busy response and retry behavior pass controlled tests without duplicate spend/accounting | Repair R1 implementation |
| Reports | Authorized report returns a valid PDF with correct site/period; foreign-device request refused; report quota enforced | Stop report release |
| Browser/history | Final dashboard passes [browser checklist](REPORT_BROWSER_CHECK.md), with citations, reload/history, late-answer handling and phone layout | Return to dashboard owner |
| Quality/content | Final candidate matches accepted eval evidence and supervisor-approved content scope | Re-evaluate affected behavior or defer cutover |

`/health` does no network I/O and checks credential presence with booleans in [HealthController](../../src/controllers/HealthController.ts).
A green response proves process liveness, not valid credentials, working retrieval, quota persistence or safe customer access.
Record request IDs, response status, latency and redacted observations without recording tokens or unnecessary customer data.

## 8. Failure handling and recovery

Before cutover, the incident operator must have access to service logs, traffic controls and the upstream deployment mechanism.
Agree the observation period and alert thresholds from measured candidate latency/error behavior; record them in §9.
Watch service 5xx/timeouts, Fireworks failures, quota refusals, report failures and usage/spend against the approved budget.

If a candidate fails before cutover, leave the upstream destination unchanged and retain the failure evidence.
For a later release with a tested prior RAG revision, the operator may restore its traffic after confirming relay-contract and corpus compatibility:

```bash
gcloud run services update-traffic "$CER_SERVICE" \
  --project="$CER_PROJECT" --region="$CER_REGION" \
  --to-revisions="$CER_PREVIOUS_REVISION=100"
```

This changes service traffic, not Firestore data, upstream code or schema.
Retain the compatible prior relay build, image, configuration/secret version references and corpus record as well.
Revision rollback behavior is described in [Cloud Run traffic management](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration).

For the first RAG release there may be no working prior RAG revision.
Architecture D9 records that switching to `GILLIGAN_BACKEND=gemini` restores a broken backend, so it is not recovery.
Before enabling traffic, the upstream owner must specify a tested way to suspend new Gilligan answer/report requests and show an unavailable message if recovery is impossible.
No such maintenance control was verified in this inspection; its availability is a release prerequisite or an explicit owner decision.
For suspected cross-organization disclosure, stop affected access through that agreed mechanism, preserve redacted incident evidence and involve the upstream security owner before resuming.

## 9. Release record and outstanding decisions

Complete this record for the actual deployment, keeping secrets in their designated store.

| field | value |
|---|---|
| Named release, cloud, backend, dashboard, eval and incident owners | Pending |
| Approved date, scope and exceptions | Pending |
| cer-demo / relay / dashboard commits | Pending release selection |
| Image digest, base image, build evidence | Pending packaging implementation |
| Corpus/cache hashes, model IDs, catalogue version | Pending candidate freeze |
| Project, region, database, registry, service URL | Pending upstream confirmation |
| Runtime/caller identities and IAM verification | Pending |
| Non-secret configuration and secret version references | Pending |
| Final R1 contract, auth settings and quota schema | Pending implementation |
| Seed approval, backup/prune decision and verification | Pending |
| Eval, isolation, quota, browser and live smoke evidence | Pending |
| Live smoke allowance and actual usage | Pending approval/execution |
| Observation period, alert thresholds and incident contact | Pending |
| Prior revisions or first-release containment procedure | Pending |
| Go/no-go decision, operator and timestamp | Pending |

Draft validation: local source inspection and official Cloud Run documentation review only.
All relative link targets exist, and the three shell examples pass `bash -n`; these checks do not execute the examples or validate operator-supplied values.
Cloud commands, image builds, seeding, credentials, service startup and production acceptance were not exercised for this document.
Reconcile this draft with the final R1 implementation and the other agents' release commits before replacing any pending entry with a completion claim.
