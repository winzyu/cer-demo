# Clean Earth RAG — Implementation Timeline

A phased plan for building the Clean Earth RAG assistant on the **Node/Express + Firestore** stack.
Durations are relative sizing, not calendar promises. **Decision gates (◆)** must be resolved before
the work downstream of them starts.

This is the successor to the original migration timeline. The single biggest change: the target-stack
gate (◆G1) is now **resolved** — see below — which re-anchors every phase that depended on it.

Companion docs: [`SPECS.md`](SPECS.md) (what's built today), [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md)
(coding conventions), [`migration/MIGRATION_SPEC.md`](migration/MIGRATION_SPEC.md) (legacy FastAPI
behavior being ported), `report/…report-template.pdf` (the report template a later phase builds toward).

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

---

## Phase N2 — Real retrieval on Firestore
*Goal: replace the stub with real document retrieval. This is where the pgvector loss is felt.*

**◆ G7 — Retrieval store & method (new; the pgvector replacement gate). Blocks this phase.** Spike to decide:

| Option | What it means | Watch-outs |
|---|---|---|
| **Firestore native vector search** | Store chunk embeddings in Firestore, use its KNN/`findNearest` vector query | Confirm dimension/þindex limits and cost; single store, consistent with the stack |
| **External vector store** | Firestore for metadata, a dedicated vector DB for embeddings | Adds a system the conventions deliberately avoided; more infra |
| **Keep stub / defer** | Ship N1 features that don't need the corpus first | Only viable if early demos are sensor-focused |

**Lexical arm is a distinct sub-problem:** the legacy retrieval was **hybrid dense + Postgres
full-text (BM25) fused with RRF** (`MIGRATION_SPEC.md` §7). **Firestore has no full-text search.** So
either (a) go dense-only and accept the acronym/exact-token weakness the hybrid was built to fix, or
(b) add a lexical path (e.g. a keyword-token field + array-contains, or an external text-search
service). Decide explicitly — a pure-vector rebuild changes results.

- Build a **Fireworks embedding adapter** (`getContext` implementation) behind the N1 interface,
  preserving the nomic `search_query:` / `search_document:` task prefixes (dropping them degrades quality).
- **Ingestion → Firestore** (port of `MIGRATION_SPEC.md` §5): documents → chunks → embeddings written
  to Firestore; preserve chunking (3200 chars / 400 overlap), the quality filter, and OCR for the one
  scanned PDF. Idempotent by filename.

*Exit: a real retrieval adapter selectable via config returns grounded chunks from the corpus in
Firestore; ingestion is idempotent; retrieval quality validated against a few known queries.*

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
| ◆ G7 | Retrieval store on Firestore (vector method + lexical arm) | Open | Phase N2 |
| ◆ G8 | Sensor-data store (Firestore port vs device-API) | Open | Phase N3 |
| ◆ G3 | Site-baseline definition (operator range vs. computed) | Open | Phase N4 flag logic |
| ◆ G4 | Event-detection context source | Open | Phase N6 §4 |
| ◆ G5 | Frontend responsiveness (mobile/tablet) | Open | Phase N7 UI |
| ◆ G6 | Redesign vs. match existing style | Open | Phase N7 UI |
| — | Turbidity metric code + unit confirmation | Open | resolve during N3 discovery |
