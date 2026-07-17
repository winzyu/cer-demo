# Clean Earth RAG — Node/Express + Firestore service

A water-quality assistant that answers questions grounded in a single sensor deployment's
readings and a corpus of authoritative water-quality documents.

This repository is being migrated from the original FastAPI + Postgres/pgvector implementation
to a **Node/Express + Firestore** stack.

> **Status: skeleton.** The service bootstrap is complete — config loading + validation,
> Firestore initialization, Express + middleware, error handling, logging, and a health
> endpoint. The **`POST /chat` endpoint, retrieval, and sensor queries are not built yet** —
> see [`docs/timeline.md`](docs/timeline.md) for what's next and
> [`docs/SPECS.md`](docs/SPECS.md) for exactly what exists today.

Companion docs:
- [`docs/SPECS.md`](docs/SPECS.md) — current architecture (what's built today).
- [`docs/timeline.md`](docs/timeline.md) — phased plan and next steps.
- [`docs/migration/CONVENTIONS.md`](docs/migration/CONVENTIONS.md) — the conventions this code follows.
- [`docs/migration/MIGRATION_SPEC.md`](docs/migration/MIGRATION_SPEC.md) — behavioral spec of the legacy FastAPI system.

---

## Stack

- **Runtime:** Node.js 18+, TypeScript (CommonJS output, strict).
- **HTTP:** Express 4, with `helmet`, `cors`, `morgan`.
- **Datastore:** Firestore (`@google-cloud/firestore`).
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
| **Google Cloud SDK** (`gcloud`) | latest | *Optional now*, needed for Firestore auth in the chat phase. [Install guide](https://cloud.google.com/sdk/docs/install). |
| **Docker** | latest | *Optional*, only for the container run path. |

---

## 2. Credentials & accounts

> **You do NOT need any credentials to boot the skeleton or pass the health check.** The current
> build performs no Firestore or Fireworks calls at runtime. Set these up now so you're ready when
> the chat/retrieval features land — or skip to [section 3](#3-set-up-and-run) to just run it.

### 2a. Fireworks AI (LLM + embeddings)

The service will call Fireworks' OpenAI-compatible API for chat completion and embeddings.

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

   *Alternative (service account):* download a service-account JSON key, save it as
   `serviceAccountKey.json` in the repo root (it is git-ignored), and export
   `GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json`. Use this for CI or deployment where
   interactive login isn't available.

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
| `EMBEDDING_MODEL` | `nomic-ai/nomic-embed-text-v1.5` | Embedding model id (768-dim). |
| `DEFAULT_RETRIEVAL` | `stub` | Which retrieval adapter to use by default. |
| `DEBUG_RETRIEVAL` | `false` | When `true`, a request may override the retrieval mode. |
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
`http://localhost:8000` by default. Note: the chat box will not function yet — `POST /chat` arrives
in the next phase (see the timeline).

---

## 4. What you can test today

The skeleton is a working HTTP service. You can exercise:

| Try this | Expected |
|---|---|
| `curl localhost:8000/health` | `200` liveness JSON with `checks.fireworksConfigured` / `firestoreProjectConfigured` booleans. |
| `curl localhost:8000/` | `200` `{"message":"Clean Earth RAG service"}`. |
| `curl localhost:8000/api/v1` | `200` `{"message":"Clean Earth RAG API v1"}`. |
| `curl localhost:8000/nope` | `404` with the `{ "error", "message" }` body shape (no `status` field). |
| `npm test` | Jest suite (health + 404-shape) passes. |
| `npm run typecheck` / `npm run lint` | Clean type-check and lint. |
| Start with a bad var, e.g. `PORT=abc npm run dev` | Fails immediately with a clear config-validation error. |

**Not built yet (see [`docs/timeline.md`](docs/timeline.md)):** `POST /chat`, document retrieval,
`query_sensor_data`, document/CSV ingestion, and the wired-up chat frontend.

---

## 5. Scripts

| script | purpose |
|---|---|
| `npm run dev` | run with live reload (`ts-node-dev`) |
| `npm run build` | compile TypeScript to `dist/` |
| `npm start` | run the compiled server (`node dist/index.js`) |
| `npm test` | run the Jest test suite |
| `npm run test:coverage` | tests with coverage |
| `npm run lint` | ESLint (`--fix`) over `src` |
| `npm run typecheck` | type-check without emitting |

---

## 6. Project layout

```
src/
  index.ts              # entry: load config, start the server
  app.ts                # express assembly (middleware + routers), exported for tests
  config/
    index.ts            # centralized env loading + validation
    database.ts         # Firestore client (memoized singleton)
  routes/
    index.ts            # /api/v1 aggregator (resource routers mount here)
    healthRoutes.ts     # GET /health
  controllers/
    HealthController.ts
  middleware/
    errorHandler.ts     # terminal error handler -> { error, message }
    notFound.ts         # 404 -> http-errors NotFound
  utils/
    errors.ts           # http-errors subclasses
    logger.ts           # tagged console logger
test/
  integration/
    health.test.ts
frontend/
  index.html            # static chat UI (chat wiring lands with POST /chat)
data/                   # sensor CSV (git-ignored; confidential per CLAUDE.md)
documents/              # source corpus PDFs (git-ignored; bulky)
docs/                   # SPECS.md, timeline.md, migration/
```

---

## 7. Endpoints

| method | path | description |
|---|---|---|
| `GET` | `/` | service banner |
| `GET` | `/health` | liveness + config-presence checks (no external I/O) |
| `GET` | `/api/v1` | API v1 banner (resource routers land here) |

---

## 8. Troubleshooting

- **Port already in use** — change `PORT` in `.env`, or stop whatever holds `8000`.
- **Server exits at startup with "Invalid configuration"** — a `.env` value failed validation; the
  message lists each bad variable. Fix and restart.
- **`[Config] FIREWORKS_API_KEY is not set` warning** — expected until you add the key; the skeleton
  still runs and `/health` still passes.
- **Firestore auth errors** — only relevant once data access lands; re-run
  `gcloud auth application-default login` and confirm `FIRESTORE_PROJECT_ID`.
