# Clean Earth RAG — Backlog

Improvements to the baseline implementation, ordered roughly by impact-per-effort. `SPECS.md` describes the current system; this file is the queue of "what to do next."

`README.md` §15 lists items deliberately deferred from the baseline (auth, fine-tuning, dedicated vector DB, etc.) with their own trigger conditions; those are not duplicated here. This file focuses on quality-of-implementation improvements within the current architecture.

---

## Suggested first bundle (~60 min)

Highest visible quality lift, lowest effort: **#1 + #2 + #4 + #8**. After that, `README.md` §14 step 9 advice applies: stop adding features and collect real conversations before iterating further.

---

## Quick wins (each < 30 min)

### 1. Frontend doesn't render markdown
Assistant messages contain markdown (tables, bold, lists, headings). The frontend currently writes `msg.body.textContent = body`, so tables show as pipes-and-dashes, `**bold**` renders as literal asterisks, lists render as raw hyphens.

**Fix.** Add `marked` (~30 KB) + `DOMPurify` from a CDN; replace `b.textContent = body` with `b.innerHTML = DOMPurify.sanitize(marked.parse(body))`. Sanitization is mandatory once you flip to `innerHTML`.

### 2. Strip `gpt-oss-20b`'s `【commentary:functions.X】` markers
The model emits internal annotation markers in response text (e.g. `【commentary:functions.search_documents#25】`). They survive into the rendered message.

**Fix.** Strip with a regex in `run_chat` before returning:
```python
import re
text = re.sub(r"【[^】]*】", "", text)
```

### 3. Citation hallucination in prose
The model sometimes writes a confident citation in the response body that doesn't exist in the corpus (e.g. "EPA Meaningful Water Quality Parameters"), while the structured `citations[]` field has the actual sources.

**Fix.** Tighten the system prompt to instruct the model not to mention sources by name in prose — those go in the citations footer. Or move citation responsibility entirely to the structured response by having the model return chunk IDs it relied on.

### 4. Friendly date label in `query_sensor_data` output
Model summarizes "last week" as "May 4-5" when the resolved range is May 4 → May 7. Cause: it's reformatting the raw ISO strings poorly.

**Fix.** Add a `time_range_label` field to the tool's return value with a human-friendly string (e.g. `"Mon May 4 – Thu May 7, 2026"`) and prompt the model to use it verbatim.

### 5. `/health` doesn't probe Fireworks
Currently only checks that `FIREWORKS_API_KEY` env var is set, not that it's valid.

**Fix.** Issue a cheap call (e.g. `HEAD /v1/models`) at startup or on `/health`. Cache the result for ~60 s so `/health` stays cheap.

### 6. Connection pooling
Each `/chat` opens a new psycopg connection and calls `register_vector(conn)`. Both are non-trivial.

**Fix.** Use `psycopg_pool.ConnectionPool` initialized at FastAPI startup; check out a connection per request.

### 7. Serve the frontend from FastAPI
Two processes to start is one too many. The frontend is a single static file.

**Fix.** Mount `app.mount("/", StaticFiles(directory="frontend", html=True))`. Drop the `http.server` step from operations.

### 8. Sensor manufacturer datasheet
`README.md` §16 item 7 still open. RAG has no coverage for "is this reading plausible" / sensor accuracy / calibration / failure modes.

**Fix.** Drop the datasheet PDF(s) into `docs/`, add to `seed.DOC_META`, re-run seed.

---

## Medium effort (30 min – 2 hr)

### 9. Pydantic-validated tool args
Tool functions parse raw dicts. An LLM that passes a non-string `metric` or a malformed `time_range` gets a generic dict-key error.

**Fix.** Define a Pydantic model per tool and surface `ValidationError` messages back to the LLM verbatim. Better self-correction in the orchestration loop.

### 10. Conversation telemetry
No record of what users asked, what was retrieved, or what the model returned. Crucial for prompt iteration.

**Fix.** Log each `/chat` exchange (request, system prompt hash, tool calls + results, final response, latency) to a `chat_logs` table or a JSONL file. Add a flag to redact prompts on demand for privacy.

### 11. Conversation persistence
Reloading the frontend loses history because it lives in a JS array.

**Fix (light).** Persist `history` to `localStorage` keyed by a session id.
**Fix (heavier).** Server-side session storage in a `chats` table — opens the door to multi-device but introduces session management (and adjacent auth concerns).

### 12. Round-trip-safe `score` semantics
The retrieval `score` field changed from cosine similarity (0–1) to RRF score (~0.01–0.05) when hybrid retrieval was introduced. Callers can't infer which they have.

**Fix.** Either rename to `rrf_score` everywhere, or return both: `rrf_score` and `dense_cosine` (when available).

