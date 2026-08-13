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
- The **question set every arm is graded against** is in [`EVAL_FIXTURES.md`](EVAL_FIXTURES.md)
  (§12), committed before any arm runs.

> **Status (2026-08-13): Phase N1 complete; Phase N2 captured but ungraded.** Service bootstrap,
> the retrieval seam (§9), and a working `POST /api/v1/chat` (§10). **All three retrieval arms are
> built, seeded and swept** — `firestore-direct`, `pgvector-rag`, `firestore-vector` (§14, §14b) —
> with 168 transcripts under `eval/transcripts/` and the cost model running on measured numbers
> (§14a). `DEFAULT_RETRIEVAL` still ships as `stub`, so a fresh checkout needs no credentials.
>
> **What remains in N2 is grading, not building.** ◆G7 is open until the blind packet
> (`eval/grading/`, [`GRADING_GUIDE.md`](GRADING_GUIDE.md)) is scored and
> `RETRIEVAL_COMPARISON.md` is written. Sensor queries and the tool-calling loop are **not
> implemented** on this branch (see §17); a read-only device-API client exists on
> `feat/device-api` — see [`migration/DEVICE_API.md`](migration/DEVICE_API.md).
>
> **Current state and how to resume: [`HANDOFF.md`](HANDOFF.md).**

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
│   │   ├── database.ts       memoized Firestore client factory
│   │   └── pgvector.ts       ⚠️ bake-off only, deleted at ◆G7
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
│   │   ├── rrf.ts            reciprocal rank fusion (pgvector arm)
│   │   ├── adapters/
│   │   │   ├── StubAdapter.ts
│   │   │   ├── DirectFeedAdapter.ts
│   │   │   ├── PgVectorRagAdapter.ts       ⚠️ bake-off only, deleted at ◆G7
│   │   │   └── FirestoreVectorAdapter.ts
│   │   └── sources/
│   │       ├── corpusSource.ts        CorpusSource contract
│   │       ├── ArtifactCorpusSource.ts
│   │       └── FirestoreCorpusSource.ts
│   ├── ingestion/
│   │   ├── corpus.ts         DOC_META + the ◆G9 direct-feed slice
│   │   ├── extract.ts / chunk.ts / ingest.ts
│   ├── eval/
│   │   ├── types.ts          EvalFixture / EvalTurn / EvalRubric
│   │   ├── fixtures.ts       loader + strict validation of eval/fixtures/
│   │   ├── cli.ts            bakeoff argument parsing
│   │   ├── transport.ts      SSE + JSON HTTP transports
│   │   ├── runner.ts         replay engine + sweep summary
│   │   ├── transcript.ts     transcript shape and totals
│   │   ├── prices.ts         dated price sheet + sources
│   │   ├── costScenarios.ts  measured token counts + fixed costs
│   │   └── cost.ts           per-request / monthly / break-even math
│   ├── prompt/
│   │   ├── systemPrompt.ts   ported legacy prompt + REFUSAL_SENTENCE
│   │   └── promptBuilder.ts  static-first message assembly
│   ├── services/
│   │   ├── LlmService.ts     Fireworks chat completion + streaming
│   │   └── EmbeddingService.ts  nomic embeddings + dimension/all-zero guards
│   ├── validators/
│   │   └── chatValidators.ts parseChatRequest
│   ├── types/
│   │   ├── retrieval.types.ts  Chunk / GetContextOptions / RetrievalAdapter
│   │   └── chat.types.ts       ChatMessage / ChatRole
│   └── utils/
│       ├── errors.ts         NotFound/Validation/Unauthorized/Forbidden/Conflict
│       ├── logger.ts         createLogger(tag)
│       └── sse.ts            Server-Sent Events helpers
├── scripts/                  ingest.ts, seedFirestore.ts, seedFirestoreChunks.ts,
│                             seedPgvector.ts, bakeoff.ts, cost.ts, gradePacket.ts
├── test/
│   ├── integration/  health.test.ts, chat.test.ts
│   └── unit/         retrieval.test.ts, prompt.test.ts, llmService.test.ts,
│                     directFeed.test.ts, ingestion.test.ts, chatValidators.test.ts,
│                     evalFixtures.test.ts, bakeoffRunner.test.ts, pgvectorRag.test.ts,
│                     cost.test.ts, firestoreCorpus.test.ts, firestoreVector.test.ts,
│                     gradePacket.test.ts
├── eval/fixtures/            30 committed bake-off conversations (§12)
├── eval/transcripts/         captured sweeps, <pass>/<arm>/<fixture>.json (§13)
├── eval/grading/             blind grading packet, <pass>/{packet,context,scores.csv,KEY.json}
├── frontend/index.html       static chat UI, wired to POST /api/v1/chat (streaming)
├── data/                     sensor CSV + corpus artifact (git-ignored)
├── documents/                corpus PDFs (git-ignored)
└── docs/                     SPECS.md, timeline.md, EVAL_FIXTURES.md, migration/
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
its text. `REFUSAL_SENTENCE` is **verbatim** because behavior depends on its exact wording (pinned
by a test; `MIGRATION_SPEC.md` §11 calls it out specifically).

