# Clean Earth RAG — Implementation Timeline

A phased plan for building the Clean Earth RAG assistant on the **Node/Express + Firestore** stack.
Durations are relative sizing, not calendar promises. **Decision gates (◆)** must be resolved before
the work downstream of them starts.

This is the successor to the original migration timeline. The single biggest change: the target-stack
gate (◆G1) is now **resolved** — see below — which re-anchors every phase that depended on it.

> **Current state and how to resume: [`HANDOFF.md`](HANDOFF.md) (2026-08-12).** The N2 sweep is
> captured and valid; what remains is grading. Read that first if you are picking this up cold.

Companion docs: [`SPECS.md`](SPECS.md) (what's built today), [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md)
(coding conventions), [`migration/MIGRATION_SPEC.md`](migration/MIGRATION_SPEC.md) (legacy FastAPI
behavior being ported), [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) (the Phase N2 direct-feed vs
RAG experiment design), [`EVAL_FIXTURES.md`](EVAL_FIXTURES.md) (the committed bake-off question set), `report/…report-template.pdf` (the report template a later phase builds toward).

> The previous planning docs `BACKLOG.md` and `data-access-findings.md` were retired during the
> stack conversion. Their still-relevant items are folded into the phases below; the legacy system's
> behavior is preserved in `MIGRATION_SPEC.md`.

---

## Where we are now

**◆ G1 — Target stack & data store: RESOLVED → Option C (full migration to Node/Express + Firestore).**

The original timeline held three options: (A) run the FastAPI/pgvector demo as-is, (B) hybrid — keep
the Python RAG core, swap only the sensor source, (C) full port to Node/Express + Firestore. **C was
chosen and is underway.** This closes the largest gate and unblocks the phases below; it also means
retrieval must be re-implemented off pgvector (new gate ◆G7).

**New track: the retrieval strategy is now an experiment, not an assumption — and the driver is
cost.** The two strategies have structurally different cost shapes (direct-feed: large flat
per-request input, zero fixed cost; RAG: small per-request input, but corpus embedding + index
storage + re-embedding on every corpus change), and which is cheaper at our query volume can't be
reasoned out — it has to be measured. So Phase N2 measures a **direct-feeding brain** (put the source
text in the prompt) against a **RAG brain** (embed → search → inject top matches), prices both, and
lets the numbers close ◆G7. Full design in [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md).

Two things to keep straight about this track:

- It deliberately restores a **dev-only** pgvector sidecar as the legacy-parity baseline — a measuring
  stick, not a reversal of ◆G1. It never enters the deployed path and is deleted once ◆G7 closes.
- **It is deferred, and not on this branch.** `migration` stays scoped to the skeleton + docs. The
  bake-off runs on its own branch (e.g. `feat/retrieval-bakeoff`) *after* `migration` merges and
  *after* Phase N1 provides the adapter seam. Nothing in it should be implemented now.

### Corpus scoped to what the DataPod measures (2026-07-29)

The sensor reads six parameters: temperature, DO, ORP, conductivity, pH, turbidity. Six documents
covering analytes it **cannot** detect were moved to `documents/_excluded/` — EPA aquatic-life
criteria (metals/pesticides, and structurally shredded by its own table markup), recreational water
criteria (pathogens), nutrient criteria (N/P), plus two superseded DO references. Two of those were
worse than useless: the system prompt already refuses pathogen and non-measured-pollutant questions,
so retrieving them can only pull an answer toward material the bot must decline.

Added in their place, from the operator: `water-quality-metrics-source-of-truth.pdf` (all six
parameters, per-water-type baseline ranges, a pollution-event signature matrix, and sensor
data-quality caveats) and four Atlas Scientific probe datasheets (EC, ORP, pH, DO). These close the
turbidity-unit question, give **ORP its only coverage** in the corpus, and supply the grounding N6's
faulty-data/recalibration feature needed.

Corpus: 9 documents / ~340K tokens → **8 documents / ~179K tokens**. Still far larger than any
context window, so the N2 comparison remains meaningful — had it fit, direct-feed would win by
default and RAG would be moot.

### Completed (migration groundwork)

- **Conventions reverse-engineered** from the sibling repos (`clean-earth-rovers-server`,
  `user-dashboard`) and reconciled into a single canonical [`CONVENTIONS.md`](migration/CONVENTIONS.md),
  with every cross-repo disagreement flagged and a recommendation given.
- **Legacy behavior captured** in [`MIGRATION_SPEC.md`](migration/MIGRATION_SPEC.md) so no logic is
  lost when the Python source is removed.
- **Service skeleton scaffolded** (see [`SPECS.md`](SPECS.md)): TypeScript + Express + Firestore
  bootstrap, centralized config loading/validation, memoized Firestore client, central error handling,
  tagged logging, `/health`, and an integration test. **Boots cleanly and passes the health check.**
- **Repo converted:** FastAPI/Postgres source, the Postgres `docker-compose`, and stale planning docs
  removed; README rewritten as a runbook.

---

## Confirmed decisions (carried forward, still in force)

- **Data:** synthetic 766-row CSV for now. Future structure = the current 5 metrics (DO, ORP, pH,
  conductivity, temperature) **+ a new `turbidity` column**. Real-data integration is a later phase.
  *0 is a valid reading for turbidity and ORP — never flag 0 as erroneous for those.*
- **Sensor access:** **backend-mediated tool call** — `query_sensor_data` fetches data (user token
  forwarded), so the LLM queries on demand.
- **LLM:** Fireworks (OpenAI-compatible), model id **from config, never inlined** (serverless catalogue
  rotates). Current default `accounts/fireworks/models/gpt-oss-20b`; embeddings
  `nomic-ai/nomic-embed-text-v1.5` (768-dim).
- **Deployment:** local/demo for now; **Cloud Run** is the promotion target (per conventions §13).
- **Report:** template-based, six fixed sections, no visualizations in v1. **Compute vs. narrate** —
  every number/flag/status is computed deterministically in code; the LLM only narrates pre-computed
  facts.

---

## Phase N1 — Retrieval interface + chat spine (stub-backed) `✅ COMPLETE`
*Goal: a working `POST /chat` end to end on the new stack, before any real retrieval exists. Defines
the seam everything downstream plugs into.*

- **Define the retrieval interface first.** `Chunk = { id, text, source, score? }`;
  `getContext(query, opts?) => Promise<Chunk[]>`.
- **Adapter registry** mapping a mode name → implementation; selected via `config.DEFAULT_RETRIEVAL`.
- **Stub adapter** returning fixed fake chunks, so the whole chat path is testable with zero
  infrastructure.
- **`POST /chat`** — accepts `{ query, retrieval? }`. Selects the adapter from `config.DEFAULT_RETRIEVAL`;
  the request's `retrieval` override is honored **only when `config.DEBUG_RETRIEVAL` is true**, else ignored.
- **Prompt assembly** — static content first (system instructions, then document context), dynamic
  content (the user question) last. This ordering is required for Fireworks prompt caching — do not
  interleave.
- **Fireworks call** — OpenAI-compatible SDK at `https://api.fireworks.ai/inference/v1`; model id from
  config; set the `user` field per request for serverless cache affinity; `max_tokens` generous
  (gpt-oss emits reasoning tokens before visible output and truncates to empty if starved).
- **Streaming response.**

*Exit: **met.** The service answers `POST /api/v1/chat` end to end against the stub adapter, with
adapter selection and the debug-override rule enforced, in both JSON and SSE. 65 tests, none of which
touch the network. Verified live against Fireworks — including the ported refusal behavior. See
[`SPECS.md`](SPECS.md) §10.*

> **Delivered in five checkpoints** (C1–C5, the working shorthand for testable slices within a phase):
> C1 retrieval interface + registry + stub adapter · C2 `POST /api/v1/chat` · C3 system prompt +
> static-first assembly · C4 Fireworks call · C5 SSE streaming.

> The registry + `DEBUG_RETRIEVAL` override are also the **bake-off harness**: N2 compares strategies
> by swapping one request field on the same running server. Build the seam cleanly here and N2 costs
> no rework.

**Retrieval runs up front, not as a tool — and `search_documents` is gone.** The legacy service
exposed retrieval as a tool and let the model decide whether and when to search
(`MIGRATION_SPEC.md` §3–4.3). Here retrieval runs before the LLM call and the text arrives as
context. Two reasons:

- **It is what makes N2 measurable.** If the model chose when to retrieve, each arm would get a
  different number of retrievals per question depending on how the model behaved that run — you would
  be measuring tool-calling behavior, not the retrieval strategy.
- **Direct-feed has no tool-shaped equivalent.** "Put the corpus in the prompt" cannot be expressed
  as a function the model calls.

The cost is real and is **not** a free win: the model gets one shot at the query as asked and cannot
search, read, then search again the way the legacy loop could. Multi-part questions are the likely
casualty. That trade-off is ◆G11.

---

## Phase N2 — Retrieval bake-off: direct-feed vs RAG
*Goal: replace the stub with real document context — and decide **how** by measuring **what each
method costs**, not by arguing. Full experiment design:
[`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md).*

> **Deferred — do not start on the `migration` branch.** Runs on its own branch
> (e.g. `feat/retrieval-bakeoff`) after `migration` merges and after N1 delivers the adapter seam.
> Also needs two inputs from outside the code: **projected requests/month** and **current Fireworks
> pricing incl. the cached-input rate** — the break-even math is meaningless without both.

**◆ G7 — Retrieval store & method (the pgvector replacement gate). Resolved *by* this phase**, not
before it. Each candidate becomes an adapter behind the N1 interface and is graded on the same eval
set; the winner closes the gate.

| arm | what it does | infra |
|---|---|---|
| `firestore-direct` ✅ built | **Direct feed** — read the corpus slice from Firestore, put it in the prompt whole. No embedding, no ranking, no top-k, structurally no retrieval miss. | none |
| `pgvector-rag` ✅ built | **Legacy-parity RAG** — hybrid dense + Postgres full-text fused with RRF, exactly `MIGRATION_SPEC.md` §7. | Postgres+pgvector sidecar, **dev-only**, deleted after G7 |
| `firestore-vector` | RAG on Firestore native `findNearest`, dense-only unless a lexical path is built | Firestore vector index |

**The corpus does not fit in context.** ~1.357M chars ≈ **339K tokens** across 9 docs
(`MIGRATION_SPEC.md` §10.1), so "direct feed" means a *defined slice*, not everything — see ◆G9. The
small authoritative tier (criteria table + USGS DO + factsheet) is ~21K tokens and is the recommended
starting slice. Confirm the configured model's real context limit first; the serverless catalogue rotates.

**Lexical arm is a distinct sub-problem** for the Firestore RAG arm: the legacy retrieval was hybrid
dense + BM25 fused with RRF, and **Firestore has no full-text search**. Either go dense-only and
accept the acronym/exact-token weakness the hybrid was built to fix, or add a lexical path (keyword-token
field + array-contains, or an external text-search service). A pure-vector rebuild changes results —
and the eval set includes acronym queries precisely to expose that.

Build work in this phase:

- **`firestore-direct` adapter** — corpus slice → prompt, in stable document order, behind the N1
  `getContext` interface. Cheapest arm to stand up; build it first.
- **Fireworks embedding adapter** for the RAG arms, preserving the nomic `search_query:` /
  `search_document:` task prefixes (dropping them degrades quality).
- **Ingestion → Firestore** (port of `MIGRATION_SPEC.md` §5): documents → chunks → embeddings;
  preserve chunking (3200 chars / 400 overlap), the quality filter, and OCR for the one scanned PDF.
  Idempotent by filename. Direct-feed needs the document text but not the embeddings.
- **`pgvector-rag` sidecar** — `docker-compose.bakeoff.yml`, never in the deployed image.
- **Eval fixtures** — ✅ **done**: 30 conversations / 62 turns in `eval/fixtures/`, with per-turn
  rubrics, committed before any arm runs. See [`EVAL_FIXTURES.md`](EVAL_FIXTURES.md).
- **Eval harness (programmatic)** — ✅ **done**: `npm run bakeoff`. Replays the fixed **multi-turn conversations** over
  HTTP against each arm in a set order, and saves full transcripts: responses, **the exact context
  supplied to the model** (without it groundedness can't be graded), tool calls, cached/uncached token
  split, TTFT and wall time, plus arm/model/temperature/git-SHA. Temperature pinned to 0; cold and
  warm passes kept separate.
- **Human testing harness (frontend)** — an arm selector in the existing `frontend/index.html`, so
  non-technical testers can exercise the arms in a browser. **Blind by default** (arms shown as
  A/B/C, shuffled per session) because a visible arm name destroys blind grading; a labeled mode
  exists for debugging and its transcripts are tagged as non-eval. Sessions capture to the same
  transcript shape as the runner. Needs `GET /api/v1/retrieval/modes`, gated on `DEBUG_RETRIEVAL`.
  Seeded sessions (tester asks fixture questions) feed the human calibration sample; roaming
  sessions are for discovering missing question classes, which become new fixtures for the *next*
  sweep, never scores in this one. **Not** the N7 Next.js page — this is the throwaway demo UI.
- **Grading is a separate offline pass** over the saved transcripts, arms stripped and shuffled —
  human, LLM judge, or judge calibrated against a human sample. If a judge grades: different model
  than the one under test, one dimension per call, and the human-agreement rate reported.
- **Cost accounting covers upkeep, not just tokens** — idle/standing cost per arm (direct-feed: $0;
  deployed `pgvector-rag`: an always-on DB instance that likely dominates at our volume), Firestore
  free-tier headroom, index storage, re-embedding on corpus change, and the legacy FastAPI+pgvector
  cost floor as a reference point.
- **Latency and cost ceilings written down before results** — a quality win that blows the budget
  isn't a win, and setting the bar afterward isn't a test.
- **Deliverable: `docs/RETRIEVAL_COMPARISON.md`** — a committed comparison of every retrieval method
  and its output: headline table (cost/answer cold + warm, cache hit rate, **idle $/mo, 12-month
  TCO**, quality, p95), the upkeep breakdown, break-even chart against projected volume, dated prices
  **and quotas**, side-by-side sample conversations (including a case each arm loses), how quality was
  graded and the judge/human agreement rate, and the decision plus what would reverse it. *This report
  is the point of the phase*, and it's re-runnable when prices, the model, the corpus, or traffic change.

**Decision rule: quality gates, cost decides.** Arms below the correctness/groundedness floor are out
regardless of price; among those that clear it, total cost of ownership at our volume wins; latency is
a veto, not a tiebreaker.

*Exit: every selected arm selectable via config and verified; eval set, rubrics, and raw per-question
results committed; **`RETRIEVAL_COMPARISON.md` written**; ◆G7 resolved with the numbers that resolved
it; ◆G9/◆G10 closed; pgvector sidecar removed. A **split outcome is a legitimate result** —
direct-feed the small authoritative tier, RAG the long manuals — and the adapter registry composes
that without a rewrite.*

---

## Phase N3 — Sensor data on the new stack
*Goal: restore `query_sensor_data` and the backend-mediated real-data path.*

**◆ G8 — RESOLVED → go straight to the device API.** No Firestore port of the CSV. Rationale: it is
the most direct path to wiring this service into the real system, and a synthetic Firestore store
would be work thrown away the moment real data arrives. The data-source abstraction still applies —
one tool, swappable adapters — so a synthetic adapter can still be added later for offline testing if
it proves necessary.

**Full contract, credentials, and the exploration/recording plan:
[`migration/DEVICE_API.md`](migration/DEVICE_API.md)** — written 2026-08-11 from a read-only sweep
of **both** reference repos. It supersedes the dashboard-only table below on three points: the
production base URL (the dashboard proxies server-side, so its own env var is empty in prod),
turbidity's provenance (derived from a raw voltage by a **provisional, uncalibrated** conversion —
see §8, it qualifies a pinned N2 control), and a shifted metric-code table in the backend's
alerting service that must not be ported. **The pod names are in neither repo** — the device list
is runtime-only, so `npm run explore:devices` against the live API is the only way to confirm
"Algalita pod" / "OWC 2026".

The **read-only data layer is built and verified live 2026-08-11** (client, metric decoding,
exploration/recording script, 45 offline tests). The **tool loop and the prompt's tool block are
deliberately not built yet** — both would void the N2 arms; see `DEVICE_API.md` §10.

**Test pods confirmed:** `Algalita Pod` = `dev:351077454569099` (salt-water, reporting) and
**`Old Woman Creek 2026`** = `dev:351077454567580` (fresh-water, stale since 2026-08-07). Note the
second is *not* named "OWC" anywhere — the acronym matches nothing.

Three findings from the live run that bear on later phases (`DEVICE_API.md` §12):

- **Temperature's unit varies by endpoint** — °F from `/water/last` and `/water/average`, raw °C
  from `/water/period`, with nothing in the payload to say which. Normalized in the decoder.
- **An empty window returns zeros for all six metrics**, not an error — "no data for the last day"
  is otherwise indistinguishable from anoxic water at pH 0. Guarded; this is a hard requirement
  for `query_sensor_data`, since reporting it would be a fabricated figure.
- **The two test pods are different water types**, so `WATER_TYPE` as a global env var cannot serve
  both. Water type must move to per-device metadata — **Phase N4, and an input to ◆G3**.
  Separately, Algalita reads **54,100-60,200 µS/cm against a stated saltwater range of
  40,000-50,000** — an operator question, not a code fix.

**Contract, confirmed by reading `../user-dashboard` (read-only):**

| item | value | source |
|---|---|---|
| Base URL | `NEXT_PUBLIC_API_BASE_URL` + **`/api/v1`**; dev default `http://localhost:5001` | `services/axios.config.js` |
| Auth | `Authorization: Bearer <jwt>`; the dashboard reads it from `localStorage.token` | `axios.config.js` interceptor |
| Token source | `POST /users/login` → `accessToken` \| `access_token` \| `token` | `services/auth.ts` |
| Endpoints | `/devices`, `/water/last/{device}`, `/water/average/{duration}/{unit}`, `/water/period/{duration}/{unit}`, `/water/chart/{duration}/{unit}/{metric}/{tz}`, `/water/tides/{device}/{start}/{end}`, `/water/export/csv/{device}` | `services/device-data.js` |
| Metric codes | pH **99**, ORP **98**, DO **97**, conductivity **100**, temperature **102**, **turbidity 72** | `MetricsDictionary` |
| 401 handling | dashboard clears the token and redirects to login — this service must surface expiry, not retry blindly | `axios.config.js` |

- **Device-API adapter:** call `/water/*` + `/devices`, forwarding the caller's bearer JWT. Decode the
  numeric metric keys via the mapping above.
- Reproduce the aggregations (min/max/mean/median/latest/raw), natural-language time-range parsing,
  and the **reference-time = latest reading** rule (`MIGRATION_SPEC.md` §8) on top of whatever the API
  returns — the endpoints are period/average shaped, so some aggregation stays local.
- **Still unknown, revised 2026-08-11:** ~~the deployed base URL~~ — **resolved**,
  `https://cer-api-98242557946.us-central1.run.app/api/v1`. ~~a QA mirror~~ — **there is none**;
  "qa" selects a different Firestore database on the same deployment, so any live call reads
  production. What remains: **a working token** — the one item that still needs a person, see
  [`migration/DEVICE_API.md`](migration/DEVICE_API.md) §5 — and the **exact response body of each
  `/water/*` endpoint**, which `npm run explore:devices` records the moment a token exists.

**Also lands here: the tool-calling orchestration loop** (`MIGRATION_SPEC.md` §3), deferred from N1.
N1 makes a single LLM call with no tools; the legacy loop — up to `MAX_TOOL_ROUNDS = 5` tool-enabled
rounds plus one forced text-only round, tool dispatch, `role:"tool"` messages keyed by
`tool_call_id`, and the round-cap fallback — has to come back before any tool is usable. N5's
"raise the tool-round cap" item depends on this existing first.

*Exit: `query_sensor_data` works against the synthetic Firestore adapter; the orchestration loop is
restored; a documented device-API adapter stub + access-discovery checklist are ready to execute when
real data is granted.*

---

## Phase N4 — Data layer & schema evolution `⟵ was Phase 1`
*Goal: get the data model to where features need it.*

- **Add `turbidity` (NTU) end-to-end** — ingestion unit detection and the metric enum. The
  **operator normal-range and system-prompt range block landed early (2026-07-29)** — `0-25 NTU`
  freshwater / `0-10 NTU` saltwater — because the N2 eval could not measure retrieval while the
  prompt still declared turbidity unmeasured. See the session handoff.
- **Encode the "0 is valid" rule** for turbidity *and* ORP into the faulty-data foundation. The
  system-prompt range already starts at 0 for turbidity.
- **Site/device metadata store** — coordinates, water-body type, client/contract, per-sensor
  calibration dates (needed for the report header + §5).
- **◆ G3 — Site-baseline definition** (carried forward): is the report's "Site Baseline" the
  operator-provided normal range, or computed from historical per-site data? Gates the flag logic.
- **Site baseline + flag logic** — per-site, per-parameter min–max + deterministic Flag
  (Normal/Elevated/Low/Exceedance).

*Exit: 6 metrics queryable end to end; turbidity returns sane values + units; baseline/flag computable.*

---

## Phase N5 — Core behavior & UX quality `⟵ was Phase 2`
*Goal: cheap, high-visibility correctness/polish.*

- Raise/remove the tool-round cap (need 6+ for a table + sensor data in one answer; **hard dependency
  for reports**).
- System-prompt personality (friendly; steers toward water-quality topics).
- **Markdown rendering + XSS hardening** in the UI.
- **Show retrieved chunks + inline quote citations**; **no public links** to source-of-truth docs.
- Strip `gpt-oss-20b`'s `【commentary…】` markers.

*Exit: chat renders rich answers with grounded, non-hallucinated, link-free citations; multi-tool
answers complete.*

---

## Phase N6 — New features & report generation `⟵ was Phase 3`
*Goal: the net-new asks, built on the compute/narrate principle.*

- **Faulty / erroneous sensor-data handling** — detect & flag bad readings, surface "device error /
  needs recalibration," ground guidance in a **sensor manual doc**. Consolidated with report §5.
- **Sensor datasheet into corpus** — prerequisite for recalibration guidance.
- **Document management** — upload + delete source-of-truth docs with auto-seed on upload.
- **◆ Report generation** to the six-section template. Compute the header/§2/§5 deterministically;
  narrate §1/§3/§6 with the LLM over pre-computed facts; §4 event-detection is compute + narrate.
  Build order: §2 + header → §3 → §5 → §6 → **§4 last** (own spike, gated by G4).
- **◆ G4 — Event-detection context** (carried forward): does §4 run on sensor signals alone, or is
  rainfall/tidal/vessel-activity context fed in manually? Gates §4.

*Exit: each feature demoable on synthetic data; report generation produces a template-conformant report.*

---

## Phase N7 — Frontend migration & integration `⟵ was Phase 5`
*Goal: replace the existing Gilligan feature with the new bot.*

- Build the **Next.js dedicated chatbot page** (replaces the demo's single-file `frontend/index.html`).
- Re-point the dashboard's `services/gilligan.js` from `/gilligan/*` to the new `/chat`; match
  request/response shapes; retire/re-map `askGilligan`/`getChats`/`checkQuota`.
- **◆ G5 responsiveness** (mobile/tablet) and **◆ G6 redesign vs. match existing style** — both gate
  the UI build.

*Exit: chatbot reachable from the dashboard, styled per decision, answering end to end.*

---

## Phase N8 — Testing & demo `⟵ was Phase 6`
*Goal: provable behavior + presentation material.*

- **Mock conversation set** for testing and demo.
- Extend the test suite for the new metrics, tool-round cap, faulty-data handling, and the report's
  computed layer (the compute/narrate split makes every number testable).
- Walk the acceptance conversations (sensor-only, is-this-normal, definitional, follow-up, precedence,
  out-of-scope refusal) — these *demonstrate*, not build.

*Exit: green test suite + a scripted demo covering each feature.*

---

## Phase N9 — Deployment `⟵ was Phase 7`
*Goal: ship. Local/demo now; **Cloud Run** when promoted.*

- **Now:** local end to end (`npm run dev`, or the Docker image).
- **Later (Cloud Run):** deploy alongside the dashboard/backend; listen on `PORT`/`8080`; secrets from
  env; Firestore via the service's runtime service account.
- Pre-prod hardening: **CORS lockdown**, `/health` extended to a real readiness probe, and the
  **privacy bar** (signed DPA / ZDR with Fireworks) before any real data flows.

---

## Cross-cutting: data requirements

1. **Sensor time-series** — per device, per timestamp: DO, ORP, pH, conductivity, temperature,
   **+ turbidity (new)**. Today: 766-row CSV, one device. Future: real rovers, numeric-keyed from the
   production API (decode in the adapter). *0 is valid for turbidity and ORP.*
2. **Operator normal-ranges / site baseline** — per metric, per site; authoritative over documents.
   Add a turbidity range. See ◆G3.
3. **Site/device metadata** — coordinates, water-body type, client/contract, calibration dates.
4. **Source-of-truth corpus** — the 9 EPA/USGS docs **+ a sensor datasheet/manual**. No public links.
5. **Unit confirmations** — turbidity (NTU vs FNU) before answers quote it as fact.
6. **Auth context** — the user's JWT, forwarded for backend-mediated sensor calls, scoped so the bot
   only sees that user's rovers.

---

## Open gates summary

| Gate | Decision | Status | Blocks |
|---|---|---|---|
| ◆ G1 | Target stack (A/B/C) | **Resolved → C (Node/Express + Firestore)** | — (unblocked all) |
| ◆ G7 | Retrieval strategy: direct-feed vs RAG (and, if RAG, vector method + lexical arm) — **decided on cost**, with quality as a floor | Open — **resolved by the N2 bake-off**, by measurement, on its own branch later | Phases N2→N6 depend on the answer; N2 itself is the experiment |
| ◆ G9 | Direct-feed corpus slice | **Resolved → operator source-of-truth + 4 probe datasheets (~9.4K tokens)**. Revised 2026-07-29: the original small tier was 83% a structurally shredded criteria table covering pollutants this sensor cannot measure | — |
| ◆ G10 | Third bake-off arm | **Resolved → yes, three arms**: `firestore-direct`, `pgvector-rag`, `firestore-vector`. Also answers whether Firestore's own vector search is good enough if RAG wins | — |
| ◆ G11 | Does `search_documents` return as a **tool** after ◆G7 settles, or is up-front retrieval permanent? A hybrid — up-front retrieval for the first pass, an optional follow-up search tool for multi-part questions — is plausible. Decide **after** N2, so the bake-off measures strategies rather than tool-calling behavior | Open | N3 loop scope; multi-part answer quality |
| ◆ G8 | Sensor-data store (Firestore port vs device-API) | **Resolved → device API** (most direct path to the real codebase) | — |
| ◆ G3 | Site-baseline definition (operator range vs. computed) | Open | Phase N4 flag logic |
| ◆ G4 | Event-detection context source | Open | Phase N6 §4 |
| ◆ G5 | Frontend responsiveness (mobile/tablet) | Open | Phase N7 UI |
| ◆ G6 | Redesign vs. match existing style | Open | Phase N7 UI |
| — | Turbidity metric **code** | **Resolved → `72`** (from `user-dashboard` `MetricsDictionary`) | — |
| — | Turbidity **unit** (NTU vs FNU) | **Resolved → the fleet reports NTU** (white-light). NTU and FNU are not interchangeable (FNU = infrared), so a pod reporting FNU is not comparable without re-deriving the range. Source: operator source-of-truth §6; unit confirmed by operator 2026-07-29 | — |

---

## Session handoff — 2026-07-31, updated 2026-08-04 — **SUPERSEDED**

> **Superseded by [`HANDOFF.md`](HANDOFF.md) (2026-08-13).** Everything this section describes as
> pending has since happened: all three arms were swept (168 transcripts, zero failed turns), the
> cost model runs on measured means, and a blind grading packet is built. **The one open item is
> grading.** Kept below rather than deleted because its findings — prompt caching, the embeddings
> `encoding_format` bug, the fixed quality floor — are still in force and still explain why the
> code looks the way it does.

**Phase N1 complete and merged to `demo`. Phase N2 (the retrieval bake-off) is most of the way
built.** Everything below is committed and pushed on `feat/retrieval-bakeoff`. **228 tests, none
touching the network.**

> **Update 2026-08-04. Both blockers are closed and all three arms now exist.** Fireworks pricing
> is measured and modelled (`npm run cost`); Firestore credentials turned out to be already
> configured; the redundant `chunks` field is gone; and `firestore-vector` is built, seeded and
> verified end-to-end through the chat pipeline. **What remains is running the experiment, not
> building it.** Struck-through items below are kept rather than deleted so the sequence stays
> readable.

### The three arms

| arm | status |
|---|---|
| `firestore-direct` | ✅ built, verified live. Firestore is now seeded and the slice reads back from it, so `CORPUS_SOURCE=firestore` is ready — the *measured* run under it still has not happened. |
| `pgvector-rag` | ✅ built, seeded, verified live. Sidecar is `docker-compose.bakeoff.yml`; **it is not running — restart it before use.** |
| `firestore-vector` | ✅ built, seeded (305 chunks, both indexes present) and **verified end-to-end through `POST /api/v1/chat`** on 2026-08-04 — including the two discriminating fixtures: it answers the deep-in-manual question direct-feed refuses, and it refuses the fecal-coliform probe *despite retrieving the coliform chapter*. **Swept 2026-08-11 (cold + warm, 58/58 turns, zero failures).** |

Also built: the **eval fixtures** (30 conversations / 62 turns, `eval/fixtures/`, see
[`EVAL_FIXTURES.md`](EVAL_FIXTURES.md)) and the **capture runner**
(`npm run bakeoff -- --arm=<mode> --pass=<cold|warm>`, plus `--spot-check`, `--only`, `--dry-run`).
**28 of 30 fixtures (58 of 62 turns) are runnable**; the 2 held back need `query_sensor_data` (N3).

### Decisions already fixed — do not reopen without a reason

- **Quality floor and latency ceiling**, written before any arm ran:
  [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §8a. Hard gates on grounding (zero fabricated
  figures, 100% refusal where required, citations ≥95%); correctness mean ≥1.0 per servable class
  and ≥1.3 overall; latency veto = ≤1.5s p95 TTFT over the fastest arm; p95 wall ≤10s is a flag,
  not a veto. **If every arm fails, ◆G7 stays open and the floor does not move.**
- **Grading:** LLM judge calibrated against a ~20% human sample, collected through the blind
  frontend harness (§7c). Judge model must differ from the model under test.
- **Turbidity is in scope**, reported in **NTU**, operator range `0-25 NTU` freshwater /
  `0-10 NTU` saltwater. The system prompt is a **pinned control** — changing it after an arm runs
  voids that arm.
- **Temperature pinned to 0** (`LLM_TEMPERATURE`), recorded in every transcript.

### The two findings that matter most

**1. Prompt caching works — and the discount was priced on 2026-08-03. It does *not* invert the
story on our model.** Direct-feed's prefix is byte-identical every request, so ~99.4-99.9% of its
~10,900 prompt tokens are cached — roughly **14 uncached tokens per warm request**. RAG sends far
fewer tokens (~2,700-4,400) but its context changes per query, so the prefix diverges early and
only ~570 cache. **RAG sends fewer tokens and pays near-full price for most of them.**

`gpt-oss-20b` caches at **50% off** ($0.07 → $0.035/1M), which is not enough: direct-feed's warm
input is still ~1.3× RAG's. But `gpt-oss-120b` caches at **90.7% off** ($0.15 → $0.014/1M), which
inverts it completely — direct-feed becomes ~3.7× cheaper on input, and cheaper than direct-feed on
*20b*. Full price sheet, arithmetic, and the two consequences (including that completion tokens now
cost more than the retrieval choice does) in [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §1b.
Reproduce with `npm run cost`.

**2. A provider bug nearly invalidated the RAG arms.** Calling Fireworks' embeddings endpoint
*without* `encoding_format` returns a corrupt **192-element all-zero vector** instead of the
768-dim embedding, silently. Dense search over zero vectors ranks arbitrarily, so RAG would have
lost the bake-off to a bug. `EmbeddingService` now always sends `encoding_format: "float"` and
rejects wrong dimensions **and** all-zero vectors. Do not remove either guard.

### Blocked, and on whom

- ~~**Firestore credentials (user).**~~ **RESOLVED — they were already in place.** Application
  Default Credentials were written 2026-07-31 (`~/.config/gcloud/application_default_credentials.json`,
  account `winsyu475@gmail.com`, project **`cer-demo-2026`**, database `(default)`), i.e. after
  this handoff was drafted. Verified live 2026-08-03: `npm run seed:firestore` committed all 8
  documents, and `FirestoreCorpusSource.loadSlice()` read the 5-document slice back in stable
  filename order. **The `where(inDirectFeedSlice) + orderBy(filename)` query served without
  raising `FAILED_PRECONDITION`**, so the composite index the shape notes below anticipated is
  either already present or unnecessary — check the console before creating one. `firestore-vector`
  and the measured `CORPUS_SOURCE=firestore` run are both unblocked.
- ~~**Fireworks pricing incl. the cached-input rate.**~~ **RESOLVED 2026-08-03.** Prices recorded
  in `src/eval/prices.ts`, cost model in `src/eval/cost.ts`, CLI `npm run cost`, findings in
  `RETRIEVAL_BAKEOFF.md` §1b. Re-read the sources before publishing the comparison — rates rotate.
- **`query_sensor_data` / tool loop (N3).** Holds back 2 fixtures. Low priority: they discriminate
  little between arms by design.

### Firestore shape decisions pending (needed before `firestore-vector`)

The existing `corpus_documents` collection stores **one document per file** with `chunks` as an
array field. Vector search cannot index a vector inside an array element, so the vector arm needs a
separate per-chunk collection (~305 docs), proposed `corpus_chunks` with a `Vector(768)` `embedding`
field. Two indexes will be needed: a composite (`inDirectFeedSlice` ASC, `filename` ASC) for the
existing direct-feed query, and a vector index on `corpus_chunks.embedding`.

**Two traps found while planning this:**

- The embedding must be written with `FieldValue.vector([...])`. A plain `number[]` writes as an
  array, the index never matches, and `findNearest` returns nothing **with no error**.
- ~~`volunteer_stream_monitoring_a_methods_manual.pdf` serialises to ~1,005,018 bytes…~~
  **DONE 2026-08-03.** `chunks` is no longer written to `corpus_documents`. Measured: that
  document went **1,005,018 → 478,584 bytes (96% → 45.6% of the limit)**, headroom 43 KB → 570 KB,
  and every other document is now under 17%. `seed:firestore` also **size-checks every document
  before committing anything**, so an oversized document names itself instead of failing an opaque
  batch commit. `corpus.json` still carries `chunks` — the pgvector seeder and the future vector
  seeder both read it from there.

### Immediate next steps

**No external blockers remain.** All three of the items this handoff was waiting on are closed.

1. ~~Land Firestore credentials.~~ Done — already present, verified live.
2. ~~Get Fireworks pricing.~~ Done — `npm run cost`. Feed it real sweep numbers once captured:
   replace the spot-check constants in `src/eval/costScenarios.ts` and flip `TOKEN_PROVENANCE`
   to `measured`.
3. ~~Drop the redundant `chunks` field from `corpus_documents`.~~ Done.
4. ~~Build `firestore-vector`.~~ Done — `corpus_chunks` seeded with 305 chunks, both indexes
   present, `findNearest` returning ranked results, and the arm answered end-to-end through the
   chat pipeline on both discriminating fixtures. See `SPECS.md` §14b.
5. Then: spot-check every arm, run the sweep (cold + warm), grade blind, write
   `RETRIEVAL_COMPARISON.md`, close ◆G7, delete the pgvector sidecar.

### Environment notes

- `ts-node` cold start is ~80s. `npm run dev` looks hung but is not.
- `docker compose` (plugin) is not installed; use **`docker-compose`** (standalone v5.0.1).
- A dev server may already be on **:8000**; use another port (e.g. `PORT=8099`) for test runs.
- Sidecar: `docker-compose -f docker-compose.bakeoff.yml up -d`, then
  `PGVECTOR_URL=postgresql://cer:cer@localhost:5433/cer_bakeoff`. Re-seeding is idempotent and
  costs no embedding calls.

**Measurements so far** (live, single runs — indicative, not the eval):

| | prompt tokens | cached | TTFT | wall |
|---|---:|---:|---:|---:|
| `firestore-direct`, warm | ~10,900 | ~99.4-99.9% | 7.8-9.3s | 9.5-11.6s |
| `pgvector-rag` | 2,722-4,446 | 0-569 | — | — |
| `firestore-vector` | 2,738-3,969 | 0 | — | — |

`firestore-direct` read from Firestore (`CORPUS_SOURCE=firestore`) at **10,889** prompt tokens —
within noise of the artifact-backed figure, which is what confirms Firestore returns the slice in a
stable `filename` order. An unstable order would destroy the prompt-cache hit rate the arm's whole
cost case rests on, silently.

Completion tokens ran 158-1,299 (earlier runs up to 4,060) — gpt-oss emits reasoning tokens, so
cost per answer cannot be inferred from answer length.
