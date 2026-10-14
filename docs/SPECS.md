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
│   │   ├── plausibility.ts   per-metric physical rails the hardware error flags miss
│   │   └── readingQc.ts      per-reading QC: QARTOD flags, flat lines, spikes, board faults (§19)
│   ├── tools/
│   │   ├── index.ts          tool registry, gated on SENSOR_TOOL and REPORT_TOOL
│   │   ├── querySensorData.ts  the sensor tool: device match, fetch, caveats (§10.3a)
│   │   ├── dataCoverage.ts     the server-written "Data covered in this reply" line (§10.8)
│   │   ├── dailyCycle.ts       local solar time and when each day's peak comes (§10.9)
│   │   ├── metricVerdict.ts  each metric's verdict for the sensor tool (§19)
│   │   ├── generateReport.ts   the report tool, gated on REPORT_TOOL
│   │   ├── getPodThresholds.ts  the pod's registry alert limits, validated, v2 fallback ranges
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
│   │   ├── referenceRanges.ts   v2 fallback ranges, minimum detectable change, TURBIDITY_BAND_EDGES
│   │   ├── flagRules.ts      the share rule, edge rule and verdicts, shared by chat and reports
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
│   ├── fixtures/skepticism/  fabricated fleet for the data-skepticism tests and replay (§10.9)
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
  fireworks:  { apiKey?, baseUrl, chatModel?, embeddingModel, rerankModel, maxTokens, temperature,
                reasoningEffort, thinking, user },
  deviceApi:  { baseUrl?, devToken?, timeoutMs, defaultDeviceLabel? },
  tools:      { sensorTool, reportTool, maxToolRounds, rawLimit },
  chat:       { maxHistoryMessages },
  quota:      { enabled, requests, tokens, reports, windowMs, windowLabel, scope },
  retrieval:  { defaultMode, debug, corpusSource, queryRewrite, queryRewriteFirstTurn },
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

`fireworks.reasoningEffort` (`LLM_REASONING_EFFORT`: `default` sends nothing, or `low`, `medium`,
`high`) and `fireworks.thinking` (`LLM_THINKING`: `default` or `disabled`, which sends
`thinking: {type: "disabled"}` for models such as `minimax-m3`) shape the answer call. The release
answers with `glm-5p3-flash` at `low`: it is thinking-only, rejects `disabled` with a 400, and was
evaluated at `low` (`EVAL_REBUILD.md`, R4).

`retrieval.queryRewrite` (`QUERY_REWRITE`, default `false`) and `retrieval.queryRewriteFirstTurn`
(`QUERY_REWRITE_FIRST_TURN`, default `false`, effective only with the first on) are described in
§10.1a; the release turns both on.

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
| `QUERY_QUOTA_STORE` | `memory` | `memory` (in-process) or `firestore` (`gilligan_usage`, needs `QUERY_QUOTA_WINDOW=1d`) |
| `QUERY_QUOTA_WARN_AT` | `0.2` | fraction of a finite allowance at or below which the status reports `nearLimit`; `0` = never |

The release runs 20 questions, 5 reports and 1,000,000 tokens per user per UTC day (`QUERY_QUOTA_WINDOW=1d`, `QUERY_QUOTA_STORE=firestore`); the token cap is the user's 2026-09-24 starting value, to be tuned in testing.
`GET /api/v1/usage` carries `nearLimit` on each dimension and at the top level, true when at least one is left and no more than `ceil(limit x QUERY_QUOTA_WARN_AT)` remain (4 of 20 questions, 1 of 5 reports), for the dashboard's warning.

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

With `CER_RAG_SERVICE_KEY` set (every deployment), `caller` scope keys on `user:<id>`, the user the CER server names after verifying the JWT (§4c), so a fresh login is not a fresh allowance.
The rest of this section describes `caller` scope without the key, for local runs and the eval harness.

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

### Storage

`InMemoryQuotaStore` (`QUERY_QUOTA_STORE=memory`, for tests and local runs) is a `Map` in the process: it **resets on every redeploy and crash**, it is
**per instance** (N containers enforce N quotas, so the effective limit is `limit x N`), and
read-then-record is not transactional, so concurrent requests from one key can overshoot by one
or two. Windows are **fixed and epoch-aligned**, not rolling — a caller can spend a full
allowance on each side of a boundary, and a `7d` window rolls over on Thursday 00:00 UTC rather
than on Sunday or on the caller's first request.

