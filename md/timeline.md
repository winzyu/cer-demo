# Gilligan Chatbot — Implementation Timeline

A phased plan for replacing the existing Gilligan AI feature with the Clean Earth RAG system. Durations are relative sizing, not calendar promises. **Decision gates (◆)** must be resolved before the work downstream of them starts.

Companion docs: `SPECS.md` (what's built today), `BACKLOG.md` (itemized queue, including the 2026-06-26 planning additions), `report/datapod-water-quality-report-template.md (1).pdf` (the report template this plan builds toward).

---

## Confirmed decisions (planning round, 2026-06-26)

- **Data:** synthetic 766-row CSV for now. Future structure = the current 5 metrics (DO, ORP, pH, conductivity, temperature) **+ a new `turbidity` column**. Real-data integration is a later phase. *0 is a valid reading for turbidity and ORP — never flag 0 as erroneous for those.*
- **Target stack:** **undecided — held as an explicit gate** (G1). All three options carried below.
- **Sensor access:** **backend-mediated tool call** — the `query_sensor_data` tool fetches data (token forwarded), so the LLM queries on demand.
- **Deployment:** **local/demo for this phase.** GCP options noted for later (Phase 7).
- **Report:** template-based, six fixed sections, **no visualizations in v1**. **Design principle: compute vs. narrate** — every number/flag/status is computed deterministically in code; the LLM only narrates pre-computed facts.

---

## Phase 0 — Decision gates & groundwork
*Goal: lock the things that change how everything else is built. Nothing large gets coded until these close.*

**◆ G1 — Target stack & data store.** *Largest gate; blocks Phases 1, 4, 5.* Spike to choose among:

| Option | What it means | Pro | Con |
|---|---|---|---|
| **A. RAG standalone** | Run the FastAPI + pgvector demo as-is; integrate only at the API boundary | Fastest to ship; preserves the working core | Two backends to operate; data lives apart from their charts' store |
| **B. Hybrid (keep brain, adapt data layer)** | Keep FastAPI + pgvector for docs/retrieval; swap the *sensor* source to their store/API | Reuses the proven RAG core; sensor data aligns with production | Moderate rework in `tools.py`; straddles two data systems |
| **C. Full migration** | Port chatbot to the Node/Express + Firestore stack | One consistent stack long-term | Largest rewrite; re-implements retrieval (pgvector → ?); highest risk |

The Phase 4 data-source abstraction makes A→B a smooth later upgrade, so starting at A/B and deferring C keeps options open without committing to the big rewrite early.

**◆ G2 — Report scope.** Mostly resolved by the template (fixed six sections, tables + prose, no viz). Two sub-gates survive: **G3** and **G4** below.

**◆ G3 — Site-baseline definition.** Is §2's "Site Baseline" the operator-provided normal range, or computed from historical per-site data? Gates the §2 flag logic.

**◆ G4 — Event-detection context.** Does §4 run on sensor signals alone, or are rainfall / tidal / vessel-activity context fed in manually? (Open-internet sourcing is closed.) Gates §4.

**Groundwork (parallel, no gate):**
- Reconcile README model note (Qwen3 → actual `gpt-oss-20b`).
- Write the target **data contract** (see Data Requirements) so Phase 1 builds against the future shape, not just today's CSV.

*Exit: stack direction chosen (or explicitly time-boxed), report sub-gates decided, data contract drafted.*

---

## Phase 1 — Data layer & schema evolution
*Goal: get the data model to where features need it. Still on the 766-row CSV.*

- **Add `turbidity` (NTU) end-to-end** — `schema.sql` column, `seed.py` unit detection, `tools.py` metric enum, operator normal-range, system-prompt range block.
- **Encode the "0 is valid" rule** for turbidity *and* ORP into the faulty-data foundation.
- **Site/device metadata store** — coordinates, water-body type, client/contract, per-sensor calibration dates (needed for report header + §5).
- **Site baseline + flag logic** — per-site, per-parameter min–max + deterministic Flag (Normal/Elevated/Low/Exceedance), per G3.
- Re-seed; verify row counts before/after and a sample query per metric.

*Exit: 6 metrics queryable end-to-end; turbidity returns sane values + units; baseline/flag computable; re-seed idempotent.*

---

## Phase 2 — Core behavior & UX quality
*Goal: cheap, high-visibility correctness/polish. Mostly maps to existing BACKLOG entries — flagged to avoid duplicate work.*

- Raise/remove `MAX_TOOL_ROUNDS` in `main.py` (need 6+ for table + sensor data in one answer; **hard dependency for reports**).
- System-prompt personality (friendly; steers toward water-quality topics).
- **Markdown rendering + XSS hardening** (= BACKLOG #1 + #15, ship together).
- **Show retrieved chunks + inline quote citations** (relates to BACKLOG #3).
- **No public links to source-of-truth docs** (privacy; net-new).
- Strip `gpt-oss-20b`'s `【commentary…】` markers (= BACKLOG #2).

*Exit: chat renders rich answers with grounded, non-hallucinated, link-free citations; multi-tool answers complete.*

---

## Phase 3 — New features
*Goal: the net-new asks. Report generation is built on the compute/narrate principle.*

- **Faulty / erroneous sensor data handling** — detect & flag bad readings, surface "device error / needs recalibration," ground guidance in a **sensor manual doc** (source-of-truth only). **Consolidated with report §5 Data Quality — one workstream.**
- **Sensor datasheet into corpus** (= BACKLOG #8) — prerequisite for recalibration guidance.
- **Document management** — upload + delete source-of-truth docs with auto-seed on upload (README §15 pulled forward).
- **◆ Report generation** — to the six-section template. Compute/narrate split:

| Section | Layer | How |
|---|---|---|
| Header / metadata | **Compute** | Lookups from site/device metadata + reporting period |
| §2 Parameter Data | **Compute** | Min/Max/Mean/Median reuse `query_sensor_data`; Flag = deterministic baseline comparison |
| §5 Data Quality | **Compute** | Completeness %, drift, biofouling heuristic, sensor agreement (DO–ORP, EC temp comp); calibration = lookup |
| §1 Summary | **Narrate** | LLM over computed status + flags |
| §3 Parameter Analysis | **Narrate** | LLM prose over computed pattern type (diel/tidal/flat) + excursion timestamps |
| §4 Event Detection | **Compute + Narrate** | Detection (window/severity/movements) deterministic; classification + interpretation LLM |
| §6 Recommendations | **Narrate** | LLM over detection results + corpus |

  Build order: §2 + header → §3 → §5 → §6 → **§4 last** (own spike; riskiest, see G4). Principle: the LLM never emits a number — only narrates ones the code computed.

*Exit: each feature demoable on synthetic data; report generation produces a category-selected, template-conformant water-quality report.*

---

## Phase 4 — Sensor-data integration design (the real-data pivot)
*Goal: make the jump from CSV to live rover data a configuration change, not a rewrite. Backend-mediated.*

Abstract `query_sensor_data` behind a **data-source interface** with swappable adapters:
- **Now (synthetic):** CSV/Postgres adapter — current behavior.
- **Later (real):** Device-API adapter calling the production `/water/*` + `/devices` endpoints, **forwarding the user's bearer token** (same JWT the dashboard stores at login). The LLM keeps calling one tool; only the adapter changes.

**Two ways to source real data, and how to pivot to each:**

| Path | What you'd do | Watch-outs |
|---|---|---|
| **Production endpoint (read-only)** | Point the adapter at the live backend with a scoped **test account** token; query only that account's rovers | Touches real/confidential data → privacy bar (README §16, DPA); rate limits; never write |
| **Mirror dev/QA branch** | Use/seed a non-prod backend (e.g. the existing `qa-db` / `app-qa` deploy) with representative data | Must expose the same `/water/*` + `/devices` contract; may need someone to seed it |

**Critical caveat:** those `/water/*` and `/devices` endpoints are **not** in the `clean-earth-rovers-server` repo on hand — they live in a separate production backend whose URL isn't committed (injected via `NEXT_PUBLIC_API_BASE_URL` at deploy). So the first concrete real-data step is an **access-discovery task**: locate that backend, get its URL, confirm the response shape, obtain a test token or QA mirror.

**Data-shape note:** the production API returns **numeric-keyed metrics** (pH=99, DO=97, ORP=98, conductivity=100, temp=102; **turbidity code TBD — confirm during discovery**), not named fields. Build the decode mapping into the adapter from the start.

*Exit: tool works against the CSV adapter today; a documented device-API adapter stub + an access-discovery checklist ready to execute when real data is granted.*

---

## Phase 5 — Frontend migration & integration
*Goal: replace the existing Gilligan feature with the new bot.*

- Build the **Next.js dedicated chatbot page** (replaces the demo's single-file HTML).
- Re-point the dashboard's `services/gilligan.js` from `/gilligan/*` to the new `/chat`; match request/response shapes; retire or re-map `askGilligan`/`getChats`/`checkQuota`.
- **◆ G5 responsiveness** (mobile/tablet) and **◆ G6 redesign vs. match existing style** — both gate the UI build.

*Exit: chatbot reachable from the dashboard, styled per decision, answering against synthetic data end-to-end.*

---

## Phase 6 — Testing & demo
*Goal: provable behavior + presentation material.*

- **Mock conversation set** for testing and demo; optionally LLM-generate more from data + context (adjacent to BACKLOG #22).
- Extend the 47 unit tests for new metrics, tool-round cap, faulty-data, and the report's computed layer (the compute/narrate split makes all numbers testable).
- Walk README §13 acceptance tests (#1–6 already map to existing behavior — these *demonstrate*, not build).

*Exit: green test suite + a scripted demo covering each new feature.*

---

## Phase 7 — Deployment
*Goal: ship. **Local/demo is the target for this phase.***

**Now:** local end-to-end — `docker-compose` (pgvector) + uvicorn + the Next.js app. No infra commitment.

**Later (when promoted, likely GCP):**
- **GCP alongside the dashboard** — App Engine / Cloud Run in the same org as the UI (`clean-earth-rovers-ui`) and backend; consistent with existing deploy scripts.
- **Separate service** — own infra, integrated only via API + the `NEXT_PUBLIC_API_BASE_URL` pattern.
- Pre-prod hardening queued in backlog: **CORS lockdown** (#16), connection pooling (#6), `/health` Fireworks probe (#5), and the **privacy bar** (signed DPA / ZDR with Fireworks) before any real data flows.

---

## Cross-cutting: Data Requirements

1. **Sensor time-series** — per device, per timestamp: DO, ORP, pH, conductivity, temperature, **+ turbidity (new)**. Today: 766-row CSV, one device. Future: same shape, real rovers, numeric-keyed from the production API (decode in the adapter). *0 is valid for turbidity and ORP.*
2. **Operator normal-ranges / site baseline** — per metric, per site; authoritative over documents. Add a turbidity range; per-device if multi-device lands (README §7). See G3.
3. **Site/device metadata** — coordinates, water-body type, client/contract, per-sensor calibration dates (report header + §5). New.
4. **Source-of-truth document corpus** — current 9 EPA/USGS docs (523 chunks) **+ a sensor datasheet/manual** (recalibration guidance). No public links exposed.
5. **Unit confirmations** — turbidity (NTU vs FNU) and README §16 open unit items, before answers quote them as fact.
6. **Auth context** — the user's JWT, forwarded for backend-mediated sensor calls, scoped so the bot only sees that user's rovers.

---

## Open gates summary

| Gate | Decision | Blocks |
|---|---|---|
| ◆ G1 | Target stack (A/B/C) | Phases 1, 4, 5 |
| ◆ G2 | Report scope | mostly resolved by template; see G3/G4 |
| ◆ G3 | Site-baseline definition (operator range vs. computed) | §2 flag logic |
| ◆ G4 | Event-detection context source | §4 |
| ◆ G5 | Frontend responsiveness (mobile/tablet) | Phase 5 UI |
| ◆ G6 | Redesign vs. match existing style | Phase 5 UI |
| — | Turbidity metric code + unit confirmation | resolve during Phase 4 discovery |
