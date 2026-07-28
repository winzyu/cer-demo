# Clean Earth RAG — Current Specs

What is built and how it works **as of the Node/Express + Firestore skeleton**. This is the
implementation reference for the current codebase.

- The **legacy** FastAPI + Postgres/pgvector behavior being ported lives in
  [`migration/MIGRATION_SPEC.md`](migration/MIGRATION_SPEC.md).
- The **conventions** this code follows are in [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md).
- The **roadmap / next steps** are in [`timeline.md`](timeline.md).
- The **direct-feed vs RAG experiment** that decides how document context is retrieved — on cost —
  is in [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md). Deferred: it runs on its own branch after
  Phase N1, and produces `RETRIEVAL_COMPARISON.md`.

> **Status: skeleton.** Service bootstrap only. No business logic yet — retrieval, `POST /chat`,
> sensor queries, and ingestion are **not implemented** (see §11).

---

## 1. Scope (as built)

- A Node/Express HTTP service that boots cleanly, validates its configuration, initializes a
  Firestore client (lazily), and serves a health endpoint.
- Central error handling, request logging, and a versioned API mount point ready for resource
  routers.
- An integration test proving the health endpoint and the error-response shape.

Deliberately **out of scope at this stage:** the chat orchestration loop, LLM/embedding calls,
document retrieval, sensor-data queries, corpus/CSV ingestion, and any authentication.

---

## 2. Components

| Layer | Choice |
|---|---|
| Language | TypeScript 5, `strict`, **CommonJS** output via `tsc` → `dist/` |
| HTTP | Express 4 |
| Middleware | `morgan` (dev logging), `helmet`, `cors`, `express.json` |
| Datastore | Firestore via `@google-cloud/firestore` (client constructed, not yet queried) |
| Errors | `http-errors` + thin subclasses + one terminal handler |
| Config | hand-rolled loader + validation (no config-schema library, per conventions §8) |
| Logging | `morgan` + a tagged `console` logger (no logging library) |
| Tests | Jest + `ts-jest` + `supertest` |
| Lint | ESLint `airbnb-base` + `@typescript-eslint` |

---

## 3. File layout

```
clean-earth-rag/
├── package.json / tsconfig.json / jest.config.js / .eslintrc.js
├── Dockerfile / .dockerignore
├── .env.example
├── src/
│   ├── index.ts              entry: load config, start listening
│   ├── app.ts                express assembly (exported for tests, no listen)
│   ├── config/
│   │   ├── index.ts          env loading + validation → frozen `config`
│   │   └── database.ts       memoized Firestore client factory
│   ├── routes/
│   │   ├── index.ts          /api/v1 aggregator
│   │   └── healthRoutes.ts   GET /health
│   ├── controllers/
│   │   └── HealthController.ts
│   ├── middleware/
│   │   ├── errorHandler.ts   terminal error handler
│   │   └── notFound.ts       404 → http-errors NotFound
│   └── utils/
│       ├── errors.ts         NotFound/Validation/Unauthorized/Forbidden/Conflict
│       └── logger.ts         createLogger(tag)
├── test/integration/health.test.ts
├── frontend/index.html       static chat UI (not yet wired to a chat endpoint)
├── data/                     sensor CSV (git-ignored)
├── documents/                corpus PDFs (git-ignored)
└── docs/                     SPECS.md, timeline.md, migration/
```

---

## 4. Configuration (`src/config/index.ts`)

All environment reading and validation happens **once**, at import, producing a single frozen
`config` object. This replaces the reference server's scattered `process.env` reads.

- Typed getters (`readString`, `readInt`, `readBool`, `readEnum`) collect **all** validation errors
  and throw once with a combined message, so a bad `.env` fails fast and completely.
- **Malformed** values (non-integer `PORT`, unknown `WATER_TYPE`/`NODE_ENV`) are fatal.
- **Missing** secrets/models (`FIREWORKS_API_KEY`, `LLM_MODEL`, and `FIRESTORE_PROJECT_ID` in
  production) are **warnings only** — the skeleton must boot and pass `/health` without them.

Shape:

```ts
config = {
  nodeEnv, isProduction, port, logLevel,
  firestore:  { projectId?, databaseId },
  fireworks:  { apiKey?, baseUrl, chatModel?, embeddingModel },
  retrieval:  { defaultMode, debug },
  waterType,
}
```

Environment variables and defaults are documented in `README.md` §3 and `.env.example`.

---

## 5. Firestore initialization (`src/config/database.ts`)