`FirestoreQuotaStore` (`QUERY_QUOTA_STORE=firestore`, the release setting) keeps one `gilligan_usage` document per user per UTC day, id `<userId>_<YYYY-MM-DD>`, with the fields in `migration/GILLIGAN_FIRESTORE_FRAMEWORK.md`.
Each write sets `expireAt` 90 days after `updatedAt`, and the Firestore TTL policy runs on `expireAt`: a document is deleted once its TTL field is in the past, so a policy on `updatedAt` would delete the current day's counter and reset the user's limits.
A new day is a new document, so there is no rollover logic; that is why the store requires `QUERY_QUOTA_WINDOW=1d`.
Each record reads and rewrites the day's document in one transaction, so simultaneous answers all count.
The check in `quotaGuard` is a separate read, so a user with several questions in flight at the ceiling can overshoot by those few.
An unreadable store fails closed: the gate answers 503 and a question is not answered if its count cannot be written, because failing open would be unmetered model spend.
Token and report counts recorded after the answer or PDF exists are logged on failure rather than withheld from the user.
The store is async (`QuotaStore` returns promises) and every method takes `nowMs` explicitly so window rollover is testable without faking the clock.

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
Version `2026-09-24.1` is the first approved set: all 38 entries and 6 referrals, with the 26 entries marked up in the 2026-09-24 review approved as edited (`timeline.md`, 2026-09-24).
Entries that send the customer to CER support name the `cer-support` referral, so its contact line travels with them.

**Reports** (`report/narrative.ts`).
An event's cause is named only when a usable `explanation` matches its type, water class, confidence and severity.
An entry that sets both `minSeverity` and `minDurationHours` takes either as enough, so "High severity, or over 12 hours" also selects a long event the engine rates below High, such as a one-day bloom or a capped persistent offset.
A named cause is headed "Consistent with <cause>", source-of-truth v2 §9.2's tier for matching signatures; "Strongly consistent with" needs neighbour or contextual evidence the pipeline lacks, and "Confirmed" is never assigned from sensor data (`timeline.md`, 2026-10-11).
Otherwise the PDF heads it "Anomaly, cause unclear", says the cause cannot be determined from sensor data, prints no classification confidence, and selects every other entry as if the event were `Inconclusive`, so a next step cannot imply the unnamed cause.
The `inspect-sensors` next step is shown only when the report has a likely data issue (`DataQualityCheck.likelyDataIssue`), because v2 §9.2 recommends inspection only then; whether the catalogue itself should carry that condition is `STAKEHOLDER_QUESTIONS.md` item 26.
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

## 4c. Service check and model-call gate

**Service check (`src/middleware/requireServiceKey.ts`).**
With `CER_RAG_SERVICE_KEY` set, every `/api/v1` route requires that shared secret in `X-CER-RAG-Service-Key`, compared in constant time; a missing or wrong key is 401 `service_key_invalid`.
Once the key matches, `X-CER-RAG-User-Id` is required (400 `service_identity_required` without it) and `X-CER-RAG-Organization-Id` is optional; together they become the verified identity the quota keys on.
Identity headers are ignored whenever the key is unset or wrong.
`/health` stays outside the check for probes, and `NODE_ENV=production` refuses to boot without a key of at least 32 characters.
A shared secret was chosen over Cloud Run identity tokens because Cloud Run strips the signature from the forwarded service token, so this process cannot verify one (`migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md` §5), and minting identity tokens in the CER server was deferred past launch.
Data access is unchanged: device reads still use the caller's own forwarded JWT.

**Model-call gate (`src/services/modelCallGate.ts`).**
Every Fireworks chat call runs inside a process-wide limit of `LLM_MAX_CONCURRENT` (8) calls; others queue up to `LLM_QUEUE_TIMEOUT_MS` (20 s), and a streamed call holds its slot until the stream ends.
A Fireworks 429 or 503 is retried once after `LLM_RETRY_DELAY_MS` (2 s) or a shorter `Retry-After` (capped at 10 s); a second refusal, or no slot in time, is 503 `model_busy` ("busy, try again").
The OpenAI SDK's own silent retries are off (`maxRetries: 0`), so this is the only retry policy.
Embedding calls (`EmbeddingService`) are not gated and keep the SDK's default retries.

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
  | `model_busy` | 503 | Fireworks refused twice with 429/503, or no model-call slot freed in time (§4c) |
  | `service_key_invalid` | 401 | missing or wrong `X-CER-RAG-Service-Key` while `CER_RAG_SERVICE_KEY` is set (§4c) |
  | `service_identity_required` | 400 | the service key matched but the user id header was missing or malformed (§4c) |

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
  the cache `npm run embed:cache` writes. No vector index and no Firestore reads; each query is
  still embedded through Fireworks (`EmbeddingService.embedQuery`), and the cache holds only the
  corpus vectors. It began as the way to evaluate retrieval offline; `npm run compare:vector-arms`
  reports **30/30 queries ranked identically** to `firestore-vector`, drift ~1e-4, because
  Firestore's index is configured `flat` (exhaustive) rather than approximate.
  **It is the release's retrieval (user, 2026-09-27)** at `DEFAULT_TOP_K` 20 with the four probe
  datasheets unpinned, as ordinary corpus documents: R4 measured it level with the reranker at a
  third of the cost (`EVAL_REBUILD.md`, "Control: `local-vector` with both rewrites").