**The authoritative ranges are no longer verbatim.** Turbidity was added 2026-07-29 — `0-25 NTU`
freshwater, `0-10 NTU` saltwater, derived from §2 of the operator source-of-truth reference — and
the scope lines were corrected to stop declaring turbidity unmeasured. It is one of the six
parameters the DataPod reads and it is in the ◆G9 slice, so the legacy wording refused every
turbidity question before retrieval ran. The low end is 0, not 5: **0 is a valid turbidity reading**
and must never be flagged as erroneous (same rule as ORP). This block is a pinned control for the
N2 bake-off (`RETRIEVAL_BAKEOFF.md` §4) — changing it once arms have run voids their results.

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
- `temperature` from `LLM_TEMPERATURE`, **default 0**. Previously unsent, so the provider default
  applied and answers were not reproducible. The N2 bake-off requires it pinned — sampling variance
  across arms would measure the sampler rather than the retrieval strategy.
- **Usage carries a cached/uncached prompt-token split** (`cachedPromptTokens`, from
  `prompt_tokens_details.cached_tokens`). Direct-feed's entire cost case rests on this number, and
  reporting only the total would make the arm look uniformly expensive and quietly decide ◆G7.
  `undefined` means the provider said nothing, which is **not** the same as a 0% hit rate.
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

### Seeding Firestore (`scripts/seedFirestore.ts`)

```
npm run ingest && npm run seed:firestore
```

Uploads the artifact to the **`corpus_documents`** collection, one document per file, id derived
from the filename so re-running overwrites rather than duplicating. Writes are batched, so a
partial failure cannot leave the slice half-populated.

**`chunks` is not stored** (removed 2026-08-03). Nothing read it — the direct-feed source reads
`text`, the pgvector seeder reads `corpus.json` directly, and the vector arm needs a separate
per-chunk collection because Firestore cannot index a vector inside an array element. Storing it
put `volunteer_stream_monitoring_a_methods_manual.pdf` at **1,005,018 of 1,048,576 bytes — 96%
full, ~43 KB of headroom**, where one more chunk would have broken seeding. Without it that
document is **478,584 bytes (45.6%)** and the rest are under 17%.

The write shape (`corpusDocumentFields`) lives beside the reader in `FirestoreCorpusSource.ts` on
purpose: a field written but never read is dead weight paid for on every seed, and a field read
but never written is a runtime `undefined`. The seeder **size-checks every document before
committing any of them**, because Firestore rejects an oversized document with an error that names
the batch rather than the file.

**Verified live 2026-08-03** against project `cer-demo-2026`, database `(default)`, via
Application Default Credentials: 8 documents written, largest 478,584 bytes, 5-document slice read
back in stable filename order.

---

## 12. Eval fixtures (`eval/fixtures/`, `src/eval/`)

The Phase N2 bake-off's question set: **30 conversations, 62 turns**, one JSON file per
conversation, committed **before any arm runs** (`RETRIEVAL_BAKEOFF.md` §5). Full design —
classes, grading scales, per-fixture predictions, and the two blockers — in
[`EVAL_FIXTURES.md`](EVAL_FIXTURES.md).

