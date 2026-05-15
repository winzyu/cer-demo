# Clean Earth RAG — Current Specs

What is built and how it works as of the baseline cut. This is the implementation reference; `BACKLOG.md` tracks what could be improved next. See `README.md` for the original build spec the system is implementing.

---

## 1. Scope (as built)

- Single user, single tenant, single device's worth of sensor data.
- Nine authoritative water-quality documents (EPA, USGS) ingested into a local vector store.
- A FastAPI `/chat` endpoint that answers grounded questions over sensor data + documents via an LLM with two tools.
- A single-file vanilla HTML chat UI.

Items explicitly out of scope per `README.md` §1 remain so: no auth, no multi-tenancy, no fine-tuning, no external API tools, no LiteLLM, no dedicated vector DB, no TimescaleDB, no sandboxed code execution, no streaming, no ingestion UI.

---

## 2. Components

| Layer | Choice |
|---|---|
| LLM | `accounts/fireworks/models/gpt-oss-20b` via Fireworks (OpenAI-compatible) |
| Embeddings | `nomic-ai/nomic-embed-text-v1.5` via Fireworks, 768-dim |
| Vector DB | `pgvector/pgvector:pg16` in Docker, single named volume |
| Backend | FastAPI + uvicorn + psycopg3 + OpenAI SDK + pypdf + tesseract |
| Frontend | One `frontend/index.html`, vanilla JS, no build step |
| Python | uv-managed Python 3.12 venv at `backend/.venv/` |

The model differs from `README.md` §6 (Qwen3 not available on Fireworks). `gpt-oss-20b` was selected for cost and tool-calling support.

---

## 3. File layout

```
clean-earth-rag/
├── docker-compose.yml
├── .env.example / .env
├── SPECS.md             (this file)
├── BACKLOG.md           (improvement queue)
├── backend/
│   ├── main.py          FastAPI app + orchestration loop
│   ├── llm.py           Fireworks client + embed_query helper
│   ├── tools.py         query_sensor_data, search_documents (hybrid)
│   ├── rag.py           thin retrieve() glue
│   ├── seed.py          one-time ingest: docs → chunks → embeddings; CSV → sensor_data
│   ├── schema.sql       documents, chunks, sensor_data
│   ├── requirements.txt
│   └── tests/           46 unit tests
├── frontend/index.html
├── docs/                9 source PDFs/MD (corpus)
├── data/                sensor CSV
└── .ocr_cache/          tesseract output for scanned PDFs
```

---

## 4. Database schema

`backend/schema.sql`, idempotent (`IF NOT EXISTS`).

```sql
CREATE EXTENSION IF NOT EXISTS vector;

documents      (id, filename UNIQUE, title, source_url, ingested_at)
chunks         (id, document_id FK, chunk_index, content,
                embedding VECTOR(768),
                content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED)
sensor_data    (id, device, measured_at, dissolved_oxygen, orp, ph, conductivity, temperature,
                UNIQUE(device, measured_at))

idx_chunks_embedding    IVFFLAT (vector_cosine_ops)  -- created post-seed, lists = sqrt(n)
idx_chunks_content_tsv  GIN
idx_sensor_measured_at  BTREE
```

