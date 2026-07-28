# Clean Earth RAG — Implementation Timeline

A phased plan for building the Clean Earth RAG assistant on the **Node/Express + Firestore** stack.
Durations are relative sizing, not calendar promises. **Decision gates (◆)** must be resolved before
the work downstream of them starts.

This is the successor to the original migration timeline. The single biggest change: the target-stack
gate (◆G1) is now **resolved** — see below — which re-anchors every phase that depended on it.

Companion docs: [`SPECS.md`](SPECS.md) (what's built today), [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md)
(coding conventions), [`migration/MIGRATION_SPEC.md`](migration/MIGRATION_SPEC.md) (legacy FastAPI
behavior being ported), [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) (the Phase N2 direct-feed vs
RAG experiment design), `report/…report-template.pdf` (the report template a later phase builds toward).

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

## Phase N1 — Retrieval interface + chat spine (stub-backed) `⟵ immediate next`
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

*Exit: the service answers `/chat` end to end against the stub adapter, streaming, with adapter
selection and the debug-override rule enforced. No real corpus required.*

> The registry + `DEBUG_RETRIEVAL` override are also the **bake-off harness**: N2 compares strategies
> by swapping one request field on the same running server. Build the seam cleanly here and N2 costs
> no rework.

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
| `firestore-direct` | **Direct feed** — read the corpus slice from Firestore, put it in the prompt whole. No embedding, no ranking, no top-k, structurally no retrieval miss. | none |
| `pgvector-rag` | **Legacy-parity RAG** — hybrid dense + Postgres full-text fused with RRF, exactly `MIGRATION_SPEC.md` §7. | Postgres+pgvector sidecar, **dev-only**, deleted after G7 |
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
- **Eval harness (programmatic)** — a runner replays ~25–30 fixed **multi-turn conversations** over
  HTTP against each arm in a set order, and saves full transcripts: responses, **the exact context
  supplied to the model** (without it groundedness can't be graded), tool calls, cached/uncached token
  split, TTFT and wall time, plus arm/model/temperature/git-SHA. Temperature pinned to 0; cold and
  warm passes kept separate.
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

**◆ G8 — Sensor-data store (new). Blocks the sensor tool.** Port the CSV/SQL implementation to a
Firestore-backed store, **or** go straight to the device-API adapter (below). The old timeline's
data-source abstraction still applies: one tool, swappable adapters.

- **Synthetic adapter:** load the 766-row CSV into Firestore (or read-through), reproduce the
  aggregations (min/max/mean/median/latest/raw), natural-language time-range parsing, and the
  **reference-time = latest reading** rule (`MIGRATION_SPEC.md` §8).
- **Device-API adapter (real data):** call the production `/water/*` + `/devices` endpoints,
  forwarding the user's bearer JWT. **Access-discovery task first:** that backend is *not* in the repos
  on hand — locate its URL (injected via `NEXT_PUBLIC_API_BASE_URL`), confirm the response shape, get a
  test token or QA mirror. The API returns **numeric-keyed metrics** (pH=99, DO=97, ORP=98,
  conductivity=100, temp=102; **turbidity code TBD**) — build the decode mapping into the adapter.

*Exit: `query_sensor_data` works against the synthetic Firestore adapter; a documented device-API
adapter stub + access-discovery checklist are ready to execute when real data is granted.*

---

## Phase N4 — Data layer & schema evolution `⟵ was Phase 1`
*Goal: get the data model to where features need it.*

- **Add `turbidity` (NTU) end-to-end** — ingestion unit detection, metric enum, operator normal-range,
  system-prompt range block.
- **Encode the "0 is valid" rule** for turbidity *and* ORP into the faulty-data foundation.
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
| ◆ G9 | Direct-feed corpus slice (small tier / whole-doc selection / distilled) — the corpus is ~339K tokens and does **not** fit in context | Open — recommend starting with the ~21K-token small tier | `firestore-direct` arm |
| ◆ G10 | Does `firestore-vector` run as a third arm, or is the bake-off just direct-feed vs `pgvector-rag`? | Open | N2 scope/duration |
| ◆ G8 | Sensor-data store (Firestore port vs device-API) | Open | Phase N3 |
| ◆ G3 | Site-baseline definition (operator range vs. computed) | Open | Phase N4 flag logic |
| ◆ G4 | Event-detection context source | Open | Phase N6 §4 |
| ◆ G5 | Frontend responsiveness (mobile/tablet) | Open | Phase N7 UI |
| ◆ G6 | Redesign vs. match existing style | Open | Phase N7 UI |
| — | Turbidity metric code + unit confirmation | Open | resolve during N3 discovery |