```ts
EvalFixture = { id, class, expected_to_favor, answerable_from, requires, notes, turns }
EvalTurn    = { role: "user", content, rubric: { must_contain, must_not, cite?, notes? } }
```

- **Fixtures are data, not code.** `src/eval/fixtures.ts` loads and validates them; a typo in a
  filename or class fails at load rather than after three arms have been replayed and paid for.
- **Every turn carries its own rubric**, because every turn produces a graded answer and a
  conversation-level rubric would hide *which* turn failed — usually the follow-up, which is what
  the multi-turn format exists to test.
- **`sliceCoverage` and `runnable` are derived at load time, never stored**, so they cannot drift
  from `DIRECT_FEED_SLICE` or from what the service can actually do.
- **`requires` marks fixtures that depend on capabilities that don't exist yet** — `sensor-tool`
  (N3). `turbidity-in-scope` was resolved 2026-07-29 by the prompt change in §10.2, taking the
  runnable set from 22 to **28 of 30 fixtures (58 of 62 turns)**. Without the flag those fixtures
  would produce clean-looking transcripts that grade a missing feature identically across all
  three arms.

---

## 13. Bake-off capture runner (`scripts/bakeoff.ts`, `src/eval/`)

```
npm run bakeoff -- --arm=firestore-direct --pass=cold
npm run bakeoff -- --arm=firestore-direct --spot-check
```

Replays the runnable fixtures against a **running service over HTTP** — not the controller
in-process — so the latency and token counts recorded are the ones production would see
(`RETRIEVAL_BAKEOFF.md` §7a). Capture only; grading is a separate offline pass.

| piece | role |
|---|---|
| `src/eval/cli.ts` | argument parsing; collects every problem before throwing |
| `src/eval/transport.ts` | SSE (default) and JSON transports over `fetch` |
| `src/eval/runner.ts` | replay, history assembly, the arm guard, sweep summary |
| `src/eval/transcript.ts` | transcript shape and totals |
| `scripts/bakeoff.ts` | wiring, spot-check mode, transcript writing |

Transcripts land at `eval/transcripts/<pass>/<arm>/<fixture-id>.json` — the path separates passes
and arms so cold and warm can never be blended by accident.

**Four things it is built to prevent**, each of which otherwise produces a dataset that *looks*
fine:

- **Silent arm substitution.** The registry *ignores* a retrieval override when `DEBUG_RETRIEVAL`
  is false rather than rejecting it (§9). A sweep run against such a server would record all three
  arms as the default and compare one strategy against itself. The runner compares the arm it
  requested against the `mode` the service reports **on every turn** and aborts on mismatch.
- **Cache data mistaken for a cache miss.** An unreported `cachedPromptTokens` stays `undefined`
  through totals and summary rather than summing as zero, and the summary says so loudly.
- **Mislabelled passes.** `--pass=cold` is a label, not a guarantee. The summary warns when a
  "cold" pass was in fact served from cache; the measured split is the ground truth.
- **Empty context.** A misconfigured adapter returning nothing yields fluent, ungradeable answers.
  `--spot-check` probes the arm with three queries (in-slice, out-of-slice, must-refuse) and prints
  the context before any sweep runs.

The **streaming transport is the default** because it is the only one that yields TTFT; `--transport=json`
is the fallback if a provider ever stops emitting usage over the stream.

**Verified live** against `firestore-direct` on 2026-07-30: transcripts captured with full context,
per-turn TTFT/wall time, and the cached/uncached split. Fireworks reports `cached_tokens`, and the
observed hit rate on a warm prefix was **~99.4-99.9%** — the static-first prompt ordering (§10.2)
holding up exactly as the cost case requires.

---

## 14. `pgvector-rag` arm (`docker-compose.bakeoff.yml`, `src/retrieval/adapters/PgVectorRagAdapter.ts`)

⚠️ **Dev/experiment only.** Deliberately re-introduces the stack ◆G1 resolved away from, as the
only honest baseline for "what we had before". **Deleted — adapter, seeder, schema, compose file,
`src/config/pgvector.ts` and the `pg` dependency — once ◆G7 resolves** (`RETRIEVAL_BAKEOFF.md` §9).

