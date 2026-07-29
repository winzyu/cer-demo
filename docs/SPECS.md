# Clean Earth RAG — Current Specs

What is built and how it works **as of Phase N1**. This is the implementation reference for the
current codebase.

- The **legacy** FastAPI + Postgres/pgvector behavior being ported lives in
  [`migration/MIGRATION_SPEC.md`](migration/MIGRATION_SPEC.md).
- The **conventions** this code follows are in [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md).
- The **roadmap / next steps** are in [`timeline.md`](timeline.md).
- The **direct-feed vs RAG experiment** that decides how document context is retrieved — on cost —
  is in [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md). Deferred: it runs on its own branch after
  Phase N1, and produces `RETRIEVAL_COMPARISON.md`.

> **Status: Phase N1 complete.** Service bootstrap, the retrieval seam (§9), and a working
> `POST /api/v1/chat` answering via Fireworks with optional streaming (§10). Retrieval is still the
> **stub adapter** — real retrieval is decided by the N2 bake-off. Sensor queries and ingestion are
> **not implemented** (see §14).

---

## 1. Scope (as built)

- A Node/Express HTTP service that boots cleanly, validates its configuration, initializes a
  Firestore client (lazily), and serves a health endpoint.
- Central error handling, request logging, and a versioned API mount point ready for resource
  routers.
- The **retrieval seam**: the `Chunk`/`getContext` contract, an adapter registry with the
  config-driven selection rules, and a stub adapter (§9).
- A **working chat endpoint** (§10): validation, adapter selection, prompt assembly, a Fireworks
  chat completion, and opt-in SSE streaming.
- Tests covering all of the above, with the LLM mocked — no test spends money or needs a key.

Deliberately **out of scope at this stage:** the tool-calling orchestration loop, embedding calls,
any *real* document retrieval, sensor-data queries, corpus/CSV ingestion, and any authentication.

---

## 2. Components

| Layer | Choice |
|---|---|
| Language | TypeScript 5, `strict`, **CommonJS** output via `tsc` → `dist/` |
| HTTP | Express 4 |
| Middleware | `morgan` (dev logging), `helmet`, `cors`, `express.json` |
| Datastore | Firestore via `@google-cloud/firestore` (client constructed, not yet queried) |
| LLM | Fireworks via the official `openai` SDK pointed at its compatible endpoint |
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
│   │   ├── healthRoutes.ts   GET /health
│   │   └── chatRoutes.ts     POST /api/v1/chat
│   ├── controllers/
│   │   ├── HealthController.ts
│   │   └── ChatController.ts   retrieve → assemble → answer (JSON or SSE)
│   ├── middleware/
│   │   ├── errorHandler.ts   terminal error handler
│   │   └── notFound.ts       404 → http-errors NotFound
│   ├── retrieval/
│   │   ├── index.ts          shared registry, built-in adapters registered here
│   │   ├── RetrievalRegistry.ts  mode → adapter + selection rules
│   │   ├── options.ts        top-k bounds + resolveTopK()
│   │   ├── adapters/
│   │   │   ├── StubAdapter.ts
│   │   │   └── DirectFeedAdapter.ts
│   │   └── sources/
│   │       ├── corpusSource.ts        CorpusSource contract
│   │       ├── ArtifactCorpusSource.ts
│   │       └── FirestoreCorpusSource.ts
│   ├── prompt/
│   │   ├── systemPrompt.ts   ported legacy prompt + REFUSAL_SENTENCE
│   │   └── promptBuilder.ts  static-first message assembly
│   ├── services/
│   │   └── LlmService.ts     Fireworks chat completion + streaming
│   ├── validators/
│   │   └── chatValidators.ts parseChatRequest
│   ├── types/
│   │   ├── retrieval.types.ts  Chunk / GetContextOptions / RetrievalAdapter
│   │   └── chat.types.ts       ChatMessage / ChatRole
│   └── utils/
│       ├── errors.ts         NotFound/Validation/Unauthorized/Forbidden/Conflict
│       ├── logger.ts         createLogger(tag)
│       └── sse.ts            Server-Sent Events helpers
├── test/
│   ├── integration/  health.test.ts, chat.test.ts
│   └── unit/         retrieval.test.ts, prompt.test.ts, llmService.test.ts
├── frontend/index.html       static chat UI, wired to POST /api/v1/chat (streaming)
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
  fireworks:  { apiKey?, baseUrl, chatModel?, embeddingModel, maxTokens, user },
  deviceApi:  { baseUrl?, devToken?, timeoutMs },
  chat:       { maxHistoryMessages },
  retrieval:  { defaultMode, debug, corpusSource },
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

