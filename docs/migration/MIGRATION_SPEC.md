# Migration Spec — Clean Earth RAG Service

Functional specification of the existing FastAPI + pgvector RAG service, derived from the
`backend/` source. This describes **what the system does** so it can be rebuilt on a
different stack. No implementation code is reproduced here.

## 1. System overview

A single-tenant water-quality assistant for one sensor deployment. It exposes a chat
endpoint backed by an LLM tool-calling loop with two tools:

1. **`query_sensor_data`** — statistics over a local time-series of sensor readings (Postgres SQL).
2. **`search_documents`** — hybrid semantic + keyword retrieval over a corpus of authoritative
   water-quality documents (pgvector + Postgres full-text search).

The LLM is instructed to answer **only** from sensor readings, retrieved document chunks, or a
fixed set of operator-provided "normal ranges" in the system prompt; otherwise it must refuse.

**Stack (current):** FastAPI, PostgreSQL 16 + `pgvector`, OpenAI Python SDK pointed at
Fireworks' OpenAI-compatible endpoint (chat + embeddings), psycopg 3.

**Components:**
- `backend/main.py` — FastAPI app, request/response models, tool schemas, system prompt, orchestration loop.
- `backend/tools.py` — the two tool implementations (SQL + hybrid retrieval).
- `backend/llm.py` — LLM/embedding client factory + query embedding helper.
- `backend/rag.py` — thin retrieval wrapper (delegates to `tools.search_documents`).
- `backend/seed.py` — one-time ingestion (documents → chunks+embeddings; CSV → sensor rows).
- `backend/schema.sql` — Postgres DDL.
- `frontend/index.html` — static single-page chat UI (calls `/chat` and `/health` on `localhost:8000`).

---

## 2. HTTP API

Base app title: `Clean Earth RAG`. No API prefix/versioning. **No authentication** on any
endpoint. CORS is fully open: `allow_origins=["*"]`, all methods, all headers.

### 2.1 `GET /health`

- **Auth:** none.
- **Request:** no params, no body.
- **Behavior:** opens a DB connection and runs `SELECT 1`; reports whether the Fireworks API key is configured.
- **Response 200** (always 200, even when DB check fails — failure is reported in the body):

  | field | type | meaning |
  |---|---|---|
  | `db_ok` | bool | DB connectivity check succeeded |
  | `db_error` | string \| null | error string if the DB check threw, else null |
  | `fireworks_configured` | bool | `FIREWORKS_API_KEY` env var is non-empty |
  | `model` | string | value of `LLM_MODEL` env (empty string if unset) |
  | `water_type` | string | value of `WATER_TYPE` env (default `"freshwater"`) |

- **Status codes:** `200` only.

### 2.2 `POST /chat`

- **Auth:** none.
- **Request body** (`application/json`, `ChatRequest`):

  | field | type | required | default | meaning |
  |---|---|---|---|---|
  | `message` | string | yes | — | the user's message |
  | `history` | array of `ChatMessage` | no | `[]` | prior turns |

  `ChatMessage`:

  | field | type | notes |
  |---|---|---|
  | `role` | string | free-form string; passed through to the LLM as-is (typically `"user"` / `"assistant"`; not validated against an enum) |
  | `content` | string | message text |

- **Response body** (`application/json`, `ChatResponse`, status 200):

  | field | type | meaning |
  |---|---|---|
  | `response` | string | the assistant's final text answer |
  | `citations` | array of `Citation` | document chunks surfaced by `search_documents` during this request |
  | `tool_calls` | array of `ToolCallTrace` | full trace of every tool call executed |

  `Citation`:

  | field | type | notes |
  |---|---|---|
  | `document_title` | string | from `documents.title` |
  | `filename` | string | from `documents.filename` |
  | `chunk_excerpt` | string | first 300 chars of chunk content, `"..."` appended if truncated |

  `ToolCallTrace`:

  | field | type | notes |
  |---|---|---|
  | `name` | string | tool name |
  | `arguments` | object | parsed arguments the LLM supplied |
  | `result` | any | raw tool return value (dict for sensor queries, list for document search, or `{"error": ...}`) |