```
docker-compose -f docker-compose.bakeoff.yml up -d
npm run seed:pgvector
PGVECTOR_URL=postgresql://cer:cer@localhost:5433/cer_bakeoff npm run dev
```

A faithful port of `MIGRATION_SPEC.md` §7. Every constant is pinned to the legacy value rather than
tuned — a tuned reimplementation would be a different system and would not answer the question:

| element | value | source |
|---|---|---|
| Dense branch | cosine `<=>`, fetch 20 | §7 step 3 |
| Lexical branch | `websearch_to_tsquery('english')` + `ts_rank_cd`, fetch 20 | §7 step 4 |
| Fusion | RRF, `RRF_K = 60`, score `1/(k + rank + 1)` | §7 step 5 |
| top-k | 5, capped 1–10 (shared `resolveTopK`) | §7 |
| Embeddings | `nomic-embed-text-v1.5`, 768-dim, batch 32 | §4.4 |
| Schema | PostgreSQL 16 + pgvector, GIN on `content_tsv`, IVFFlat `lists = clamp(√n, 10, 100)` built post-load | §6 |

`fuseRrf` is a pure function in `src/retrieval/rrf.ts`, separate from the adapter, because it is the
one piece whose correctness can be established without a database — and a subtly wrong fusion
returns plausible-but-worse chunks, which would read as "RAG loses" rather than as a bug.

The seeder reads **`data/corpus/corpus.json`**, the same artifact every other arm loads, never the
PDFs — the one-parse rule (§11). It is idempotent by filename and embeds inside a per-document
transaction, so a mid-run failure cannot leave a half-seeded document that the idempotency check
would later skip as complete. `sensor_data` is deliberately **not** ported: the sensor path is held
constant across arms.

> **Provider bug found while standing this up (2026-07-30).** Calling Fireworks' embeddings endpoint
> **without** `encoding_format` returns a corrupt **192-element all-zero vector** instead of the
> 768-dim embedding — no error, no warning. Dense retrieval built on zero vectors ranks arbitrarily,
> so the RAG arms would have lost the bake-off to a bug rather than to retrieval. `EmbeddingService`
> now always sends `encoding_format: "float"` and rejects both wrong dimensions **and** all-zero
> vectors, since a degenerate vector of the right shape would otherwise pass every check.

**Verified live** on 2026-07-30 against the seeded sidecar (8 documents, 305 chunks, IVFFlat
lists=17): answers ORP correctly on ~4,400 prompt tokens against direct-feed's ~10,900, **answers
the deep-in-manual stabilization-criteria question that direct-feed refuses**, and still refuses the
fecal-coliform probe despite retrieving the volunteer manual's bacteria chapter.

---

## 14a. Cost model (`src/eval/prices.ts`, `src/eval/cost.ts`, `scripts/cost.ts`)

```
npm run cost
npm run cost -- --model=accounts/fireworks/models/gpt-oss-120b
npm run cost -- --cache-rate=0
```

The arithmetic that resolves ◆G7 once quality has gated the arms (`RETRIEVAL_BAKEOFF.md` §1, §1b).
Calls no network and no provider — it is pure arithmetic over a recorded price sheet, so anyone
auditing the decision can re-run it for free.

| piece | role |
|---|---|
| `src/eval/prices.ts` | the price sheet, **with the date and source URL it was read from** |
| `src/eval/costScenarios.ts` | the measured token counts per arm, and the fixed-cost figures |
| `src/eval/cost.ts` | pure functions: `perRequestCost`, `monthlyCost`, `breakEven`, `costCurve` |
| `scripts/cost.ts` | the CLI — per-answer table, monthly curve over 1k-100k, pairwise break-evens |

Four things it is built to prevent:

- **An undated price sheet.** Rates rotate; a cost conclusion whose inputs cannot be dated cannot
  be re-checked. `PRICES_READ_ON` and `PRICE_SOURCES` travel with the numbers.
- **A guessed cache split.** `RequestTokens.cachedPromptTokens` is **required**, and a split larger
  than the prompt throws. Defaulting it to zero prices direct-feed at its worst case; defaulting it
  to the full prompt prices it at its best — both silently.
- **A negative break-even reported as a threshold.** When the lower-marginal arm also has the lower
  fixed cost the lines cross at a negative request count; `breakEven` returns `dominated` instead.