## 9. Retrieval seam (`src/retrieval/`, `src/types/retrieval.types.ts`)

The contract every retrieval strategy implements. Built in Phase N1 checkpoint C1, **before** any
real retrieval exists, so the Phase N2 bake-off ([`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md)) can
compare strategies by swapping implementations behind one interface.

```ts
Chunk           = { id, text, source, score? }
RetrievalAdapter = { mode, getContext(query, opts?) => Promise<Chunk[]> }
```

**The interface carries no strategy-specific fields.** There is no `embedding`, `vector`, or
`distance` — a direct-feed adapter has none of those, and `score` is optional for the same reason. A
contract that assumed ranking would make the bake-off's direct-feed arm impossible to implement
honestly.

### Adapter selection (`RetrievalRegistry`)

| rule | behavior |
|---|---|
| No override requested | Use `config.retrieval.defaultMode` (`DEFAULT_RETRIEVAL`) |
| Override requested, `DEBUG_RETRIEVAL=false` | **Ignored, not rejected** — falls back to the default, logs a warning |
| Override requested, `DEBUG_RETRIEVAL=true` | Honored (trimmed); unknown mode → `ValidationError` (400) |
| `DEFAULT_RETRIEVAL` names an unregistered mode | Throws — misconfiguration, not bad input |
| Same mode registered twice | Throws — silent replacement would make retrieval depend on import order |

**Why the rule lives in the registry, not the chat controller:** it is the fiddliest rule in N1, and
here it is unit-testable without HTTP. **Why ignore rather than reject an override in production:**
letting a caller choose the retrieval strategy means letting them choose its cost.

The registry is a class with constructor DI (conventions §12) rather than a module singleton, so
tests construct isolated instances instead of depending on import order.

### Adapters

- **`stub`** (`StubAdapter`) — fixed placeholder chunks; no corpus, credentials, or network. Text is
  prefixed `[STUB CONTEXT]` so a stub answer can never be mistaken for a grounded one in a demo or a
  bake-off transcript. Accepts injected chunks for test scenarios.
- **`firestore-direct`** (`DirectFeedAdapter`) — the ◆G9 slice returned whole, one `Chunk` per
  document, unranked and **ignoring `topK`** (truncating an unranked slice would drop documents
  arbitrarily). The slice is identical every request, so it is **loaded once per process**;
  re-reading would add cost and latency for the same bytes, and on Firestore would burn read quota.
  A load failure is not cached, so a transient datastore error cannot disable the arm for the
  process lifetime. Text comes from a `CorpusSource`: `ArtifactCorpusSource` (local ingestion
  output, no credentials — the dev default) or `FirestoreCorpusSource` (required for a measured
  bake-off run so Firestore reads are counted), selected by `CORPUS_SOURCE`. **Explicit config, never
  an automatic fallback** — a silent switch could have a run measured against the wrong source.
- Registration happens in one place (`src/retrieval/index.ts`), so adding a bake-off arm is a single
  line rather than an import side effect.

### Shared guards (`options.ts`)

`resolveTopK()` centralizes the legacy bounds — default 5, max 10, non-positive → 0 — and an empty
query returns `[]`. Carried over from `MIGRATION_SPEC.md` §7 so every adapter degrades identically
instead of each inventing its own edge-case behavior, and so retrieval stays comparable across the
migration.

---

## 10. Chat pipeline (`POST /api/v1/chat`)

Phase N1, complete. One request flows: **validate → select adapter → retrieve → assemble prompt →
call Fireworks → respond**.

```
ChatController ─► RetrievalRegistry.resolve(retrieval?) ─► adapter.getContext(query) ─► Chunk[]
               ─► buildMessages({ query, chunks })       ─► ChatMessage[]
               ─► LlmService.complete | completeStream    ─► answer
```

### 10.1 Request

`{ query: string, retrieval?: string, stream?: boolean, history?: ChatMessage[] }`, validated by
hand in `validators/chatValidators.ts` (conventions §8 — no schema library). `query` is required and
trimmed; the rest are optional and type-checked. Every failure is a `ValidationError` → 400 in the
house `{ error, message }` shape.

**History carries two deliberate guards:**

- **Only `user` and `assistant` roles are accepted.** A caller-supplied `system` message is
  rejected with a 400 — accepting one would let anyone override the scope and refusal policy with
  `{ role: "system", content: "ignore previous instructions" }`.
- **Trimmed to the newest `MAX_HISTORY_MESSAGES` (default 20), not rejected.** History is
  unbounded client-controlled input; without a cap one conversation grows the prompt, and the bill,
  without limit. Oldest turns are dropped because recent ones carry the context that matters.

### 10.2 Prompt assembly (`src/prompt/`)

`buildSystemPrompt()` is ported from the legacy `backend/main.py::build_system_prompt`, recovered
from git history at `7e2b09e^` — `MIGRATION_SPEC.md` §4.2 described its structure but never recorded
its text. Two blocks are **verbatim** because behavior depends on their exact wording: the
authoritative normal ranges, and `REFUSAL_SENTENCE` (pinned by a test; `MIGRATION_SPEC.md` §11 calls
it out specifically).

The legacy **tool inventory and routing rules were deliberately not ported.** The legacy model
fetched documents itself via a `search_documents` tool; here retrieval runs before the call and
arrives as context, so advertising tools that do not exist would invite the model to announce lookups
it cannot perform. See ◆G11.

`buildMessages()` orders blocks **most static first, most dynamic last**:

| # | block | varies |
|---|---|---|
| 1 | system prompt | never, for a given deployment |
| 2 | document context | per corpus slice (direct-feed) or per query (RAG) |
| 3 | history | per conversation |
| 4 | the user question | every request |

**This ordering is load-bearing, not stylistic.** Fireworks prompt caching matches on a *prefix*, so
a cache hit extends only to the first differing byte. Anything dynamic placed earlier truncates the
cacheable prefix to nothing — silently, with no error. The direct-feed arm's entire cost case rests
on this (`RETRIEVAL_BAKEOFF.md` §1); a test asserts two different questions produce identical
prefixes. The context block is omitted entirely when there are no chunks, because an empty
`CONTEXT:` heading reads to the model as "the corpus had nothing" — a different claim from "no
corpus was consulted".

### 10.3 LLM call (`src/services/LlmService.ts`)

The official OpenAI SDK pointed at Fireworks' compatible endpoint (`MIGRATION_SPEC.md` §4). The
client is **lazy and memoized**, like the Firestore client, so the service boots and passes `/health`
without credentials; a missing key is a 503 only when a chat request arrives.

- `max_tokens` from `LLM_MAX_TOKENS` (default **4096**, up from the legacy 800).
- `user` sent on every request — Fireworks serverless cache affinity. Dropping it does not error, it
  just silently stops cache hits, which would distort the N2 bake-off. Asserted by a test.
- **No tools offered** — retrieval already ran. The legacy tool-round loop returns in N3.
- **An empty answer throws a 502 naming `LLM_MAX_TOKENS`.** This is the documented gpt-oss failure:
  reasoning tokens exhaust the budget, the API call *succeeds*, and the answer is blank. Without an
  explicit check that is indistinguishable from a valid empty response.

### 10.4 Responses

**Default (JSON):** `{ answer, model, mode, citations, usage }`.

**Streaming (`stream: true`)** — Server-Sent Events, opt-in rather than default. The JSON path stays
the simple one because the N2 harness captures whole answers plus token counts, and non-browser
callers should not have to parse SSE. N7's chat UI will likely flip the default for browsers.

| event | payload | notes |
|---|---|---|
| `meta` | `{ mode, citations }` | **Always first.** After the first byte the status code cannot change, so provenance must lead. |
| `token` | `{ text }` | one per delta |
| `done` | `{ model, usage }` | only when the provider reports usage |
| `end` | `{}` | terminator |
| `error` | `{ error, message }` | in-band; headers are already sent, so the central error handler cannot render it |

Validation runs **before** the stream opens, so a bad request is still a JSON 400 rather than an SSE
error event. A client disconnect aborts the upstream call via `AbortController` — otherwise a closed
tab keeps generating billable tokens. `X-Accel-Buffering: no` is set because a buffering proxy in
front of Cloud Run would otherwise hold the whole stream and release it at once, which is
indistinguishable from streaming being broken.

---

## 11. Ingestion (`src/ingestion/`, `scripts/ingest.ts`)

`npm run ingest` parses `documents/` once into **`data/corpus/corpus.json`** — a deterministic
artifact every Phase N2 arm loads from. Parsing once is what makes "same corpus" a guarantee rather
than an intention; if each arm parsed the PDFs itself, extraction differences could masquerade as
retrieval-strategy differences.

| step | behavior |
|---|---|
| Discover | `.pdf`/`.md`/`.txt` in `documents/`, sorted, excluding the `README.md` manifest |
| Extract | `.md`/`.txt` read as UTF-8; PDFs via `pdf-parse` (v2 class API, not the v1 function form) |
| OCR | If a PDF averages < 50 chars/page it is scanned. **OCR is not performed** — the legacy cache at `.ocr_cache/<filename>.txt` is reused, which keeps an OCR toolchain out of the service and guarantees byte-identical text across arms. Missing cache ⇒ hard error, never silent partial text. |
| Chunk | 3200 chars / 400 overlap, recursive splitter over `["\n\n", "\n", ". ", " ", ""]` |
| Filter | length ≥ 100, no PDF boilerplate, and an alphabetic-ratio ≥ 0.5 test **skipped for `.md`/`.txt`** — see below |
| Output | per document: full `text` (direct-feed) and filtered `chunks` (vector arms), plus the ◆G9 slice flag |

Current run: **8 documents, 716,603 chars (~179K tokens), 305 chunks**; direct-feed slice
**37,660 chars (~9.4K tokens)**.

The corpus is scoped to the six parameters the DataPod measures. Documents about undetectable
analytes live in `documents/_excluded/` — see `timeline.md`. Active set: the operator
source-of-truth, four Atlas Scientific probe datasheets, and three USGS/EPA field-methods manuals.

**The alpha-ratio exemption is a deliberate break from legacy parity.** The 0.5 threshold cannot tell
OCR noise from a table — markdown tables here score 0.07–0.14, so the legacy rule discarded 15 of 23
chunks of the aquatic-life criteria table, the corpus's authoritative threshold source. Because
direct-feed uses whole documents and the vector arms use chunks, leaving it alone would have handed
direct-feed the threshold questions for reasons unrelated to retrieval. Full reasoning in
[`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §4.

`data/` is git-ignored, so the artifact is rebuilt locally rather than committed.

---

## 12. API

| method | path | response |
|---|---|---|
| `GET` | `/` | `{ "message": "Clean Earth RAG service" }` |
| `GET` | `/health` | `{ status, service, environment, timestamp, uptime, checks: { fireworksConfigured, firestoreProjectConfigured } }` |
| `GET` | `/api/v1` | `{ "message": "Clean Earth RAG API v1" }` |
| `POST` | `/api/v1/chat` | `{ answer, model, mode, citations, usage }`, or SSE when `stream: true` (§10) |

`/health` does **no** network I/O (no Firestore/Fireworks calls), so it always succeeds while the
process is up and never blocks on external services. CORS is currently wide open (`cors()`) — fine
for local demo, to be tightened before deploy.

> **Pre-prod:** error responses include a `stack` field outside production (`errorHandler.ts`). The
> gate is `NODE_ENV=production`, so if `NODE_ENV` is unset in a deployed environment, stack traces
> ship to clients. Add to the N9 hardening list alongside the CORS lockdown.

---

## 13. Testing

Jest + `ts-jest` + `supertest`. **104 tests, all passing.**

| suite | covers |
|---|---|
| `integration/health.test.ts` | `/health` shape; unknown route → 404 `{ error, message }`, no `status` |
| `integration/chat.test.ts` | `POST /chat` happy path, validation, the `DEBUG_RETRIEVAL` override rule end to end, and the SSE wire format (event order, headers, terminator) |
| `unit/retrieval.test.ts` | `resolveTopK`, `StubAdapter` guards, registry lookup, all five selection rules |
| `unit/prompt.test.ts` | ranges, `REFUSAL_SENTENCE` pinned verbatim, block ordering, cacheable-prefix stability |
| `unit/llmService.test.ts` | request params (`max_tokens`, `user`, no tools), empty-answer 502, streaming deltas, abort signal, usage handling |
| `unit/directFeed.test.ts` | slice loading, once-per-process memoization, topK ignored, failure not cached, Firestore query shape |
| `unit/ingestion.test.ts` | chunk sizing and overlap, the quality filter, the alpha-ratio exemption, corpus metadata |
| `unit/chatValidators.test.ts` | history ordering, newest-kept trimming, the `system`-role rejection, per-index error messages |

**No test touches the network, needs a key, or spends money** — `chat.test.ts` mocks `LlmService`
wholesale and the unit tests inject a fake client. Run with `npm test`.

`npm run lint` is clean. Two airbnb rules are narrowed in `.eslintrc.js` where they conflict with the
conventions this codebase follows, rather than disabled globally:

- `class-methods-use-this` → `enforceForClassFields: false`. Handlers are class-property arrow
  functions so `this` binds when passed to a router (conventions §12); a handler with no injected
  dependencies never touches `this`. Still enforced for ordinary methods.
- `max-classes-per-file` → off **for `src/utils/errors.ts` only**. Five thin error subclasses in one
  file is the point of that module; one class per file would be five three-line files.
- `no-restricted-syntax` → airbnb's other restrictions kept verbatim, but `ForOfStatement` is banned
  only in its non-`await` form. `for await...of` is the only way to consume an async iterable, which
  streaming requires.

---

## 14. Not yet built (tracked in `timeline.md`)

| Area | Legacy reference | Target |
|---|---|---|
| Tool-calling orchestration loop | `MIGRATION_SPEC.md` §3 | 5 tool rounds + 1 forced-text round, `role:"tool"` messages, round-cap fallback — returns in N3 with `query_sensor_data` |
| Corpus ingestion + real adapters | `MIGRATION_SPEC.md` §5 | N2 bake-off: `firestore-direct` (small tier, ◆G9), `pgvector-rag`, `firestore-vector` (◆G10 → all three) |
| Embedding calls | `MIGRATION_SPEC.md` §4.4 | only needed if the bake-off selects a vector arm |
| Document context strategy | `MIGRATION_SPEC.md` §6–7 (pgvector) | **open gate ◆G7** — decided by the [direct-feed vs RAG bake-off](RETRIEVAL_BAKEOFF.md): `firestore-direct` vs `pgvector-rag` vs `firestore-vector` |
| `query_sensor_data` | `MIGRATION_SPEC.md` §8 | **device-API adapter** (◆G8 resolved) — see `timeline.md` N3 |
| Ingestion (docs + CSV) | `MIGRATION_SPEC.md` §5 | re-home to Firestore |


---

## 15. Privacy posture (carried forward)

Unchanged in intent from the legacy build: once chat lands, all prompts (system + history +
retrieved chunks + user message) are sent to Fireworks AI, and confidentiality rests on a
contractual DPA with Fireworks, not on data residency. For the skeleton, no data flows to any LLM.
Sensor data (`data/`) and the corpus (`documents/`) are git-ignored; sensor data is treated as
confidential per `CLAUDE.md`.
