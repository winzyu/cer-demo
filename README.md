# Clean Earth RAG — Baseline Build

A single-page chat interface where a user asks questions about water-quality sensor data and authoritative water-quality documents, and the backend produces grounded answers with citations.

This README is the build spec. It is intentionally narrow. Anything not listed here is **explicitly deferred** — see the "Deferred" section at the end. Do not add scope without checking that section first.

---

## 0. Setup

Run these from the repo root.

1. **Configure environment.** Copy the template and fill in your Fireworks key:
   ```bash
   cp .env.example .env
   # then edit .env and set FIREWORKS_API_KEY=...
   ```
2. **Provide source data.** Drop the seed PDFs listed in section 5 into `docs/`, and the sensor CSV at `data/water-data.csv`.
3. **Start Postgres + pgvector** (docker-compose, exposes 5432):
   ```bash
   docker compose up -d
   ```
4. **Apply the schema** (one-time; creates `documents`, `chunks`, `sensor_data` and the `vector` extension):
   ```bash
   docker exec -i cer_rag_db psql -U postgres -d cleanearth < backend/schema.sql
   ```
5. **Install Python deps** (use a venv):
   ```bash
   python -m venv .venv && source .venv/bin/activate
   pip install -r backend/requirements.txt
   ```
6. **Seed documents + sensor data** (idempotent; embeds via Fireworks):
   ```bash
   python -m backend.seed
   ```
7. **Run the backend** (FastAPI on :8000):
   ```bash
   uvicorn backend.main:app --reload --port 8000
   ```
   Sanity check: `curl http://localhost:8000/health` should report `db_ok: true` and `fireworks_configured: true`.
8. **Open the frontend.** Open `frontend/index.html` directly in a browser. It calls `http://localhost:8000` by default; override with `?backend=http://host:port` if needed.

---

## 1. What we're building

**Scope:**
- One user, one tenant, one device's worth of sensor data.
- A handful of seed documents covering recreational water criteria, aquatic-life criteria, and field-measurement interpretation for the parameters the sensor measures.
- A `/chat` endpoint that retrieves relevant context (from documents and/or sensor data), produces an answer via Qwen3-30B-A3B-Instruct-2507, and returns it with citations.
- A minimal HTML chat UI.

**Out of scope** (do not implement):
- Authentication, user accounts, multi-tenancy
- Fine-tuning
- A separate guardrails layer
- External API tools (EPA ECHO, NOAA, USGS web APIs)
- LiteLLM or any multi-provider abstraction
- A dedicated vector database (Pinecone, Qdrant, Weaviate)
- TimescaleDB or any time-series-optimized storage
- Sandboxed code execution for charts
- Streaming responses
- A document ingestion UI (we ingest via a one-time script)

---

## 2. Decisions already made

| Decision | Choice |
|---|---|
| LLM | Qwen3-30B-A3B-Instruct-2507 |
| LLM provider | **Fireworks AI** (OpenAI-compatible API) |
| Embedding model | **`nomic-ai/nomic-embed-text-v1.5`** via Fireworks |
| Frontend | **Plain HTML + JS** (single file, no build step) |
| Backend | **Python + FastAPI** |
| Database | **Postgres + pgvector** (one instance, via docker-compose) |
| Deployment | **Local for now.** Plan to deploy to Railway when we need to share. |
| Privacy posture | Signed DPA with Fireworks; no training on data. See section 6.1 for the full contract checklist. |
| Safety posture | The sensor does not measure pathogens. For any safety question, defer to local public-health authorities. |
| Operator-provided normal ranges | Authoritative. See section 7. Supplied in the system prompt as ground truth, take precedence over document-retrieved ranges in case of conflict. |

---

## 3. File layout

```
clean-earth-rag/
├── docker-compose.yml      # Postgres with pgvector
├── .env.example            # template; copy to .env and fill in
├── backend/
│   ├── main.py             # FastAPI app: POST /chat, GET /health
│   ├── llm.py              # Fireworks client wrapper (OpenAI SDK pointed at Fireworks)
│   ├── tools.py            # query_sensor_data, search_documents
│   ├── rag.py              # embed query, retrieve top-k chunks
│   ├── seed.py             # one-time script: load docs + CSV into Postgres
│   ├── schema.sql          # CREATE TABLE statements for documents, chunks, sensor_data
│   └── requirements.txt
├── frontend/
│   └── index.html          # chat UI: one input, one message list, one thinking indicator
├── docs/                   # source PDFs to ingest (see section 5)
├── data/
│   └── water-data.csv      # sensor CSV
└── README.md
```