- **A projection passed off as a measurement.** Projected arms are marked `*` and the table is
  labelled by `TOKEN_PROVENANCE`. **Since 2026-08-12 every arm is a sweep mean** — provenance is
  `measured`, `PROJECTED_ARMS` is empty, and the `*` legend only prints when something is actually
  projected.

Prices, findings, and what they do to the decision: `RETRIEVAL_BAKEOFF.md` §1b. The headline is
that a **50% cached-input discount on `gpt-oss-20b` does not invert the naive cost story, but the
90.7% discount on `gpt-oss-120b` does** — and that at realistic volume every arm lands within a few
dollars a month of the others.

---

## 14b. `firestore-vector` arm (`src/retrieval/adapters/FirestoreVectorAdapter.ts`)

```
npm run ingest && npm run seed:firestore-chunks
DEBUG_RETRIEVAL=true npm run dev        # then send retrieval=firestore-vector
```

Dense RAG on Firestore's own vector search — ◆G10. Unlike `pgvector-rag` this arm **survives ◆G7**:
it runs on the store the service already uses, so keeping it costs no infrastructure even if
direct-feed wins.

It is deliberately **not a better RAG**. It is `pgvector-rag` with the store swapped and the
lexical branch removed, because **Firestore has no full-text search**: same chunks, same embedding
model, same nomic prefixes, same top-k. The missing lexical branch is a finding, not a shortcut —
it is the weakness the legacy hybrid existed to cover, and the eval's exact-token class
(`acronym-*`: "ORP", "NTU", "KCl creep") is aimed straight at it.

| element | value | why |
|---|---|---|
| Collection | `corpus_chunks`, ~305 docs, id `<filename>__<0000-padded index>` | **Separate from `corpus_documents` by necessity** — Firestore will not index a vector inside an array element |
| Vector field | `embedding`, `Vector(768)` via `FieldValue.vector()` | must match the index |
| Distance | `COSINE`, to match pgvector's `<=>` | a different measure would mean the two RAG arms no longer compare the same similarity |
| Fetch depth | `limit = topK` (5), not the pgvector arm's fetch-20 | depth 20 exists to give RRF something to fuse; with one branch it would only pay for discarded reads |
| Score | `1 − distance` | Firestore returns *distance* (0 = identical), pgvector's fused RRF score is higher-is-better; reporting distance verbatim would invert the ranking signal between arms |

**Two silent-failure modes, both guarded:**

- **`FieldValue.vector()` is load-bearing.** A plain `number[]` writes an array, the index never
  matches it, and `findNearest` returns **nothing, with no error** — the same shape as the
  `encoding_format` bug that nearly decided this bake-off. An arm retrieving nothing still answers
  fluently and ungrounded, so it would have read as "Firestore vector search is bad." The write
  shape lives beside the reader and `unit/firestoreVector.test.ts` asserts the wrapper directly.
- **Zero results are logged loudly**, naming the three causes that produce them (unseeded
  collection, missing vector index, embeddings written as arrays).

The seeder is idempotent **checked before embedding**, so a re-run costs nothing rather than
re-paying for identical vectors, and commits one batch per document so an interruption cannot leave
a half-seeded document the idempotency check would later skip as complete.

**Verified live 2026-08-04** against `cer-demo-2026`: 305 chunks seeded — the same count the
pgvector arm holds, which is what "same chunks" requires — embeddings stored as `VectorValue`
(768-dim, non-zero), both indexes present, and `findNearest` returning 5 ranked chunks per query.
Re-running the seeder skipped all 8 documents and made zero embedding calls.

**Exercised end-to-end through `POST /api/v1/chat`**, on the two fixtures that discriminate between
arms:

| probe | result |
|---|---|
| Turbidity normal range | **3,532** prompt tokens against direct-feed's **10,889**, cosine scores descending 0.735 → 0.718 |
| `deepmanual-stabilization-criteria` | **Answers what direct-feed refuses** — all five rubric figures, top chunks from `tm9a6.8.pdf`, no probe-datasheet specs substituted |
| `refusal-pathogens` | Retrieved the volunteer manual's fecal-bacteria chapter (chunks 175–177) and **still refused**, using the exact refusal sentence |