- **Status codes:**
  - `200` — success.
  - `400` — `message` is empty/whitespace (`detail: "message is empty"`).
  - `422` — FastAPI/Pydantic validation error on malformed body (standard FastAPI behavior).
  - `500` — unhandled exception (e.g. `FIREWORKS_API_KEY` not set raises `RuntimeError`; DB connection failure; LLM/embedding API error). These are **not** caught inside `/chat`, so they surface as 500s.

- **Streaming:** none. The endpoint returns a single JSON object after the orchestration loop completes.

---

## 3. Orchestration loop (POST /chat internals)

Per request:

1. Build the message list: `[system prompt] + history (role/content pass-through) + {role:"user", content: message}`.
2. Loop up to **`MAX_TOOL_ROUNDS = 5`** tool-enabled rounds, plus **one final** round with tools disabled (loop runs `MAX_TOOL_ROUNDS + 1 = 6` iterations max; on iterations 1–5 tools are offered, iteration 6 forces a text-only answer).
3. Each round calls the LLM chat-completion. If the model returns tool calls, execute each one, append results as `role:"tool"` messages keyed by `tool_call_id`, and loop again. If the model returns no tool calls, return its content as the final answer immediately.
4. **Citations** are accumulated only from `search_documents` results (each returned chunk becomes one `Citation`). `query_sensor_data` results are traced but not cited.
5. **Round-cap fallback:** if 6 iterations elapse without a tool-free final answer, return the last assistant `content`, or a placeholder string noting the cap was reached.

Tool dispatch maps tool name → implementation; unknown tool names return `{"error": "unknown tool '<name>'"}` (fed back to the model rather than raising).

---

## 4. LLM calls

All LLM traffic goes through the OpenAI Python SDK with `base_url = https://api.fireworks.ai/inference/v1`
(Fireworks OpenAI-compatible API). API key from `FIREWORKS_API_KEY`.

### 4.1 Chat completion (orchestration loop)

- **Model:** `LLM_MODEL` env var. Current value: `accounts/fireworks/models/gpt-oss-20b`.
- **`max_tokens`:** `800` (every round).
- **`tools`:** the two function schemas (§4.3) are attached on rounds 1–5; **omitted** on the final round 6 to force a text answer.
- **`tool_choice`:** not set (model decides; effectively `auto`).
- **`temperature` / `top_p` / penalties:** not set (SDK/provider defaults).
- **Streaming:** disabled (no `stream=True`).
- **System prompt:** single system message, structure in §4.2.
- **Assistant/tool message shape:** assistant turns are re-appended with their `tool_calls` (id/type/function.name/function.arguments); tool results are appended as `{role:"tool", tool_call_id, content: <json-serialized result>}`.

### 4.2 System prompt structure

One assembled system message (`build_system_prompt()`), composed of these blocks in order:

1. **Role framing** — "water-quality assistant for a single sensor deployment."
2. **Authoritative normal ranges** (operator-provided, declared to take precedence over documents):
   - pH: 6.5–8.5
   - ORP: 200–400 mV
   - Dissolved oxygen: 5–14 mg/L
   - Temperature: 32–95 °F
   - Conductivity: depends on `WATER_TYPE` — freshwater `0–1,500` µS/cm, saltwater `40,000–50,000` µS/cm (interpolated into the prompt at build time).
3. **Tool inventory** — names + one-line purpose of the two tools.
4. **Routing rules** — when to call `query_sensor_data` vs `search_documents`; use the authoritative ranges (not a document lookup) to judge whether a reading is "normal"; prefer operator ranges over conflicting document text.
5. **Scope + refusal policy** — in-scope = this sensor's five metrics, retrieved corpus content, and the authoritative ranges. Out-of-scope questions, or tool calls that return nothing useful, must be refused with an **exact fixed refusal sentence** plus one sentence naming what was missing. The sensor explicitly does **not** measure pathogens/bacteria/chemicals/turbidity; safe-to-swim/drink questions must be deflected to public-health authorities. No answering from general world knowledge; no fabricated readings or citations; keep answers short and cite specific numbers.

> Note: this prompt was designed for the routing/refusal behavior added in commit `6c9a05c` ("avoid answering out of scope"). Preserve the exact refusal string if behavioral parity matters.