---

## 4. Sensor data

**File:** `data/water-data.csv` (~766 rows, one device).

**Columns:**

| Column | Type | Notes |
|---|---|---|
| `DEVICE` | string | device identifier |
| `DATE` | timestamp | **TODO (user): confirm exact format before running `seed.py` — e.g. `YYYY-MM-DD HH:MM:SS` or ISO 8601** |
| `DISSOLVED OXYGEN` | float | **TODO (user): confirm unit — mg/L or % saturation** |
| `ORP` | float | millivolts (mV) |
| `PH` | float | unitless (0–14) |
| `CONDUCTIVITY` | float | **TODO (user): confirm unit — µS/cm is most common** |
| `TEMPERATURE` | float | **TODO (user): confirm unit — °C or °F** |

**Postgres table:**

```sql
CREATE TABLE sensor_data (
    id            SERIAL PRIMARY KEY,
    device        TEXT NOT NULL,
    measured_at   TIMESTAMPTZ NOT NULL,
    dissolved_oxygen NUMERIC,
    orp           NUMERIC,
    ph            NUMERIC,
    conductivity  NUMERIC,
    temperature   NUMERIC
);
CREATE INDEX idx_sensor_measured_at ON sensor_data(measured_at);
```

`seed.py` should bulk-load the CSV with `COPY` or a batched `INSERT`. Normalize column names to snake_case on the way in.

---

## 5. Document corpus

**Owner:** TODO (user — assign one teammate as the document curator before first ingest. Their job is to decide what stays in `docs/`, version the list, and update when new docs are added.)

**Seed documents** (download manually into `docs/` before running `seed.py`). These were chosen to cover every parameter the sensor measures, in both authoritative-regulatory and accessible-interpretive registers:

1. **EPA Recreational Water Quality Criteria (2012)** — `rwqc2012.pdf`
   - https://www.epa.gov/sites/default/files/2015-10/documents/rwqc2012.pdf
   - Use case: questions about whether a body of water is safe for swimming, surfing, wading.

2. **EPA Ambient Water Quality Criteria for Dissolved Oxygen (Freshwater), 1986** — `ambient-wqc-dissolved-oxygen-1986.pdf`
   - https://www.epa.gov/sites/default/files/2019-03/documents/ambient-wqc-dissolved-oxygen-1986.pdf
   - Use case: DO thresholds for protecting aquatic life (the canonical 5 mg/L number, plus salmonid-specific guidance).

3. **EPA National Recommended Water Quality Criteria — Aquatic Life Criteria Table** — `aquatic-life-criteria-table.pdf` (save the page as PDF)
   - https://www.epa.gov/wqc/national-recommended-water-quality-criteria-aquatic-life-criteria-table
   - Use case: pollutant-specific thresholds. Mostly chemicals we don't measure, but provides the regulatory framing.

4. **EPA Volunteer Stream Monitoring: A Methods Manual (1997)** — `volunteer-stream-monitoring-methods-manual.pdf`
   - https://www.epa.gov/sites/default/files/2015-04/documents/volunteer_stream_monitoring_a_methods_manual.pdf
   - Use case: **the highest-value document in the corpus.** Chapter 5 has plain-language sections on DO/BOD, temperature, pH, turbidity, conductivity — exactly the registers a typical user will write questions in.

5. **USGS National Field Manual Chapter A6.2 — Dissolved Oxygen** — `usgs-nfm-a6.2-dissolved-oxygen.pdf`
   - https://pubs.usgs.gov/tm/09/a6.2/tm9a6.2.pdf
   - Use case: how DO is actually measured, what affects readings (temperature, pressure, salinity), oxygen-solubility tables.

6. **USGS National Field Manual Chapter A6.8 — Multiparameter Instruments** — `usgs-nfm-a6.8-multiparameter.pdf`
   - https://pubs.usgs.gov/publication/tm9A6.8/full (download the full PDF)
   - Use case: covers temperature, specific conductance, pH, DO, and ORP all in one chapter — the closest single document to "interpret what my sensor is telling you."

