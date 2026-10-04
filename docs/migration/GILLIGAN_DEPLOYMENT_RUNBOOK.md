# Gilligan deployment runbook

Rewritten 2026-09-26 for release task L1, for the user, who deploys the September 30 release themselves.
It replaces the 2026-09-23 draft, which is in this file's git history.
Nothing in it has been run against production; it is the procedure, not evidence that any step passed.
Task IDs (L5, S5, F2 and so on) are those of [`GILLIGAN_RELEASE_PLAN.md`](GILLIGAN_RELEASE_PLAN.md).

Every step follows one pattern, the deployment path the supervisor chose: deploy a Cloud Run revision that takes no traffic, test it from localhost, then switch traffic to it.
Each service keeps its previous revision, so rolling back is a traffic switch back (§7).

`[FILL: ...]` marks a value that is still open or only exists once a step has run.
Nothing in this file guesses one; fill each in §8 as it becomes known, and do not start a step whose inputs are still blank.

## 1. Before you start

These facts hold on 2026-09-26 and shape the whole procedure.

- **F2 is approved, but Firestore access is still pending.**
  The supervisor approved the Firestore framework table and a dedicated Gilligan database on 2026-09-25.
  The technical permissions on the live Firestore have not been granted yet, so all Firestore-backed behaviour has been verified only on the local emulator mirror.
  Do not deploy cer-gilligan with the release configuration (§4.1) until the dedicated database exists and the runtime account can reach it.
- **The Fireworks key swap and the credential rotation come after the demo is approved (S5).**
  Until then cer-gilligan runs on the cer-demo Fireworks key, stored as a version of the secret `cer-gilligan-fireworks-api-key`.
  After the supervisor approves the demo (L7), CER's own key becomes a new version of that secret, a new revision pins it (§6.5), and only then are the credentials rotated.
- **Deploy only the pushed feature and task branches, built from clean branches with no old build cache.**
  The upstream `main` and `develop` carry malware at HEAD, and the malware ran on a build machine ([`SECURITY_INCIDENT_2026-09-19.md`](SECURITY_INCIDENT_2026-09-19.md)).
  Every image in this release is built from a fresh checkout of a reviewed commit, with no `node_modules`, `.next`, `dist` or cached image layers from before the cleanup (§3).
- **Set every release environment variable explicitly, because the guards fail open.**
  A missing variable does not stop cer-gilligan; it turns a guard off, removes a limit, or points at the customer database (§4).
  The same holds for two cer-api settings.
- **There is no working rollback to the Gemini backend** (architecture decision D9).
  `GILLIGAN_BACKEND=gemini` restores a backend that fails every question, so rolling back cer-api or the dashboard means Gilligan is unavailable, not that the old assistant returns.
- **Staged tests use production.**
  A no-traffic revision still reads the production device API and Firestore, writes real chats and usage counts, and spends Fireworks credit.
  Test as the superadmin and one real member account (L2 answers); no test organizations are created in production.

## 2. Inputs (L2)

Known values, from the release plan's L2 answers:

| input | value |
|---|---|
| Project | `conductive-fold-343604`, project number `98242557946` |
| Region | `us-central1` for all three services |
| Services | `cer-gilligan` (new), `cer-api` (server), `cer-ui` (dashboard, served at `https://cleanearthrovers-datahub.app`) |
| Image registry | `gcr.io/conductive-fold-343604/` (`cer-gilligan`, `cer-api`, `cer-ui`), pushed by Cloud Build |
| cer-gilligan runtime account | `cer-gilligan-runtime@conductive-fold-343604.iam.gserviceaccount.com`, created by Michael before L5 |
| cer-api and cer-ui runtime account | the default compute account `98242557946-compute@developer.gserviceaccount.com` |
| Fireworks secret | `cer-gilligan-fireworks-api-key`; Secret Accessor for the runtime account on this secret only; pinned numeric version |
| Service check | shared service key (S2), sent by cer-api and required by cer-gilligan; Cloud Run IAM stays off for launch |
| cer-gilligan capacity | 1 vCPU, 1 GiB, 300 s timeout, concurrency 8, min instances 0 (1 on demo and launch days), max instances 1 until the usage store is verified live, then 2 |
| Usage limits | 20 messages, 5 reports, 1,000,000 tokens per user per UTC day |
| Release owner | the user, first contact; Michael is escalation for IAM and the upstream services |
| Dedicated Gilligan Firestore database | `gilligan` (proposed name), in `us-central1` next to cer-gilligan; Native mode; holds only the usage store, because the corpus ships in the image |
| Production device API base URL | `https://cer-api-98242557946.us-central1.run.app/api/v1`, the same URL the local stack uses |
| cer-api Cloud Run request timeout | 300 s (read 2026-09-26, `MIRROR_PRODUCTION_PARITY.md` R9), above `CER_RAG_TIMEOUT_MS` |
| Service key secret | `cer-gilligan-service-key` (proposed name) |