### 13. ORP corpus depth
`README.md` §5 anticipated this: USGS NFM A6.8 is the only canonical ORP source. Queries about ORP that don't match that doc fall back on weaker sources or the model's prior.

**Fix.** Add a vetted secondary source (YSI or Hach technical notes). Mark provenance as manufacturer-authored in `documents.source_url`.

### 14. Long-conversation handling
The `history` array grows unbounded. Long threads will eventually exceed the model's context window.

**Fix (light).** Keep the last N turns.
**Fix (better).** Summarize older turns into a single system note inserted after the system prompt.

### 15. Frontend XSS hardening
Becomes mandatory the moment #1 ships (innerHTML + markdown). Without sanitization, a chunk excerpt or a tool result could inject script tags.

**Fix.** `DOMPurify.sanitize(...)` on every assistant-rendered string. Bundled with #1.

### 16. CORS lockdown
`allow_origins=["*"]` is wide open. Fine for `localhost`, not fine the moment this is reachable from anywhere else.

**Fix.** Read an `ALLOWED_ORIGINS` env var; default to `http://localhost:8001`.

---

## Larger / more speculative

### 17. Streaming responses
`README.md` §15 deferred this with the trigger "UX feedback that the spinner feels too long." Tool-call rounds plus generation can land 5–15 seconds. Adding SSE / `StreamingResponse` materially improves perceived latency. Non-trivial because of the tool-call loop — easiest path is to stream only the final text turn, after all tool calls are done.

### 18. Reranker
Top-20 hybrid → cross-encoder rerank → top-5. Closes the residual citation-quality gap without changing the rest of the architecture. Trade-off: +500 ms per query and an extra Fireworks call. Worth measuring quality uplift on a small eval set first.

### 19. Switch IVFFlat → HNSW
HNSW is better for dynamic corpora (no re-cluster needed) and generally has better recall at the same latency. `README.md` §15 lists vector-DB upgrades as deferred until `p95 > 500 ms` or `chunks > 100K`; HNSW is a strictly-within-pgvector upgrade and could come earlier if recall becomes an issue. Today's 523 chunks don't justify it.

### 20. Multi-device support
`WATER_TYPE` and operator ranges are global env-var driven. The README anticipates per-device attributes (§7: "this becomes a per-device attribute"). Touches schema (`devices` table), system-prompt construction (look up per-device), and the tool signatures (need a device id).

### 21. Per-tool error-recovery prompts
Right now a `query_sensor_data` returning `{"error": "could not parse time_range 'foo'"}` is surfaced raw to the model. The model usually recovers, but specific error → specific retry guidance would be more reliable.

**Fix.** Prefix error dicts with a model-readable hint, e.g. `{"error": "...", "hint": "Try a recognized form: 'last 7 days', 'this week', 'YYYY-MM-DD to YYYY-MM-DD'."}`.

### 22. Evaluation harness
No automated way to detect retrieval/answer-quality regressions. Acceptance tests (`README.md` §13) are manual end-to-end checks.

**Fix.** A small `evals/` directory with 20-30 canned conversations and assertions over retrieved doc filenames, sensor tool calls, and citation presence. Run on every meaningful change.

### 23. Larger model option behind a flag
`gpt-oss-20b` is cheap and adequate but accounts for the citation-discipline issues in #3. Make `LLM_MODEL` easy to swap to `gpt-oss-120b` or `kimi-k2p6` for evaluation runs, without recoding.

---

## Project-planning additions (2026-06-26 — Gilligan replacement scope)

Net-new scope from the Gilligan-chatbot planning round and the meeting notes. These expand the file's original charter (which deliberately excluded README §15 deferred features) because several of those deferrals have been pulled forward. Sequencing and decision gates for all of these live in `timeline.md`; this section is the itemized queue. Items that overlap an existing backlog entry are cross-referenced rather than duplicated.

### Decision gates (resolve before downstream build)
- **G1 — Target stack & data store.** Undecided. Three candidates: (A) RAG standalone, (B) hybrid — keep FastAPI + pgvector brain, adapt sensor data layer, (C) full migration to the Node/Express + Firestore stack. Blocks the data, real-data, and frontend work. See `timeline.md` Phase 0.
- **G2 — Report scope.** Mostly resolved by the report template (`report/datapod-water-quality-report-template.md (1).pdf`): fixed six-section structure, tables + prose, **no visualizations in v1**. Two sub-gates remain: G2a site-baseline definition, G2b event-detection context source (below).
- **G3 — Site-baseline definition.** Is §2's "Site Baseline" the operator-provided normal range, or a value computed from historical per-site data? Gates the §2 flag logic.
- **G4 — Event-detection context.** Does §4 run on sensor signals alone, or are rainfall / tidal / vessel-activity context fed in manually? Open-internet sourcing is closed. Gates §4.
- **G5 — Frontend responsiveness** (mobile/tablet y/n) and **G6 — redesign vs. match existing site style.** Gate the Next.js chatbot page.