`getFirestore()` returns a **memoized singleton** `Firestore` client. Construction is lazy and
opens no connection, so importing the module (or booting the server) never requires credentials —
the client connects on first read/write. Project id comes from `FIRESTORE_PROJECT_ID` when set,
otherwise Application Default Credentials infer it; database id defaults to `(default)`.

This intentionally differs from the reference server, which created a new client per repository —
flagged as wasteful in `migration/CONVENTIONS.md`. No repositories consume the client yet.

---

## 6. HTTP bootstrap & middleware (`src/app.ts`)

Middleware order is load-bearing (conventions §3):

```
morgan("dev") → helmet(...) → cors() → express.json()
  → GET /                (service banner)
  → GET /health          (healthRoutes, unversioned)
  → /api/v1              (resource-router aggregator)
  → notFound             (→ 404)
  → errorHandler         (terminal)
```

`app.ts` exports the assembled app without calling `listen`, so `supertest` can drive it in-process.
`src/index.ts` imports it and starts listening on `config.port`.

---

## 7. Error handling

- `src/utils/errors.ts` — `http-errors` subclasses (`NotFoundError`, `ValidationError`,
  `UnauthorizedError`, `ForbiddenError`, `ConflictError`) carrying the right `statusCode`.
- `src/middleware/notFound.ts` — unmatched routes become an `http-errors` `NotFound` passed to `next`.
- `src/middleware/errorHandler.ts` — the single terminal handler. Response body (conventions §6):

  ```json
  { "error": "<message>", "message": "<message>" }
  ```

  `error` is mandatory (the deployed client reads it); `message` mirrors it; **no `status` field is
  placed in the body** (the HTTP status line carries it); the stack is included only outside
  production. 5xx errors are logged.

---

## 8. Logging (`src/utils/logger.ts`)

`createLogger(tag)` returns `{ info, warn, error }`, each prefixing a bracketed subsystem tag
(e.g. `[Config]`, `[Firestore]`, `[Server]`). HTTP requests are logged by `morgan("dev")`. No
structured logging library — consistent with both reference repos.

---

## 9. API

| method | path | response |
|---|---|---|
| `GET` | `/` | `{ "message": "Clean Earth RAG service" }` |
| `GET` | `/health` | `{ status, service, environment, timestamp, uptime, checks: { fireworksConfigured, firestoreProjectConfigured } }` |
| `GET` | `/api/v1` | `{ "message": "Clean Earth RAG API v1" }` |

`/health` does **no** network I/O (no Firestore/Fireworks calls), so it always succeeds while the
process is up and never blocks on external services. CORS is currently wide open (`cors()`) — fine
for local demo, to be tightened before deploy.

---

## 10. Testing (`test/integration/health.test.ts`)

Jest + `ts-jest` + `supertest` against the exported `app`. Two tests:
1. `GET /health` returns `200` with `status: "ok"` and the diagnostic fields.
2. An unknown route returns `404` with the `{ error, message }` shape and **no** `status` field.

Run with `npm test`. Layout mirrors the conventions: `test/integration/` with `*.test.ts`.

---

## 11. Not yet built (tracked in `timeline.md`)

| Area | Legacy reference | Target |
|---|---|---|
| Retrieval interface + adapters | `MIGRATION_SPEC.md` §7 | `Chunk`/`getContext()`, adapter registry, **stub adapter** first |
| `POST /chat` orchestration | `MIGRATION_SPEC.md` §3 | config-selected adapter, prompt assembly, **streaming** |
| LLM / embedding calls | `MIGRATION_SPEC.md` §4 | Fireworks (OpenAI-compatible SDK), model id from config |
| Document context strategy | `MIGRATION_SPEC.md` §6–7 (pgvector) | **open gate ◆G7** — decided by the [direct-feed vs RAG bake-off](RETRIEVAL_BAKEOFF.md): `firestore-direct` vs `pgvector-rag` vs `firestore-vector` |
| `query_sensor_data` | `MIGRATION_SPEC.md` §8 | Firestore-backed or device-API adapter |
| Ingestion (docs + CSV) | `MIGRATION_SPEC.md` §5 | re-home to Firestore |
| Chat frontend wiring | `frontend/index.html` | point at `POST /chat` |

---

## 12. Privacy posture (carried forward)

Unchanged in intent from the legacy build: once chat lands, all prompts (system + history +
retrieved chunks + user message) are sent to Fireworks AI, and confidentiality rests on a
contractual DPA with Fireworks, not on data residency. For the skeleton, no data flows to any LLM.
Sensor data (`data/`) and the corpus (`documents/`) are git-ignored; sensor data is treated as
confidential per `CLAUDE.md`.