### 4.3 Tool definitions (function schemas exposed to the LLM)

**`query_sensor_data`** — "Get a statistic from the local sensor database for one of the metrics this device measures."
Parameters (all required):
- `metric` — enum: `dissolved_oxygen`, `orp`, `ph`, `conductivity`, `temperature`.
- `time_range` — string, natural language. Accepted forms: `last N days`, `last N weeks`, `last day`, `last week`, `today`, `yesterday`, `this week`, `YYYY-MM-DD to YYYY-MM-DD`, `YYYY-MM-DD` (single day). ("Now" resolves to the latest reading in the DB, not wall-clock.)
- `aggregation` — enum: `min`, `max`, `mean`, `median`, `latest`, `raw`.

**`search_documents`** — "Semantic search over the corpus of authoritative water-quality documents (EPA, USGS)." Description explicitly steers the model **not** to use it for normal-range lookups (those live in the system prompt).
Parameters:
- `query` — string, required.
- `top_k` — integer, optional, default `5`, min `1`, max `10`.

### 4.4 Embedding calls

- **Model:** `EMBEDDING_MODEL` env var. Current value: `nomic-ai/nomic-embed-text-v1.5`.
- **Dimensions:** 768 (matches DB `VECTOR(768)`).
- **Endpoint:** same Fireworks base URL, `embeddings.create`.
- **Task prefixes (required by nomic-embed-text-v1.5):**
  - Query side (retrieval): input prefixed with `search_query: `.
  - Document side (ingestion): each chunk prefixed with `search_document: `.
  - Dropping these prefixes degrades retrieval quality — must be preserved on migration.
- **Batching:** ingestion embeds in batches of `EMBED_BATCH = 32`. Query embedding is single-item.
- **`max_tokens`/other params:** none set.

---

## 5. Ingestion pipeline (`backend/seed.py`)

One-time, idempotent seeding. Two independent flows: documents → `chunks`, and CSV → `sensor_data`.

> ⚠️ **Path discrepancy (must resolve on migration):** `seed.py` reads documents from
> `ROOT/docs/`, but the corpus currently lives in `ROOT/documents/` (the `docs/` directory was
> deleted — see repo git status). As written, the seeder would find no documents. The CSV flow
> reads from `ROOT/data/` (present). Treat the intended document source as `documents/`.

### 5.1 Document flow

For each file in the source dir with extension `.pdf`, `.md`, or `.txt` (sorted):

1. **Skip if already ingested** — by `documents.filename` uniqueness (idempotent re-run).
2. **Text extraction:**
   - `.md`/`.txt`: read as UTF-8.
   - `.pdf`: extract via `pypdf`. If average extracted chars/page `< 50` (`OCR_MIN_CHARS_PER_PAGE`), treat as **scanned** and run OCR via `pdf2image` (200 DPI) + `pytesseract`. OCR output is cached to `.ocr_cache/<filename>.txt` and reused on later runs. (In this corpus, only `ambient-wqc-dissolved-oxygen-1986.pdf` triggers OCR.)
3. **Chunking** — recursive character splitter:
   - `CHUNK_SIZE_CHARS = 3200` (~800 tokens at 4 chars/token).
   - `OVERLAP_CHARS = 400` (~100 tokens), applied by prepending the previous chunk's trailing 400 chars to each subsequent chunk.
   - Separator priority: `["\n\n", "\n", ". ", " ", ""]`, recursing into oversized pieces with the next separator.
4. **Quality filter** — drop a chunk if any: length `< 100` chars (`MIN_QUALITY_CHARS`); alphabetic-char ratio `< 0.5` (`MIN_ALPHA_RATIO`); or it contains known PDF boilerplate (`"adobe acrobat"`, `"acrobat reader"`, `"click here to download"`, case-insensitive). Documents with zero surviving chunks are skipped entirely.
5. **Insert** — one `documents` row (title/source_url from a hard-coded `DOC_META` map keyed by filename; unknown filenames get `title = filename`, `source_url = NULL`), then embed surviving chunks in batches of 32 and insert `chunks` rows (`chunk_index` sequential from 0). Commit per document.
6. **Vector index** — after ingest, create the IVFFlat index (§6.3) if not present, sizing `lists = clamp(sqrt(chunk_count), 10, 100)`.