### New features
- **Turbidity metric (NTU).** Add end-to-end: `schema.sql` column, `seed.py` unit detection, `tools.py` metric enum, operator range, system prompt. **0 is a valid reading for turbidity and ORP — do not flag 0 as erroneous for these two.** Report §2 depends on this.
- **Report generation (template-based).** Build to the six-section template. **Design principle: compute vs. narrate.** Every number/flag/status is produced deterministically in code (no LLM); the LLM only narrates pre-computed facts. This eliminates numeric hallucination and makes the numeric layer unit-testable.
  - Programmatic (no LLM): header/metadata, §2 parameter table (Min/Max/Mean/Median reuse `query_sensor_data` aggregations; Flag = deterministic baseline comparison), §5 data-quality metrics.
  - LLM-narrated over computed inputs: §1 Summary, §3 Parameter Analysis prose, §4 Event-Detection interpretation, §6 Recommendations.
  - Build order: §2+header → §3 → §5 → §6 → §4 (event detection last; its own spike).
- **Site baseline + flag logic.** Per-site, per-parameter baseline (min–max) and computed Flag (Normal / Elevated / Low / Exceedance). New data requirement; see G3.
- **Site/device metadata store.** Coordinates, water-body type, client/contract, per-sensor calibration dates — none exist in `sensor_data` today. Needed for the report header and §5.
- **Event detection (§4).** Classify correlated multi-parameter movements into the template taxonomy (Sewage / Algal bloom / Stormwater / Industrial / Thermal / Saltwater intrusion / Acidic input / Hypoxia / Inconclusive) with window, severity, movements. Detection is deterministic; interpretation is LLM. Riskiest report piece; see G4.
- **Faulty / erroneous sensor data handling + recalibration guidance.** Detect/flag bad readings, surface "device error / needs recalibration," ground guidance in a sensor manual (source-of-truth only). **Consolidate with report §5 Data Quality — same workstream.** Requires the sensor datasheet (= existing #8).
- **Document management UI + auto-seed.** Upload + delete source-of-truth docs, auto-seed on upload. Pulls forward README §15's deferred ingestion UI.

### Behavioral / quality changes
- **Raise or remove `MAX_TOOL_ROUNDS`** in `main.py`. One report = all 6 metrics × multiple aggregations + retrieval in a single answer, well past the current 5-round cap. Hard dependency for report generation.
- **System-prompt personality** — friendly, steers users toward water-quality questions.
- **No public links to source-of-truth documents** in responses (privacy/security; net-new, not previously tracked).
- Markdown rendering (= **#1**, bundle XSS **#15**); inline quote citations + show retrieved chunks (relates to **#3**).

### Migrations & integration
- **Frontend → Next.js** dedicated chatbot page; re-point dashboard `services/gilligan.js` from `/gilligan/*` to the new `/chat`. See G5/G6.
- **Backend migration** to target stack — gated on G1.
- **Real-data integration (backend-mediated).** Abstract `query_sensor_data` behind a data-source interface with swappable adapters: CSV/Postgres now, device-API adapter later (forwards the user's JWT, decodes the production API's numeric-keyed metrics — pH=99, DO=97, ORP=98, conductivity=100, temp=102, **turbidity code TBD**). First real-data step is an access-discovery task: the production `/water/*` + `/devices` backend is not in the available repos and its URL is injected at deploy via `NEXT_PUBLIC_API_BASE_URL`. Pivot options: production endpoint (read-only, scoped test token) vs. a QA/dev mirror.

### Demo / docs
- **Mock conversation set** for testing + demo; optionally LLM-generated from data + context (adjacent to **#22** eval harness).
- **Reconcile README model note** — README says Qwen3; deployment is `gpt-oss-20b`.

---

## Won't-fix unless triggered

These are flagged so they're not forgotten, but they should not be worked on at baseline:

- **Auth / multi-tenancy.** Per `README.md` §15 trigger: a second user.
- **Fine-tuning.** Trigger: recurring failure mode prompt eng can't fix.
- **Dedicated guardrails layer.** Trigger: a specific failure class observed in production.
- **LiteLLM.** Trigger: a second provider we want to use.
- **Dedicated vector DB.** Trigger: `p95 > 500 ms` or `> 100K chunks`.
- **TimescaleDB.** Trigger: sensor queries slow at `> 1M` rows (not happening soon).
- **Sandboxed code execution for charts.** Trigger: users explicitly ask for charts.
- **Document-ingestion UI.** Trigger: `docs/` updated more than once a week.