Still open:

| input | value |
|---|---|
| Service key secret version | `[FILL: version]`; readable by `cer-gilligan-runtime` and the default compute account |
| Fireworks secret version for the demo (cer-demo key) | `2` (added 2026-10-01) |
| Fireworks secret version after S5 (CER's key) | `[FILL: version]` |
| Whether an organization policy allows unauthenticated invocation of `cer-gilligan` | `[FILL: checked by Michael]` |
| Dashboard build keys (`_STRIPE_KEY`, `_HERE_MAP_API`, `_GOOGLE_MAP_API`) | `[FILL: read from the live cer-ui service, §3.4]` |
| Release commits | `[FILL]` for each repository (§3.1) |
| Credentials in the S5 rotation | `[FILL: the user's list]` |
| Fallback if Firestore access is still pending on Sep 28 | `[FILL: the user's decision]`; the plan's fallback is `max-instances=1` with the in-memory store, whose counts reset on every restart |
| Inventory of every resource and grant, who creates it and how it is shown | `[FILL: still open in the plan]`; the rehearsal in `cer-demo-2026` (`LOCAL_STACK.md`) is its draft |

### 2.1 One-time setup by Michael, before L5

The user's current roles cannot create service accounts, act as one, grant IAM, touch Secret Manager or write Firestore.
Michael does these, and each is checked off in §8 before L5:

1. Create `cer-gilligan-runtime` and let the user act as it (Service Account User on that account).
2. Grant the user Service Account User on the default compute account, which `cer-api` and `cer-ui` run as; without it the user cannot deploy either service, and Michael deploys those revisions instead.
3. Create the dedicated Gilligan Firestore database, and grant `cer-gilligan-runtime` Cloud Datastore User conditioned on that database alone, with no grant on `(default)`.
4. Store the Fireworks key as `cer-gilligan-fireworks-api-key` and grant `cer-gilligan-runtime` Secret Accessor on that secret only.
5. Store the service key (at least 32 characters) as its own secret, readable by `cer-gilligan-runtime` and the default compute account.
6. After cer-gilligan exists (§6.1), allow unauthenticated invocation on it (`allUsers` as Cloud Run Invoker), if the organization policy permits.
   Check first whether the domain-restricted sharing constraint (`iam.allowedPolicyMemberDomains`) applies to the project, since it rejects any `allUsers` grant.
   If it does, the fallback is to turn off Cloud Run's invoker check on the service instead (`gcloud run services update cer-gilligan --project=conductive-fold-343604 --region=us-central1 --no-invoker-iam-check`), which grants nothing to `allUsers`.
   That flag is refused in turn if the constraint `run.managed.requireInvokerIam` is enforced.
   If both are blocked, Michael asks the organization administrator for a project exception to either constraint, and L5 waits for it.
   If no exception is granted, the §5 identity-token change moves before launch: cer-api mints an identity token for each relay call, and the default compute account gets Cloud Run Invoker on cer-gilligan.
   That is a server code change that has not been built, so it delays the release rather than unblocking it.
   The service-key check (§5) stays in place under every option.
7. Disable the `cer-ui` Cloud Build trigger `8ad67b17-5439-4507-9718-5b2b5eb4abe9`, which builds on every push to the infected `main`.
8. The release commit writes `expireAt` on usage documents (90 days after the last update); add a Firestore TTL policy on `gilligan_usage.expireAt` in the dedicated database, never on `updatedAt` ([`GILLIGAN_FIRESTORE_FRAMEWORK.md`](GILLIGAN_FIRESTORE_FRAMEWORK.md)).

### 2.2 What differs from the mirror run

The local Firestore mirror is where release behaviour is verified; production must differ from the last mirror run only in the four ways below, and anything else that differs is a release risk.
The full comparison, with evidence from production reads, is [`MIRROR_PRODUCTION_PARITY.md`](MIRROR_PRODUCTION_PARITY.md) §3 and §7.

1. Cloud resources the emulator cannot have: the `gilligan` database, `cer-gilligan-runtime`, the two secrets, the IAM grants and the unauthenticated invocation (§2.1).
2. Settings: the §4 values replace the mirror's local ones; the mirror run used the same names with a test service key, the emulator host and localhost URLs.
3. Code: each service is built from a release commit (§3.1) that contains exactly the changes the mirror ran; the server's `mirror/*` branches are test-only and never ship, so compare the release commit with the mirror branch before building and expect only mirror scripts and seed data to differ.
4. Runtime: the compiled images with `NODE_ENV=production` instead of the development runners; run each image locally against the mirror before L5 (§3.3, §3.4).

Worth raising with Michael, outside the release: the customer `(default)` database has point-in-time recovery and delete protection off.

## 3. Release sources and clean builds

### 3.1 What to deploy

The table and the note under it predate the release candidate.
They record what each release commit had to contain when the plan was written, not the commits that ship.
The release commits, their contents and their checksums go in [`RELEASE_CANDIDATE.md`](RELEASE_CANDIDATE.md), which is still to be written.
Where the two differ, `RELEASE_CANDIDATE.md` wins, and its commits fill the `[FILL]` cells below and in §8.

| service | repository | release commit must contain | release commit |
|---|---|---|---|
| cer-gilligan | cer-demo | the L4 release candidate on `dev`, including `feat/service-release` (packaging, service key, Firestore usage store, model-call gate) and Q3-Q6 | `[FILL]` |
| cer-api | clean-earth-rovers-server | `feature/gilligan-rag-assistant` (`b2074b8`), `task/gilligan-release-p3-p4` (`ccc759e`, P3 and P4), `fix/user-route-auth` (`f9607bd`, P6), `feat/service-key` (`9ef59b7`, S2) and the Q6 branch `task/gilligan-cwa-old` once pushed | `[FILL]` |
| cer-ui | user-dashboard | `task/gilligan-release-p3-p4` (`9b1ed78`) and the U1-U6 and P5 branch `task/gilligan-ux` once pushed | `[FILL]` |

The server's four branches diverge from `d12ad6d`, so no single pushed branch holds them all yet.
Build each service from one pushed commit that contains every branch in its row, and record that commit before building.

### 3.2 A clean build directory

For each repository, build from a new worktree of the exact commit, never from a working checkout.

```bash
cd <repository>
git fetch origin
git worktree add --detach ../release-<service> <release commit>
cd ../release-<service>
grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .   # must print nothing
git status --short                                                    # must print nothing
ls -d node_modules .next dist 2>/dev/null                             # must print nothing
```

Stop if the scan prints anything.
Never build, deploy or `npm install` from `main` or `develop`.
Never run the repositories' own `deploy.sh` or `deploy-cloud-run.sh`: they build an untagged `latest` image and deploy it with all traffic, skipping the staging step.
Cloud Build starts each build on a fresh worker with no layer cache unless one is configured, and none of these builds configures one; a local Docker build uses `docker build --no-cache --pull`.
Deploy by image digest (`@sha256:...`), never by tag.

### 3.3 cer-gilligan image

The image carries `data/corpus/corpus.json` and `data/embeddings/cache.json`, and its build fails unless both match `release/artifacts.sha256`.
Neither file is in git, so copy both into the build directory as real files, not symlinks:

```bash
mkdir -p data/corpus data/embeddings
cp <main checkout>/data/corpus/corpus.json data/corpus/
cp <main checkout>/data/embeddings/cache.json data/embeddings/
sha256sum -c release/artifacts.sha256
```

Build and start it locally first (S1), if Docker is available:

```bash
docker build --no-cache --pull -t cer-gilligan:<commit> .
docker run --rm -p 8011:8080 -e PORT=8080 -e NODE_ENV=production -e CER_RAG_SERVICE_KEY=<any 32+ characters> cer-gilligan:<commit>
curl -s localhost:8011/health
```

Then check what Cloud Build would upload.
cer-demo's `.gcloudignore` is an allow-list: it uploads the Dockerfile, the package files, `tsconfig.json`, `src/`, `release/artifacts.sha256` and the two data files, and nothing else, so `.env` and credentials never leave the machine:

```bash
gcloud meta list-files-for-upload . | grep -v '^src/'
```

The list must show exactly `.dockerignore`, `.gcloudignore`, `Dockerfile`, `data/corpus/corpus.json`, `data/embeddings/cache.json`, `package-lock.json`, `package.json`, `release/artifacts.sha256` and `tsconfig.json`; stop if either data file is missing or anything else appears.

```bash
gcloud builds submit --project=conductive-fold-343604 --tag=gcr.io/conductive-fold-343604/cer-gilligan:<commit> .
gcloud container images describe gcr.io/conductive-fold-343604/cer-gilligan:<commit> --format='value(image_summary.digest)'
```

### 3.4 cer-api and cer-ui images

```bash
# in the server build directory
gcloud builds submit --project=conductive-fold-343604 --tag=gcr.io/conductive-fold-343604/cer-api:<commit> .
```

The dashboard bakes its build-time values into the image, so pass all of them.
`_API_URL` is the canonical cer-api URL, not a tagged one, because the released dashboard must follow whichever cer-api revision serves traffic.
The three keys are public browser keys; read them from the live `cer-ui` service the way `deploy-cloud-run.sh` does, without running that script.

```bash
# in the dashboard build directory
gcloud builds submit --project=conductive-fold-343604 --config=cloudbuild.yaml \
  --substitutions=_API_URL=https://cer-api-98242557946.us-central1.run.app,_IMAGE=gcr.io/conductive-fold-343604/cer-ui:<commit>,_STRIPE_KEY=[FILL],_HERE_MAP_API=[FILL],_GOOGLE_MAP_API=[FILL] .
```

Record each digest with `gcloud container images describe` as above.

## 4. Configuration

### 4.1 cer-gilligan

The file is cer-demo's `release/cer-gilligan.env.yaml`; `.dockerignore` and `.gcloudignore` keep it out of the image and the build upload.
It holds no secrets; the two secrets are attached with `--set-secrets` (§6.1).

```yaml
NODE_ENV: "production"
LOG_LEVEL: "info"
DEFAULT_RETRIEVAL: "local-vector"
QUERY_REWRITE: "true"
QUERY_REWRITE_FIRST_TURN: "true"
PREDECESSOR_PERIOD_HANDOFF: "false"
CORPUS_SOURCE: "artifact"
DEBUG_RETRIEVAL: "false"
FIRESTORE_PROJECT_ID: "conductive-fold-343604"
FIRESTORE_DATABASE_ID: "gilligan"
LLM_MODEL: "accounts/fireworks/models/glm-5p3-flash"
LLM_REASONING_EFFORT: "low"
EMBEDDING_MODEL: "nomic-ai/nomic-embed-text-v1.5"
LLM_MAX_TOKENS: "16384"
LLM_MAX_CONCURRENT: "8"
LLM_QUEUE_TIMEOUT_MS: "20000"
LLM_RETRY_DELAY_MS: "2000"
DEVICE_API_BASE_URL: "https://cer-api-98242557946.us-central1.run.app/api/v1"
DEVICE_API_TIMEOUT_MS: "10000"
SENSOR_TOOL: "true"
REPORT_TOOL: "true"
MAX_TOOL_ROUNDS: "16"
CATALOGUE_PROMPT: "true"
CATALOGUE_DRAFTS: "false"
AUDIT_LOG: "false"
WATER_TYPE: "freshwater"
QUERY_QUOTA: "true"
QUERY_QUOTA_REQUESTS: "20"
QUERY_QUOTA_REPORTS: "5"
QUERY_QUOTA_TOKENS: "1000000"
QUERY_QUOTA_WINDOW: "1d"
QUERY_QUOTA_SCOPE: "caller"
QUERY_QUOTA_STORE: "firestore"
QUERY_QUOTA_WARN_AT: "0.2"
```

Confirm at L4 that `LLM_MODEL`, `LLM_REASONING_EFFORT`, `LLM_MAX_TOKENS`, `MAX_TOOL_ROUNDS`, `DEFAULT_RETRIEVAL` and both `QUERY_REWRITE` settings are the values the release candidate was evaluated with, and that `EMBEDDING_MODEL` is the model the packaged cache was built with.
Never set `DEVICE_API_TOKEN` or `SENSOR_DEVICE_LABEL`: device reads must use the caller's own token.
`PREDECESSOR_PERIOD_HANDOFF` is read in `src/config/index.ts` and defaults to `false`; it is set explicitly because it stays `false` until the patched server takes all cer-api traffic, since an unpatched period route would return another organization's history.
The retrieval depth `DEFAULT_TOP_K` is 20, but it is a code constant in `src/retrieval/options.ts`, not an environment setting: `src/config/index.ts` does not read it, so it is deliberately absent from the file above.
Confirm at L4 that the release candidate's `src/retrieval/options.ts` still sets `DEFAULT_TOP_K = 20`, the depth the release was evaluated at.
`WATER_TYPE: "freshwater"` currently adds a water-type mismatch note to every salt-water pod's answers (mirror rerun, 2026-09-29).
Removing the line does not help, because `src/config/index.ts` defaults it to `freshwater`; Q10 T12 removes the note and keeps `WATER_TYPE` only as the fallback for pods with no registered type, and must land before rc2.

What happens when a variable is missing:

| missing variable | cer-gilligan then |
|---|---|
| `QUERY_QUOTA` | counts nothing and refuses nothing |
| `QUERY_QUOTA_REQUESTS`, `_REPORTS`, `_TOKENS` | treats that limit as unlimited |
| `QUERY_QUOTA_STORE` | counts in memory, per instance, reset on every restart |
| `QUERY_QUOTA_WINDOW` | uses a 30-day window (with the Firestore store it refuses to boot instead) |
| `FIRESTORE_DATABASE_ID` | writes usage documents into the customer `(default)` database |
| `DEFAULT_RETRIEVAL` | answers from the `stub` retriever, with no documents |
| `QUERY_REWRITE`, `QUERY_REWRITE_FIRST_TURN` | searches with the user's words verbatim, so follow-ups that do not name their subject retrieve poorly |
| `LLM_REASONING_EFFORT` | sends no reasoning setting, which `glm-5p3-flash` was not evaluated with |
| `SENSOR_TOOL`, `REPORT_TOOL` | answers without pod data or reports |
| `CATALOGUE_PROMPT` | answers without the approved catalogue guidance |
| `NODE_ENV` | skips the production checks; the image sets `production`, but set it anyway |
| `CER_RAG_SERVICE_KEY` | refuses to boot in production; in any other mode accepts every caller and trusts forged identities |

After each deploy, compare the revision's environment with the file; cer-gilligan's plain values are not secret:

```bash
gcloud run revisions describe <revision> --project=conductive-fold-343604 --region=us-central1 --format=json | jq '.spec.containers[0].env'
```

### 4.2 cer-api

The new revision keeps the live service's existing environment and secrets; add only these with `--update-env-vars` and `--update-secrets` (§6.2), never `--env-vars-file`, which would replace everything.

| variable | value | if missing |
|---|---|---|
| `GILLIGAN_BACKEND` | `rag` | Gilligan uses the broken Gemini backend |
| `CER_RAG_BASE_URL` | `[FILL: cer-gilligan's canonical URL]` | the relay calls `http://localhost:8010` and every question fails |
| `CER_RAG_TIMEOUT_MS` | `120000`, below cer-api's own request timeout | defaults to 120,000 ms |
| `CER_RAG_SERVICE_KEY` | secret `[FILL: service key secret]:[FILL: version]` | no key is sent and cer-gilligan refuses every relay call |

Remove the local-development switches as a precaution: `DEV_UNVERIFIED_AUTH`, `DEV_CHAT_STORE`, `DEV_UPSTREAM_BASE_URL`, `DEV_LOCAL_PATHS`.
`DEV_UNVERIFIED_AUTH=true` would accept unsigned tokens.
Check that the live service already sets `NODE_ENV=production`.
cer-api's environment holds plaintext secrets, so list only the variable names when checking a revision:

```bash
gcloud run revisions describe <revision> --project=conductive-fold-343604 --region=us-central1 --format=json | jq -r '.spec.containers[0].env[].name'
```

### 4.3 cer-ui

The dashboard's settings are baked in at build time (§3.4), and the new revision keeps the live service's runtime environment.
`API_PROXY_TARGET` falls back to the canonical cer-api URL when unset, and the Dockerfile forces `NEXT_PUBLIC_API_BASE_URL` empty so the browser calls its own origin.

## 5. Service authentication

At launch, cer-api sends the shared service key and the verified user and organization ids on every relay call, and cer-gilligan refuses any `/api/v1` call without the key (401 `service_key_invalid`).
`/health` is outside that check, so it answers without the key.
cer-gilligan allows unauthenticated invocation at the Cloud Run level, because Cloud Run strips the signature from a forwarded identity token and cer-api does not mint one yet.
Identity tokens and a Cloud Run Invoker grant, ideally to a dedicated cer-api account, come after launch; the key check stays in place under them.

## 6. Stage, test, route

### 6.0 Record the current state

Before any deploy, record which revisions serve traffic now; these are the rollback targets in §7.

```bash
for s in cer-api cer-ui; do
  gcloud run services describe $s --project=conductive-fold-343604 --region=us-central1 --format='yaml(status.traffic)'
  gcloud run revisions list --service=$s --project=conductive-fold-343604 --region=us-central1 --limit=5
done
```

Write the serving revision of each in §8.

### 6.1 L5: cer-gilligan

Prerequisites: §2.1 items 1, 3, 4 and 5 done, the image digest from §3.3, and the env file from §4.1.

A service's first deployment cannot take `--no-traffic`, so the first cer-gilligan revision serves the service's traffic from the start.
Nothing reaches it until cer-api points at it, and it refuses any caller without the service key, so it is still staged in effect.

```bash
gcloud run deploy cer-gilligan \
  --project=conductive-fold-343604 --region=us-central1 \
  --image=gcr.io/conductive-fold-343604/cer-gilligan@sha256:[FILL] \
  --service-account=cer-gilligan-runtime@conductive-fold-343604.iam.gserviceaccount.com \
  --env-vars-file=release/cer-gilligan.env.yaml \
  --set-secrets=FIREWORKS_API_KEY=cer-gilligan-fireworks-api-key:2,CER_RAG_SERVICE_KEY=cer-gilligan-service-key:1 \
  --cpu=1 --memory=1Gi --timeout=300 --concurrency=8 \
  --min-instances=0 --max-instances=1 \
  --no-allow-unauthenticated \
  --tag=rc1
```

`--no-allow-unauthenticated` only means the deploy does not try the IAM grant itself; Michael then opens invocation (§2.1 item 6).
Every later cer-gilligan revision adds `--no-traffic` and a new tag (`rc2`, `rc3`, ...), and the command prints the tagged URL.

Test from localhost, in this order:

1. `curl -s <tagged URL>/health` returns `status: ok`.
2. `curl -s -X POST <tagged URL>/api/v1/chat` returns 401 `service_key_invalid`.
3. Run the local stack ([`LOCAL_STACK.md`](LOCAL_STACK.md), "Serving Gilligan locally") from the server and dashboard release commits, with the server's `.env` pointing `CER_RAG_BASE_URL` at the tagged URL and `CER_RAG_SERVICE_KEY` set to the service key.
   Keep the key out of chat and out of any committed file.
4. Log in as the superadmin, then as the member account, and ask a document question, a question about one pod's recent readings, and for a one-pod report.
5. Check that the usage line shows 20 messages and 5 reports, and that the count moves after each question.
6. Check that the Firestore usage documents appear in the dedicated database and nowhere in `(default)`.
7. Read the revision's logs for errors: `gcloud logging read 'resource.labels.service_name="cer-gilligan"' --project=conductive-fold-343604 --limit=50 --freshness=1h`.

Each question is a live device read and a Fireworks call.
If a later revision passes, route it: `gcloud run services update-traffic cer-gilligan --project=conductive-fold-343604 --region=us-central1 --to-tags=rc2=100`.

### 6.2 L6: cer-api and cer-ui

Prerequisites: §2.1 item 2 (or Michael deploys), both images from §3.4, and cer-gilligan's canonical URL.

```bash
gcloud run deploy cer-api \
  --project=conductive-fold-343604 --region=us-central1 \
  --image=gcr.io/conductive-fold-343604/cer-api@sha256:[FILL] \
  --no-traffic --tag=rc1 \
  --update-env-vars=GILLIGAN_BACKEND=rag,CER_RAG_BASE_URL=[FILL],CER_RAG_TIMEOUT_MS=120000 \
  --update-secrets=CER_RAG_SERVICE_KEY=cer-gilligan-service-key:1 \
  --remove-env-vars=DEV_UNVERIFIED_AUTH,DEV_CHAT_STORE,DEV_UPSTREAM_BASE_URL,DEV_LOCAL_PATHS

gcloud run deploy cer-ui \
  --project=conductive-fold-343604 --region=us-central1 \
  --image=gcr.io/conductive-fold-343604/cer-ui@sha256:[FILL] \
  --no-traffic --tag=rc1
```

The staged cer-api revision has `GILLIGAN_BACKEND=rag` from the start; it takes effect for users only when traffic moves to it.

Test cer-api from localhost with the dashboard release commit, in a second worktree made as in §3.2, so that `node_modules` and `.next` never reach a Cloud Build upload; its `.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=<cer-api tagged URL>
API_PROXY_TARGET=<cer-api tagged URL>
```

```bash
yarn install --frozen-lockfile && yarn build && yarn start -p 3000
```

This is a production build, so it also shows that P5's import error does not break the build.
With the member account at `http://localhost:3000`:

1. The pod picker lists only the member's organization's pods.
2. The disclaimer reads "Content is AI generated, be sure to double check answers, turbidity is qualitative."
3. The question stays visible while its answer loads, tables render, and citations show.
4. A report downloads; a sixth report in a day is refused.
5. The chat is still there after a reload.
6. Items L1, L2 and L4-L6 of [`LIVE_TEST_LIST.md`](LIVE_TEST_LIST.md), which only production can show, as far as your accounts allow: CWA Old's history merged into OWC 2026 for CWA alone, current-site readings only, an organization without pods sees nothing, the user routes refuse unauthenticated calls, and an invited user without a password gets a 4xx.

The staged cer-ui revision proxies to whichever cer-api revision serves traffic, which is the old one until §6.6.
Before then, open its tagged URL only to check that the page loads and login works.

### 6.3 L7: supervisor demo

Run the demo on the localhost dashboard against the staged cer-api, as in §6.2.
Set cer-gilligan's minimum instances to 1 for the day to avoid a cold start, and back to 0 afterwards:

```bash
gcloud run services update cer-gilligan --project=conductive-fold-343604 --region=us-central1 --min-instances=1
```

A `services update` creates a new revision with the same image and configuration.
Once traffic has been pinned to a tag or revision, the new revision gets none, so check the split afterwards and route the new revision by name if needed.
The same applies to every later minimum-instances change.

### 6.4 After the demo is approved: S5

Only after the supervisor approves the demo:

1. Add CER's Fireworks key as a new version of `cer-gilligan-fireworks-api-key` (Michael, or the user with Secret Manager access), and record its number.
2. Deploy cer-gilligan again with `--no-traffic --tag=rc<n>` and `FIREWORKS_API_KEY=cer-gilligan-fireworks-api-key:<new version>`, keeping every other flag of §6.1.
3. Repeat the §6.1 tests against the new tag, then route traffic to it.
4. Rotate `[FILL: the credentials in the S5 rotation]`, starting with disabling the cer-demo Fireworks key, and check that the old key is refused ([`LIVE_TEST_LIST.md`](LIVE_TEST_LIST.md) L7).

### 6.5 L8: staged smoke

The morning of September 30, repeat the §6.2 checks against the staged cer-api and the current cer-gilligan revision, with one pod per organization you can sign in as, a report, the limits and the disclaimer.
No production test data was created, so the T3 cleanup has nothing to delete.
Set cer-gilligan's minimum instances to 1 for launch day.
Go on only if every check passes; otherwise leave traffic where it is.

### 6.6 L9: route traffic

Switch in dependency order, and check each before the next:

```bash
gcloud run services update-traffic cer-api --project=conductive-fold-343604 --region=us-central1 --to-tags=rc1=100
```

1. At `https://cleanearthrovers-datahub.app`, the old dashboard still loads, logs in and shows pods.
2. Open cer-ui's tagged URL, which now reaches the new cer-api: log in as the member and ask one question.

```bash
gcloud run services update-traffic cer-ui --project=conductive-fold-343604 --region=us-central1 --to-tags=rc1=100
```

3. Production smoke at `https://cleanearthrovers-datahub.app` with the member account: one question on a pod, one report, the usage line, the disclaimer.
4. Watch cer-gilligan and cer-api logs, error rates and Fireworks spend through the first hours.
5. Once the Firestore usage store has been seen counting correctly across a revision restart ([`LIVE_TEST_LIST.md`](LIVE_TEST_LIST.md) L8), raise cer-gilligan's maximum instances to 2.

After launch, remove every tag that points at a revision not serving traffic, so no rejected candidate stays reachable: `gcloud run services update-traffic <service> --project=conductive-fold-343604 --region=us-central1 --remove-tags=<tag>`.

## 7. Rollback

Each service rolls back by sending all traffic to the revision recorded in §6.0 or to the previous release revision.
A traffic switch takes effect within seconds and changes no Firestore data: chats, usage documents and anything cer-gilligan wrote stay.
After any rollback, check the traffic split with `gcloud run services describe <service> --project=conductive-fold-343604 --region=us-central1 --format='yaml(status.traffic)'` and load the site.

### 7.1 cer-ui

Use when the new dashboard misbehaves and the new cer-api is healthy.

```bash
gcloud run services update-traffic cer-ui --project=conductive-fold-343604 --region=us-central1 --to-revisions=[FILL: cer-ui revision from §6.0]=100
```

The new Gilligan page disappears; every other dashboard page returns to its pre-release state.
Whether the previous dashboard renders chats saved by the new relay has not been tested.

### 7.2 cer-api

Use when Gilligan answers wrongly or unsafely, shows another organization's data, or the new server breaks other routes.
Roll back cer-ui first (§7.1), so the new dashboard never talks to the old server, then:

```bash
gcloud run services update-traffic cer-api --project=conductive-fold-343604 --region=us-central1 --to-revisions=[FILL: cer-api revision from §6.0]=100
```

This also withdraws the security fixes deployed with the release: the period-data membership check (P3), the user-route authorization (P6) and the CWA Old rule (Q6).
Gilligan returns to the Gemini backend, which fails every question (D9), so Gilligan is effectively off.
For suspected cross-organization disclosure, roll back first, keep the logs, and tell Michael before resuming.

### 7.3 cer-gilligan

Use when a later cer-gilligan revision (a new key, configuration or image) misbehaves.

```bash
gcloud run services update-traffic cer-gilligan --project=conductive-fold-343604 --region=us-central1 --to-revisions=[FILL: previous cer-gilligan revision]=100
```

The first release has no previous cer-gilligan revision; stop Gilligan by rolling back cer-api (§7.2) instead.
Rolling back to a revision pinned to the cer-demo Fireworks key fails once that key is rotated (§6.4).
For runaway Fireworks spend, the spending cap on CER's Fireworks account (S5) is the outer limit; rolling back cer-api stops new calls.

## 8. Release record

Fill in as the release proceeds; secrets stay in Secret Manager and never go in this table.

| field | value |
|---|---|
| §2.1 setup items 1-8, done by and when | `[FILL]` |
| Dedicated database id and location | `[FILL]` |
| Release commits: cer-demo, server, dashboard | `[FILL]` |
| Malware scan clean in each build directory | `[FILL]` |
| Image digests: cer-gilligan, cer-api, cer-ui | `[FILL]` |
| Secret versions: Fireworks (demo), Fireworks (CER), service key | `[FILL]` |
| Revisions serving traffic before release (§6.0): cer-api, cer-ui | `[FILL]` |
| cer-gilligan canonical URL | `[FILL]` |
| Staged revisions and tags: cer-gilligan, cer-api, cer-ui | `[FILL]` |
| §6.1 and §6.2 test results | `[FILL]` |
| Demo approved (L7) | `[FILL]` |
| S5 key swap and rotation done | `[FILL]` |
| L8 smoke result | `[FILL]` |
| Traffic switched (L9), time | `[FILL]` |
| Production smoke result | `[FILL]` |
| Max instances raised to 2 | `[FILL]` |
| Tags removed after launch | `[FILL]` |