The `UNIQUE (device, measured_at)` constraint on `sensor_data` enables `ON CONFLICT DO NOTHING` for idempotent CSV reseeding (not in the README schema but required by §12's "skipping rows already loaded" rule).

`content_tsv` is a generated column — Postgres keeps it in sync with `content` automatically.

---

## 5. Ingest pipeline (`backend/seed.py`)

Idempotent. Re-running skips documents already in `documents` (by filename) and CSV rows already in `sensor_data` (by `(device, measured_at)`).

### Document ingest

1. Walk `docs/` for `.pdf` / `.md` / `.txt`.
2. **Text extraction**: pypdf for PDFs, raw read for text/markdown.
3. **OCR fallback**: if `len(text) / n_pages < 50` chars/page, treat as scanned. Render each page via `pdf2image` (200 dpi), run through `pytesseract`, concatenate, cache to `.ocr_cache/<filename>.txt`. Cache is hit on re-run.
4. **Recursive character splitter**: target 3200 chars (~800 tokens), overlap 400 chars (~100 tokens). Tries separators in priority order `["\n\n", "\n", ". ", " ", ""]`; recurses on oversized pieces. Overlap = prepending the prior chunk's tail to the current chunk.
5. **Quality filter** (`is_quality_chunk`): drop chunks where length `< 100 chars`, alpha-ratio `< 50%`, or content matches known PDF boilerplate (`adobe acrobat`, `acrobat reader`, `click here to download`). Drops ~12% of raw chunks.
6. **Embedding**: batches of 32 sent to Fireworks. Each text is prefixed with `search_document:` (nomic's expected task prefix for stored passages).
7. **Insert** into `documents` then `chunks`. Commit per document.
8. After all docs are loaded, create the IVFFlat cosine index with `lists = max(10, min(100, int(sqrt(n_chunks))))`.

### CSV ingest

1. Read `data/*.csv` (the latest by lexicographic sort).
2. Normalize columns to snake_case.
3. **Unit detection** (heuristic, logs warnings on mismatch with operator ranges):
   - DO: max ≤20 → mg/L; max ≤200 → % saturation (flagged).
   - Temp: max >40 → °F; min ≥0 → °C (flagged).
   - Conductivity: max ≤100k → µS/cm.
4. Parse the project's date format `"HH:MM MM/DD/YYYY"` with a custom strptime.
5. Batched `INSERT … ON CONFLICT (device, measured_at) DO NOTHING`.

Current corpus: 9 docs, **523 chunks**. 766 sensor rows spanning 2026-04-21 → 2026-05-07. Detected units: DO=mg/L, temp=°F, conductivity=µS/cm (all consistent with `README.md` §7 operator ranges).

---

## 6. Retrieval (`backend/tools.py:search_documents`)

**Hybrid: dense + BM25 → Reciprocal Rank Fusion.**

1. **Dense arm**: embed query with `search_query:` prefix, fetch top-20 via `ORDER BY c.embedding <=> %s::vector` (pgvector cosine distance).
2. **BM25 arm**: `WHERE c.content_tsv @@ websearch_to_tsquery('english', query) ORDER BY ts_rank_cd(...) DESC LIMIT 20`. `websearch_to_tsquery` handles free-text queries without throwing on weird input.
3. **Fuse**: Reciprocal Rank Fusion with k=60.
   `score(chunk) = Σ over arms of 1 / (60 + rank_in_arm)`.
4. Return top-k (default 5) with shape `{chunk_id, document_filename, document_title, content, score}`. `score` is the RRF score, not raw cosine.

Why hybrid: dense embeddings underweight short acronyms (an "ORP" query is dominated by topic words like "phosphorus" in topically-adjacent chunks). BM25 catches exact tokens that dense misses. RRF is robust to score-scale mismatches across the two arms.

---

## 7. Sensor query (`backend/tools.py:query_sensor_data`)

Signature: `query_sensor_data(metric, time_range, aggregation) -> dict`.

- `metric` ∈ `{dissolved_oxygen, orp, ph, conductivity, temperature}`.
- `aggregation` ∈ `{min, max, mean, median, latest, raw}`. `raw` is capped at 200 rows. `median` uses `PERCENTILE_CONT(0.5) WITHIN GROUP`.
- `time_range`: natural-language. Parsed by regex:
  - `"last N days"` / `"last N weeks"` / `"last day"` / `"last week"`
  - `"today"` / `"yesterday"` / `"this week"`
  - `"YYYY-MM-DD to YYYY-MM-DD"`
  - `"YYYY-MM-DD"` (single day)
- **Reference time** for relative ranges = `max(measured_at)` in the DB, not wall clock. The CSV is historical, so wall-clock-relative ranges would resolve to empty intervals.

Returns: `{metric, time_range_resolved: {start, end}, aggregation, value, unit, n_samples}`. Unknown metric/aggregation/unparsable range returns `{"error": "..."}` for LLM-side recovery.

Units returned match `README.md` §7 (mg/L, mV, unitless, µS/cm, °F).

---

## 8. Orchestration (`backend/main.py:run_chat`)

For each `/chat` request:

1. Build messages: `[system_prompt, *history, user_message]`.
2. Loop up to `MAX_TOOL_ROUNDS = 5` rounds + 1 final:
   - Call `chat.completions.create` with `tools=TOOL_SCHEMAS` if round ≤ 5.
   - On round 6 (only reached if model kept calling tools), drop `tools` to force a final text answer.
   - If the response has `tool_calls`: parse args (defaulting to `{}` on JSON failure), dispatch to `query_sensor_data` or `search_documents`, append `{role: "tool", tool_call_id, content: json.dumps(result)}` to the message list, continue.
   - Otherwise return `ChatResponse(response, citations, tool_calls)`.
3. Citations are accumulated from any `search_documents` tool result. Each chunk becomes a `Citation(document_title, filename, chunk_excerpt[:300])`.
4. Tool traces (`name`, `arguments`, `result`) are also returned for observability.

System prompt is built per request from `WATER_TYPE` env var, which selects the conductivity range (`0-1500` freshwater vs `40000-50000` saltwater). Rest of the prompt is `README.md` §10 verbatim, with the precedence rule: operator ranges > document ranges.

---

## 9. API

`POST /chat`
- Request: `{ "message": str, "history": [{role, content}, ...] }`
- Response: `{ "response": str, "citations": [{document_title, filename, chunk_excerpt}], "tool_calls": [{name, arguments, result}] }`
- Empty `message` → 400.

`GET /health`
- Returns `{ db_ok, db_error, fireworks_configured, model, water_type }`. DB check is `SELECT 1`. Fireworks check is env-var presence (no live probe).

CORS is wide open (`allow_origins=["*"]`) — fine for local demo, would tighten before any deploy.

---

## 10. Frontend (`frontend/index.html`)

- Single file, no build step, no framework.
- Components: one text input pinned to bottom, scrollable message list, "thinking…" indicator, per-message citations rendered as a small `<ul>` deduped by filename.
- Backend URL defaults to `http://localhost:8000`; overridable via `?backend=<url>` query param.
- Maintains conversation history in a JS array and sends prior turns on each `/chat` POST.
- Health line at the top shows model / DB / water-type from `/health`.

---

## 11. Configuration (`.env.example`)

```
FIREWORKS_API_KEY=
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cleanearth
LLM_MODEL=accounts/fireworks/models/gpt-oss-20b
EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5
WATER_TYPE=freshwater
```

`docker-compose.yml` runs `pgvector/pgvector:pg16` on port 5432 with a named volume `cer_rag_pgdata` and a `pg_isready` healthcheck.

---

## 12. Testing

`backend/tests/`, 46 tests total. Run with `backend/.venv/bin/python -m pytest backend/tests/`.

| File | Count | Coverage |
|---|---|---|
| `test_seed.py` | 15 | recursive splitter, date parser, unit detector, OCR-scanned heuristic, quality-chunk filter |
| `test_tools.py` | 17 | time-range parser (8 cases), error paths, all 6 aggregations against real DB, dense-arm retrieval, BM25-arm retrieval ("ORP" → tm9a6.x) |
| `test_main.py` | 9 | system prompt builder, conductivity-range branch, orchestration loop with mocked LLM (no-tool, sensor, search-with-citations, round cap, bad-JSON args), `/health`, empty-message 400 |

Per `CLAUDE.md`: tests mock the OpenAI client (chat + embeddings) but hit the real Postgres.

---

## 13. Operations

### Start
```
docker-compose up -d
backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
backend/.venv/bin/python -m http.server --directory frontend 8001
```

Open `http://localhost:8001/index.html`.

### Re-seed
```
docker exec -i cer_rag_db psql -U postgres -d cleanearth < backend/schema.sql
backend/.venv/bin/python -m backend.seed
```

Schema is idempotent. `seed.py` is idempotent (filename-based skip for docs, ON CONFLICT for sensor rows). OCR cache is hit on re-run, so the 1986 EPA DO PDF doesn't re-OCR.

### Stop
```
pkill -f 'uvicorn backend.main'
pkill -f 'http.server'
docker-compose down                 # data persists in named volume
docker-compose down -v              # also destroys the volume
```

### Common gotchas
- WSL boot auto-starts the system Postgres on port 5432, conflicting with the container. Fix: `sudo pg_ctlcluster 17 main stop` and `sudo sed -i 's/^auto$/manual/' /etc/postgresql/17/main/start.conf`. Or run our container on a different port.
- A `vector type not found in the database` traceback on `POST /chat` means the `vector` extension is missing — usually because the volume was destroyed (`down -v`) and schema/seed weren't re-run.

---

## 14. Privacy posture (current)

Per `README.md` §6.1: all prompts (system + history + retrieved chunks + user message) are sent to Fireworks AI. The architecture relies on a contractual DPA with Fireworks for confidentiality, not on data residency. For this baseline the data is dummy and no DPA is required; before any production data flows, the items in `README.md` §6.1 (signed DPA, ZDR, sub-processor disclosure, etc.) must be in place.