The refusal result is the one worth recording: it is the case that fixture exists to catch, where a
RAG arm retrieves on-topic-looking text and gets pulled off a refusal the service must make.
Direct-feed passes it structurally, by never seeing the chapter; this arm saw it and refused anyway.

All three arms were selectable per-request on one server (`DEBUG_RETRIEVAL=true`), with
`firestore-direct` reproducing 10,889 prompt tokens exactly — the switch the sweep runs on.

**Swept 2026-08-11**: spot-checked, then captured cold and warm across all 58 runnable turns with
zero failures. It is the **best-retrieving RAG arm** — 33.9% miss rate against `pgvector-rag`'s
53.6% — the **cheapest arm at every volume** in the 1k-100k range, and it over-refused exactly one
turn (against 11 for `pgvector-rag`). It also wins `deep-in-manual` outright at 83%, the one class
`firestore-direct` cannot serve. Full per-class numbers in
[`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §4b.

---

## 15. API

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

## 16. Testing

Jest + `ts-jest` + `supertest`. **234 tests, all passing** (on `feat/device-api`, which adds the
device-API suite, 279).

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
| `unit/evalFixtures.test.ts` | the committed eval set (ids, class coverage, multi-turn, slice consistency) and every rule the fixture loader claims to enforce |
| `unit/bakeoffRunner.test.ts` | history assembly across turns, the arm-mismatch abort, failed-turn handling, cached-token accounting, the sweep warnings, SSE frame buffering, and CLI parsing |
| `unit/pgvectorRag.test.ts` | RRF scoring and tie-breaking against the legacy formula, the nomic task prefixes, embedding batching and dimension/all-zero guards, both query branches, and top-k handling — all without a database |
| `unit/cost.test.ts` | per-request billing with cached/uncached split, the cache-split guard, monthly totals, break-even including the negative-crossover and parallel-line cases, and the ◆G7 conclusions pinned to the recorded prices |
| `unit/firestoreCorpus.test.ts` | the written field set matches what `loadSlice` reads, `chunks` stays out, and the document size guard |
| `unit/firestoreVector.test.ts` | the `FieldValue.vector()` wrapper, the distance→score inversion, and the zero-result guard |
| `unit/gradePacket.test.ts` | the blind packet's label shuffle: every arm once per fixture, deterministic across rebuilds, and **balanced across the set** — a shuffle can look right per sheet while the set leaks the mapping |

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

## 17. Not yet built (tracked in `timeline.md`)

| Area | Legacy reference | Target |
|---|---|---|
| Tool-calling orchestration loop | `MIGRATION_SPEC.md` §3 | 5 tool rounds + 1 forced-text round, `role:"tool"` messages, round-cap fallback — returns in N3 with `query_sensor_data` |
| Corpus ingestion + real adapters | `MIGRATION_SPEC.md` §5 | N2 bake-off: `firestore-direct` (small tier, ◆G9), `pgvector-rag`, `firestore-vector` (◆G10 → all three) |
| Embedding calls | `MIGRATION_SPEC.md` §4.4 | only needed if the bake-off selects a vector arm |
| Document context strategy | `MIGRATION_SPEC.md` §6–7 (pgvector) | **open gate ◆G7** — decided by the [direct-feed vs RAG bake-off](RETRIEVAL_BAKEOFF.md): `firestore-direct` vs `pgvector-rag` vs `firestore-vector` |
| `query_sensor_data` | `MIGRATION_SPEC.md` §8 | **device-API adapter** (◆G8 resolved) — see `timeline.md` N3 |
| Ingestion (docs + CSV) | `MIGRATION_SPEC.md` §5 | re-home to Firestore |


---

## 18. Privacy posture (carried forward)

Unchanged in intent from the legacy build: once chat lands, all prompts (system + history +
retrieved chunks + user message) are sent to Fireworks AI, and confidentiality rests on a
contractual DPA with Fireworks, not on data residency. For the skeleton, no data flows to any LLM.
Sensor data (`data/`) and the corpus (`documents/`) are git-ignored; sensor data is treated as
confidential per `CLAUDE.md`.