### 5.2 CSV / sensor flow

- Reads the **first** `*.csv` (sorted) in `data/`.
- Column header normalization → snake_case: `DEVICE→device`, `DATE→date`, `DISSOLVED OXYGEN→dissolved_oxygen`, `ORP→orp`, `PH→ph`, `CONDUCTIVITY→conductivity`, `TEMPERATURE→temperature`.
- Date format parsed as `%H:%M %m/%d/%Y` (e.g. `02:35 05/07/2026`). Timestamps are **naive** (no timezone attached at insert).
- Numeric cells: `""`, `"NA"`, or unparseable → `NULL`.
- Insert with `ON CONFLICT (device, measured_at) DO NOTHING` (idempotent).
- **Unit detection (heuristic, advisory only):** inspects value ranges to guess units and prints warnings if they contradict the operator ranges (e.g. DO looks like % saturation not mg/L; temperature looks like °C not °F). Detected units are **not** persisted — purely a console warning to the operator. In this dataset DO values (~2–3) fall below the 5–14 mg/L operator range, which the detector would flag.

---

## 6. PostgreSQL schema

Extension: `CREATE EXTENSION IF NOT EXISTS vector;` (pgvector). Target: PostgreSQL 16
(`pgvector/pgvector:pg16` image).

### 6.1 `documents`

| column | type | constraints |
|---|---|---|
| `id` | `SERIAL` | PK |
| `filename` | `TEXT` | NOT NULL, UNIQUE |
| `title` | `TEXT` | NOT NULL |
| `source_url` | `TEXT` | nullable |
| `ingested_at` | `TIMESTAMPTZ` | default `NOW()` |

### 6.2 `chunks`

| column | type | constraints |
|---|---|---|
| `id` | `SERIAL` | PK |
| `document_id` | `INTEGER` | FK → `documents(id)` ON DELETE CASCADE |
| `chunk_index` | `INTEGER` | NOT NULL |
| `content` | `TEXT` | NOT NULL |
| `embedding` | `VECTOR(768)` | nullable |
| `content_tsv` | `TSVECTOR` | GENERATED ALWAYS AS `to_tsvector('english', content)` STORED |

Indexes on `chunks`:
- `idx_chunks_content_tsv` — **GIN** on `content_tsv` (full-text / BM25-style search). Created in `schema.sql`.
- `idx_chunks_embedding` — **IVFFlat** on `embedding` using `vector_cosine_ops`, `WITH (lists = <clamp(sqrt(n),10,100)>)`. Created **post-load** by `seed.py`, not in `schema.sql`. (Cosine distance operator `<=>` is used at query time.)

### 6.3 `sensor_data`

| column | type | constraints |
|---|---|---|
| `id` | `SERIAL` | PK |
| `device` | `TEXT` | NOT NULL |
| `measured_at` | `TIMESTAMPTZ` | NOT NULL |
| `dissolved_oxygen` | `NUMERIC` | nullable |
| `orp` | `NUMERIC` | nullable |
| `ph` | `NUMERIC` | nullable |
| `conductivity` | `NUMERIC` | nullable |
| `temperature` | `NUMERIC` | nullable |
| — | — | UNIQUE `(device, measured_at)` |

Index: `idx_sensor_measured_at` — B-tree on `measured_at`.

---

## 7. Retrieval pipeline (`search_documents`)

Hybrid retrieval fusing dense vector search and Postgres full-text search.

1. **Guard:** empty query or `top_k <= 0` → return `[]`.
2. **Embed query** — via `embed_query` with `search_query: ` prefix → 768-dim vector.
3. **Dense branch:** `ORDER BY c.embedding <=> %s::vector LIMIT 20` — cosine distance (`<=>`), fetch `HYBRID_FETCH = 20`. Joins `chunks` → `documents`.
4. **Lexical (BM25-ish) branch:** `WHERE c.content_tsv @@ websearch_to_tsquery('english', query) ORDER BY ts_rank_cd(...) DESC LIMIT 20`. `websearch_to_tsquery` tolerates arbitrary free text (quotes, OR, `-negation`). Catches acronyms/exact tokens (e.g. "ORP") that dense underweights.
5. **Fusion — Reciprocal Rank Fusion (RRF):** each doc's score = Σ over rankers of `1 / (RRF_K + rank + 1)`, with `RRF_K = 60`. Merge both ranked lists by `chunk_id`, sort by fused score desc, take **`top_k`** (default 5, caller-capped 1–10).
6. **Return shape:** list of `{chunk_id, document_filename, document_title, content, score}` (score = fused RRF score). These become `Citation`s in the response.