7. **USGS Water Science School — Dissolved Oxygen and Water** — `usgs-dissolved-oxygen-water.pdf` (save the page as PDF)
   - https://www.usgs.gov/water-science-school/science/dissolved-oxygen-and-water
   - Use case: accessible explanations of why each metric matters.

8. **EPA Ambient Water Quality Criteria for Nutrient Pollution (Lakes and Reservoirs)** — `nutrient-pollution-lakes-reservoirs.pdf`
   - https://www.epa.gov/nutrientpollution/ambient-water-quality-criteria-address-nutrient-pollution-lakes-and-reservoirs
   - Use case: nitrogen/phosphorus context (nutrients drive DO swings via algal blooms — explains the *why* behind low-DO events).

9. **Sensor manufacturer datasheets** — `<manufacturer>-<model>-datasheet.pdf`
   - TODO (user): drop the datasheets for the specific sensor model(s) producing `water-data.csv` into `docs/`. These document accuracy, range, calibration, and known failure modes — invaluable when a user asks "is this reading plausible?"

**ORP note:** The EPA and USGS have not published a standalone authoritative criteria document for ORP comparable to the DO one. NFM A6.8 (item 6) is the canonical USGS treatment and is sufficient at baseline. If retrieval quality on ORP questions disappoints, consider adding a vetted secondary source (e.g. the YSI or Hach technical notes), but mark them clearly as manufacturer-authored in the metadata.

**Documents table:**

```sql
CREATE TABLE documents (
    id            SERIAL PRIMARY KEY,
    filename      TEXT NOT NULL UNIQUE,
    title         TEXT NOT NULL,
    source_url    TEXT,
    ingested_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chunks (
    id            SERIAL PRIMARY KEY,
    document_id   INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index   INTEGER NOT NULL,
    content       TEXT NOT NULL,
    embedding     VECTOR(768)  -- nomic-embed-text-v1.5 is 768-dim
);
CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops);
```

**Chunking:** Use a recursive character splitter with chunk size ~800 tokens and ~100 token overlap. Strip page headers/footers where obvious. Store the source filename and a human-readable title with each document so citations can reference it.

---

## 6. LLM access

**Provider:** Fireworks AI. Use the OpenAI Python SDK pointed at `https://api.fireworks.ai/inference/v1`. Read `FIREWORKS_API_KEY` from env.

**Model string:** `accounts/fireworks/models/qwen3-30b-a3b-instruct-2507` (verify exact model string in Fireworks console before first call — model paths occasionally change).

**Embeddings model string:** `nomic-ai/nomic-embed-text-v1.5` via the same Fireworks endpoint.

**Function calling:** Use the provider's native tool-calling format (OpenAI-compatible). Do **not** add LangChain or LlamaIndex.

---

## 6.1 Privacy & data handling

The architecture sends prompts (including any sensor data, document chunks, and user messages embedded in the prompt) to Fireworks AI for inference. **Customer data does not stay on infrastructure you control** — it travels to Fireworks. What protects confidentiality is contractual, not topological.

**Required before production data flows through the system:**

1. **Executed DPA with Fireworks** that explicitly covers:
   - No use of customer inputs or outputs for model training or fine-tuning.
   - Defined data retention window. Ideally **Zero Data Retention (ZDR)** — Fireworks offers this on enterprise plans. Without ZDR, expect ~30-day retention for abuse-detection purposes even though the data is not used for training.
   - Sub-processor disclosure (so you know who else handles the data downstream).
   - Breach notification terms.
   - Same coverage for embeddings calls (`nomic-ai/nomic-embed-text-v1.5` is served through the same Fireworks endpoint, so the DPA scope must include both completions and embeddings).

2. **For the dummy-data baseline build:** the DPA does not need to be in place yet, since no real customer data is involved. But it must be signed before the first byte of production data is sent through the system.

**What this baseline does NOT provide:**

- **True on-premises hosting.** If the privacy bar is "customer data physically never leaves our infrastructure," Fireworks is the wrong inference provider. You would need to self-host Qwen3 via vLLM, TGI, or similar on single-tenant GPUs. This is a much larger build and was not chosen for the baseline. Confirm with stakeholders that the "vendor contractually committed via DPA" bar is the correct one before going live.

