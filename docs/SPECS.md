# Clean Earth RAG — Current Specs

What is built and how it works. This is the implementation reference for the current codebase; the
status block below says which phase each piece belongs to.

- The **legacy** FastAPI + Postgres/pgvector behavior being ported lives in
  [`migration/MIGRATION_SPEC.md`](migration/MIGRATION_SPEC.md).
- The **conventions** this code follows are in [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md).
- The **roadmap / next steps** are in [`timeline.md`](timeline.md).
- The **direct-feed vs RAG experiment** that decides how document context is retrieved — on cost —
  is in [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md). It was swept in 2026-08 and superseded by the
  eval rebuild; its report `RETRIEVAL_COMPARISON.md` is archived (`ARCHIVED.md`).
- The **question set every arm is graded against** is described in §12 and planned in
  [`EVAL_REBUILD.md`](EVAL_REBUILD.md), committed before any arm runs.

> **Status (2026-09-15).** The eval apparatus is being rebuilt ([`EVAL_REBUILD.md`](EVAL_REBUILD.md)).
> The 2026-08 bake-off ran on `gpt-oss-20b` against a fixture set archived on 2026-09-01, so **treat
> every retrieval arm as unranked**; the sections below describe what was built and stay accurate as
> history. ◆G7 split on 2026-08-26, and the system prompt has not been a pinned control since.
>
> Built: the chat spine and retrieval seam (§9, §10), the retrieval arms (§9, §14b; `pgvector-rag`
> archived and dropped, §14), and Phase N3's device-API client, `query_sensor_data`, `list_pods`,
> `get_pod_thresholds`, `get_turbidity_info` and tool loop (§10.3a), all **gated on `SENSOR_TOOL`,
> default off**. Report generation (§10.7) is gated on `REPORT_TOOL`, and the guidance catalogue (§4b)
> on `CATALOGUE_PROMPT` for chat. `DEFAULT_RETRIEVAL` ships as `stub`, so
> a fresh checkout needs no credentials. The roadmap is in [`timeline.md`](timeline.md).

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

Deliberately **out of scope at this stage:** authentication. Everything else once listed here —
the tool-calling orchestration loop, embedding calls, real document retrieval, sensor-data
queries, corpus ingestion — has since been built; see the status block above and §10.3a, §14.

---

## 2. Components

| Layer | Choice |
|---|---|
| Language | TypeScript 5, `strict`, **CommonJS** output via `tsc` → `dist/` |
| HTTP | Express 4 |
| Middleware | `morgan` (dev logging), `helmet`, `cors`, `express.json` |
| Datastore | Firestore via `@google-cloud/firestore` — read by `FirestoreCorpusSource` and `FirestoreVectorAdapter`; the client is still lazy, so boot needs no credentials (§5) |
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
│   │   ├── chatRoutes.ts     POST /api/v1/chat
│   │   ├── deviceRoutes.ts   GET /api/v1/devices (§10.5)
│   │   ├── reportRoutes.ts   POST /api/v1/reports - PDF bytes, off while REPORT_TOOL is off
│   │   └── usageRoutes.ts    GET /api/v1/usage — read-only allowance, outside quotaGuard
│   ├── controllers/
│   │   ├── HealthController.ts
│   │   ├── ChatController.ts   retrieve → assemble → answer (JSON or SSE)
│   │   ├── DeviceController.ts pod list for the UI selector
│   │   ├── ReportController.ts renders a report PDF in memory and returns it (§10.7)
│   │   └── UsageController.ts  read-only quota standing (§4a)
│   ├── middleware/
│   │   ├── errorHandler.ts   terminal error handler
│   │   ├── quotaGuard.ts     429 gate on POST /chat, before SSE opens (§4a)
│   │   ├── notFound.ts       404 → http-errors NotFound
│   │   └── requireCallerToken.ts  401 unless the caller sends a bearer token (§10.5)
│   ├── quota/
│   │   ├── index.ts          composition root: the process-wide `quotaService`
│   │   ├── QuotaService.ts   policy: check / recordRequest / recordTokens
│   │   ├── QuotaStore.ts     storage seam + epoch-aligned window maths
│   │   ├── InMemoryQuotaStore.ts  process-local counters (caveats in the header)
│   │   └── quotaKey.ts       what a counter keys on, and what it cannot
│   ├── retrieval/
│   │   ├── index.ts          shared registry, built-in adapters registered here
│   │   ├── RetrievalRegistry.ts  mode → adapter + selection rules
│   │   ├── options.ts        top-k bounds + resolveTopK()
│   │   ├── adapters/
│   │   │   ├── StubAdapter.ts
│   │   │   ├── GoldContextAdapter.ts     the labelled-relevant chunks only: the generation ceiling
│   │   │   ├── DirectFeedAdapter.ts
│   │   │   ├── FirestoreVectorAdapter.ts
│   │   │   ├── LocalVectorAdapter.ts     in-process dense, over the embedding cache
│   │   │   ├── RrfHybridAdapter.ts       dense + BM25, fused with RRF
│   │   │   └── HybridSliceVectorAdapter.ts  the ◆G9 slice + a ranked arm
│   │   ├── lexical/
│   │   │   └── Bm25Index.ts          in-process BM25 for the hybrid arms
│   │   └── sources/
│   │       ├── corpusSource.ts        CorpusSource contract
│   │       ├── ArtifactCorpusSource.ts
│   │       └── FirestoreCorpusSource.ts
│   ├── ingestion/
│   │   ├── corpus.ts         DOC_META + the ◆G9 direct-feed slice
│   │   ├── extract.ts / chunk.ts / ingest.ts
│   ├── eval/
│   │   ├── types.ts          EvalFixture / EvalTurn / EvalRubric
│   │   ├── fixtures.ts       loader + strict validation of FIXTURE_DIR (eval/fixtures-wave1/)
│   │   ├── cli.ts            bakeoff argument parsing
│   │   ├── transport.ts      SSE + JSON HTTP transports
│   │   ├── runner.ts         replay engine + sweep summary
│   │   ├── transcript.ts     transcript shape and totals
│   │   ├── gates/            §8a hard-gate checker — npm run gate:check
│   │   │   ├── normalize.ts  NFKC + dash/quote folding, edit distance, similarity
│   │   │   ├── checks.ts     refusal / citations / figures / quotes, per turn
│   │   │   └── runner.ts     walks transcripts, aggregates per arm
│   │   ├── judge/            Tier 2 LLM judge — npm run judge
│   │   │   ├── prompts.ts    one prompt per graded dimension
│   │   │   ├── runner.ts     task list, verdict ledger, budget
│   │   │   └── calibrate.ts  judge-vs-human agreement
│   │   ├── retrieval/        offline retrieval harness — npm run retrieval:eval
│   │   │   ├── labels.ts / metrics.ts / runner.ts / types.ts
│   │   ├── prices.ts         dated price sheet + sources
│   │   ├── costScenarios.ts  measured token counts + fixed costs
│   │   └── cost.ts           per-request / monthly / break-even math
│   ├── prompt/
│   │   ├── systemPrompt.ts   ported legacy prompt + REFUSAL_SENTENCE + TOOL_BLOCK /
│   │   │                     REPORT_TOOL_BLOCK (both flagged)
│   │   └── promptBuilder.ts  static-first message assembly
│   ├── devices/
│   │   ├── DeviceApiClient.ts  read-only client for the Clean Earth backend
│   │   ├── mergeChains.ts    device continuity across re-registered pods (§10.3c)
│   │   ├── metrics.ts        metric codes, error flags, reading/average decoding
│   │   └── plausibility.ts   per-metric physical rails the hardware error flags miss
│   ├── tools/
│   │   ├── index.ts          tool registry, gated on SENSOR_TOOL and REPORT_TOOL
│   │   ├── querySensorData.ts  the sensor tool: device match, fetch, caveats (§10.3a)
│   │   ├── generateReport.ts   the report tool, gated on REPORT_TOOL
│   │   ├── getPodThresholds.ts  the pod's registry alert limits, validated, no fallback
│   │   ├── getTurbidityInfo.ts  turbidity clarity bands and sensor caveats
│   │   ├── listPods.ts       the caller's own fleet, with best-effort freshness (§10.3a)
│   │   ├── timeRange.ts      NL range parsing + reference-time anchoring
│   │   └── aggregate.ts      min/max/mean/median/latest/earliest/raw/series, null-never-zero
│   ├── catalogue/           the guidance catalogue shared by chat and reports (§4b)
│   │   ├── catalogue.json    the single source: entries, referrals, review status
│   │   ├── parseCatalogue.ts  validator, run at import
│   │   ├── select.ts         usable entries, water class, per-finding selection
│   │   ├── promptBlock.ts    the chat prompt's APPROVED GUIDANCE block
│   │   └── reviewPage.ts     the supervisor review page (docs/catalogue/review.html)
│   ├── report/              the deterministic report pipeline (compute, then narrate)
│   │   ├── buildReportInput.ts  assembles the report model from sensor + registry data
│   │   ├── events.ts         period-relative event detection
│   │   ├── referenceRanges.ts   registry-threshold baselines + TURBIDITY_BAND_EDGES
│   │   ├── operatorThresholds.ts  validated per-device registry thresholds
│   │   ├── patterns.ts       diel / tidal / trend classification from an hourly series
│   │   ├── produceReport.ts  the whole pipeline, shared by generate_report and POST /reports
│   │   ├── narrative.ts      rule-based prose; causes and next steps only from the catalogue
│   │   ├── renderPdf.ts      pdfkit layout
│   │   └── types.ts
│   ├── services/
│   │   ├── LlmService.ts     Fireworks chat completion + streaming + tool calls
│   │   ├── ChatOrchestrator.ts  the tool-round loop, dispatch, cap fallback
│   │   ├── EmbeddingService.ts  nomic embeddings + dimension/all-zero guards
│   │   └── auditLog.ts       optional Firestore audit trail of answers, off unless AUDIT_LOG is set
│   ├── validators/
│   │   └── chatValidators.ts parseChatRequest
│   ├── types/
│   │   ├── retrieval.types.ts  Chunk / GetContextOptions / RetrievalAdapter
│   │   ├── device.types.ts     device, reading, metric, averages shapes
│   │   ├── tool.types.ts       ToolDefinition / ToolCall / ToolHandler / ToolInvocation
│   │   └── chat.types.ts       ChatMessage / ChatRole (incl. the tool role)
│   └── utils/
│       ├── errors.ts         NotFound/Validation/Unauthorized/Forbidden/Conflict + codedError
│       ├── answerFormat.ts   【commentary…】 stripping, buffered for the streaming path
│       ├── bearerToken.ts    lifts the caller's Authorization header
│       ├── logger.ts         createLogger(tag)
│       └── sse.ts            Server-Sent Events helpers
├── scripts/                  ingest.ts, seedFirestore.ts, seedFirestoreChunks.ts,
│                             buildEmbeddingCache.ts, bakeoff.ts, gateCheck.ts, judge.ts,
│                             cost.ts, gradePacket.ts, retrievalEval.ts,
│                             resolveRetrievalLabels.ts, compareVectorArms.ts,
│                             renderReport.ts, exploreDeviceApi.ts, verifySensorTool.ts,
│                             exploreDeviceFields.sh, exploreBackendSurface.sh
├── test/
│   ├── integration/  health.test.ts, chat.test.ts, sensorChat.test.ts, quotaChat.test.ts,
│   │                 devices.test.ts, reports.test.ts
│   ├── fixtures/device-api/  recorded production bodies + provenance README (§16)
│   ├── fixtures/pod-scope/   synthetic fleet for pod-authorization work
│   └── unit/         51 suites — see the table in §16
├── eval/fixtures-wave1/      45 committed eval conversations, 90 turns (§12)
├── eval/claims/              Phase 1a claim inventory, one file per document
├── eval/retrieval-labels/    wave-1 retrieval ground truth (generated)
├── eval/transcripts/         captured runs: the Phase 3 gold-context baseline (warm/gold-context/)
│                             (the pre-rebuild set is under tag `eval-archive-2026-09-01`)
├── frontend/                 static demo chat UI (index.html + js/), wired to /chat, /devices, /reports
├── data/                     corpus artifact + device-API recordings (git-ignored)
├── documents/                corpus PDFs — `documents/*` is git-ignored, but the four Tier 1
│                             files (the ◆G9 slice) are force-tracked; see documents/README.md
├── archive/pgvector-rag/     the archived bake-off arm at its original paths (§14) —
│                             not compiled, not tested, not imported; excluded from the image
└── docs/                     STATUS.md (start here), SPECS.md, timeline.md, EVAL_REBUILD.md, migration/
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
- The defaults of `SENSOR_TOOL` (`false`), `DEFAULT_RETRIEVAL` (`stub`) and `DEBUG_RETRIEVAL`
  (`false`) stay as they are, so a fresh checkout is credential-free and makes no live reads.