- **Distance metric:** cosine (dense) + `ts_rank_cd` (lexical).
- **top-k:** default 5, min 1, max 10 (per tool schema); each branch fetches 20 pre-fusion.
- **Filters:** none — retrieval spans the entire corpus (no per-document/metadata filtering).

`backend/rag.py::retrieve` is a thin passthrough to `search_documents` (same behavior).

---

## 8. Sensor query pipeline (`query_sensor_data`)

1. **Validate** `metric` ∈ five allowed columns and `aggregation` ∈ {min, max, mean, median, latest, raw}; invalid → `{"error": ...}`.
2. **Reference time:** `MAX(measured_at)` from `sensor_data` is used as "now" for relative ranges (the CSV is a historical snapshot; wall-clock would yield empty intervals). Empty table → falls back to `datetime.now(utc)`.
3. **Parse `time_range`** into `[start, end]` (see accepted forms in §4.3). Unparseable → `{"error": ...}` with a hint.
4. **Aggregate** over `measured_at BETWEEN start AND end`:
   - `min`/`max`/`mean`/`median` → `MIN`/`MAX`/`AVG`/`PERCENTILE_CONT(0.5) WITHIN GROUP`, plus a `COUNT`.
   - `latest` → most recent non-null reading in range + total count.
   - `raw` → up to `RAW_LIMIT = 200` non-null rows ordered by time (capped to protect the prompt).
5. **Return:** `{metric, time_range_resolved:{start,end}, aggregation, value, unit, n_samples}`. Units: DO `mg/L`, ORP `mV`, pH `unitless`, conductivity `µS/cm`, temperature `°F`. Errors returned as `{"error": ...}` so the LLM can recover mid-loop rather than crashing the request.

---

## 9. Configuration / environment variables

Loaded via `python-dotenv` (`.env`). Values redacted; names + purpose:

| var | purpose | notes / current value |
|---|---|---|
| `FIREWORKS_API_KEY` | auth for Fireworks chat + embedding APIs | **secret — redact.** Missing key → `/chat` raises 500; `/health` reports `fireworks_configured:false`. |
| `DATABASE_URL` | Postgres DSN | e.g. `postgresql://postgres:postgres@localhost:5432/cleanearth` (contains credentials — redact in prod). |
| `LLM_MODEL` | chat-completion model id | `accounts/fireworks/models/gpt-oss-20b`. |
| `EMBEDDING_MODEL` | embedding model id | `nomic-ai/nomic-embed-text-v1.5` (768-dim). Defaulted in code if unset. |
| `WATER_TYPE` | selects conductivity normal range in system prompt | `freshwater` (default) or `saltwater`. |

Hard-coded (not env): Fireworks base URL `https://api.fireworks.ai/inference/v1`;
`MAX_TOOL_ROUNDS=5`; chunking constants; `HYBRID_FETCH=20`; `RRF_K=60`; `RAW_LIMIT=200`;
chat `max_tokens=800`; CORS `*`.

**Runtime deps:** FastAPI 0.115.5, uvicorn 0.32.1, psycopg[binary] 3.2.3, pgvector 0.3.6,
openai 1.57.0, pypdf 5.1.0, pdf2image 1.17.0, pytesseract 0.3.13, python-dotenv 1.0.1
(+ pytest/httpx for tests). System deps for OCR: poppler (pdf2image) + tesseract.

---

## 10. The corpus

### 10.1 Documents

Source dir (intended): `documents/`. 9 authoritative EPA/USGS documents are cataloged in
`DOC_META` (title + source URL). A 10th file, `documents/README.md`, is a manifest but **would
also be ingested** by the seeder (no `DOC_META` entry → title = filename); exclude it on
migration if undesired.