- **Encryption of prompts at the application layer.** Fireworks calls go over TLS (encrypted in transit), and Fireworks encrypts at rest on their side, but the prompt body itself is in plaintext as it enters Fireworks' systems — that's necessary for the model to read it. There is no end-to-end encryption story available with hosted inference.

**Future risk to flag now:** any deferred tool that calls a third-party API (EPA ECHO, NOAA, USGS web services) will send data to a vendor outside the Fireworks DPA. Each such integration needs its own privacy review before it ships. Don't let these slip in quietly.

---

## 7. Operator-provided normal ranges (authoritative)

These are the supervisor-supplied normal operating ranges for the sensor. **They are a higher source of truth than anything retrieved from documents.** If the LLM finds a different range in a retrieved document chunk (e.g. the EPA Volunteer Stream Monitoring Manual gives a different pH range), it should prefer these values and explicitly note the discrepancy if relevant.

| Metric | Normal range | Unit |
|---|---|---|
| pH | 6.5 – 8.5 | unitless |
| ORP | 200 – 400 | mV |
| Dissolved oxygen | 5 – 14 | mg/L |
| Temperature | 32 – 95 | °F |
| Conductivity (freshwater) | 0 – 1,500 | µS/cm |
| Conductivity (saltwater) | 40,000 – 50,000 | µS/cm |

**Conductivity is context-dependent.** The freshwater vs saltwater distinction must be resolved before the model can judge whether a reading is normal. At baseline, hard-code the water body's type as an environment variable (`WATER_TYPE=freshwater` or `WATER_TYPE=saltwater`) and pass it into the system prompt. When you later support multiple devices, this becomes a per-device attribute.