- **`local-rerank`** / **`hybrid-slice-rerank`** — the same candidates re-scored by a Fireworks
  reranker (`RERANK_MODEL`, default `fireworks/qwen3-reranker-8b`) before the top k are kept. R4
  found no gain over `local-vector` with both rewrites at about three times the cost per question,
  so neither is used in the release.
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
does not help" when the request simply never happened. The ceiling bounds what a caller may
request; the default is what every request pays.

**`DEFAULT_TOP_K` is 20** (raised from 5 in R4, 2026-09-24): measured correctness rose with depth and
peaked at 20 (`EVAL_REBUILD.md`). It is a code constant in `options.ts`, not an environment
setting; an environment variable of that name is ignored.

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

### 10.1a Search query rewriting (`src/retrieval/queryRewrite.ts`)

Retrieval sees one query string, not the conversation, so a follow-up such as "what about in
winter?" searches without its subject. With `QUERY_REWRITE` on, `ChatController.postChat` first asks
the answer model to rewrite a follow-up into a standalone search query from the history; with
`QUERY_REWRITE_FIRST_TURN` also on, a first message is rewritten into a search query too. Only the
search changes: the prompt still carries the user's own words. A failed or empty rewrite falls back
to the message verbatim and is logged; a success logs nothing. Each rewrite is one extra model call
per turn.

R4 measured the effect (`EVAL_REBUILD.md`): follow-up rewriting raised offline recall at k=20 from
38% to 55% and correctness from 0.72 to about 0.90; first-turn rewriting added about five recall
points. The release turns both on.

### 10.2 Prompt assembly (`src/prompt/`)

`buildSystemPrompt()` is ported from the legacy `backend/main.py::build_system_prompt`, recovered
from git history at `7e2b09e^` — `MIGRATION_SPEC.md` §4.2 described its structure but never recorded
its text. `REFUSAL_SENTENCE` is **verbatim** because behavior depends on its exact wording (pinned
by a test; `MIGRATION_SPEC.md` §11 calls it out specifically).

Three rules were added in R4 (2026-09-27, `EVAL_REBUILD.md`):

- **`NO_TOOLS_RULE`**, added only when both tools are off, forbids offering to look up pod readings
  or any other tool action; `glm-5p3-flash` otherwise offered to fetch readings it could not reach.
  The tools-on prompt does not carry it.
- **No pod facts from typical instruments** (both modes): a unit, model, sensor type, setting or
  threshold is never inferred for this pod from what an excerpt says of other instruments.
- **The refusal sentence word for word** (both modes) whenever any part is declined; a paraphrase
  does not replace it. With the previous rule GLM answered or paraphrased two of eight must-refuse
  turns; with both it refused all eight exactly on gold context and in the launch capture.