Character/token counts below are from extracted text (pypdf, or the OCR cache for the scanned
doc), matching what the ingester would chunk. Tokens estimated as chars/4.

| file | pages | chars | ~tokens | extraction |
|---|---:|---:|---:|---|
| volunteer_stream_monitoring_a_methods_manual.pdf | 227 | 466,381 | 116,595 | pypdf |
| nutrient-lakes-reservoirs-report-final.pdf | 127 | 264,229 | 66,057 | pypdf |
| rwqc2012.pdf | 69 | 206,058 | 51,514 | pypdf |
| tm9a6.2.pdf | 44 | 142,810 | 35,702 | pypdf |
| ambient-wqc-dissolved-oxygen-1986.pdf | 54 | 133,416 | 33,354 | **OCR** (scanned) |
| aquatic-life-criteria-table.md | — | 66,001 | 16,500 | text |
| tm9a6.8.pdf | 24 | 58,075 | 14,518 | pypdf |
| Dissolved Oxygen and Water _ U.S. Geological Survey.pdf | 4 | 13,008 | 3,252 | pypdf |
| nutrient-lakes-reservoirs-factsheet-final.pdf | 2 | 6,577 | 1,644 | pypdf |
| README.md (manifest; ingested if not excluded) | — | 953 | 238 | text |
| **TOTAL (all 10 files)** | **575** | **1,357,508** | **~339,377** | |
| **TOTAL (9 authoritative docs, excl. README.md)** | **575** | **1,356,555** | **~339,139** | |

- **File count:** 9 authoritative documents (10 ingestible files including `README.md`).
- **Total characters:** ~1.357M (extracted text).
- **Estimated tokens (chars/4):** ~339K.
- **Chunk estimate:** at 3,200 chars/chunk with 400-char overlap (~2,800 net advance per chunk after the first), the corpus yields **roughly 480–490 raw chunks** before the quality filter drops PDF-noise chunks. (Exact count depends on separator boundaries; run the seeder to get the authoritative number.)

### 10.2 Sensor CSV

- File: `data/water-data-dev_860322068098448-04_29_2018-05_06_2026.csv`.
- Columns: `DEVICE, DATE, DISSOLVED OXYGEN, ORP, PH, CONDUCTIVITY, TEMPERATURE`.
- Rows: **765** data rows (+ header). Single device: `CER Conference Pod`.
- Date range in data: `04/21/2026` → `05/07/2026` (DATE format `HH:MM MM/DD/YYYY`).
- Observed value characteristics: DO ~2–3 (below the 5–14 mg/L operator range → unit detector flags it), pH ~7.7–8.7, ORP ~120–130 mV, conductivity ~400–420 µS/cm, temperature ~63–66 °F.

---

## 11. Migration checklist / gotchas

- [ ] **Fix the document source path:** seeder reads `docs/` but corpus is in `documents/`. Reconcile before seeding.
- [ ] **Preserve nomic task prefixes** (`search_query:` / `search_document:`) exactly, or retrieval quality drops.
- [ ] **Embedding dimension 768** must match the vector column and the chosen embedding model.
- [ ] **IVFFlat index is created post-load** (not in DDL) with data-dependent `lists`; replicate or substitute HNSW deliberately. Cosine ops (`<=>`) assumed.
- [ ] **Hybrid retrieval** depends on the generated `content_tsv` column + GIN index + RRF fusion (k=60, fetch 20/side). A pure-vector rebuild changes results.
- [ ] **No auth + open CORS** — acceptable for a demo; add auth before any real deployment.
- [ ] **Timestamps:** CSV parsed as naive datetimes but stored in `TIMESTAMPTZ`; relative time ranges anchor to `MAX(measured_at)`, not wall-clock. Preserve this or all relative queries break against the historical snapshot.
- [ ] **Exclude `documents/README.md`** from ingestion if you don't want the manifest chunked.
- [ ] **Preserve the exact refusal string** and scope rules in the system prompt for behavioral parity.
- [ ] **OCR toolchain** (poppler + tesseract) required for the one scanned PDF; the `.ocr_cache/` result can be shipped to skip re-OCR.
