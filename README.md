# Clean Earth RAG — Node/Express + Firestore service

A water-quality assistant that answers questions grounded in a single sensor deployment's
readings and a corpus of authoritative water-quality documents.

This repository is being migrated from the original FastAPI + Postgres/pgvector implementation
to a **Node/Express + Firestore** stack.

> **Status: Phase N1 complete; Phase N2 (the retrieval bake-off) is built and awaiting its
> measurement run.** `POST /api/v1/chat` works end to end — retrieval adapter selection, prompt
> assembly, a Fireworks answer, multi-turn history, and optional streaming. Document **ingestion is
> built** (`npm run ingest`), and **all three bake-off arms exist**: `firestore-direct`,
> `pgvector-rag`, `firestore-vector`. `DEFAULT_RETRIEVAL` still ships as `stub`, so a fresh
> checkout answers from placeholder text until you pick an arm — see [§3b](#3b-set-up-retrieval-the-phase-n2-arms).
> **Sensor queries (`query_sensor_data`) are not built yet.** See
> [`docs/timeline.md`](docs/timeline.md) for what's next and [`docs/SPECS.md`](docs/SPECS.md) for
> exactly what exists today.

Companion docs:
- [`docs/SPECS.md`](docs/SPECS.md) — current architecture (what's built today).
- [`docs/timeline.md`](docs/timeline.md) — phased plan and next steps.
- [`docs/migration/CONVENTIONS.md`](docs/migration/CONVENTIONS.md) — the conventions this code follows.
- [`docs/migration/MIGRATION_SPEC.md`](docs/migration/MIGRATION_SPEC.md) — behavioral spec of the legacy FastAPI system.
- [`docs/RETRIEVAL_BAKEOFF.md`](docs/RETRIEVAL_BAKEOFF.md) — the Phase N2 direct-feed vs RAG cost experiment.

---

## Stack

- **Runtime:** Node.js 18+, TypeScript (CommonJS output, strict).
- **HTTP:** Express 4, with `helmet`, `cors`, `morgan`.
- **Datastore:** Firestore (`@google-cloud/firestore`).
- **LLM:** Fireworks via the `openai` SDK (OpenAI-compatible endpoint).
- **Errors:** `http-errors` + a central error handler.
- **Tests:** Jest + `ts-jest` + `supertest`.

---

## 1. Prerequisites

Install these before anything else:

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | 18 or newer | `node --version` to check. |
| **npm** | ships with Node | `npm --version`. |
| **git** | any recent | to clone the repo. |
| **Google Cloud SDK** (`gcloud`) | latest | Needed for Firestore auth **and to create the two indexes** (§2b). [Install guide](https://cloud.google.com/sdk/docs/install). |
| **Docker** | latest | *Optional* — the container run path, and the dev-only `pgvector-rag` sidecar (§3b). |

---

## 2. Credentials & accounts

> **You do NOT need credentials to boot the service or pass `/health`** — startup opens no
> connections and `/health` does no external I/O. What each one unlocks:
>
> | | needed for |
> |---|---|
> | **Fireworks key** (§2a) | any chat answer; embedding for the two RAG arms |
> | **Firestore auth + indexes** (§2b) | `CORPUS_SOURCE=firestore` and the `firestore-vector` arm |
> | **Device API token** (§2c) | nothing yet — Phase N3 |
>
> To just run it and poke at `/health`, skip to [section 3](#3-set-up-and-run).

### 2a. Fireworks AI (LLM + embeddings)

The service calls Fireworks' OpenAI-compatible API for chat completion and embeddings.

1. Create an account at **https://fireworks.ai**.
2. In the dashboard, open **API Keys** and generate a key.
3. Put it in your `.env` as `FIREWORKS_API_KEY` (see [section 3](#3-set-up-and-run)).
4. The default models are already set in `.env.example`
   (`LLM_MODEL=accounts/fireworks/models/gpt-oss-20b`,
   `EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5`). Confirm the exact model id in the Fireworks
   console before first use — the serverless catalogue rotates.

### 2b. Google Cloud / Firestore (datastore)

1. Create or pick a **Google Cloud project** at https://console.cloud.google.com.
2. Enable the **Firestore API** and create a **Firestore database** (Native mode). Note its database
   id — the default database is literally named `(default)`.
3. Authenticate locally. The simplest path for development is **Application Default Credentials**:
   ```bash
   gcloud auth application-default login
   ```
   This stores credentials the Firestore client picks up automatically — no key file needed.
4. Set `FIRESTORE_PROJECT_ID` (your project id) and `FIRESTORE_DATABASE_ID` in `.env`.

   > **Cost note:** Firestore has an "Always Free" daily quota that a demo may sit entirely inside,
   > but the quota has historically applied to the **`(default)`** database — a *named* database can
   > bill from the first read. Keep `FIRESTORE_DATABASE_ID=(default)` unless you have a reason not to,
   > and confirm the current quota terms before relying on them. Firestore itself has no idle charge;
   > see [`docs/RETRIEVAL_BAKEOFF.md`](docs/RETRIEVAL_BAKEOFF.md) §1 for the full cost picture.

   *Alternative (service account):* download a service-account JSON key, save it as
   `serviceAccountKey.json` in the repo root (it is git-ignored), and export
   `GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json`. Use this for CI or deployment where
   interactive login isn't available.

5. **Create the two indexes.** Firestore will not build these on demand, and neither failure is
   obvious: without the composite index the direct-feed query fails outright, and without the
   vector index `findNearest` returns **nothing at all, with no error**.

   ```bash
   # Direct-feed slice query: equality on inDirectFeedSlice + orderBy filename.
   gcloud firestore indexes composite create \
     --project="$FIRESTORE_PROJECT_ID" --database='(default)' \
     --collection-group=corpus_documents \
     --query-scope=collection \
     --field-config=field-path=inDirectFeedSlice,order=ascending \
     --field-config=field-path=filename,order=ascending

   # Vector search for the firestore-vector arm. 768 must match the embedding model.
   gcloud firestore indexes composite create \
     --project="$FIRESTORE_PROJECT_ID" --database='(default)' \
     --collection-group=corpus_chunks \
     --query-scope=collection \
     --field-config=field-path=embedding,vector-config='{"dimension":"768","flat":"{}"}'
   ```

   Field order in the first command is not arbitrary — it must match the query: equality field
   first, `orderBy` field second. Confirm both reach `READY` before seeding:

   ```bash
   gcloud firestore indexes composite list \
     --project="$FIRESTORE_PROJECT_ID" --database='(default)'
   ```

   > Requires `roles/datastore.indexAdmin` (or `roles/owner`). Building over an empty collection
   > takes seconds. Firestore must be **Native mode, Standard edition** — Enterprise edition has
   > no `findNearest`.

### 2c. Clean Earth device API (sensor data) — Phase N3

Not needed for chat; required once `query_sensor_data` lands. **Both values go in `.env`**, which is
git-ignored — never in `.env.example`, never in code.

| variable | what to put there |
|---|---|
| `DEVICE_API_BASE_URL` | The backend's base URL **including `/api/v1`**. The dashboard builds this from `NEXT_PUBLIC_API_BASE_URL`; its local default is `http://localhost:5001`, so locally that means `http://localhost:5001/api/v1`. |
| `DEVICE_API_TOKEN` | **Dev only.** A bearer JWT for manual testing. |

Two ways to get a token:

1. **From the dashboard** (fastest): log into the Clean Earth dashboard, then DevTools →
   Application → Local Storage → copy the `token` value.
2. **Directly:** `POST {DEVICE_API_BASE_URL}/users/login` with your credentials; the token comes back
   as `accessToken`, `access_token`, or `token` depending on the deployment.

```bash
curl -s -X POST "$DEVICE_API_BASE_URL/users/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"…"}'
```

> **`DEVICE_API_TOKEN` is a development shortcut, not the production design.** In production this
> service forwards the *caller's* JWT, so the bot only ever sees that user's devices. A shared service
> token would let any chat user read every device. Tokens also expire — a 401 means re-authenticate,
> not retry.

---

## 3. Set up and run

Run everything from the repo root.

**Step 1 — configure environment.** Copy the template and edit it:

```bash
cp .env.example .env
```

`.env` variables (all optional for the skeleton; none block boot):

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production`. Controls error-stack exposure. |
| `PORT` | `8000` | HTTP port. |
| `LOG_LEVEL` | `info` | Log verbosity label. |
| `FIRESTORE_PROJECT_ID` | *(unset)* | GCP project id. Unset ⇒ inferred from Application Default Credentials. |
| `FIRESTORE_DATABASE_ID` | `(default)` | Firestore database id. |
| `FIREWORKS_API_KEY` | *(unset)* | Fireworks API key. Required before chat works; a warning is logged if missing. |
| `FIREWORKS_BASE_URL` | `https://api.fireworks.ai/inference/v1` | OpenAI-compatible endpoint. |
| `LLM_MODEL` | *(unset)* | Chat model id (e.g. `accounts/fireworks/models/gpt-oss-20b`). |
| `LLM_MAX_TOKENS` | `4096` | Keep generous — gpt-oss emits reasoning tokens and returns an empty answer if starved. |
| `LLM_TEMPERATURE` | `0` | Sampling temperature. **Leave at 0 for the bake-off** — sampling variance across arms would measure the sampler, not the retrieval strategy. |
| `FIREWORKS_USER` | `clean-earth-rag` | Sent as the OpenAI `user` field; drives serverless prompt-cache affinity. |
| `EMBEDDING_MODEL` | `nomic-ai/nomic-embed-text-v1.5` | Embedding model id (768-dim). |
| `MAX_HISTORY_MESSAGES` | `20` | Cap on prior turns accepted per request. Oldest are dropped, not rejected. |
| `DEVICE_API_BASE_URL` | *(unset)* | Clean Earth backend base URL, **including `/api/v1`** (§2c). Phase N3. |
| `DEVICE_API_TOKEN` | *(unset)* | Dev-only bearer JWT (§2c). Production forwards the caller's token. |
| `DEVICE_API_TIMEOUT_MS` | `10000` | Device API request timeout. |
| `SENSOR_DEVICE_LABEL` | *(unset)* | Pod `query_sensor_data` answers about when the model names none. **Leave unset unless the deployment really has one pod** — the token sees 21 devices and the two cleared test pods are on opposite coasts, so a wrong default answers confidently about the wrong site. Unset means the tool asks. |
| `SENSOR_TOOL` | `false` | **Phase N3 gate.** Enables `query_sensor_data`, the tool-round loop, and the tool block in the system prompt. ⚠️ The prompt is a pinned control for the N2 bake-off and ◆G7 is open — with this off the prompt is byte-identical to the one all three captured arms ran against. Do not capture bake-off arms with it on. |
| `MAX_TOOL_ROUNDS` | `16` | Tool-enabled rounds before the loop forces a text-only answer. Legacy was 5, which cannot fit the six-parameter eval fixture. |
| `RAW_LIMIT` | `200` | Rows an `aggregation: "raw"` call may return. A cap, not a page size — raw output goes into the next prompt. |
| `DEFAULT_RETRIEVAL` | `stub` | Retrieval adapter used by default: `stub`, `firestore-direct`, `pgvector-rag`, `firestore-vector` (§3b). |
| `DEBUG_RETRIEVAL` | `false` | When `true`, a request may override the retrieval mode via a `"retrieval"` field. Required by the bake-off runner. |
| `CORPUS_SOURCE` | `artifact` | Where `firestore-direct` reads corpus text: `artifact` (local `data/corpus/corpus.json`, no credentials) or `firestore`. Explicit rather than auto-detected — a silent fallback would measure the wrong source. |
| `PGVECTOR_URL` | *(unset)* | Postgres connection string for the **dev-only** `pgvector-rag` sidecar (§3b). Unset everywhere else; the arm then fails with a clear message rather than blocking boot. |
| `WATER_TYPE` | `freshwater` | `freshwater` \| `saltwater` — selects the conductivity normal range. |

Invalid values (e.g. a non-numeric `PORT`, an unknown `WATER_TYPE`) fail fast at startup with a
clear message listing every problem. Missing secrets are only warnings.

**Step 2 — install dependencies:**

```bash
npm install
```

**Step 3 — run the service.** Pick one:

```bash
npm run dev                 # live-reload dev server (ts-node-dev) on http://localhost:8000
# — or —
npm run build && npm start  # compile to dist/ and run the compiled server
# — or —
docker build -t clean-earth-rag . && docker run -p 8000:8000 clean-earth-rag
```

**Step 4 — verify it's up:**

```bash
curl http://localhost:8000/health
# {"status":"ok","service":"clean-earth-rag","environment":"development", ...}
```

**Step 5 — open the frontend (optional).** Open `frontend/index.html` in a browser. It targets
`http://localhost:8000` by default and the chat box works. With `DEFAULT_RETRIEVAL=stub` it answers
from placeholder text; for grounded answers, set up an arm in §3b first. The frontend has **no arm
selector** — it always uses the server's `DEFAULT_RETRIEVAL`.

---

## 3b. Set up retrieval (the Phase N2 arms)

Everything above runs without a corpus. This section makes answers actually grounded. See
[`docs/RETRIEVAL_BAKEOFF.md`](docs/RETRIEVAL_BAKEOFF.md) for why there are three arms and
[`docs/SPECS.md`](docs/SPECS.md) §11–14b for how each is built.

**Step 1 — build the corpus artifact.** Put source PDFs in `documents/`, then:

```bash
npm run ingest
```

Writes `data/corpus/corpus.json` (git-ignored). **Every arm reads this one artifact** — none of
them re-parse the PDFs. That is deliberate: if two arms extracted their own text, extraction
differences would surface as answer-quality differences and be misread as one retrieval strategy
beating another.

**Step 2 — pick an arm and set it up.**

<details>
<summary><b><code>firestore-direct</code></b> — feed the whole ◆G9 slice, no embeddings, no ranking</summary>

Needs no embedding API. Runs against the local artifact by default:

```bash
DEFAULT_RETRIEVAL=firestore-direct npm run dev
```

For a **measured** run where Firestore's read costs are counted, seed it and switch the source
(requires the composite index from §2b step 5):

```bash
npm run seed:firestore
CORPUS_SOURCE=firestore DEFAULT_RETRIEVAL=firestore-direct npm run dev
```

Re-running the seeder overwrites by filename rather than duplicating.
</details>

<details>
<summary><b><code>firestore-vector</code></b> — dense RAG on Firestore's own vector search</summary>

Requires `FIREWORKS_API_KEY` (it embeds 305 chunks) and the **vector index** from §2b step 5.

```bash
npm run seed:firestore-chunks
DEFAULT_RETRIEVAL=firestore-vector npm run dev
```

The seeder is idempotent *checked before embedding*, so a re-run costs nothing rather than
re-paying for identical vectors. Expect `305 chunks in "corpus_chunks"` on a full seed.
</details>

<details>
<summary><b><code>pgvector-rag</code></b> — legacy-parity hybrid RAG (⚠️ dev only)</summary>

Deliberately re-introduces the stack ◆G1 moved away from, as the only honest baseline for "what we
had before." **Deleted once ◆G7 resolves.** Needs Docker and `FIREWORKS_API_KEY`:

```bash
docker-compose -f docker-compose.bakeoff.yml up -d
npm run seed:pgvector
PGVECTOR_URL=postgresql://cer:cer@localhost:5433/cer_bakeoff \
  DEFAULT_RETRIEVAL=pgvector-rag npm run dev
```

Note: `docker compose` (the plugin form) may not be installed — use `docker-compose`.
</details>

**Step 3 — switch arms without restarting.** Set `DEBUG_RETRIEVAL=true` and name the arm per
request. This is the switch the bake-off runs on — same server, same session, one field different:

```bash
DEBUG_RETRIEVAL=true DEFAULT_RETRIEVAL=firestore-direct npm run dev

curl -s -X POST localhost:8000/api/v1/chat -H 'content-type: application/json' \
  -d '{"query":"What is the normal turbidity range?","retrieval":"firestore-vector"}'
```

The response echoes `mode`, so you can confirm which arm actually answered. **Always check it** —
without `DEBUG_RETRIEVAL=true` the override is ignored silently and every request is served by the
default arm.

**Step 4 — capture a bake-off run** (see [`eval/README.md`](eval/README.md) and
[`docs/EVAL_FIXTURES.md`](docs/EVAL_FIXTURES.md)):

```bash
npm run bakeoff -- --arm=firestore-vector --spot-check       # always run this first
npm run bakeoff -- --arm=firestore-vector --pass=cold
npm run cost                                                  # price the arms
```

`--spot-check` probes the arm with three questions and prints the retrieved context. Run it before
every sweep: an adapter returning empty context still produces a clean-looking, completely
meaningless dataset.

---

## 4. What you can test today

The skeleton is a working HTTP service. You can exercise:

| Try this | Expected |
|---|---|
| `curl localhost:8000/health` | `200` liveness JSON with `checks.fireworksConfigured` / `firestoreProjectConfigured` booleans. |
| `curl localhost:8000/` | `200` `{"message":"Clean Earth RAG service"}`. |
| `curl localhost:8000/api/v1` | `200` `{"message":"Clean Earth RAG API v1"}`. |
| `curl localhost:8000/nope` | `404` with the `{ "error", "message" }` body shape (no `status` field). |
| `npm test` | Full Jest suite passes — 228 tests, none touching the network. |
| `npm run typecheck` / `npm run lint` | Clean type-check and lint. |
| Start with a bad var, e.g. `PORT=abc npm run dev` | Fails immediately with a clear config-validation error. |
| `curl -X POST localhost:8000/api/v1/chat -H 'Content-Type: application/json' -d '{"query":"What is ORP?"}'` | `200` with `{ answer, model, mode, citations, usage }` — a real Fireworks answer. Needs `FIREWORKS_API_KEY` + `LLM_MODEL`. |
| Same, with `"stream":true` (add `curl -N`) | Server-Sent Events: `meta` → `token`… → `done` → `end`. |
| `curl -X POST … -d '{"query":"Who won the 2022 World Cup?"}'` | The fixed refusal sentence — out-of-scope questions are declined, not answered. |
| `npm run ingest` | Parses `documents/` into `data/corpus/corpus.json` and prints per-document char/chunk counts. |
| Any arm from §3b, then ask *"What is the normal turbidity range?"* | A grounded answer citing the operator range (`0–25 NTU` freshwater). Compare `usage.promptTokens` across arms — that spread is what the bake-off measures. |

### Try it in a browser

`frontend/index.html` is a single-file chat UI wired to the streaming endpoint. Start the server,
then open the file directly — no build step:

```bash
npm run dev                 # terminal 1
xdg-open frontend/index.html    # or just open it in your browser
```

It defaults to `http://localhost:8000`; override with `?backend=http://localhost:8123`. The header
shows service status and whether the API key is configured. **This is a manual test surface, not the
product** — the real UI is the Next.js page in Phase N7.

It has **no retrieval-arm selector** and sends no `retrieval` field, so it always uses the server's
`DEFAULT_RETRIEVAL`. To compare arms in a browser, restart the server with a different default.

**Not built yet (see [`docs/timeline.md`](docs/timeline.md)):** `query_sensor_data`, the
tool-calling loop, CSV ingestion, and the blind grading harness the bake-off's human sample needs.

`DEFAULT_RETRIEVAL` / `DEBUG_RETRIEVAL` select the retrieval adapter and are the switch for the
**direct-feed vs RAG cost bake-off** in Phase N2 — see
[`docs/RETRIEVAL_BAKEOFF.md`](docs/RETRIEVAL_BAKEOFF.md). All three arms are built; what remains is
running the experiment and resolving ◆G7.

---

## 5. Scripts

| script | purpose |
|---|---|
| `npm run dev` | run with live reload (`ts-node-dev`) |
| `npm run build` | compile TypeScript to `dist/` |
| `npm start` | run the compiled server (`node dist/index.js`) |
| `npm test` | run the Jest test suite |
| `npm run test:coverage` | tests with coverage |
| `npm run test:watch` | tests in watch mode |
| `npm run lint` | ESLint (`--fix`) over `src` |
| `npm run typecheck` | type-check without emitting |
| `npm run ingest` | parse `documents/` → `data/corpus/corpus.json` (§3b) |
| `npm run seed:firestore` | upload the corpus to Firestore `corpus_documents` (one doc per file) |
| `npm run seed:firestore-chunks` | embed the corpus and upload it to `corpus_chunks` for `firestore-vector` |
| `npm run seed:pgvector` | embed and load the dev-only pgvector sidecar |
| `npm run bakeoff -- --arm=<mode> --pass=<cold\|warm>` | capture a bake-off run; `--spot-check`, `--only`, `--dry-run` |
| `npm run cost` | price the arms and compute the break-even curve |
| `npm run grade:packet` | build the blind grading packet from captured transcripts (`--pass=`, `--sample=`) |

---

## 6. Project layout

```
src/
  index.ts              # entry: load config, start the server
  app.ts                # express assembly (middleware + routers), exported for tests
  config/
    index.ts            # centralized env loading + validation
    database.ts         # Firestore client (memoized singleton)
    pgvector.ts         # dev-only sidecar pool (deleted with the arm)
  routes/               # /api/v1 aggregator, healthRoutes, chatRoutes
  controllers/          # HealthController, ChatController
  retrieval/            # the retrieval seam — see SPECS.md §9
    RetrievalRegistry.ts  # mode -> adapter, selected by DEFAULT_RETRIEVAL
    options.ts          # shared topK bounds (default 5, capped 1-10)
    rrf.ts              # reciprocal-rank fusion (pgvector arm)
    adapters/           # StubAdapter, DirectFeedAdapter,
                        #   PgVectorRagAdapter, FirestoreVectorAdapter
    sources/            # ArtifactCorpusSource | FirestoreCorpusSource
  ingestion/            # extract.ts, chunk.ts, corpus.ts, ingest.ts
  prompt/               # systemPrompt.ts (pinned control), promptBuilder.ts
  services/             # LlmService, EmbeddingService
  eval/                 # bake-off runner, fixtures, transcripts, cost model
  validators/           # chatValidators.ts (hand-rolled, no schema library)
  types/                # chat.types.ts, retrieval.types.ts
  middleware/           # errorHandler.ts, notFound.ts
  utils/                # errors.ts, logger.ts
scripts/                # ingest, bakeoff, cost, seedFirestore,
                        #   seedFirestoreChunks, seedPgvector
eval/
  fixtures/             # 30 committed conversations (EVAL_FIXTURES.md)
test/
  integration/          # health, chat
  unit/                 # per-module suites
frontend/
  index.html            # single-file chat UI (manual test surface, not the product)
data/                   # corpus artifact + sensor CSV (git-ignored)
documents/              # source corpus (see documents/README.md). `.gitignore` has a
                        #   documents/* rule, but several PDFs predate it and ARE tracked —
                        #   check `git status` before assuming a deleted one is gone.
eval/                   # fixtures/ (committed question set), transcripts/ (captured sweep),
                        #   grading/ (blind packet) — see eval/README.md
docs/                   # HANDOFF.md (start here), SPECS.md, timeline.md,
                        #   RETRIEVAL_BAKEOFF.md, EVAL_FIXTURES.md, GRADING_GUIDE.md, migration/
```

---

## 7. Endpoints

| method | path | description |
|---|---|---|
| `GET` | `/` | service banner |
| `GET` | `/health` | liveness + config-presence checks (no external I/O) |
| `GET` | `/api/v1` | API v1 banner |
| `POST` | `/api/v1/chat` | `{ answer, model, mode, citations, usage }`, or SSE when `"stream": true` |

`POST /api/v1/chat` accepts `{ query, retrieval?, stream?, history? }`. `query` is required;
`retrieval` is honored only when `DEBUG_RETRIEVAL=true`. `citations` returns the **retrieved
context**, not parsed inline citations — for direct-feed that is the whole slice on every request.

---

## 8. Troubleshooting

- **Port already in use** — change `PORT` in `.env`, or stop whatever holds `8000`.
- **Server exits at startup with "Invalid configuration"** — a `.env` value failed validation; the
  message lists each bad variable. Fix and restart.
- **`[Config] FIREWORKS_API_KEY is not set` warning** — expected until you add the key; the skeleton
  still runs and `/health` still passes.
- **Firestore auth errors** — re-run `gcloud auth application-default login` and confirm
  `FIRESTORE_PROJECT_ID`. Check the credentials actually work before blaming the code:
  `gcloud firestore databases list --project=<id>`.
- **`FAILED_PRECONDITION: The query requires an index`** — the `corpus_documents` composite index
  is missing (§2b step 5). The error text includes a console link that creates it for you.
- **`firestore-vector` returns no context, but nothing errors** — the silent failure. In order of
  likelihood: the collection is unseeded (`npm run seed:firestore-chunks`), the vector index is
  missing or still `CREATING`, or the embeddings were written as plain arrays rather than
  `FieldValue.vector()`. The adapter logs a warning naming all three. Verify with
  `gcloud firestore indexes composite list --database='(default)'`.
- **A request ignored the `"retrieval"` field** — `DEBUG_RETRIEVAL` is not `true`, so the override
  was dropped silently and the default arm answered. Check the `mode` field in the response.
- **`PGVECTOR_URL is not configured`** — expected unless the dev-only sidecar is up (§3b).
- **`npm run dev` looks hung** — `ts-node` cold start takes ~80s. It isn't hung.
- **Answers are placeholder text** — `DEFAULT_RETRIEVAL` is still `stub`. Pick an arm (§3b).