**The prompt carries no ranges.** The legacy `AUTHORITATIVE NORMAL RANGES` block was deleted on
2026-09-13, when the supervisor vetoed the operator source-of-truth document's ranges. A pod's
limits may be stated only from a tool result: `get_pod_thresholds` returns the pod's validated,
operator-configured registry alert limits, or, where those are unusable, source-of-truth v2's
general range for the pod's water class with status "fallback" (§19), or a reason when neither
applies. `query_sensor_data` returns each metric's verdict, and the prompt has the model relay it
rather than compare readings with limits itself. Turbidity is described through `get_turbidity_info` (the operator's three clarity bands)
and stays qualitative for every pod. Both tools are gated on `SENSOR_TOOL`. The scope lines still
name turbidity as one of the six measured parameters, and **0 is a valid turbidity reading** that
must never be flagged as erroneous (same rule as ORP). The reasoning is in the
`src/prompt/systemPrompt.ts` docstring and the `timeline.md` decision log.

**Turbidity is a unitless relative index, and an all-zero period is flagged** (2026-09-24,
provisional, Task A). Every pod is treated as qualitative only, so the prompt, the tool results and
the metric table name no unit and never say NTU. The clarity bands stay at the operator's 345/795
(2.2 V and 0.7 V); the dashboard dial's 350/800 is the discrepancy to fix upstream. The backend's
`turbVoltToNTU.ts` returns 0 for a missing voltage and for the offline sentinel as well as for clear
water, so `isAllZeroTurbidity` (`src/report/referenceRanges.ts`) flags a period in which every
reading is 0 as a possible missing sensor: `query_sensor_data` adds `TURBIDITY_ALL_ZERO_CAVEAT` to
its note, the report's Flag column reads "Clear (all zero)", and the narrative says so. A lone 0
among varied readings stays Clear with no flag. The flag is a data-quality signal like off-scale,
not a fourth band.

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
| 4 | `CURRENT TIME` line, only with a device tool on | every request |
| 5 | `SELECTED POD` line, only with a device tool on and a pod sent | every request |
| 6 | the user question | every request |

**This ordering is load-bearing, not stylistic.** Fireworks prompt caching matches on a *prefix*, so
a cache hit extends only to the first differing byte. Anything dynamic placed earlier truncates the
cacheable prefix to nothing — silently, with no error. The direct-feed arm's entire cost case rests
on this (`RETRIEVAL_BAKEOFF.md` §1); a test asserts two different questions produce identical
prefixes. The context block is omitted entirely when there are no chunks, because an empty
`CONTEXT:` heading reads to the model as "the corpus had nothing" — a different claim from "no
corpus was consulted".

**With tools on, each request carries the current time and each reading its age** (2026-09-24, Q1).
In the 2026-09-24 conversation check the model called two pods silent for 10 and 12 days "likely online" and gave a 10-day-old temperature as current, because nothing told it the date (`migration/CONVERSATION_QA_2026-09-24.md` findings 1 and 2).
`buildMessages` now adds `CURRENT TIME: <UTC, to the minute>` as block 4 above; it cannot go in the system prompt, which must stay byte-identical to be cached.
The tools state ages themselves, since date arithmetic by the model is unreliable: `list_pods` adds `last_reported_age` and `last_reported_stale`, and `query_sensor_data` and `generate_report` add `device_last_reported_age` and `device_last_reported_stale` (`src/tools/readingAge.ts`).
Stale means more than six hours without a reading: the pods report about hourly, so six missed reports is well past jitter.
Ages round up, so a reading is never described as fresher than it is (9 days 20 hours reads as "10 days").
`TOOL_BLOCK` asks the model to state a reading's age and never call a stale pod online, to test a claimed spike or crash with `min`, `max` or `series` rather than `latest` (finding 4), and to relay every tool `note` (finding 5).
None of this reaches a tools-off prompt, so R4's captures are unchanged.

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
`"last_reported": "not_checked"`. A timestamp comes with `last_reported_age` and
`last_reported_stale` (§10.2).

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
| every result with a `device_last_reported` also carries its age and a stale flag (§10.2) | ranges anchor to the newest reading, so a pod silent for days answers "now" with a days-old value that reads as current |
| `earliest` is its own aggregation, not the first row of `raw` | `raw` drops the **oldest** rows first, so its first row is not the earliest reading — this produced a confidently wrong date on live data |
| `series` buckets server-side rather than handing over raw rows | a week is ~336 rows; trend-reading from those is arithmetic a 20B model is bad at, over a window `raw` may have truncated |
| an auto `series` width is the smallest whose **epoch-aligned** buckets fit the cap, not span / cap | a 60-day window starting mid-day touches 61 calendar days; sizing by span picked 1-day buckets and the cap dropped the oldest, which the report's min/max/mean are computed from |
| ranges anchor to the device's newest reading, not the wall clock | one cleared pod is stale; a wall-clock "last day" is empty on a pod with a good last day of data |
| the reference instant comes from one `/water/last` call, then **one** period window sized to reach back to the range's start | the API's window ends at the *server's* now while the range is anchored to the device's newest reading; sizing from the phrase alone fetches short on a stale pod and reports a real statistic over a fraction of the window it claims |
| if `/water/last` gives nothing, a widening probe (day → week → month, at most twice) looks for data the GPS filter hid | `/water/last` drops readings with no GPS fix, so an empty response there is not proof of silence; `/water/period` does not filter |
| faulted samples are excluded per metric, and the count is reported | a faulted probe still reports a plausible number |
| `0` is never falsy-checked | it is a real reading for ORP and turbidity |
| a device must be named when several are visible | the two cleared pods are different water bodies on opposite coasts |
| turbidity results carry a provisional/uncalibrated note and no unit | it is a derived voltage index, not a measurement and not NTU |
| a window in which every turbidity reading is 0 carries a possible-missing-sensor note | the backend reports a missing or offline voltage as 0, the same as clear water |
| the result never compares a device's `operatingEnvironment` with `WATER_TYPE` | `WATER_TYPE` is one deployment-wide setting and most pods are salt-water, so the comparison put a "configured as freshwater" note on nearly every answer; limits and reports follow each pod's registered type, and `WATER_TYPE` is only the report's fallback for a pod with no registered type (removed 2026-09-29) |

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

**Default (JSON):** `{ answer, model, mode, citations, usage, audit }`, plus optional `tool_calls` and `tool_round_cap_reached`.
Every invocation receives an answer-local `handle` (`T1`, `T2`, etc.), including deduplicated calls.
The model receives `{ handle, result }` in each tool message and can cite it as `【T1】`.
Numeric document citations remain separate from tool evidence.
The tools-only prompt blocks describe this exception; the evaluated general prompt is unchanged.

The trace preserves `handle`, `name`, effective `arguments`, `raw_arguments`, `result`, `round`, and optional `deduped`.
The cap flag is true when the forced final round is used, including when that round successfully returns prose.
Absent fields remain absent for legacy messages; neither the relay nor the interface assigns handles retrospectively.
The server relay, chat storage, dashboard state and reopened history preserve these optional fields, document citations, report offers and citation audit data.
The relay's existing `audit.toolCalls` name list remains available for older clients.

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
| `done` | `{ answer, audit, model, usage?, tool_calls?, tool_round_cap_reached? }` | **always emitted**, on both branches. `usage` is omitted when the provider reports none — `stream_options.include_usage` support varies — and `tool_calls` / `tool_round_cap_reached` appear only on the tool branch, when a tool actually ran. |
| `end` | `{}` | terminator |
| `error` | `{ error, message, code? }` | in-band; headers are already sent, so the central error handler cannot render it. Same shape as the JSON error body above, `code` included, so a client branches identically on either transport. |

Validation runs **before** the stream opens, so a bad request is still a JSON 400 rather than an SSE
error event. A client disconnect aborts the upstream call via `AbortController` — otherwise a closed
tab keeps generating billable tokens. `X-Accel-Buffering: no` is set because a buffering proxy in
front of Cloud Run would otherwise hold the whole stream and release it at once, which is
indistinguishable from streaming being broken.

### 10.4a Citation audit and display contract

`src/utils/citations.ts` supplies the same marker assessment to HTTP responses and deterministic evaluation.
Before validating a numeric quote marker, the service checks the quote against the supplied excerpt verbatim.
If its current excerpt does not contain the quote and exactly one excerpt does, it changes only the numeric index.
Ambiguous, case-changed, whitespace-changed and unmatched quotes do not trigger a correction.
Quote-support measurement remains separate from marker resolution.

The response `audit` contains `original_answer` (before citation edits), `corrections` (original marker, replacement, original character offset, old and new index), and `invalid_citations` (marker, original offset and reason).
Malformed markers, empty markers, unknown tool handles, out-of-range document numbers and invalid line spans are recorded before removal from displayed text.
Malformed quote closers such as `"}】` count as invalid; the legacy frontend fallback consumes doubled closers as one marker.
A tool marker resolves only against an explicit handle in this answer's invocation list.
This proves that the evidence exists, not that it supports the attached claim.
The optional audit-log record also retains this citation audit.
When report results supply `report_period`, `audit.report_periods` records whether the period appears after Unicode hyphens are normalized for comparison only.
Neither original answers nor captured transcripts are rewritten for this comparison.

JSON `answer` and SSE `done.answer` contain the corrected display text.
The streaming client replaces accumulated tokens with the authoritative final answer and retains the audit separately.
This matters on the document-only stream, where validation happens after generation finishes.
Evaluation assesses `audit.original_answer` when present, so removing an invalid marker from display cannot make an invalid-citation assessment pass.
Legacy transcripts without an audit are assessed from their stored answer.

Both frontends render tool handles as controls opening evidence within that answer, without colliding with document numbers or another answer's handles.
The dashboard keeps tool arguments, results, rounds and reuse status in a collapsed disclosure.
Incomplete searches, stale or empty windows, provisional turbidity, tool errors and exhausted rounds remain visible outside it.
Outside it the page shows only reader-facing text: its own fixed notices and each result's `user_notes` (`USER_NOTES_FIELD`), never a result's `note`, which is written for the model.
`ChatOrchestrator` removes `user_notes` from the copy of a result the model reads, so adding one never changes the model's input; every new tool note needs a reader version or the page shows nothing for it.
Site exclusions, the no-GPS rule, an unassessed site, stuck sensors, not-assessed limits and withheld history each carry one; `generate_report` repeats its series read's reader notes.
`list_pods` lifts each probed pod's reader notes to its own top level, prefixed with the pod's name, because the page reads only that level and it is the only copy removed from the model's input.
A failed call is not shown once a later call to the same tool succeeded, and an empty window is judged on `n_samples`, since `series` and `raw` results have readings and `value: null`.
Citations carry the document `title` where `corpus.json` has one, added at the response boundary (`src/retrieval/sourceTitles.ts`) because the prompt reads only `source` and `text`; the page labels a source by its title and falls back to the address.
An empty window or null value is never converted to zero; actual zero measurements remain zero.
Explicit scope refusals have intentional-outcome styling.
Turbidity interpretation itself is unchanged.

Future JSON and SSE captures preserve optional tool evidence, cap status and citation audit in `TranscriptTurn`.
Deterministic figure checks receive tool results; citation checks resolve handles using the trace; judge and grading-packet inputs include the evidence and qualifications.
Existing `eval/transcripts/` remain verbatim.

Controlled verification uses `scripts/taskCStack.ts` with `TASK_C_SERVER_WORKTREE` pointing at the approved server checkout and `scripts/taskCBrowser.mjs` against the local dashboard.
The stack injects deterministic model and tool responses and blocks nonlocal fetches.
The browser harness blocks external requests and checks answer display, tool navigation, saved-history reopening, refusals and legacy messages.
It uses the development in-memory chat store; this verifies serialization and history paths, not a live Firestore deployment.

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

**The tool renders no PDF.** `generate_report` returns the summary the model narrates (status, event headings, baseline provenance, catalogue version) plus `report_request: { time_range, device?, omit? }`, the arguments it ran with.
It never returns a URL, and the prompt tells the model to point at the interface's download button instead of writing a link.

**The status comes with its reason** (2026-09-24, Q1).
`assessStatus` (`src/report/types.ts`) returns the status, the rule that fired and the parameters behind it; `overallStatus` is its `.status`, and the PDF receives the same assessment through `produceReport`.
The tool adds `status_reason`, one sentence naming that rule and, for a flag-driven status, each flagged parameter's observed range against its configured threshold in the PDF's number format, and `parameter_flags`, every measured parameter's flag.
Before this, an ORP Exceedance on Old Woman Creek reached the model as "Action Required" with 0 events and no cause, and the model wrote "no abnormal conditions" beside it (`migration/CONVERSATION_QA_2026-09-24.md` finding 3).
The period ends on the device's newest reading, so the tool also returns `device_last_reported` with its age, and the prompt asks the model to say when a stale pod's period ended.

A parameter's flag follows the share rule (`timeline.md` 2026-10-13): Elevated or Low means out-of-range readings, beyond the baseline by more than v2's minimum detectable change, reached 5% of the kept readings in some rolling 24 hours and numbered at least 3, at some point in the period (Watch).
Exceedance (Action Required) needs that flag to be current, meaning the period's latest 24 hours meet it on their own, beyond the baseline by the larger of 15% of its width and that change; a period that ends before the pod's newest reading (`ParameterStats.pastPeriod`) has no current flag.
A high-confidence, high-severity event reaches Action Required only when it ends in the period's latest 24 hours and the period is not past.
`buildReportInput` hands each parameter its kept raw readings in time order (`ParameterStats.readings`), with unusual ones marked, taken from the query snapshot before bucketing, trend thinning or raw-result truncation; device faults are excluded.
One or two readings beyond a limit, however far, set no flag, and unusual readings never count toward one.
The parameter analysis names each flagged stretch with its times and extreme (summarised by side past four stretches), says whether the flag has since cleared, and adds two mentions below a flag that lift a report to Watch at most: the edge rule and unusual stretches (status rules `edge` and `unusual`).
`status_reason` names the rule, each flagged parameter's range against its limit, and when it was first flagged; `flag_detail` gives each flagged stretch, whether the flag is current, the edge finding and unusual stretches.
The plausibility filter keeps only rails: dissolved oxygen of 0.00 mg/L remains physically possible and stays in the report, though 24 identical zeros in a row fail QC as a flat line.
Flat-line and stuck-turbidity failures are excluded before aggregation and report pattern matching and counted per metric as `excluded_stuck` with `sensor_quality: "likely failed sensor"`; error-flag and rail failures keep their existing counts.
A **likely data issue** is 3 or more consecutive device faults of one metric and covers only those readings; unusual readings never make one, and scattered failures are excluded and counted but never flagged.
Three or more consecutive readings on which every channel fails at once are reported as `board_fault`, with v2 §9.2's "most likely reflects a sensor or data issue" wording; the count is provisional until CER confirms it (`STAKEHOLDER_QUESTIONS.md` item 25).

**Limits** (`resolveLimit`, `src/report/operatorThresholds.ts`).
A metric is judged against the pod's operator threshold when it passes validation, otherwise against source-of-truth v2 §3's general range for the pod's registry water class, otherwise not at all.
v2 ranges (`V2_FALLBACK_RANGES`): pH, dissolved oxygen and ORP for freshwater (6.5-8.5, 6-11 mg/L, 100-400 mV) and brackish or estuarine water (7.0-8.3, 5-9, 100-350); pH and dissolved oxygen for coastal water (7.8-8.3, 6-8.5), each with a note that upwelling can lower them naturally.
Temperature, conductivity, coastal ORP and turbidity have no fallback: v2 calls temperature site and season dependent, its conductivity ranges are for conductance corrected to 25 °C, which the pods may not report (`STAKEHOLDER_QUESTIONS.md` item 24), and it judges coastal ORP by trend.
A pod whose registry gives no water type gets no fallback; a defaulted water type never selects a column.
Every fallback is labelled generic wherever it appears: `basis` and `limit_note` in the sensor tool, status "fallback" in `get_pod_thresholds`, `baselineSource: "v2-fallback"` and a footnote in the report.

**The flag rule** (`src/report/flagRules.ts`, v2 §8.2, §8.3 and §9.1; Michael's decisions of 2026-10-12; `timeline.md` 2026-10-13).
Every kept reading is normal, out of range, or unusual; device faults never reach the rule.
Out of range means beyond the limit plus v2's minimum detectable change: pH 0.2, dissolved oxygen 1 mg/L, ORP 50 mV, conductivity 2% of the reading, temperature twice the PT-1000 accuracy at the reading.
A metric is flagged where out-of-range readings reach 5% of the kept readings in some rolling 24 hours and number at least 3, consecutive or not; at 48 readings a day the minimum of 3 binds.
High and low are counted separately, and flagged readings more than 12 hours apart start a new stretch, so a daily dip is flagged day by day.
A flag is current only when the latest 24 hours meet the rule on their own.
Unusual readings stay in every share's denominator but never count toward a flag.
The edge rule raises a metric within one cushion of a limit, either side of it, for 12 hours in a row, or for 2 hours or more on at least half the period's days with at least 3 such days; a flag supersedes it.
An unusual stretch is readings unusual for their value (pH outside 3-12, a short flat line) that meet the share rule themselves; jumps and spikes are a moment and never make one, so a brief blip stays quiet.
Flagged readings holding at least 80% of the window's kept readings are a persistent offset, stated once with its start as more likely a threshold, fouling or calibration issue than a change in the water (v2 §7.2 rule 7).
The datasheet accuracies (`PROBE_SPECS`) stay for their other uses but do not set a noise floor.

**Reading labels** (`src/devices/readingQc.ts`, v2 §8.2).
A device fault (QC fail) is the probe's error flag, the read-failure value, a rail no probe in water can emit (pH exactly 0 or 14, the -1023 °C temperature rail), a flat line of 24 or more, turbidity at 0 for a day, or every channel failing at once; it is left out, and only here may Gilligan say "sensor fault" or "inspect".
An unusual reading (QC suspect) is kept and shown: pH outside 3-12, a jump faster than v2's rate of change (pH 0.3 per 10 minutes on marine and brackish pods, none for freshwater; temperature 2 °C per 10 minutes; scaled to the gap, untested across gaps over 3 hours), a spike, or a flat line of 6-23.
Only the reading after a jump is labelled, so a real change that holds still counts from the next reading on; a jump back into range is labelled too.

**Verdicts** (`src/tools/metricVerdict.ts`).
`query_sensor_data` returns each metric's `verdict`: `status` (in range, out of range, likely data issue, not assessed, not enough data), `basis`, `limit`, `limit_note`, `out_of_range` (direction, each flagged stretch with its times and extreme, the newest 12 listed, whether current, whether persistent), `at_edge`, `unusual_stretches`, `unusual_readings` with `unusual_listed` (the 12 that moved most from the reading before, in time order, each with why and the previous reading), and `data_issue` stretches.
"Likely data issue" is the status only when device faults left no readings in the window; otherwise faults are listed beside a verdict on the rest.
The window is judged with the 24 hours before it, so a "now" question or a flagged day straddling the window's start is judged on a full day; the edge rule counts the window's own days.
The report judges its period the same way (`flagRules.ts` `assessWindow`, through `flagsFor`), so a chat answer and a report on the same period name the same flags.
`current` is true only when the window holds the pod's newest reading.
The prompt has the model relay verdicts, name flagged days, tell a cleared flag in the past tense, describe unusual readings (when, how far, how fast, what other metrics did) as very unusual with a calibration check, never as a fault, suggest inspection or maintenance only for device faults, a board fault or a likely failed sensor, state a persistent offset once, lead a summary with what the water did, and give `turbidity_caveat` once per conversation.
The server's alert emails still check only each pod's latest reading (`STAKEHOLDER_QUESTIONS.md` item 27), so an email can alert while chat calls the metric in range.
Operator limits that are unusable because they exceed the sensor's measurement range remain “Not assessed”, with no assertion that readings are within those limits.

A pH reading outside 3-12 is kept and labelled unusual, never a fault: natural surface water spans roughly 3.5 (peat bogs) to 11 (soda lakes) and the fleet sits in neither, but the device did not flag the reading and it may be real (`timeline.md` 2026-10-13; from `bc097e1` until then it was excluded like a rail).
Only pH exactly 0 or 14 is excluded as a rail; configured pH limits are still validated against the 0-14 scale, and the tool and report notes say rail readings "may be sensor faults and were left out".
`list_pods` gives each pod a status of reporting, silent (no current-site reading for more than 6 hours), unconfirmed (no timestamp) or not checked, and repeats silent pods with their reading age in `silent_pods`, so an answer about which pods are online lists them as silent instead of leaving them out.
The system prompt's single pod-status rule calls only reporting pods online, lists every silent pod with its age, and requires a `query_sensor_data` check only for an unconfirmed pod; the `list_pods` note defines the statuses without restating the rule.
`query_sensor_data` lists each metric's implausible readings beside `excluded_implausible` as `excluded_implausible_values` (newest 10, oldest first, with `excluded_implausible_not_listed` for the rest) plus `excluded_implausible_min` and `excluded_implausible_max`, and its note says `value` and `n_samples` count only the remaining readings.
Excluded-reading extrema are computed iteratively so long faulty runs cannot exceed the JavaScript function-argument limit.
The report PDF prints the device's last reading with its age at the report's recorded generation time, and adds a warning under the metadata table when that age is over 6 hours.
Older report inputs without a generation timestamp use their report date for reading age.
A report trend bucket is thin, and dropped from the trend series only, when it holds under half the series' median bucket count, capped at 3 readings; a series the floor would empty keeps every bucket.

`PREDECESSOR_PERIOD_HANDOFF` defaults to `false`, keeping hidden predecessor labels withheld without period requests for them.
When enabled, an organization-scoped caller can submit hidden predecessors named by the registry chain separately to the patched period route for authorization.
The patched server alone determines whether a hidden predecessor with a null or non-existent organization belongs to the survivor's organization; a predecessor registered to another existing organization remains withheld.
Only an unconfirmed predecessor's recognized 400 “Device not found” refusal becomes withheld history, while successful authorized readings remain available and returned history labels, withheld labels and explanatory notes are rebuilt consistently.
A survivor refusal, a confirmed-label refusal, authentication failure, outage or unrelated error still fails the query.
A view spanning organizations cannot use this hand-off, and visible predecessors still require the same organization as the survivor.
Visible same-organization predecessors are withheld when both registered `operatingEnvironment` values are set and differ (compared ignoring case and surrounding spaces), with the reason "different water type - history not transferred".
When either water type is unset, the predecessor is retained with a tool and reader note that its water type could not be confirmed; hidden predecessors keep the existing authorization hand-off behavior.
Enable the flag only after the patched server handles all cer-api traffic and its authorization behavior has been verified.
Mixed old/new server traffic is not safe.
The flag must remain off during rollback to an unpatched server.

The manual coordinate audit lists devices visible to the configured `DEVICE_API_TOKEN` and reads `/water/period/90/day` once per device without `/water/last`, writes, or model calls.
Run it from this worktree with the existing TypeScript tooling after configuring `DEVICE_API_BASE_URL` and `DEVICE_API_TOKEN` locally:

```bash
npx --no-install ts-node scripts/coordinateAudit.ts
```

It prints device identification, total rows, usable GPS excluding 0,0, rows at 0,0, missing or invalid GPS excluding 0,0, newest timestamp, and chronological visit counts and date ranges.
The three GPS categories are non-overlapping and sum to the total, while visit counts include unpositioned rows only within each visit's coordinate-supported span.
Production and audit share coordinate validation and chronological segmentation.
Site discovery is limited to the audited 90-day window, its first visit is provisional, and the audit cannot establish earlier centroid context or authorize hidden predecessor history.
Tokens, authorization headers, raw rows, sensor values and upstream exception text are never printed by the script.