Shape:

```ts
config = {
  nodeEnv, isProduction, port, logLevel,
  firestore:  { projectId?, databaseId },
  fireworks:  { apiKey?, baseUrl, chatModel?, embeddingModel, maxTokens, temperature, user },
  deviceApi:  { baseUrl?, devToken?, timeoutMs, defaultDeviceLabel? },
  tools:      { sensorTool, reportTool, maxToolRounds, rawLimit },
  chat:       { maxHistoryMessages },
  quota:      { enabled, requests, tokens, reports, windowMs, windowLabel, scope },
  retrieval:  { defaultMode, debug, corpusSource },
  waterType,
  audit:      { enabled },
  catalogue:  { prompt, includeDrafts },
}
```

`tools.sensorTool` (`SENSOR_TOOL`, default `false`) is the Phase N3 gate — see §10.3a.
`tools.reportTool` (`REPORT_TOOL`, default `false`) is the same shape for `generate_report`: a
separate flag rather than a fold into `sensorTool`, because `generate_report` calls
`QuerySensorData.query()` directly instead of going through the model's tool loop. Turning either
on **logs a warning at startup**, deliberately: both un-pin the bake-off's system prompt, and a
capture run made with one on is not comparable to the three already captured. Better a line in
every startup log than a silently voided sweep.

`catalogue.prompt` (`CATALOGUE_PROMPT`, default `false`) appends the guidance block to the system
prompt and warns at startup for the same capture-comparability reason. `catalogue.includeDrafts`
(`CATALOGUE_DRAFTS`, default `false`) shows unapproved entries, for the supervisor's review only (§4b).

Environment variables and defaults are documented in `README.md` §5 and `.env.example`.

Two readers exist only for the quota block (§4a) and are worth naming, because both are stricter
than the getters above rather than more forgiving:

- `readLimit` accepts the literal `unlimited` or a non-negative integer, and **fails the boot on
  anything else**. `none`, `off`, `-1` are all plausible things to type, and reading any of them
  as "unlimited" would hand an unbounded deployment to somebody who was trying to bound one.
- `readDuration` requires a unit suffix (`s`/`m`/`h`/`d`/`w`). `DEVICE_API_TIMEOUT_MS` gets away
  with a bare integer because `10000` is legible; `604800000` is not, and a unitless window
  silently accepts a value in the wrong unit.

---

## 4a. Query quota (`src/quota/`, `src/middleware/quotaGuard.ts`)

**Off by default, and that is a requirement rather than a default.** This repo runs pinned
experimental controls (`SENSOR_TOOL`, `REPORT_TOOL`, the system-prompt hash); a gate that began
refusing requests without an operator opting in would void a capture run and look like a product
bug. `QUERY_QUOTA=false` short-circuits everything: nothing is counted, nothing is refused, and
the limits below are ignored — "off" is one state, not something inferred from four variables.

### Why it exists

The upstream backend hard-codes its policy in `GilliganService.checkQuota`
(`GET /api/v1/gilligan/check-quota`): allowed if **any** of — under 2 messages by this user in the
last week, under 10 by their organization this month, any active Stripe subscription, or
`role === "superadmin"`. Whatever replaces Gilligan inherits that contract, and those numbers are
exactly what the team is still deciding. This block makes the policy an `.env` edit, and adds the
**token** dimension so a request count and a spend cap can be compared on one deployment.

Since the R3 relay, that upstream route is served from this service's `GET /api/v1/usage` when the
upstream backend is `rag`, so the policy is read from here rather than hard-coded there. The
endpoint reports standing and the gate refuses; `QuotaService.status` is the read and
`quotaGuard` the refusal, and neither calls the other.

| variable | default | meaning |
|---|---|---|
| `QUERY_QUOTA` | `false` | master switch |
| `QUERY_QUOTA_REQUESTS` | `unlimited` | chat requests per key per window, or `unlimited`; `0` = refuse everything |
| `QUERY_QUOTA_TOKENS` | `unlimited` | `usage.totalTokens` per key per window, summed across tool rounds |
| `QUERY_QUOTA_REPORTS` | `unlimited` | report PDFs per key per window (`POST /api/v1/reports`); refuses with `quota_reports_exceeded` |
| `QUERY_QUOTA_WINDOW` | `30d` | window length; **unit suffix required** (`s`/`m`/`h`/`d`/`w`) |
| `QUERY_QUOTA_SCOPE` | `caller` | `caller` (per identity) or `global` (whole deployment) |

Reports are a third, separate dimension: a report runs several device reads and a render but no model call, so it is gated by `quotaGuard(…, "report")` on `POST /api/v1/reports` against `reports` only, and chat is gated against `requests` and `tokens` only.
All three share `QUERY_QUOTA_WINDOW`; a per-day report limit beside a per-month token limit needs R1's multi-window store.
A report is recorded only after its PDF renders, so a bad range or an empty window costs nothing.

The two chat dimensions are independent — either, neither, or both. `requests` is evaluated first, so
when both are simultaneously spent the refusal names the request count: it is the cheaper, more
legible ceiling for an operator to raise. Upstream's `OR` is deliberately **not** reproduced; its
semantics mean the effective limit is the *maximum* of its clauses, which is almost certainly not
what anyone reading "2 messages per week" expects. Here every enabled dimension must be satisfied.

### Enforcement point

`quotaGuard` is middleware on `POST /api/v1/chat`, ahead of the controller. It has to be:
`openSseStream` writes the status line before the first token, so a refusal discovered inside the
handler could only be an in-band `error` event on a 200. As middleware, an over-quota request —
streamed or not — is refused as a real **429 with a JSON body** and `Retry-After` set to the
window's remaining seconds. This matches the existing rule that validation 400s arrive as JSON
rather than as SSE.

The gate **reads**; `ChatController` **writes**. Requests are counted after `parseChatRequest`
succeeds, so a 400 does not consume an allowance, and tokens are recorded when the model reports
usage — on the JSON path, the tool-loop streaming path, and the token-streaming path alike.

**Token accounting is retrospective and cannot be otherwise.** A prompt's cost is unknown until
the provider answers, so the ceiling is enforced against usage already recorded: the request that
crosses the line completes, the next one is refused. The overshoot is bounded by one
`LLM_MAX_TOKENS` answer. An absent `totalTokens` is dropped rather than counted as `0` — "not
reported" and "free" are different facts.

### What the counters key on — and what they cannot

`caller` scope resolves, in order: `sha256(bearer token)` truncated to 16 hex chars → `ip:<addr>`
→ a single shared `anonymous` bucket. Being unattributable must not buy an unlimited allowance.
What is **not** available here, stated plainly:

- **No user id.** This service authenticates nobody — `callerToken` lifts the header verbatim and
  the device API judges it. The token is a JWT, but keying on an *unverified* `sub` would be a
  quota any caller can reset by editing a payload. Hashing the whole token means a second bucket
  costs a second token the device API accepts.
- **No organization.** Resolving one needs a backend round-trip this service does not make.
  `QUERY_QUOTA_SCOPE=global` is the honest stand-in on a single-tenant deployment; a real per-org
  quota arrives with real auth.