**How these are surfaced to the model:** these ranges go directly into the system prompt as structured facts, not into the document store. The model has them in context on every turn — no retrieval needed. This is deliberate: ranges are short, authoritative, change rarely, and the cost of a retrieval miss on them is high (the model would either invent a range or fall back to a document's range, both of which are worse).

---

## 8. Tools the LLM can call

Exactly two. No more at baseline.

### `query_sensor_data`

```python
def query_sensor_data(
    metric: Literal["dissolved_oxygen", "orp", "ph", "conductivity", "temperature"],
    time_range: str,           # natural-language spec like "last 7 days", "2025-04-01 to 2025-04-15"
    aggregation: Literal["min", "max", "mean", "median", "latest", "raw"]
) -> dict
```

Returns a dict with `metric`, `time_range_resolved` (the parsed start/end timestamps), `aggregation`, `value` (or list of values for `raw`), `unit`, and `n_samples`.

Implement `time_range` parsing with a small set of patterns (last N days/weeks, explicit ISO date range, "today", "this week"). If parsing fails, return an error dict the LLM can read and recover from.

### `search_documents`

```python
def search_documents(query: str, top_k: int = 5) -> list[dict]
```

Embeds `query` with nomic-embed-text-v1.5, runs cosine similarity in pgvector, returns the top-k chunks. Each result is `{chunk_id, document_filename, document_title, content, score}`.

---

## 9. Orchestration loop

The simplest possible flow. No framework.

1. User POSTs `{message: str, history: list[{role, content}]}` to `/chat`.
2. Backend constructs the prompt: system message (see section 9), the history, and the new user message.
3. Backend sends to Fireworks with both tools defined.
4. If the model returns tool calls, backend executes them, appends tool results to the message list, and re-calls the model. Loop until the model returns a final text response (cap at ~5 tool-call rounds to avoid runaway loops).
5. Backend returns `{response: str, citations: list[{document_title, filename, chunk_excerpt}], tool_calls: list[...]}` to the frontend.
6. Frontend appends the response to the message list and renders citations as a small footnote-style list beneath the answer.

---

## 10. System prompt (starting point)

The system prompt must include the operator-provided ranges from section 7 as structured facts. Build it at request time so it's easy to update.

```
You are a water-quality assistant for a single sensor deployment. You answer
questions about the sensor's readings and about authoritative water-quality
documents.

AUTHORITATIVE NORMAL RANGES (operator-provided, take precedence over documents):
- pH: 6.5 to 8.5
- ORP: 200 to 400 mV
- Dissolved oxygen: 5 to 14 mg/L
- Temperature: 32 to 95 °F
- Conductivity (this deployment is {WATER_TYPE}): {RANGE_FOR_WATER_TYPE} µS/cm

You have two tools:
- query_sensor_data: get statistics from the local sensor database
- search_documents: search regulatory and interpretive documents

Rules:
- For questions about the user's actual water, call query_sensor_data.
- For questions about thresholds, normal ranges, or what a metric means:
  - If the question is about whether a reading is normal, use the
    AUTHORITATIVE NORMAL RANGES above. Do not retrieve a document for this.
  - For everything else (what a metric means, why it matters, how it's
    measured, regulatory context), call search_documents.
- For questions that mix both ("is my pH normal?"), call query_sensor_data
  for the reading and compare against the AUTHORITATIVE NORMAL RANGES.
- If a retrieved document chunk disagrees with the AUTHORITATIVE NORMAL
  RANGES, prefer the operator-provided ranges and note the discrepancy
  if it's relevant to the user's question.
- Always cite the document filename when you use information from a document.
- The sensor measures dissolved oxygen, ORP, pH, conductivity, and temperature.
  It does NOT measure pathogens, bacteria, chemicals, or turbidity. If asked
  whether water is safe to swim in or drink, say plainly that the sensor cannot
  answer that and the user should consult local public-health authorities.
- If a tool returns an error or no data, say so. Do not fabricate readings.
- Keep answers short and direct. Cite specific numbers from the data.
```

`{WATER_TYPE}` and `{RANGE_FOR_WATER_TYPE}` are interpolated at request time from the `WATER_TYPE` env var. Iterate on this prompt once you have real conversations to look at — the prompt is not load-bearing for the architecture, but the precedence rule about authoritative ranges is.

---

## 11. Frontend

`frontend/index.html` is a single file. Vanilla JS, no framework.

- One text input pinned to the bottom.
- One scrollable message list above it.
- One "thinking..." indicator while a request is in flight.
- Render assistant messages with their citations as a small list below the message body, each citation showing the document title.
- Configurable backend URL (default `http://localhost:8000`).
- No login, no sidebar, no settings, no styling beyond what's needed for legibility.

---

## 12. Environment

`.env.example`:

```
FIREWORKS_API_KEY=
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cleanearth
LLM_MODEL=accounts/fireworks/models/qwen3-30b-a3b-instruct-2507
EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5
WATER_TYPE=freshwater   # or "saltwater" — controls which conductivity range is treated as normal
```

`docker-compose.yml` runs `pgvector/pgvector:pg16` (or the latest stable pgvector image) exposing 5432, with a volume for persistence. `seed.py` should be idempotent: safe to re-run, skipping documents already ingested (by filename) and skipping CSV rows already loaded (by `device + measured_at`).

---

## 13. Acceptance tests

The baseline is **done** when the system handles these five conversations correctly. "Correctly" means: the answer is factually grounded in the right source (sensor data, document, or operator-provided ranges), citations point to the actual chunk used, and no values are fabricated.

1. **Sensor-only question.**
   User: *"What's my dissolved oxygen been like this week?"*
   Expected: Model calls `query_sensor_data(metric="dissolved_oxygen", time_range="last 7 days", aggregation="mean")` (or similar). Response cites the actual data (mean, min, max, sample count) from the database. No document citation needed.

2. **Document-only question.**
   User: *"Is a pH of 8.2 normal?"*
   Expected: Model recognizes this as a "is this normal" question, uses the **operator-provided range (pH 6.5–8.5)** from the system prompt, and answers that 8.2 is within range. Does **not** retrieve a document for the range itself. May optionally call `search_documents` for additional context on why pH matters, citing the source.

3. **Definitional question.**
   User: *"What does ORP measure?"*
   Expected: Model calls `search_documents("ORP oxidation reduction potential")`. Response explains ORP based on retrieved chunks (likely USGS NFM A6.8), with a citation.

4. **Follow-up question referencing prior answer.**
   User: *(after question 1)* *"How does that compare to what's healthy for aquatic life?"*
   Expected: Model combines the prior sensor result with the operator-provided DO range (5–14 mg/L) and may also call `search_documents` for the EPA DO criteria document for additional aquatic-life-specific context. Cites both the sensor reading from turn 1 and any document chunk used.

5. **Precedence test (catches a regression where the model trusts a document over the operator range).**
   User: *"What's the normal range for pH in surface water?"*
   Expected: Model gives the operator-provided range (6.5–8.5) as authoritative. If it also surfaces a document range (e.g. the EPA Volunteer Manual mentions different values), it should explicitly note that the operator-provided range is the source of truth for this deployment.

If all five work end-to-end, the spine is real. Stop adding to the baseline and start collecting real conversations.

---

## 14. Build order (suggested)

1. `docker-compose up` — Postgres + pgvector running.
2. `schema.sql` applied — tables exist.
3. `seed.py` for documents — ingest, chunk, embed, store. Verify a vector similarity query returns sensible neighbors for a test phrase.
4. `seed.py` for CSV — load sensor data, verify row count.
5. `tools.py` — implement and unit-test the two tools standalone.
6. `llm.py` — implement Fireworks client, verify a no-tool completion works.
7. `main.py` — wire `/chat` with the orchestration loop, no UI yet, test with `curl`.
8. `frontend/index.html` — wire to the backend, run through the four acceptance tests.
9. Stop. Do not start adding features until you have real user questions to learn from.

---

## 15. Deferred (do not build at baseline)

For each item: why it's safe to defer, and the trigger that means "now's the time."

- **Auth / multi-tenancy.** Defer until you know who the users actually are. Trigger: a second user or a customer who needs SSO.
- **Fine-tuning.** Defer until you have example conversations to train on. Trigger: a recurring failure mode that prompt engineering can't fix.
- **Guardrails layer.** Defer until you've observed real outputs. Trigger: a specific failure class you want to catch (e.g. fabricated readings).
- **External-API tools (EPA ECHO, NOAA, USGS APIs).** Defer. Trigger: questions the document store alone can't answer keep coming up.
- **LiteLLM / multi-provider abstraction.** Defer. Trigger: you have a second provider you actually want to use.
- **Dedicated vector DB.** Defer. Trigger: pgvector latency on retrieval exceeds ~500ms p95, or chunk count exceeds ~100K.
- **TimescaleDB.** Defer. Trigger: sensor table queries get slow (won't happen at <1M rows).
- **Sandboxed code execution / Plotly-from-LLM.** Defer. Trigger: users explicitly ask for charts and numeric summaries aren't enough.
- **Streaming responses.** Defer. Trigger: UX feedback that the "thinking..." spinner feels too long.
- **Ingestion UI.** Defer. Trigger: the document curator is updating `docs/` more than once a week.

---

## 16. Open items (need user input before building)

These are marked `TODO (user)` above and gathered here for visibility:

1. Confirm the exact `DATE` format in `water-data.csv`.
2. Confirm the unit for `DISSOLVED OXYGEN` (mg/L or % saturation). Note: operator-provided range is in mg/L, so if the CSV is in % saturation it must be converted at ingest.
3. Confirm the unit for `CONDUCTIVITY` (µS/cm assumed).
4. Confirm the unit for `TEMPERATURE`. Note: operator-provided range is in °F. If the CSV is in °C it must be converted at ingest, or the system prompt must be updated to use °C ranges (32 °F = 0 °C, 95 °F = 35 °C).
5. Set `WATER_TYPE` env var to `freshwater` or `saltwater`.
6. Assign a document corpus owner.
7. Drop the actual sensor manufacturer datasheet(s) into `docs/`.
8. Confirm the privacy posture in section 6.1 matches what your supervisor expects. Specifically: is "Fireworks DPA with no-training clause" the bar, or does the bar require on-prem hosting? These imply very different builds.

Claude Code: if any of these are not resolved before you start, write `seed.py` to detect units defensively where possible (e.g. if every DO value is between 0 and 20, it's mg/L; if every value is between 0 and 100 and clustered above 50, it's likely % saturation), log what was detected, and flag it in stdout so the user can correct course. Unit mismatches between the CSV and the operator-provided ranges will silently produce wrong "is this normal" answers, so this is the highest-risk class of bug.