- **A signed-out browser sends no `Authorization` header** (`frontend/js/auth.js` sends the active
  account's token only when one is set, §10.5), so an anonymous request lands on the IP branch.
- **`trust proxy` is not set** in `app.ts`, so `req.ip` is the socket peer — behind Cloud Run,
  the proxy. For anonymous traffic, `global` is the scope whose behavior matches its name.
  `config` warns about all of this at startup rather than leaving it to be discovered.

### Storage caveat

`InMemoryQuotaStore` is a `Map` in the process: it **resets on every redeploy and crash**, it is
**per instance** (N containers enforce N quotas, so the effective limit is `limit x N`), and
read-then-record is not transactional, so concurrent requests from one key can overshoot by one
or two. Windows are **fixed and epoch-aligned**, not rolling — a caller can spend a full
allowance on each side of a boundary, and a `7d` window rolls over on Thursday 00:00 UTC rather
than on Sunday or on the caller's first request.

That is adequate for deciding which policy the team wants, and inadequate as the gate on a paid
tier. The `QuotaStore` interface is where a Firestore or Redis implementation lands: policy
(`QuotaService`) and counting (`QuotaStore`) are already separate, and swapping the store is a
new file plus one line in `src/quota/index.ts`. Every method takes `nowMs` explicitly so window
rollover is testable without faking the clock.

---

## 4b. Guidance catalogue (`src/catalogue/`)

Every possible cause, next step and referral a customer can see comes from one versioned file, `src/catalogue/catalogue.json`, reviewed by the supervisor.
The decision and the content sources are in `migration/GILLIGAN_TARGET_ARCHITECTURE.md` §2d; the allowlist reasoning is in `RESPONSIBILITY.md`.

**Entries.**
Each entry has an id, a kind (`explanation`, `limitation` or `next-step`), approved text, the conditions and evidence it needs, a limitation, sources, an optional referral and a review record.
A `next-step` that reports can select names its recommendation slot (`operational`, `investigative` or `stakeholder`).
An entry without `appliesTo.triggers` is for chat only.
`parseCatalogue` validates the file at import and lists every problem at once; an approval must record who and when.

**What is usable.**
Only `approved` entries whose referral (if any) is also approved reach customers.
`CATALOGUE_DRAFTS=true` adds drafts for the supervisor's own review; rejected entries are never used.
The `version` string is bumped on every content change and is recorded with each report (`catalogue_version`, `guidance_ids` in the `generate_report` result).

**Reports** (`report/narrative.ts`).
An event's cause is named only when a usable `explanation` matches its type, water class, confidence and severity.
Otherwise the PDF heads it "Threshold crossing", prints no classification confidence, and selects every other entry as if the event were `Inconclusive`, so a next step cannot imply the unnamed cause.
The detection rule's own rationale (`WQEvent.interpretation`) is never printed.
Recommendations for a flagged period are the matching `next-step` texts per slot, deduplicated in catalogue order; an empty slot says no approved recommendation covers the findings.
The routine and "not assessed" lines are about monitoring and configuration and do not come from the catalogue.
Water class: `Freshwater` pods use the freshwater signatures; `Marine`, `Brackish` and `Estuarine` pods use the marine ones (source-of-truth v2 §0 rule 2).

**Chat** (`catalogue/promptBlock.ts`).
With `CATALOGUE_PROMPT=true` the system prompt ends with an `APPROVED GUIDANCE` block: rules, then one record per usable entry.
With nothing approved, the block forbids causes, actions, services and contacts outright.
The block appends after both tool blocks, so the earlier prompt stays a byte-exact prefix (`test/unit/prompt.test.ts`).
The eval runners build their grounding prompt with the block off.

**Review page.**
`npm run catalogue:review` regenerates `docs/catalogue/review.html` from the file; never edit the page by hand.

---

## 5. Firestore initialization (`src/config/database.ts`)

`getFirestore()` returns a **memoized singleton** `Firestore` client. Construction is lazy and
opens no connection, so importing the module (or booting the server) never requires credentials —
the client connects on first read/write. Project id comes from `FIRESTORE_PROJECT_ID` when set,
otherwise Application Default Credentials infer it; database id defaults to `(default)`.

This intentionally differs from the reference server, which created a new client per repository —
flagged as wasteful in `migration/CONVENTIONS.md`. Its consumers are `FirestoreCorpusSource`,
`FirestoreVectorAdapter` and `auditLog`.

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
  { "error": "<message>", "message": "<message>", "code": "<error-code>" }
  ```

  `error` is mandatory (the deployed client reads it); `message` mirrors it; **no `status` field is
  placed in the body** (the HTTP status line carries it); the stack is included only outside
  production. 5xx errors are logged.

  `code` is **optional and machine-readable** — present only when the failure belongs to the
  taxonomy in `src/utils/errors.ts`, absent for everything else. The closed set is:

  | code | status | meaning |
  |---|---|---|
  | `llm_not_configured` | 503 | no `FIREWORKS_API_KEY` / `LLM_MODEL` |
  | `device_auth_expired` | 401 | the device API rejected the token; terminal, never retried |
  | `device_timeout` | 504 | the device API did not answer within `DEVICE_API_TIMEOUT_MS` |
  | `device_unavailable` | 502/503 | the device API is unreachable or `DEVICE_API_BASE_URL` is unset |
  | `caller_token_required` | 401 | a route or tool that reads org-scoped data got no bearer token (§10.5) |
  | `quota_requests_exceeded` | 429 | this key's `QUERY_QUOTA_REQUESTS` allowance is spent (§4a) |
  | `quota_tokens_exceeded` | 429 | this key's `QUERY_QUOTA_TOKENS` allowance is spent (§4a) |
  | `quota_reports_exceeded` | 429 | this key's `QUERY_QUOTA_REPORTS` allowance is spent (§4a) |

  Clients branch on `code`, never on prose: `frontend/js/podbar.js` maps the four device/LLM codes
  to its badge text, and falls back to `err.status` when a failure carries no code at all.

  The quota codes are separate rather than one `quota_exceeded` because the dimensions are
  configured independently: one is fixed by asking fewer questions, another by asking cheaper
  ones, and an operator raises a different variable for each. All carry a `Retry-After` header.

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
- **`firestore-vector`** (`FirestoreVectorAdapter`) — dense RAG on Firestore's own vector search
  (§14b), the surviving RAG arm.
- **`local-vector`** (`LocalVectorAdapter`) — the same dense retrieval computed in process against
  the cache `npm run embed:cache` writes. No credentials, no vector index, no network on the query
  path. It exists so retrieval can be evaluated offline and free; `npm run compare:vector-arms`
  reports **30/30 queries ranked identically** to `firestore-vector`, drift ~1e-4, because
  Firestore's index is configured `flat` (exhaustive) rather than approximate.
- **`local-hybrid`** (`RrfHybridAdapter`) — dense fused with an in-process BM25 index using
  Reciprocal Rank Fusion, `RRF_K = 60`. This restores the lexical half the migration dropped
  because Firestore has no full-text search (`RETRIEVAL_BAKEOFF.md` §4b's "dead lexical branch").
  **`RRF_K` is the published default and deliberately untuned** — tuning it against the same 99
  queries used to report the result would fit the constant to the test set.
- **`hybrid-slice-vector`** / **`hybrid-slice-lexvec`** (`HybridSliceVectorAdapter`) — the ◆G9
  slice returned whole, **first**, plus a ranked arm over everything else. The slice leads so the
  cacheable prompt prefix stays byte-identical across requests; reversing the order would destroy
  direct-feed's ~99% prompt-cache hit rate. Composed from the adapters above rather than
  reimplementing either — this is the split outcome `timeline.md` names as a legitimate ◆G7 result,
  and it cost one delegating adapter.
- Registration happens in one place (`src/retrieval/index.ts`), so adding a bake-off arm is a single
  line rather than an import side effect — and **removing one is a single line too**: that is how
  `pgvector-rag` stopped being selectable on 2026-08-19 when its code was archived (§14). The seam
  is what made archiving an arm cheap; nothing outside that file knew the mode existed.

### Shared guards (`options.ts`)

`resolveTopK()` centralizes the bounds — **default 5, max 50**, non-positive → 0 — and an empty
query returns `[]`. Every adapter degrades identically instead of each inventing its own edge-case
behavior, so retrieval stays comparable across the migration.

**`MAX_TOP_K` was raised from 10 to 50 on 2026-08-24.** The old ceiling was legacy parity
(`MIGRATION_SPEC.md` §7: default 5, caller-capped 1–10), never a measurement. While it stood, a
`k=20` run returned exactly `k=10`'s numbers because `resolveTopK` clamped — which reads as "depth
does not help" when the request simply never happened. **`DEFAULT_TOP_K` is unchanged at 5**: the
ceiling bounds what a caller may request, the default is what every request pays.

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

`{ query: string, retrieval?: string, stream?: boolean, history?: ChatMessage[], device?: string }`,
validated by
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

**The prompt carries no ranges.** The legacy `AUTHORITATIVE NORMAL RANGES` block was deleted on
2026-09-13, when the supervisor vetoed the operator source-of-truth document's ranges. A pod's
limits may be stated only from a tool result: `get_pod_thresholds` returns the pod's validated,
operator-configured registry alert limits, or a reason when none is usable, with no fallback
table. Turbidity is described through `get_turbidity_info` (the operator's three clarity bands)
and stays qualitative for every pod. Both tools are gated on `SENSOR_TOOL`. The scope lines still
name turbidity as one of the six measured parameters, and **0 is a valid turbidity reading** that
must never be flagged as erroneous (same rule as ORP). The reasoning is in the
`src/prompt/systemPrompt.ts` docstring and the `timeline.md` decision log.

**Greetings and capability questions are carved out of the refusal rule** (2026-09-21). They were
not before: the scope rule fired on anything that was not a groundable question, so "hello" was
answered with `REFUSAL_SENTENCE`, which is how a real session opened. A greeting asks for nothing,
so there is nothing to ground and nothing to refuse. The carve-out names only greetings, thanks and
"what can you do", so it cannot be read as licence to answer a substantive question unsupported,
and the three rules that bound it — no prior knowledge, no world knowledge, no fabricated readings
— are asserted alongside it. The same edit asks a refusal to name the closest thing the system
genuinely can do, offered as a different next step and never as the answer: every wave-1
`refusal-*` fixture rubric already required that and the prompt text did not ask for it.

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
- **Tools are offered only when `SENSOR_TOOL` is on** (Phase N3, default **off**). `complete()`
  takes an optional `tools` array and returns `toolCalls`; when absent the `tools` key is omitted
  from the request entirely, because sending `tools: []` still perturbs the cacheable prefix. An
  assistant turn that asks for tools legitimately has empty content, so the empty-answer guard
  below is skipped when tool calls are present — otherwise every successful tool round would 502.
- **An empty answer throws a 502 naming `LLM_MAX_TOKENS`.** This is the documented gpt-oss failure:
  reasoning tokens exhaust the budget, the API call *succeeds*, and the answer is blank. Without an
  explicit check that is indistinguishable from a valid empty response.

### 10.3a Tool-round loop (`src/services/ChatOrchestrator.ts`, `src/tools/`)

Phase N3, **gated on `SENSOR_TOOL` (default off)**. Restores `MIGRATION_SPEC.md` §3: up to
`MAX_TOOL_ROUNDS` tool-enabled rounds, then one final round with tools omitted to force a text
answer. A round with no tool calls ends the loop and its content is the answer.

**Why it is behind a flag.** The tools read production pod data, and the tool block changes the
system prompt. The prompt was a pinned control for the N2 bake-off until ◆G7 split on 2026-08-26;
`test/unit/prompt.test.ts` now guards that the tool blocks are purely additive, so with the flag off
the model sees the base prompt only and no `tools` array is attached. Three things move together on
that flag and must never move apart: the prompt block, the `tools` array, and the tool registry.

- **`MAX_TOOL_ROUNDS` defaults to 16**, not the legacy 5. `sensor-doc-event-check` asks for six
  parameters and then reasons over them. N5's "raise the cap" item, landed early.
- **Repeated identical calls are served from a per-request cache** (`deduped: true`) rather than
  re-run. That is what makes a 16-round cap affordable: the common stuck pattern is a model
  re-asking the question it just asked, and each round is a paid LLM call.
- **Usage is summed across every round**, so an expensive conversation is visible in the response
  rather than only on the invoice. An unreported `cachedPromptTokens` stays `undefined` rather than
  summing to 0 — that number decides ◆G7.
- **Tool calls on the forced final round are ignored**, not dispatched: their results could never
  reach the model, so running them would hit the device API for nothing.
- **Errors are fed back, never thrown** — unknown tool name, malformed JSON arguments, device-API
  failure. Each becomes a tool result the model can recover from mid-loop.
- **Round-cap fallback:** the last prose the model produced, or `ROUND_CAP_PLACEHOLDER` if it never
  produced any.

`query_sensor_data` (`src/tools/querySensorData.ts`), `list_pods` (`src/tools/listPods.ts`),
`get_pod_thresholds` and `get_turbidity_info` are the `SENSOR_TOOL` registrations;
`generate_report` (`src/tools/generateReport.ts`) is the `REPORT_TOOL` one.
`search_documents` is **not** a tool — ◆G11 is open, and retrieval still runs before the call as
CONTEXT.

**`list_pods` answers "which pods do I have", and exists because nothing else could.** The fleet is
scoped to the caller's organization by the device API, so it is not a property of the deployment:
it cannot live in the system prompt, which must stay byte-identical across requests to stay
cacheable, and it is not in CONTEXT, which holds corpus text. Before this tool the model's only
route to a pod name was the failure text `resolveDevice` emits when more than one device is
visible, which reads as an error — so a question about the user's own fleet drew the refusal
sentence. It takes no arguments, prints the deduped registry rows under the same names `device`
accepts, and shares the per-token `/devices` TTL cache with every other tool in the request. Its
`last_reported` column is **best effort and not proof of silence**: it comes from `/water/last`,
which drops readings with no GPS fix, so a null there means "not confirmed recently" and the
question "has this pod stopped" is a `query_sensor_data` call. Freshness probing is capped at 20
pods (the listing itself is never truncated); beyond that, pods carry
`"last_reported": "not_checked"`.

**Arguments:** `metric` (six names, or `all`), `time_range`, `aggregation`, optional `device`, and
optional `bucket` for `series`.

| aggregation | notes |
|---|---|
| `min` `max` `mean` `median` | over the resolved window |
| `latest` / `earliest` | one reading each, with its `observed_at`. Exact — **not** subject to the raw cap |
| `raw` | up to `RAW_LIMIT` rows, keeping the **newest**; sets `truncated` and `truncated_kept` |
| `series` | epoch-aligned buckets, each with `mean`/`min`/`max`/`n`. Width auto-derived from the span unless `bucket` says otherwise; empty buckets are omitted, never zero-filled |

`metric: "all"` reads every parameter out of **one** fetched window — one API call, not six, and
six fewer chances for the model to drop a parameter while reassembling them. The result nests
per-metric objects under `metrics`; a single metric keeps the original flat shape.

**Two fields exist because a model got them wrong on live data**, both added 2026-08-16:

- `window_actually_searched` — `time_range_resolved` is what the *phrase* asked for; this is what
  the API's fixed unit ladder could actually reach (it tops out at one year). Asked for "last 10
  years", a model read the resolved start (2016) as the pod's first reading. `complete: false`
  now says the search never went there.
- a top-level `observed_at` on multi-metric `latest`/`earliest` reads, since every metric comes off
  the same row. Without it the model substituted a window boundary for a reading's timestamp.

### 10.3b Programmatic access (`QuerySensorData.query`)

`run()` is the LLM path: loose args in, `{ error }` out. **`query()` is the code path**: typed
`SensorQueryParams` in, `SensorQueryError` thrown on failure.

It exists for Phase N6. `timeline.md` requires the report's header, §2 and §5 to be **computed
deterministically** and only narrated — so a report must not obtain its numbers by asking a
language model to call a tool. Both entry points share one implementation, so there is one copy of
the traps rather than two. "No readings" stays a *result* (`value: null`, `n_samples: 0`) rather
than an exception: a report needs to state that a pod was silent.

Behavior worth knowing, each guarding a documented silent-failure mode in `DEVICE_API.md` §12:

| rule | why |
|---|---|
| `/water/average` is never called; everything is computed from the raw period series | that endpoint returns zeros on an empty window and drops whole rows when any one probe faults |
| empty window ⇒ `value: null`, `n_samples: 0`, plus `device_last_reported` | a fabricated `0` is anoxic water at pH 0, and the eval's automatic disqualification |
| `earliest` is its own aggregation, not the first row of `raw` | `raw` drops the **oldest** rows first, so its first row is not the earliest reading — this produced a confidently wrong date on live data |
| `series` buckets server-side rather than handing over raw rows | a week is ~336 rows; trend-reading from those is arithmetic a 20B model is bad at, over a window `raw` may have truncated |
| ranges anchor to the device's newest reading, not the wall clock | one cleared pod is stale; a wall-clock "last day" is empty on a pod with a good last day of data |
| the reference instant comes from one `/water/last` call, then **one** period window sized to reach back to the range's start | the API's window ends at the *server's* now while the range is anchored to the device's newest reading; sizing from the phrase alone fetches short on a stale pod and reports a real statistic over a fraction of the window it claims |
| if `/water/last` gives nothing, a widening probe (day → week → month, at most twice) looks for data the GPS filter hid | `/water/last` drops readings with no GPS fix, so an empty response there is not proof of silence; `/water/period` does not filter |
| faulted samples are excluded per metric, and the count is reported | a faulted probe still reports a plausible number |
| `0` is never falsy-checked | it is a real reading for ORP and turbidity |
| a device must be named when several are visible | the two cleared pods are different water bodies on opposite coasts |
| turbidity results carry a provisional/uncalibrated note | it is a derived voltage index expressed in NTU, not a measurement |
| a device whose `operatingEnvironment` disagrees with `WATER_TYPE` is flagged in the result | one global env var cannot describe both pods; per-device water type in chat is unbuilt N4 work |

### 10.3c Device continuity — merge chains (`src/devices/mergeChains.ts`)

A replaced Notecard mints a new device id, and the registry ties old to new with `mergedInto` on
the retired row and `labels[]` on the survivor. **The rows do not follow.** Historical readings
keep the retired label forever, so a survivor can hold under 4 % of its own site's record
(`BACKEND_FIELDS.md` §4a). Answered off the survivor label alone, "the trend at Marina Park over
two years" is a real statistic over six weeks that says nothing about the other 94 % — the
confident-wrong-answer class.

Upstream shipped chain expansion for seven query sites but **not** for `/water/period`, the only
endpoint this tool reads (`SECURITY_FINDINGS.md` §7), so the fan-out happens here.

| rule | why |
|---|---|
| every `/water/period` read goes out once per chain label, survivor first, sequentially | repeating `device=` on that route returns **0 rows** — the param is not a list there — and this is someone else's production API |
| rows a **later** label repeats are dropped, matched on `timestamp` | chains overlap (New Trinidad and Trinidad Island share five months); naive concatenation double-counts and reweights every mean. The first batch is never filtered, so an unmerged pod's series is byte-identical to before |
| a predecessor is read only when it is in the caller's **own** `/devices` response | that response is org-scoped upstream and is the only trustworthy statement of what this caller may see; `/water/period` itself authorizes nothing (`SECURITY_FINDINGS.md` §1) |
| a predecessor whose `organization` differs from the survivor's is **withheld** | access follows organization membership, and history is read only where same-organization ownership is known (decided 2026-09-23). Three of the four chains in the August census crossed organizations; whether those merges transferred the site is open with the operator, and withholding is the reversible error |
| an organization is compared as an opaque string, never resolved | the August census found two devices pointing at organizations that do not exist; a lookup either throws or silently returns nothing. A survivor with no organization inherits nothing |
| `mergedInto` is never followed **forward** | a question about a retired pod is about that pod's own span; following it would widen the read into a device the caller never named. The result says the pod was retired instead |
| what was read and what was withheld are **named in the result** (`device.history_labels`, `device.history_withheld`, plus a note) | silent expansion is the bug; disclosed expansion is the feature. A withheld predecessor is a limit on the answer, not a statement that the history does not exist |

Expansion cannot widen what the caller could otherwise reach, so it needs no flag of its own.
The report's **Data scope** block is still open — the report inherits the fan-out through
`QuerySensorData.query()` but does not yet print which labels it used.

**Live state, 2026-09-23.** `/devices` no longer returns retired predecessors, even to a superadmin
token, so today every predecessor is withheld as "not visible to this account" and each pod's
history starts at its own label. That is the fail-closed outcome the rules above intend.

### 10.4 Responses

**Default (JSON):** `{ answer, model, mode, citations, usage }`, plus `tool_calls` when any tool ran
and `tool_round_cap_reached` when the loop hit the cap. Both are **omitted** when no tool ran, so
the flag-off response shape is unchanged from N1. Tool results are traced there, never turned into
citations (§3 rule 4) — a sensor reading is this deployment's own measurement, not a claim
attributable to a corpus document.

**Answer text post-processing (`src/utils/answerFormat.ts`).** gpt-oss sometimes leaks its harmony
`commentary` channel into the answer as a `【commentary…】` marker. It is stripped after the fact,
on the JSON path, the round-cap fallback and (through `createStreamingCommentaryFilter`) the
non-tool SSE branch. The matcher is anchored to the channel name because the same full-width
brackets carry the citation markers: about 160 of them across the captured transcripts, which
`GRADING_GUIDE.md` scores as `invalid_citations`. A strip-anything-in-brackets rule would have
deleted graded evidence. An answer that is only markers comes out empty and hits the empty-answer
guard.

> **Streaming limitation with tools on.** The answer is not token-streamed: the loop cannot know a
> round is the last until it returns without tool calls, by which point the text exists. Re-issuing
> that round as a stream would double the cost of every answer, so the finished text is emitted as a
> single `token` event and the SSE contract holds. Real streaming needs incremental
> `delta.tool_calls` assembly — N7's chat UI is the phase that will want it. With `SENSOR_TOOL` off,
> streaming is unchanged.

**Streaming (`stream: true`)** — Server-Sent Events, opt-in rather than default. The JSON path stays
the simple one because the N2 harness captures whole answers plus token counts, and non-browser
callers should not have to parse SSE. N7's chat UI will likely flip the default for browsers.

| event | payload | notes |
|---|---|---|
| `meta` | `{ mode, citations }` | **Always first.** After the first byte the status code cannot change, so provenance must lead. |
| `token` | `{ text }` | one per delta |
| `done` | `{ model, usage?, tool_calls?, tool_round_cap_reached? }` | **always emitted**, on both branches. `usage` is omitted when the provider reports none — `stream_options.include_usage` support varies — and `tool_calls` / `tool_round_cap_reached` appear only on the tool branch, when a tool actually ran. |
| `end` | `{}` | terminator |
| `error` | `{ error, message, code? }` | in-band; headers are already sent, so the central error handler cannot render it. Same shape as the JSON error body above, `code` included, so a client branches identically on either transport. |

Validation runs **before** the stream opens, so a bad request is still a JSON 400 rather than an SSE
error event. A client disconnect aborts the upstream call via `AbortController` — otherwise a closed
tab keeps generating billable tokens. `X-Accel-Buffering: no` is set because a buffering proxy in
front of Cloud Run would otherwise hold the whole stream and release it at once, which is
indistinguishable from streaming being broken.

### 10.5 Device list (`GET /api/v1/devices`)

Added 2026-08-19 for the UI's pod selector. Read-only: it lists the pods the caller's token can see
so a human can choose one, replacing the tool's "which pod do you mean?" round trip.

**A caller token is required** (`middleware/requireCallerToken.ts`; 401 with
`code: caller_token_required`, plus a `WWW-Authenticate: Bearer` challenge). Until 2026-08-21 it was
not, and that was an authentication hole rather than a convenience: `DeviceApiClient` defaulted its
token to `DEVICE_API_TOKEN`, so a request with no `Authorization` header was answered with the
deployment's own credential — a superadmin one in practice — and returned **every organization's**
fleet, while this section and the controller's docstring both described the route as scoped to the
caller. The fix has two halves and needs both: the route refuses an anonymous request, and the
client no longer has that default at all (`useConfiguredToken` must be passed explicitly, which
only the offline scripts do). The same requirement applies to the sensor and report tools reached
through `POST /api/v1/chat`, which is where the identical fallback used to answer a chat question
out of the wrong fleet.

**How the demo page holds that token (2026-09-03).** `frontend/` has no sign-in of its own, so it
keeps a set of **named accounts** in `localStorage` (`frontend/js/auth.js`, switched from the context
bar by `frontend/js/accountbar.js`) and sends the active one on `/devices`, on `POST /chat`, and on
the report fetch. Three properties are load-bearing rather than incidental, and
`test/unit/frontendAuth.test.ts` pins each:

- **Several accounts, not one.** A token's organization is fixed upstream at login and cannot be
  requested, so *switching accounts is the only way to see another organization's fleet* — and the
  only way to watch org scoping actually scope. Switching re-runs the pod load, because a stale list
  would be the previous account's pods.
- **Never in a URL, never served by the backend.** A query parameter writes a non-expiring bearer
  credential into history, `Referer` headers and proxy logs; a token served to the page would put a
  deployment credential in front of every visitor, re-creating the hole this section describes. The
  user pastes it, including for superadmin.
- **The report button is a `fetch`, not a navigation.** `POST /reports` requires the header, so the
  click posts the tool result's `report_request` with it and saves the returned PDF from a blob.

**Deliberately not gated on `SENSOR_TOOL`.** That flag governs whether the *model* is handed a tool;
listing pods for a person to pick from is a different act. But an unconfigured `DEVICE_API_BASE_URL`
returns the coded 503 rather than an empty list — an empty `devices` array must mean "this token sees
no pods", never "the service is not set up".

- **Deduped by `dev:` label** via the same `dedupeByLabel` the tool uses: the registry genuinely
  returns three rows for Algalita Pod. Rows with no label are dropped — nothing in `/water/*` can
  address them, so they cannot serve a picker.
- **`name` falls back to `label`**, because six registry rows have no name, and ordering tie-breaks on
  label so unnamed rows cannot reshuffle between loads. A reshuffling dropdown loses the selection.
- **`water_type` is echoed** so the client can flag a pod whose `operating_environment` disagrees
  without duplicating the rule. Comparison is `environment.includes("salt")`, matching the tool —
  `"salt-water"` and `"saltwater"` are the same claim, and the strings are left unnormalized.
- **`last_reported` costs one `/water/last` call per pod**, run concurrently. The registry row carries
  no recency at all, so there is no cheaper source — but on the live fleet that is ~15 upstream reads
  per picker load. **Do not poll this on a timer**; there is no QA mirror and every call reads
  production (`migration/DEVICE_API.md` §3).
- **A coded upstream failure is not flattened to `null`.** `device_auth_expired` / `device_timeout` /
  `device_unavailable` propagate, because reporting an outage as `last_reported: null` would assert
  that a pod has never reported. Only an *uncoded* per-device failure degrades to `null`, so one odd
  row cannot take the whole picker down.

### 10.6 Per-request device (`device` on `POST /api/v1/chat`)

Optional, trimmed, max 120 characters; a malformed value is a 400, an *unrecognised* pod is not —
that stays a recoverable `{ error }` tool result, because a stale UI holding a removed pod should not
hard-fail a conversation the model could still rescue.

**It fills a gap; it never overrides.** If the model names a device in its tool arguments, the model
wins. Nothing is injected into a tool whose schema does not declare `device`, so the trace never shows
an argument the tool would ignore.

**The value lives on the `ChatOrchestrator.run` call stack, never on an instance or the registry.**
`chatRoutes.ts` constructs the controller at module load and its constructor evaluates
`buildToolRegistry()` once, so a single orchestrator, tool and handler closure serve every request in
the process — a device stored on any of them would be handed to whichever request ran next. The
per-request dedupe cache keys on the *effective* arguments for the same reason: otherwise one pod's
reading could be served as the answer for another.

### 10.7 Reports (`generate_report`, `POST /api/v1/reports`)

Both run one pipeline, `report/produceReport.ts`: sensor data, report model, events, status, narrative, and for the route only the PDF.
No LLM call is made and nothing is written to disk.

**The tool renders no PDF.** `generate_report` returns the summary the model narrates (status, event headings, baseline provenance, catalogue version) plus `report_request: { time_range, device? }`, the arguments it ran with.
It never returns a URL, and the prompt tells the model to point at the interface's download button instead of writing a link.

**The route renders the PDF on request.** `POST /api/v1/reports` takes that `report_request` as its body and answers `200 application/pdf` with `Content-Disposition: attachment; filename="cer-report-<site>-<start>-to-<end>.pdf"` and `Cache-Control: no-store`.
Guards, in order: `requireCallerToken` (401), the report quota (429, §4a), `REPORT_TOOL` (404 while off), body validation (400: `time_range` required, at most 100 characters; `device` optional, at most 200), then the pipeline's own refusal as 422 (a phrase the grammar does not read, a pod the caller cannot see, an empty window).
Every reading is fetched with the caller's token, which the device API scopes to their organization, so a report can only describe the caller's own pods.

This replaced a design that wrote PDFs to `generated_reports/` and served them from `GET /api/v1/reports/:filename` behind a sha256-of-token ownership sidecar.
That design lost every report on redeploy, bound access to one exact token string so a re-login lost it, and needed the ownership check only because a stored file could be asked for by someone else; with no stored file there is nothing to guard.

**Recomputed at download.** The PDF is built from the same `time_range` phrase when the user clicks, and relative phrases anchor to the pod's newest reading (§10.3b).
A pod that reported again in between yields a window shifted by those minutes; the PDF prints its own resolved period, which is the authority.

**Pattern tags** (`report/patterns.ts`).
Each parameter is tagged `diel`, `tidal`, `trend` or `unknown` from a third, hourly series query (`maxBuckets` raised to 62 days, a programmatic-only option).
Periodicity is read from the autocorrelation of the series minus a centered 25-hour moving mean: a diel cycle repeats at 24 h and inverts at 12 h, a semidiurnal tide repeats at 12 h and inverts at 6 h.
A trend is daily means on a straight line (R² ≥ 0.7) over at least 14 days.
At least 72 hours and 60% hourly coverage are required, and `unknown` means unclassified, not steady.
A diel or tidal tag stops threshold windows opening on that parameter and enables the algal-bloom detector; a diurnal tide is indistinguishable from a diel rhythm on these lags and is tagged diel.
Hourly buckets are not thinned by `MIN_BUCKET_SAMPLES`: the Newport pods report about once an hour, so one reading per bucket is their cadence.

**Downgraded events keep their signature.** An event below the 0.5 confidence floor is `Inconclusive`, and `WQEvent.signature` records what it matched.
The heading still names no cause and next steps are still chosen as `Inconclusive`, but an explanation the catalogue approves at that lower confidence is shown, hedged (`narrative.ts`).
Today that is `saltwater-intrusion` (from 0.45) and `industrial-unclear` (from 0.3), the two classifications that previously could never reach a reader.
Saltwater intrusion is named outright (0.55) only for an isolated conductivity rise in marine water whose series is tagged `trend`, the drought or sea-level shape; a discharge is a step, not a weeks-long creep.

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
| Filter | length ≥ 100 and no PDF boilerplate. The alphabetic-ratio ≥ 0.5 test is **off for every document** and off by default — see below |
| Output | per document: full `text` (direct-feed) and filtered `chunks` (vector arms), plus the ◆G9 slice flag |

Current run, **since the source-of-truth document left the corpus on 2026-09-13**: **14
documents, 840,413 chars, 446 chunks** (840,327 until the 2026-09-21 re-OCR added 86 chars to the
EPA SOP, `EVAL_REBUILD.md` §2b); direct-feed slice **26,096 chars (~6.5K tokens), the four
probe datasheets**. Before that it was 15 documents / 851,891 chars / 451 chunks, re-ingested
2026-08-31 without the alpha-ratio filter (393 chunks with it on), with a 37,660-char slice. It was
18 documents /
1,254,899 chars / 558 chunks after the 2026-08-21 expansion, and 8 documents / 716,603 chars /
305 chunks before that. The trim cut three documents that carried no number or procedure for any
measured parameter — 32% of the characters, and nothing that answers a question
([`../documents/README.md`](../documents/README.md)).

The corpus is scoped to the six parameters the DataPod measures. Documents about undetectable
analytes live in `documents/_excluded/` — see `timeline.md`. Active set: four Atlas Scientific
probe datasheets, **the whole USGS National Field Manual
Chapter A6 (nine chapters, one per parameter)**, and one EPA field-calibration SOP. The two
situational pollution-event references and the EPA standards handbook were cut on 2026-08-24. Full breakdown and the edition-currency check in
[`documents/README.md`](../documents/README.md).

**The slice did not grow with the corpus, deliberately.** Direct-feed's cost *is* its slice size,
so the ~814K-char reference tier is reachable only by a RAG arm — which is what makes direct-feed
a fixed baseline rather than a fourth candidate.

**Two traps this expansion introduced**, both documented in `documents/README.md`:

- **The four Tier 1 files are the entire direct-feed slice**, so they are force-tracked past the
  `documents/*` ignore rule. If they ever go missing, ingest **exits 0** and prints
  `direct-feed slice: 0 chars`; the arm then answers ungrounded, warning once at load. Read the
  number ingest prints.
- **`epa-sop-field-instrument-calibration-2010.pdf` is scanned** (18 chars/page) and ingests only
  via `.ocr_cache/`, which is git-ignored. Missing cache is a hard error, not silent partial text.

**The alpha-ratio filter is off entirely, and off by default.** The 0.5 threshold cannot tell OCR
noise from a table: a numeric grid is mostly digits and separators and scores far under it. Because
direct-feed uses whole documents and the vector arms use chunks, leaving it on handed direct-feed
the threshold questions for reasons unrelated to retrieval.

**Measured 2026-08-31, over all fifteen documents**, the filter removed:

| dropped | chunks |
|---|---:|
| Numeric tables | **42** |
| Table-of-contents dot leaders | 17 |
| Genuine OCR noise — the only thing it exists to catch | **0** |

34 of the 42 were the oxygen-solubility tables in `usgs-nfm-a6.2`, the corpus's authoritative
source for DO threshold lookups. An earlier version exempted `.md`/`.txt`; the reasoning was right
and **the condition matched nothing**, because every document here is a PDF, so the exemption was
dead code and the filter ran on all fifteen.

The reversal was near-free and verified rather than assumed: the filter runs *after* chunking and
chunk ids are content-derived, so re-ingest kept **393 of 393 existing ids, zero lost**, and added
58. Only `index` moved, and it is re-derived from `chunkId`.

`checkAlphaRatio` survives on `QualityOptions` as a deliberate escape hatch for a genuinely
OCR-noisy document, should one ever be added. **It defaults to `false` as of 2026-09-02** — the
destructive state has to be asked for, because turning it back on silently re-deletes those tables
and kills every retrieval label keyed to them without a single test failing. Full reasoning in
[`EVAL_REBUILD.md`](EVAL_REBUILD.md) §2b.

`data/` is git-ignored, so the artifact is rebuilt locally rather than committed.

### Seeding Firestore (`scripts/seedFirestore.ts`)

```
npm run ingest && npm run seed:firestore
```

Uploads the artifact to the **`corpus_documents`** collection, one document per file, id derived
from the filename so re-running overwrites rather than duplicating. Writes are batched, so a
partial failure cannot leave the slice half-populated.

**`chunks` is not stored** (removed 2026-08-03). Nothing read it — the direct-feed source reads
`text`, the pgvector seeder read `corpus.json` directly, and the vector arm needs a separate
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

## 12. Eval fixtures (`eval/fixtures-wave1/`, `src/eval/`)

The question set every arm is graded against: **45 conversations, 90 turns**, one JSON file per
conversation, committed **before any arm runs**. Seven classes — `cross-document` 12,
`deep-in-manual` 10, `probe-calibration` 8, and 4 each of `definitional`, `follow-up`,
`refusal`, and 3 `precedence`. No fixture declares a `requires`, so all 45 are runnable under any
flag setting. Slice coverage: 41 none / 5 partial / 0 full.

**This replaced the 30-conversation / 62-turn bake-off set on 2026-09-01.** The old set is archived
under the tag `eval-archive-2026-09-01`; 27 of its 30 fixtures were answerable from 4.4% of the
corpus and three carried the entire `deep-in-manual` class. The rebuild's plan, the wave-1 exit
criteria and the class allocation are in [`EVAL_REBUILD.md`](EVAL_REBUILD.md).

`FIXTURE_DIR` in `src/eval/fixtures.ts` points at `eval/fixtures-wave1/`. Renaming that directory
back to `eval/fixtures/` is the last step of the migration; the name is deliberately left free.

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
- **`requires` marks fixtures that depend on a capability that is off by default** (`sensor-tool`,
  N3), so they are skipped rather than graded against a missing feature, which would look identical
  across every arm. Wave 1 declares none.

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
and arms so cold and warm can never be blended by accident. The 224 pre-rebuild `gpt-oss-20b`
captures were archived on 2026-09-01 (`ARCHIVED.md`); the directory now holds only the Phase 3
gold-context baseline, `warm/gold-context/` (45 files, captured 2026-09-14). `npm run gate:check`
throws `No transcripts at ...` for any pass or arm with no captures, by design.

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

## 14. `pgvector-rag` arm — **archived 2026-08-19** (`archive/pgvector-rag/`)

⚠️ **Dev/experiment only, and no longer part of the running service.** It deliberately re-introduced
the stack ◆G1 resolved away from, as the only honest baseline for "what we had before". Its runtime
code — adapter, `rrf.ts`, seeder, `db/bakeoff/schema.sql`, `docker-compose.bakeoff.yml`,
`src/config/pgvector.ts` — moved to **`archive/pgvector-rag/`**, mirroring the original paths. The
mode is unregistered, the `pg` and `@types/pg` dependencies and the `seed:pgvector` script are gone,
`PGVECTOR_URL` is no longer a configuration variable at all, and `archive` is in `.dockerignore`.

**This was done ahead of ◆G7, by decision**, and the arm was dropped for good on 2026-08-31
(`EVAL_REBUILD.md` §1). The split followed
`timeline.md`'s rule: the *evidence* stays, the *runtime code* goes.

| what | where it is now | why |
|---|---|---|
| 56 captured transcripts | archived 2026-09-01 under tag `eval-archive-2026-09-01`, `eval/transcripts/{cold,warm}/pgvector-rag/` | the graded artifact; ◆G7 is not auditable without them |
| Blind label→arm mapping | archived 2026-09-01 under the same tag, `eval/grading/warm/KEY.json` | it names the arm in the archived packet |
| Cost scenario + its assertions | live — `src/eval/costScenarios.ts`, `test/unit/cost.test.ts` | `npm run cost` still prices **all three** arms; a two-arm cost table would not answer ◆G7 |
| `"pgvector-rag"` in the packet builder | live — `scripts/gradePacket.ts` `ARMS` | the packet grades captured evidence, so `npm run grade:packet` is unchanged |
| Adapter, fusion, seeder, schema, compose | archived — `archive/pgvector-rag/` | upkeep with no consumer: a dependency, a container, and a config surface |
| Its unit suite's `fuseRrf` / adapter blocks | archived with the arm | they test archived code |
| Its `EmbeddingService` blocks | live — split out into `test/unit/embeddingService.test.ts` | `EmbeddingService` still serves `firestore-vector` and `seedFirestoreChunks.ts` (§16) |

**What archiving gave up:** the arm cannot be re-run or re-captured as it stands. Doing so means
restoring the files from `archive/pgvector-rag/`, re-adding `pg`, re-registering the mode and
re-reading `PGVECTOR_URL`. Everything below is therefore a **record of a completed experiment**, not
a runbook — and it is kept in full because the findings are what the archive exists to preserve.

The commands the captured sweep ran under, recorded so the transcripts can be interpreted:

```
docker-compose -f docker-compose.bakeoff.yml up -d
npm run seed:pgvector
PGVECTOR_URL=postgresql://cer:cer@localhost:5433/cer_bakeoff npm run dev
```

A faithful port of `MIGRATION_SPEC.md` §7. Every constant was pinned to the legacy value rather than
tuned — a tuned reimplementation would be a different system and would not answer the question:

| element | value | source |
|---|---|---|
| Dense branch | cosine `<=>`, fetch 20 | §7 step 3 |
| Lexical branch | `websearch_to_tsquery('english')` + `ts_rank_cd`, fetch 20 | §7 step 4 |
| Fusion | RRF, `RRF_K = 60`, score `1/(k + rank + 1)` | §7 step 5 |
| top-k | 5, capped 1–10 (shared `resolveTopK`) | §7 |
| Embeddings | `nomic-embed-text-v1.5`, 768-dim, batch 32 | §4.4 |
| Schema | PostgreSQL 16 + pgvector, GIN on `content_tsv`, IVFFlat `lists = clamp(√n, 10, 100)` built post-load | §6 |

> **The lexical row is the legacy value, not what the arm finally ran.** `websearch_to_tsquery`
> **ANDs** every content word, which matched nothing on 78% of the eval's questions once retrieval
> moved up-front onto the raw user question (◆G11). It was repaired 2026-08-12 to OR the lexemes
> derived by `to_tsvector` — so **the archived arm is an approximation of the legacy hybrid, not a
> strict port**, and its numbers must be labelled that way wherever they are quoted.
> `RETRIEVAL_BAKEOFF.md` §4a/§4b carry the measurement and the repaired SQL.

`fuseRrf` was a pure function in `rrf.ts` (now `archive/pgvector-rag/src/retrieval/rrf.ts`),
separate from the adapter, because it is the one piece whose correctness can be established without
a database — and a subtly wrong fusion returns plausible-but-worse chunks, which would read as "RAG
loses" rather than as a bug. `RETRIEVAL_BAKEOFF.md` §4a is what happened when the *query* rather
than the fusion was wrong, and it is the reason that separation was worth having.

The seeder read **`data/corpus/corpus.json`**, the same artifact every other arm loads, never the
PDFs — the one-parse rule (§11). It was idempotent by filename and embedded inside a per-document
transaction, so a mid-run failure could not leave a half-seeded document that the idempotency check
would later skip as complete. `sensor_data` was deliberately **not** ported: the sensor path is held
constant across arms.

> **Provider bug found while standing this up (2026-07-30) — this guard is still live and must
> stay.** Calling Fireworks' embeddings endpoint **without** `encoding_format` returns a corrupt
> **192-element all-zero vector** instead of the 768-dim embedding — no error, no warning. Dense
> retrieval built on zero vectors ranks arbitrarily, so the RAG arms would have lost the bake-off to
> a bug rather than to retrieval. `EmbeddingService` always sends `encoding_format: "float"` and
> rejects both wrong dimensions **and** all-zero vectors, since a degenerate vector of the right
> shape would otherwise pass every check. The finding was made on the archived arm but the code is
> not archived: `EmbeddingService` still serves `firestore-vector` and `scripts/seedFirestoreChunks.ts`,
> and `test/unit/embeddingService.test.ts` exists so these guards keep a suite of their own now that
> the arm's own suite is gone (§16).

**Verified live** on 2026-07-30 against the seeded sidecar (8 documents, 305 chunks, IVFFlat
lists=17): answered ORP correctly on ~4,400 prompt tokens against direct-feed's ~10,900, **answered
the deep-in-manual stabilization-criteria question that direct-feed refuses**, and still refused the
fecal-coliform probe despite retrieving the volunteer manual's bacteria chapter. Its swept numbers —
53.6% retrieval miss, 11 over-refusals, and the dead-lexical-branch caveat that makes them an
approximation rather than a legacy port — are in `RETRIEVAL_BAKEOFF.md` §4a/§4b and stand as
recorded; archiving the code changed no measurement.

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
| `src/eval/costScenarios.ts` | the measured token counts per arm, and the fixed-cost figures. **Still carries `pgvector-rag`** — its deployed counterfactual is the whole "what we had before costs this" line, and dropping it when the code was archived (§14) would have removed a number ◆G7 is decided on |
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

Dense RAG on Firestore's own vector search — ◆G10. Unlike `pgvector-rag`, which was always a
measuring stick and was archived on 2026-08-19 (§14), this arm **is meant to survive ◆G7**: it runs
on the store the service already uses, so keeping it registered costs no infrastructure even if
direct-feed wins.

It is deliberately **not a better RAG**. It is `pgvector-rag` with the store swapped and the
lexical branch removed, because **Firestore has no full-text search**: same chunks, same embedding
model, same nomic prefixes, same top-k. The missing lexical branch is a finding, not a shortcut —
it is the weakness the legacy hybrid existed to cover, and the eval's exact-token class
(`acronym-*`: "ORP", "NTU", "KCl creep") is aimed straight at it.

| element | value | why |
|---|---|---|
| Collection | `corpus_chunks`, one per chunk (**451** since the 2026-08-31 re-ingest without the alpha-ratio filter; 393 before that, 305 when the arms were swept), id `<filename-slug>__<12 hex chars of sha256(chunk text)>` since 2026-08-24 — **positional before that**, which is why re-seeding never repaired the stale collection and `--wipe` exists | **Separate from `corpus_documents` by necessity** — Firestore will not index a vector inside an array element |
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
pgvector arm held, which is what "same chunks" requires — embeddings stored as `VectorValue`
(768-dim, non-zero), both indexes present, and `findNearest` returning 5 ranked chunks per query.
Re-running the seeder skipped all 8 documents and made zero embedding calls.

**Exercised end-to-end through `POST /api/v1/chat`**, on the two fixtures that discriminate between
arms:

| probe | result |
|---|---|
| Turbidity normal range | **3,532** prompt tokens against direct-feed's **10,889**, cosine scores descending 0.735 → 0.718 |
| `deepmanual-stabilization-criteria` | **Answers what direct-feed refuses** — all five rubric figures, top chunks from `tm9a6.8.pdf` (renamed `usgs-nfm-a6.8-multiparameter-instruments.pdf` on 2026-08-21), no probe-datasheet specs substituted |
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
| `GET` | `/api/v1/devices` | `{ devices: [{ label, name, operating_environment, last_reported }], water_type }` (§10.5). **Requires `Authorization: Bearer`** — 401 `caller_token_required` without one |
| `POST` | `/api/v1/reports` | body `{ time_range, device? }`; the report PDF as an attachment (§10.7). **Requires `Authorization: Bearer`**. 400 bad body, 404 while `REPORT_TOOL` is off, 422 no report for that range or pod, 429 `quota_reports_exceeded` |
| `GET` | `/api/v1/usage` | `{ enabled, questions: { used, limit, remaining }, tokens: {...}, reports: {...}, window, resetsAt }` (§4a). `limit` and `remaining` are `null` for an unlimited dimension and while the quota is off, so "no ceiling" is distinguishable from "nothing left" by type. Read-only: it never records, so polling it cannot spend the allowance it reports |
| `POST` | `/api/v1/chat` | `{ answer, model, mode, citations, usage }`, or SSE when `stream: true` (§10). **429** with `code: quota_requests_exceeded` / `quota_tokens_exceeded` plus `Retry-After` when the quota gate refuses — as JSON, before any stream opens (§4a) |

`/health` does **no** network I/O (no Firestore/Fireworks calls), so it always succeeds while the
process is up and never blocks on external services. CORS is currently wide open (`cors()`) — fine
for local demo, to be tightened before deploy.

> **Pre-prod:** error responses include a `stack` field outside production (`errorHandler.ts`). The
> gate is `NODE_ENV=production`, so if `NODE_ENV` is unset in a deployed environment, stack traces
> ship to clients. Add to the N9 hardening list alongside the CORS lockdown.

---

## 15a. Demo frontend (`frontend/`)

A static page with no build step and no bundler.

- **No CDN and no remote assets.** Third-party code is vendored into `frontend/vendor/` with its
  license header intact (`marked` and `DOMPurify`, used by `js/markdown.js`).
- **Served, never opened as a file** (decided 2026-08-17). The scripts are ES modules, which are
  fetched with CORS, and a `file://` page has an opaque origin, so every browser blocks
  `<script type="module">` there. Serve it with `python3 -m http.server 5173` from `frontend/` and
  point it at the API with `?backend=http://localhost:8010`.

**Where things belong** (decided 2026-08-18, from live testing). Wave 1 put every piece of
provenance into the message, and a routine question came back with a tool chip, a freshness badge,
a water-type warning, an auto-drawn chart and fifteen starter prompts: each defensible, the whole
unreadable. The rule: **a message carries what qualifies that answer; the chrome carries what is
true of the session.** Anything constant across answers is chrome, because repeating it per message
trains the reader to skip the line where it finally matters.

| surface | what lives there | why |
|---|---|---|
| **Context bar** (persistent, `js/podbar.js`) | pod selector, pod status and last reading, water-type mismatch | properties of the deployment, identical on every answer; the mismatch is a config fact, not a finding about a reading |
| **Message** (always) | the answer, and qualifications specific to it: an empty window ("silent since Aug 7"), `complete: false`, turbidity-provisional when turbidity is in the answer | these change how this particular number reads; dropping them would be dishonest |
| **Message** (collapsed, `js/provenance.js`) | which tool ran, its arguments, sample counts, citations | auditable on demand, closed by default |
| **On request** (`js/chart.js`) | the series chart | a chart answers "show me the trend"; it is not a decoration on every series result |

Consequences:

- The pod selector replaces the model asking which pod. `SENSOR_DEVICE_LABEL` is deliberately
  unset because guessing between pods on opposite coasts is unsafe; the picker removes the guess
  rather than defaulting it.
- Freshness moves but does not disappear: "silent since Aug 7" stays in the message when it
  explains an empty result, because there it is the answer. The routine "reporting, 8 minutes ago"
  on a healthy pod moves to the bar.
- Starter prompts were cut to three, then removed on 2026-09-15.

---

## 16. Testing

Jest + `ts-jest` + `supertest`. **57 suites** (51 unit, 6 integration; counted 2026-09-23 from
`test/`). The last recorded full run was 949 tests in 46 suites on 2026-09-02, so the test total
is due a re-measure. The table below names the suites that carry a design decision worth reading;
it is not the full list — `npx jest --listTests` is.

No test touches the network, needs an API key or costs money, and new tests keep to that: mock
`LlmService`, and serve recorded bodies through a stubbed `fetch`.

| suite | covers |
|---|---|
| `integration/health.test.ts` | `/health` shape; unknown route → 404 `{ error, message }`, no `status` |
| `integration/chat.test.ts` | `POST /chat` happy path, validation, the `DEBUG_RETRIEVAL` override rule end to end, and the SSE wire format (event order, headers, terminator) |
| `unit/gateCheck.test.ts` | the §8a hard gates. Pins the U+2011 refusal case — an exact comparison scores a *correct* refusal zero, and NFKC alone does not fix it — and the rule that a tolerance match is never counted as an exact pass |
| `unit/retrieval.test.ts` | `resolveTopK`, `StubAdapter` guards, registry lookup, all five selection rules |
| `unit/prompt.test.ts` | no ranges in the prompt, `REFUSAL_SENTENCE` pinned verbatim, the tool and catalogue flags only appending, block ordering, cacheable-prefix stability |
| `unit/llmService.test.ts` | request params (`max_tokens`, `user`, no tools), empty-answer 502, streaming deltas, abort signal, usage handling |
| `unit/directFeed.test.ts` | slice loading, once-per-process memoization, topK ignored, failure not cached, Firestore query shape |
| `unit/ingestion.test.ts` | chunk sizing and overlap, the quality filter, the alpha-ratio escape hatch (off by default), corpus metadata |
| `unit/chatValidators.test.ts` | history ordering, newest-kept trimming, the `system`-role rejection, per-index error messages |
| `unit/evalFixtures.test.ts` | the committed eval set (ids, class coverage, multi-turn, slice consistency) and every rule the fixture loader claims to enforce |
| `unit/bakeoffRunner.test.ts` | history assembly across turns, the arm-mismatch abort, failed-turn handling, cached-token accounting, the sweep warnings, SSE frame buffering, and CLI parsing |
| `unit/embeddingService.test.ts` | the nomic `search_query:` / `search_document:` task prefixes, embedding batching, and the dimension **and** all-zero guards that the 2026-07-30 `encoding_format` provider bug exists to catch (§14). **Carved out of the archived arm's suite on 2026-08-19**, because `EmbeddingService` outlived it — it still serves `firestore-vector` and `seedFirestoreChunks.ts`, and those guards must not lose their coverage along with the arm |
| `unit/cost.test.ts` | per-request billing with cached/uncached split, the cache-split guard, monthly totals, break-even including the negative-crossover and parallel-line cases, and the ◆G7 conclusions pinned to the recorded prices |
| `unit/firestoreCorpus.test.ts` | the written field set matches what `loadSlice` reads, `chunks` stays out, and the document size guard |
| `unit/firestoreVector.test.ts` | the `FieldValue.vector()` wrapper, the distance→score inversion, and the zero-result guard |
| `unit/gradePacket.test.ts` | the blind packet's label shuffle: every arm once per fixture, deterministic across rebuilds, and **balanced across the set** — a shuffle can look right per sheet while the set leaks the mapping |
| `unit/deviceApi.test.ts` | the metric-code table pinned as canonical (it outlived the backend's shifted third mapping, fixed upstream 2026-08-19), epoch-seconds decoding, the per-endpoint temperature unit, the all-zero empty-average flag, 401 and timeout handling |
| **N3** `unit/timeRange.test.ts` | every accepted phrase, the rejections (unparseable, `2026-02-30`, backwards spans), reference-time anchoring, the fetch-window ladder, and whether the endpoint belongs to the range |
| **N3** `unit/aggregate.test.ts` | the six aggregations, `null`-never-`0` on an empty window, `0` kept as a real reading, faulted-sample exclusion and its count, the raw cap keeping the newest rows |
| **N3** `unit/querySensorData.test.ts` | the tool against recorded production bodies: Celsius→Fahrenheit on `/water/period`, the OWC acronym match, duplicate-row dedupe, empty-window escalation, `/water/average` never called, the caveat notes, and every error path |
| **N3** `unit/chatOrchestrator.test.ts` | the round loop: tool dispatch and `tool_call_id` replay, multi-call rounds, summed usage, unknown-tool and malformed-argument recovery, the forced final round, the cap fallback, and call dedupe |
| `unit/quota.test.ts` | the quota policy in isolation: unlimited (both off and on), the count and token ceilings biting at `>=` rather than `>`, each dimension enforced while the other is unlimited, request-before-token precedence, window rollover in both directions, the `Retry-After` boundary, per-key isolation, and what `quotaKeyFor` derives — token hashed never raw, IPv4-mapped normalization, the shared `anonymous` bucket |
| `unit/usageStatus.test.ts` | `GET /api/v1/usage` (§4a): remaining against a finite ceiling, `null` limits for an unlimited dimension and while the quota is off, remaining floored at 0 when retrospective token accounting overshoots, window rollover, per-token bucketing, and — the defect the endpoint could easily have — that repeated status reads do not themselves spend the allowance |
| `unit/quotaConfig.test.ts` | the `QUERY_QUOTA*` parsing rules: the off-and-unlimited default, `unlimited` accepted case-insensitively, `none`/`off`/`-1` **rejected** rather than guessed, the required duration unit suffix, `org` rejected as a scope this service cannot key on, and Gilligan's free tier expressed without a code change |
| `integration/quotaChat.test.ts` | the gate over HTTP: the disabled default answering past tiny limits, the 429 body and `Retry-After`, a validation 400 not consuming an allowance, per-token vs global bucketing, tokens counted on the streamed path, and a refused `stream: true` request arriving as JSON with no SSE frames |
| **N3** `integration/sensorChat.test.ts` | `query_sensor_data` end to end through `POST /chat` — scripted model, recorded device bodies, real loop/client/decoder in between — and the flag-off path making one tool-free call that never touches the device API |
| `integration/devices.test.ts` | `GET /api/v1/devices` (§10.5): label dedupe, the `name`→`label` fallback and its stable tie-break, `water_type` echo, and a coded upstream failure propagating rather than flattening to `null` |
| `unit/plausibility.test.ts` | the per-metric physical rails, including the verified −1023 °C temperature rail and the pH 0.000/14.000 exclusive bounds, and that `0` stays plausible for ORP and turbidity |
| `unit/operatorThresholds.test.ts` | every rejection reason for an operator-entered temperature baseline — the all-zero "never configured" registry state, an inverted range, a typed-in placeholder magnitude — each falling back to "no baseline established" rather than to a wrong range, and never printing the rejected numbers |
| `unit/answerFormat.test.ts` | `【commentary…】` stripping anchored to the channel name, **citation markers in the same brackets left untouched** (~160 of them across the captured transcripts), the marker-only answer coming out empty so the existing 502 guard fires, and the streaming filter agreeing with the batch stripper however the text is chopped up |
| `unit/generateReport.test.ts`, `unit/buildReportInput.test.ts`, `unit/reportModel.test.ts`, `unit/reportEvents.test.ts`, `unit/reportPatterns.test.ts`, `unit/reportReferenceRanges.test.ts`, `unit/reportNarrative.test.ts`, `unit/reportRenderPdf.test.ts` | the report pipeline: the tool's arguments and flag gating, the computed model assembled from sensor + registry data, event detection, diel/tidal/trend tagging, the transcribed baselines and turbidity bands, narration confined to pre-computed facts, and the PDF layout |
| `integration/reports.test.ts` | `POST /api/v1/reports` (§10.7): each guard (token, flag, body, report quota), the PDF returned with nothing written to disk, a 422 refusal that counts nothing, and the removed `GET /reports/:filename` |

**`unit/pgvectorRag.test.ts` is gone from the live suite** (2026-08-19). Its `fuseRrf` and
`PgVectorRagAdapter` blocks went to `archive/pgvector-rag/` with the code they test — a suite whose
subject is archived proves nothing and costs a run on every `npm test`. Its `EmbeddingService` blocks
did **not** go: they are `unit/embeddingService.test.ts` above. Splitting rather than deleting was
the point — the all-zero-vector guard is a live guard on a live provider bug (§14).

**No test touches the network, needs a key, or spends money** — `chat.test.ts` and
`sensorChat.test.ts` mock `LlmService` wholesale, and the device-API suites serve recorded bodies
through a stubbed `fetch` into the real client (`test/fixtures/device-api/README.md` records their
provenance and what was scrubbed). Run with `npm test`.

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
| ~~Tool-calling orchestration loop~~ | `MIGRATION_SPEC.md` §3 | **Built (N3, §10.3a).** 16 tool rounds + 1 forced-text round, `role:"tool"` messages, round-cap fallback. Gated on `SENSOR_TOOL`, default off |
| Corpus ingestion + real adapters | `MIGRATION_SPEC.md` §5 | N2 bake-off: `firestore-direct` (small tier, ◆G9), `pgvector-rag` (**archived 2026-08-19**, §14), `firestore-vector` (◆G10 → all three built and swept) |
| ~~Embedding calls~~ | `MIGRATION_SPEC.md` §4.4 | **Built.** `EmbeddingService` (nomic task prefixes, dimension and all-zero guards, §14) serves `firestore-vector` and `scripts/seedFirestoreChunks.ts`. It becomes dead code only if ◆G7 resolves to direct-feed alone |
| Document context strategy | `MIGRATION_SPEC.md` §6–7 (pgvector) | **Unranked.** ◆G7 split on 2026-08-26, but its comparison ran on a placeholder model and was superseded; `EVAL_REBUILD.md` Phase 4 re-measures the live arms against the gold-context ceiling. `pgvector-rag` is dropped (§14) |
| ~~`query_sensor_data`~~ | `MIGRATION_SPEC.md` §8 | **Built (N3, §10.3a)** on the device API (◆G8 resolved). Remaining: per-device water type in chat (N4) and token streaming with tools on (N7) |
| ~~Ingestion (docs + CSV)~~ | `MIGRATION_SPEC.md` §5 | **Documents: built** (§11) — `npm run ingest` → `data/corpus/corpus.json`, seeded to `corpus_documents` / `corpus_chunks`. **The CSV half is retired, not pending:** ◆G8 resolved to the live device API, the synthetic 766-row CSV was never ported, and nothing reads it (`timeline.md`, "Confirmed decisions") |
| Document upload / delete | — | N6. Also a condition that would reopen the provisional `firestore-direct` choice (`timeline.md`, the 2026-08-26 ◆G7 split): direct-feed's slice grows unbounded as documents are added |


---

## 18. Privacy posture (carried forward)

Unchanged in intent from the legacy build: every chat prompt (system + history + retrieved chunks +
tool results, including sensor readings + user message) is sent to Fireworks AI, and confidentiality
rests on a contractual DPA with Fireworks, not on data residency. Reports make no LLM call.
Sensor data (`data/`) is git-ignored and treated as confidential per `CLAUDE.md`; `documents/` is
git-ignored too, with the four Tier 1 corpus files force-tracked as the exception (§11).

Two holes of this service's own were found and fixed on 2026-08-21, and are written up in [`migration/SECURITY_FINDINGS.md`](migration/SECURITY_FINDINGS.md) §6.
`GET /api/v1/devices` served unauthenticated callers out of the deployment's superadmin token; it now requires the caller's token (§10.5).
`GET /api/v1/reports/:filename` served stored customer PDFs with no authentication; it was first gated by a token-hash ownership check and was removed on 2026-09-22, when reports moved to `POST /api/v1/reports` with nothing stored (§10.7).
