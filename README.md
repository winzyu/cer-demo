# Clean Earth RAG — Node/Express + Firestore service

A water-quality assistant that answers questions grounded in a single sensor deployment's real
readings and a corpus of authoritative water-quality documents.

Migrated from the original FastAPI + Postgres/pgvector implementation to **Node/Express +
Firestore**.

---

## Where do I go?

**If you read one thing first:** [`docs/HANDOFF.md`](docs/HANDOFF.md) — current state, open
decisions, and the traps that cost time.

| I want to… | Go to |
|---|---|
| Understand what this is and what's built | [§1 Overview](#1-overview) · [`docs/SPECS.md`](docs/SPECS.md) |
| Get it running in 5 minutes with no credentials | [§3 Quick start](#3-quick-start) |
| Get credentials (Fireworks / Firestore / device API) | [§2 Credentials](#2-credentials) |
| **Run the server a particular way** (sensor tool on/off, pick a retrieval arm, debug mode) | **[§4 Run recipes](#4-run-recipes)** ← *the copy-paste section* |
| Look up one environment variable | [§5 Configuration reference](#5-configuration-reference) |
| Set up a retrieval arm (direct-feed / vector / pgvector) | [§6 Retrieval arms](#6-retrieval-arms) |
| Turn on sensor querying and check it reads real pods | [§7 Sensor querying](#7-sensor-querying) |
| Query sensor data by hand with `curl` | [§7c Query the device API directly](#7c-query-the-device-api-directly) |
| Call the sensor layer from my own code (e.g. report generation) | [§7d Programmatic access](#7d-programmatic-access) |
| See every npm script | [§8 Scripts](#8-scripts) |
| Find a file | [§9 Project layout](#9-project-layout) |
| Know the HTTP contract | [§10 Endpoints](#10-endpoints) |
| Fix something that's broken or silently wrong | [§11 Troubleshooting](#11-troubleshooting) |
| Understand *why* a decision was made | [`docs/timeline.md`](docs/timeline.md) (phases + ◆ gates) |

### Companion docs

| doc | what it covers |
|---|---|
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | **Start here.** State, open decisions, silent-failure traps. |
| [`docs/SPECS.md`](docs/SPECS.md) | Architecture as built today, section by section. |
| [`docs/timeline.md`](docs/timeline.md) | Phased plan, and the **◆ decision gates** that block work. |
| [`docs/RETRIEVAL_BAKEOFF.md`](docs/RETRIEVAL_BAKEOFF.md) | The direct-feed vs RAG cost experiment (◆G7). |
| [`docs/migration/DEVICE_API.md`](docs/migration/DEVICE_API.md) | The sensor API contract, verified live. **Read §12 before trusting any reading.** |
| [`docs/migration/MIGRATION_SPEC.md`](docs/migration/MIGRATION_SPEC.md) | Behaviour of the legacy FastAPI system being ported. |
| [`docs/migration/CONVENTIONS.md`](docs/migration/CONVENTIONS.md) | Coding conventions this repo follows. |
| [`docs/EVAL_FIXTURES.md`](docs/EVAL_FIXTURES.md) · [`eval/README.md`](eval/README.md) | The committed question set and captured sweeps. |

---

## 1. Overview

**What works today:** `POST /api/v1/chat` end to end — retrieval adapter selection, prompt
assembly, a Fireworks answer, multi-turn history, optional streaming, **and sensor querying against
the real device API** via `query_sensor_data` and a tool-round loop.

| phase | state |
|---|---|
| **N1** — chat spine + retrieval seam | ✅ complete |
| **N2** — retrieval bake-off | ⏳ all three arms built, sweep captured, **awaiting grading** (◆G7 open) |
| **N3** — sensor querying + tool loop | ✅ built, **behind `SENSOR_TOOL`, default off** |
| **N4+** — per-device water type, reports, UI | not started |

**Two defaults will surprise you on a fresh checkout:**

- `DEFAULT_RETRIEVAL=stub` → answers come from three lines of placeholder text. Pick an arm in
  [§6](#6-retrieval-arms).
- `SENSOR_TOOL=false` → the bot has **no access to sensor readings at all** and will refuse to
  answer questions about them. Turn it on in [§7](#7-sensor-querying).

> **Why is the sensor tool off by default?** Enabling it appends a tool block to the system prompt,
> and that prompt is a **pinned control** for the Phase N2 bake-off. ◆G7 is still open — the sweep is
> captured but ungraded — so changing the default prompt would void all three arms. With the flag
> off the prompt is byte-identical to the one they ran against (pinned by a SHA-256 in
> `test/unit/prompt.test.ts`). Turning it on for normal use is fine. **Do not capture bake-off arms
> with it on.**

### Stack

Node.js 18+ · TypeScript (CommonJS, strict) · Express 4 (`helmet`, `cors`, `morgan`) ·
Firestore (`@google-cloud/firestore`) · Fireworks via the `openai` SDK · Jest + `ts-jest` +
`supertest`.

---

## 2. Credentials

> **You need none of these to boot the service or pass `/health`.** Startup opens no connections.

| credential | unlocks | section |
|---|---|---|
| **Fireworks key** | any chat answer; embeddings for the RAG arms | [§2a](#2a-fireworks-ai) |
| **Firestore auth + indexes** | `CORPUS_SOURCE=firestore` and the `firestore-vector` arm | [§2b](#2b-google-cloud--firestore) |
| **Device API token** | `query_sensor_data` — all sensor readings | [§2c](#2c-clean-earth-device-api) |

### Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| **Node.js** | 18+ | everything |
| **npm** | ships with Node | everything |
| **Google Cloud SDK** (`gcloud`) | latest | Firestore auth **and creating the two indexes** ([§2b](#2b-google-cloud--firestore)) |
| **Docker** | latest | *optional* — container run path and the dev-only `pgvector-rag` sidecar |

### 2a. Fireworks AI

1. Create an account at **https://fireworks.ai**.
2. **API Keys** → generate a key → put it in `.env` as `FIREWORKS_API_KEY`.
3. Model ids are already in `.env.example` (`accounts/fireworks/models/gpt-oss-20b`,
   `nomic-ai/nomic-embed-text-v1.5`). **Confirm the exact id in the console first** — the serverless
   catalogue rotates.

### 2b. Google Cloud / Firestore

1. Create or pick a project at https://console.cloud.google.com.
2. Enable the **Firestore API**, create a **Native mode** database. The default one is literally
   named `(default)`.
3. Authenticate:
   ```bash
   gcloud auth application-default login
   ```
4. Set `FIRESTORE_PROJECT_ID` and `FIRESTORE_DATABASE_ID` in `.env`.

   > **Cost note:** the "Always Free" daily quota has historically applied to the **`(default)`**
   > database — a *named* database can bill from the first read. Keep `FIRESTORE_DATABASE_ID=(default)`
   > unless you have a reason not to.

   *For CI/deployment:* download a service-account JSON, save as `serviceAccountKey.json`
   (git-ignored), export `GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json`.

5. **Create the two indexes.** Firestore will not build these on demand, and **neither failure is
   obvious**: without the composite index the direct-feed query fails outright; without the vector
   index `findNearest` returns **nothing at all, with no error**.

   ```bash
   # Direct-feed slice query: equality on inDirectFeedSlice + orderBy filename.
   gcloud firestore indexes composite create \
     --project="$FIRESTORE_PROJECT_ID" --database='(default)' \
     --collection-group=corpus_documents \
     --query-scope=collection \
     --field-config=field-path=inDirectFeedSlice,order=ascending \
     --field-config=field-path=filename,order=ascending

   # Vector search for the firestore-vector arm. 768 must match the embedding model.
   gcloud firestore indexes composite create \
     --project="$FIRESTORE_PROJECT_ID" --database='(default)' \
     --collection-group=corpus_chunks \
     --query-scope=collection \
     --field-config=field-path=embedding,vector-config='{"dimension":"768","flat":"{}"}'
   ```

   Field order in the first command must match the query: equality field first, `orderBy` second.
   Confirm both reach `READY` before seeding:

   ```bash
   gcloud firestore indexes composite list --project="$FIRESTORE_PROJECT_ID" --database='(default)'
   ```

   > Requires `roles/datastore.indexAdmin` (or owner). Firestore must be **Native mode, Standard
   > edition** — Enterprise has no `findNearest`.

### 2c. Clean Earth device API

Required for all sensor readings. **Both values go in `.env`** (git-ignored) — never in
`.env.example`, never in code.

| variable | value |
|---|---|
| `DEVICE_API_BASE_URL` | Backend base URL **including `/api/v1`**. Production: `https://cer-api-98242557946.us-central1.run.app/api/v1`. Local: `http://localhost:5001/api/v1`. |
| `DEVICE_API_TOKEN` | **Dev only.** A bearer JWT. |

Getting a token:

1. **From the dashboard** (fastest): log in → DevTools → Application → Local Storage → copy `token`.
2. **Directly:**
   ```bash
   curl -s -X POST "$DEVICE_API_BASE_URL/users/login" \
     -H 'Content-Type: application/json' \
     -d '{"email":"you@example.com","password":"…"}'
   ```

> ⚠️ **There is no QA mirror.** Any live call reads **production** data — a real customer fleet.
> Read-only, no bursts. See [`docs/migration/DEVICE_API.md`](docs/migration/DEVICE_API.md) §3.
>
> ⚠️ **Tokens never expire** and are **org-scoped**. A leaked one is valid forever; a wrong-org one
> returns a short, plausible device list rather than an error.
>
> `DEVICE_API_TOKEN` is a development shortcut. In production the service forwards the *caller's*
> JWT, so a chat user only ever sees their own devices.

---

## 3. Quick start

No credentials needed for steps 1–4.

```bash
npm install
cp .env.example .env
npm run dev                      # ~80s cold start — ts-node is slow, it is not hung
curl http://localhost:8000/health
```

Then add `FIREWORKS_API_KEY` and `LLM_MODEL` to `.env` and ask it something:

```bash
curl -s -X POST localhost:8000/api/v1/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"What is ORP?"}' | jq
```

At this point you have a working chat service answering from **placeholder text** with **no sensor
access**. To make it useful, continue to [§4](#4-run-recipes).

Other ways to run it:

```bash
npm run build && npm start                                   # compiled
docker build -t clean-earth-rag . && docker run -p 8000:8000 clean-earth-rag
```

---

## 4. Run recipes

Copy-paste configurations. Every variable can live in `.env` instead — the inline form is shown so
you can switch without editing files, which matters when comparing setups.

### 4a. The one you probably want

Grounded document answers **and** live sensor readings:

```bash
DEFAULT_RETRIEVAL=firestore-direct \
SENSOR_TOOL=true \
LLM_MAX_TOKENS=16384 \
npm run dev
```

Startup should print `SENSOR_TOOL is ON …` and, on the first request,
`[DirectFeed] Loaded 5 documents …`. Needs `npm run ingest` once ([§6](#6-retrieval-arms)) and a
device token ([§2c](#2c-clean-earth-device-api)).

### 4b. By what you're doing

| goal | command |
|---|---|
| **Minimal / no credentials** | `npm run dev` |
| **Documents only**, no sensor access | `DEFAULT_RETRIEVAL=firestore-direct npm run dev` |
| **Sensors only**, placeholder documents | `SENSOR_TOOL=true npm run dev` |
| **Compare retrieval arms** without restarting | `DEBUG_RETRIEVAL=true DEFAULT_RETRIEVAL=firestore-direct npm run dev` |
| **A second server** alongside the first | add `PORT=8001` |
| **Capture a bake-off arm** ⚠️ | `SENSOR_TOOL=false DEBUG_RETRIEVAL=true CORPUS_SOURCE=firestore LLM_MAX_TOKENS=16384 LLM_TEMPERATURE=0 npm run dev` |

⚠️ **The bake-off row is not optional detail.** `SENSOR_TOOL` must be `false` or the run is not
comparable to the three captured arms, and `.env` does **not** contain these settings by default.

### 4c. Switching retrieval arm per request

Only works with `DEBUG_RETRIEVAL=true`. Without it the override is **ignored silently** and the
default arm answers.

```bash
curl -s -X POST localhost:8000/api/v1/chat -H 'Content-Type: application/json' \
  -d '{"query":"What is the normal turbidity range?","retrieval":"firestore-vector"}' | jq '.mode'
```

**Always check the echoed `mode`** — it is the only confirmation of which arm actually answered.

### 4d. Two servers, side by side

Useful for comparing arms or flag states with one browser tab each:

```bash
DEFAULT_RETRIEVAL=firestore-direct SENSOR_TOOL=true  PORT=8000 npm run dev   # terminal 1
DEFAULT_RETRIEVAL=stub            SENSOR_TOOL=false PORT=8001 npm run dev   # terminal 2
```

The frontend takes a `?backend=` override: `http://localhost:5173?backend=http://localhost:8001`.

> **Serve the frontend, don't double-click it.** It is now ES modules, and module scripts are
> blocked over `file://` (opaque origin, CORS). From `frontend/`, run
> `python3 -m http.server 5173`.

### 4e. Stopping it

```bash
pkill -f "[t]s-node-dev"
```

**Never `pkill -f "src/index.ts"`** — it matches your own shell and kills it.

---

## 5. Configuration reference

`cp .env.example .env`. Nothing here blocks boot; invalid *values* fail fast with a message listing
every problem, missing secrets are warnings only.

### Core

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production`. Controls error-stack exposure. |
| `PORT` | `8000` | HTTP port. |
| `LOG_LEVEL` | `info` | Log verbosity label. |
| `MAX_HISTORY_MESSAGES` | `20` | Cap on prior turns per request. Oldest dropped, not rejected. |
| `WATER_TYPE` | `freshwater` | `freshwater` \| `saltwater`. Selects conductivity + turbidity normal ranges in the prompt. **Global — see the caveat in [§7e](#7e-known-limits).** |

### LLM (Fireworks)

| Variable | Default | Purpose |
|---|---|---|
| `FIREWORKS_API_KEY` | *(unset)* | Required before any chat works. |
| `FIREWORKS_BASE_URL` | `https://api.fireworks.ai/inference/v1` | OpenAI-compatible endpoint. |
| `LLM_MODEL` | *(unset)* | e.g. `accounts/fireworks/models/gpt-oss-20b`. |
| `LLM_MAX_TOKENS` | `4096` | **Raise to 16384 for tool use or capture runs.** gpt-oss emits reasoning tokens and returns an *empty answer* if starved — the API call still succeeds. |
| `LLM_TEMPERATURE` | `0` | **Leave at 0 for the bake-off** — sampling variance would measure the sampler, not retrieval. |
| `FIREWORKS_USER` | `clean-earth-rag` | Sent as the OpenAI `user` field; drives serverless prompt-cache affinity. |
| `EMBEDDING_MODEL` | `nomic-ai/nomic-embed-text-v1.5` | 768-dim. |

### Retrieval ([§6](#6-retrieval-arms))

| Variable | Default | Purpose |
|---|---|---|
| `DEFAULT_RETRIEVAL` | `stub` | `stub` \| `firestore-direct` \| `pgvector-rag` \| `firestore-vector`. |
| `DEBUG_RETRIEVAL` | `false` | When `true`, a request's `"retrieval"` field is honoured. Required by the bake-off runner. |
| `CORPUS_SOURCE` | `artifact` | Where `firestore-direct` reads text: `artifact` (local file, no credentials) or `firestore`. Explicit rather than auto-detected — a silent fallback would measure the wrong source. |
| `PGVECTOR_URL` | *(unset)* | Dev-only sidecar DSN. Unset everywhere else. |

### Sensor tool ([§7](#7-sensor-querying))

| Variable | Default | Purpose |
|---|---|---|
| `SENSOR_TOOL` | `false` | **The gate.** Enables `query_sensor_data`, the tool-round loop, and the prompt's tool block. Off ⇒ the bot cannot read sensors at all. |
| `MAX_TOOL_ROUNDS` | `16` | Tool-enabled rounds before a forced text-only round. Legacy was 5, which cannot fit a six-parameter question. |
| `RAW_LIMIT` | `200` | Rows an `aggregation: "raw"` call returns. A cap, not a page size — raw output goes into the next prompt. |
| `SENSOR_DEVICE_LABEL` | *(unset)* | Default pod when the model names none. **Leave unset unless the deployment truly has one pod** — the token sees ~17 devices and the two cleared test pods are on opposite coasts. Unset means the tool asks. |

### Device API ([§2c](#2c-clean-earth-device-api))

| Variable | Default | Purpose |
|---|---|---|
| `DEVICE_API_BASE_URL` | *(unset)* | Backend base URL **including `/api/v1`**. |
| `DEVICE_API_TOKEN` | *(unset)* | Dev-only bearer JWT. |
| `DEVICE_API_TIMEOUT_MS` | `10000` | Request timeout. Node's default is effectively none. |
| `CER_EMAIL` / `CER_PASSWORD` | *(unset)* | Optional — lets `npm run explore:devices` mint a token for the run instead of storing one. |

---

## 6. Retrieval arms

Makes document answers grounded. Background: [`docs/RETRIEVAL_BAKEOFF.md`](docs/RETRIEVAL_BAKEOFF.md);
implementation: [`docs/SPECS.md`](docs/SPECS.md) §11–14b.

**Step 1 — build the corpus artifact** (once). Put source PDFs in `documents/`, then:

```bash
npm run ingest
```

Writes `data/corpus/corpus.json` (git-ignored). **Every arm reads this one artifact** — none
re-parse the PDFs. Deliberate: if each arm extracted its own text, extraction differences would
surface as answer-quality differences and be misread as one strategy beating another.

**Step 2 — pick an arm.**

| arm | what it does | needs |
|---|---|---|
| `stub` | three lines of placeholder text | nothing |
| **`firestore-direct`** ⭐ | feeds the whole ◆G9 slice, no embeddings, no ranking | the artifact |
| `firestore-vector` | dense RAG on Firestore vector search | Fireworks key + vector index |
| `pgvector-rag` | legacy-parity hybrid RAG (⚠️ dev only, deleted at ◆G7) | Docker + Fireworks key |

⭐ = the provisional working choice (7.1% retrieval miss vs 33.9%). See
[`docs/HANDOFF.md`](docs/HANDOFF.md) §3.

<details>
<summary><b><code>firestore-direct</code></b></summary>

Despite the name it reads the **local artifact** by default — no Firestore, no credentials:

```bash
DEFAULT_RETRIEVAL=firestore-direct npm run dev
```

For a **measured** run where Firestore read costs are counted (needs the composite index from
[§2b](#2b-google-cloud--firestore)):

```bash
npm run seed:firestore
CORPUS_SOURCE=firestore DEFAULT_RETRIEVAL=firestore-direct npm run dev
```

Re-running the seeder overwrites by filename rather than duplicating.
</details>

<details>
<summary><b><code>firestore-vector</code></b></summary>

Requires `FIREWORKS_API_KEY` (it embeds 305 chunks) and the **vector index** from
[§2b](#2b-google-cloud--firestore).

```bash
npm run seed:firestore-chunks
DEFAULT_RETRIEVAL=firestore-vector npm run dev
```

Idempotency is checked *before* embedding, so a re-run costs nothing. Expect
`305 chunks in "corpus_chunks"`.
</details>

<details>
<summary><b><code>pgvector-rag</code></b> ⚠️ dev only</summary>

Re-introduces the stack ◆G1 moved away from, as the only honest "what we had before" baseline.
**Deleted once ◆G7 resolves.**

```bash
docker-compose -f docker-compose.bakeoff.yml up -d      # NOT `docker compose` — plugin may be absent
npm run seed:pgvector
PGVECTOR_URL=postgresql://cer:cer@localhost:5433/cer_bakeoff \
  DEFAULT_RETRIEVAL=pgvector-rag npm run dev
```
</details>

**Step 3 — capture a bake-off run** ([`eval/README.md`](eval/README.md)):

```bash
npm run bakeoff -- --arm=firestore-vector --spot-check    # ALWAYS run this first
npm run bakeoff -- --arm=firestore-vector --pass=warm
npm run cost                                              # pure arithmetic, no network, free
```

`--spot-check` probes the arm with three questions and prints the retrieved context. An adapter
returning empty context still produces a clean-looking, completely meaningless dataset.

---

## 7. Sensor querying

`query_sensor_data` reads the **real Clean Earth device API**. Implementation:
[`docs/SPECS.md`](docs/SPECS.md) §10.3a; API contract and traps:
[`docs/migration/DEVICE_API.md`](docs/migration/DEVICE_API.md).

### 7a. Turn it on

```bash
DEVICE_API_BASE_URL=…  DEVICE_API_TOKEN=…       # in .env, see §2c
SENSOR_TOOL=true LLM_MAX_TOKENS=16384 npm run dev
```

Startup prints a warning confirming it's on. `LLM_MAX_TOKENS=16384` matters here: each tool round
re-consumes the budget, and a starved model returns an *empty answer* from a *successful* API call.

### 7b. Verify it reads real pods — free, no LLM

```bash
npm run verify:sensor                      # both cleared test pods
npm run verify:sensor -- --pods=Algalita   # one
npm run verify:sensor -- --json            # machine-readable
```

This drives the tool directly with the model removed as a variable, so a failure here is
unambiguously a data problem. **Run it before spending tokens on a chat round-trip.** It prints a
checklist of what a passing run looks like.

The two cleared test pods:

| pod | label | environment |
|---|---|---|
| Algalita Pod | `dev:351077454569099` | salt-water |
| Old Woman Creek 2026 | `dev:351077454567580` | fresh-water |

> "OWC" appears **nowhere** in the registry — the pod is named "Old Woman Creek 2026". The tool
> matches the acronym anyway; a raw API filter on `owc` matches nothing and *succeeds*.

Then through the bot:

```bash
curl -s localhost:8000/api/v1/chat -H 'Content-Type: application/json' \
  -d '{"query":"What is the current dissolved oxygen at the Algalita Pod?"}' \
  | jq '{answer, tool_calls}'
```

**`tool_calls` is the diagnostic.** Absent ⇒ the model never called the tool (a prompt/model
problem, not a data one). Present with `result.error` ⇒ a tool problem, and the message says which.
Present with a real `value` but disagreeing prose ⇒ the model is mis-narrating a number it has.

### 7c. Query the device API directly

Ground truth, bypassing everything in this repo. Never paste a token — source it:

```bash
set -a; source .env; set +a
D=dev:351077454569099                      # Algalita

curl -s "$DEVICE_API_BASE_URL/water/last/$D" -H "Authorization: Bearer $DEVICE_API_TOKEN" | jq
curl -s "$DEVICE_API_BASE_URL/water/period/1/day?device=$D" -H "Authorization: Bearer $DEVICE_API_TOKEN" | jq 'length'
curl -s "$DEVICE_API_BASE_URL/devices" -H "Authorization: Bearer $DEVICE_API_TOKEN" \
  | jq -r '.[] | "\(.data.label)  \(.data.operatingEnvironment // "?")  \(.data.name // "(unnamed)")"'
```

Metric codes: `97` DO mg/L · `98` ORP mV · `99` pH · `100` conductivity µS/cm · `102` temperature ·
`72` turbidity NTU. Timestamps are epoch **seconds**.

> ⚠️ **Do not compare raw output against what the bot says.** Temperature is **°F** from
> `/water/last` and **raw °C** from `/water/period`, with nothing in either payload saying which —
> you will conclude the bot is hallucinating when it is correcting. And **never use
> `/water/average`**: it returns zeros for all six metrics on an empty window and drops whole rows
> when any single probe faults. The tool never calls it.

### 7d. Programmatic access

For code that must not get its numbers by asking a language model — Phase N6 report generation
computes the header, §2 and §5 deterministically.

```ts
import { QuerySensorData } from "./src/tools";

const sensors = new QuerySensorData();

const now = await sensors.query({
  metric: "all", timeRange: "last day", aggregation: "mean", device: "Algalita Pod",
});

const first = await sensors.query({
  metric: "dissolved_oxygen", timeRange: "last 1 year", aggregation: "earliest", device: "Algalita Pod",
});

const trend = await sensors.query({
  metric: "temperature", timeRange: "last week", aggregation: "series", device: "Algalita Pod",
});
```

`query()` takes typed params and **throws `SensorQueryError`**. `run()` is the LLM path — loose args
in, `{ error }` out. Same implementation underneath. "No readings" stays a *result*
(`value: null`, `n_samples: 0`), not an exception — a report needs to say a pod was silent.

**What the tool can express:**

| argument | values |
|---|---|
| `metric` | `dissolved_oxygen` `orp` `ph` `conductivity` `temperature` `turbidity`, or **`all`** (every metric from one fetched window) |
| `aggregation` | `min` `max` `mean` `median` `latest` `earliest` `raw` `series` |
| `time_range` | `last N hours/days/weeks/months`, `last day`, `last week`, `today`, `yesterday`, `this week`, `now`, `YYYY-MM-DD`, `YYYY-MM-DD to YYYY-MM-DD` |
| `device` | name, `dev:` label, or an acronym like `OWC` |
| `bucket` | `series` only — `auto` (default) `hour` `day` `week` |

Ranges anchor to the **device's most recent reading**, not the wall clock, so a pod that stopped
reporting still answers "the last day" about its last day of data.

### 7e. Known limits

- **No cross-metric or cross-pod comparisons, no trend/slope, no event detection.** `series` gives
  bucketed means; interpreting them is the model's job. Event detection is N6, gated by ◆G4.
- **Calendar phrases resolve in UTC**, not pod-local time. The two pods are in different timezones.
- **`raw` drops the OLDEST rows first** when it hits `RAW_LIMIT`. Use `earliest` for first-reading
  questions — `truncated_kept` says which end survived.
- **`time_range_resolved` is what you asked for; `window_actually_searched` is what was searched.**
  The API's window ladder tops out at one year, so a longer range comes back `complete: false`.
- **`WATER_TYPE` is one global variable and the two test pods disagree.** One deployment cannot
  serve both correctly. The tool *flags* the mismatch in its result rather than silently comparing a
  saltwater pod against freshwater limits. Making it per-device is N4 work, gated by ◆G3.
- **A pod's first-ever reading may be a boot artifact** (Algalita's is pH 13.58, −1809 °F) whose
  hardware error flags are **not** set, so it passes the fault filter. A plausibility floor per
  metric is N6's faulty-data work.

---

## 8. Scripts

| script | purpose |
|---|---|
| `npm run dev` | live-reload dev server (`ts-node-dev`) |
| `npm run build` / `npm start` | compile to `dist/` / run compiled |
| `npm test` | full Jest suite (429 tests, none touching the network) |
| `npm run test:coverage` / `test:watch` | coverage / watch mode |
| `npm run lint` / `npm run typecheck` | ESLint `--fix` over `src` / `tsc --noEmit` |
| `npm run ingest` | parse `documents/` → `data/corpus/corpus.json` ([§6](#6-retrieval-arms)) |
| `npm run seed:firestore` | upload the corpus to `corpus_documents` |
| `npm run seed:firestore-chunks` | embed + upload to `corpus_chunks` for `firestore-vector` |
| `npm run seed:pgvector` | embed and load the dev-only sidecar |
| **`npm run verify:sensor`** | **live read-only check that the sensor tool reads real pods (no LLM, no cost)** |
| `npm run explore:devices` | discover the fleet and record raw responses to `data/device-api/` |
| `npm run bakeoff -- --arm=<mode> --pass=<cold\|warm>` | capture a run; `--spot-check`, `--only`, `--dry-run` |
| `npm run cost` | price the arms and compute break-even |
| `npm run grade:packet` | build the blind grading packet (`--pass=`, `--sample=`) |

---

## 9. Project layout

```
src/
  index.ts              # entry: load config, start the server
  app.ts                # express assembly, exported for tests
  config/               # index.ts (env loading + validation), database.ts, pgvector.ts
  routes/               # /api/v1 aggregator, healthRoutes, chatRoutes
  controllers/          # HealthController, ChatController
  retrieval/            # the retrieval seam — SPECS.md §9
    RetrievalRegistry.ts  #   mode -> adapter, selected by DEFAULT_RETRIEVAL
    adapters/           #   Stub, DirectFeed, PgVectorRag, FirestoreVector
    sources/            #   ArtifactCorpusSource | FirestoreCorpusSource
  devices/              # DeviceApiClient (read-only), metrics.ts (codes, flags, decoding)
  tools/                # the sensor tool — SPECS.md §10.3a
    querySensorData.ts  #   tool + typed query(); timeRange.ts; aggregate.ts
  services/             # LlmService, ChatOrchestrator (tool loop), EmbeddingService
  prompt/               # systemPrompt.ts (pinned control + TOOL_BLOCK), promptBuilder.ts
  ingestion/            # extract, chunk, corpus, ingest
  eval/                 # bake-off runner, fixtures, cost model
  validators/ types/ middleware/ utils/
scripts/                # ingest, bakeoff, cost, seed*, exploreDeviceApi, verifySensorTool
test/
  integration/          # health, chat, sensorChat
  unit/                 # per-module suites
  fixtures/device-api/  # recorded production bodies + provenance README
frontend/               # chat UI (manual test surface, not the product). Served, not file://
  index.html            #   markup + mount points; app.css; js/ modules; vendor/ for third-party
data/                   # corpus artifact + device recordings (git-ignored)
documents/              # source corpus. NOTE: `.gitignore` has a documents/* rule, but several
                        #   PDFs predate it and ARE tracked — check `git status` before assuming
                        #   a deleted one is gone.
eval/                   # fixtures/ (committed questions), transcripts/, grading/
docs/                   # HANDOFF.md (start here), SPECS.md, timeline.md, RETRIEVAL_BAKEOFF.md,
                        #   EVAL_FIXTURES.md, GRADING_GUIDE.md, migration/
```

---

## 10. Endpoints

| method | path | description |
|---|---|---|
| `GET` | `/` | service banner |
| `GET` | `/health` | liveness + config-presence checks (no external I/O) |
| `GET` | `/api/v1` | API v1 banner |
| `GET` | `/api/v1/devices` | pod list for the UI selector (read-only, forwards the caller's token) |
| `POST` | `/api/v1/chat` | JSON, or SSE when `"stream": true` |

**Request:** `{ query, retrieval?, stream?, history?, device? }`. `query` required; `retrieval`
honoured only when `DEBUG_RETRIEVAL=true`; `device` names the pod to read when the model does not
name one itself (the model's own choice wins).

**Response:** `{ answer, model, mode, citations, usage }`, plus `tool_calls` when any tool ran and
`tool_round_cap_reached` when the loop hit its cap. Both are **omitted** when no tool ran.

- `citations` is the **retrieved context**, not parsed inline citations — for direct-feed that is
  the whole slice on every request.
- **Sensor readings appear in `tool_calls`, never in `citations`.** A reading is this deployment's
  own measurement, not a claim attributable to a corpus document.
- `usage` is **summed across every tool round**, not just the last call.

> **Streaming with `SENSOR_TOOL=true` is not token-by-token.** The loop cannot know a round is the
> last until it returns without tool calls, by which point the text exists; re-issuing it as a
> stream would double the cost of every answer. The finished text arrives as one `token` event.
> With the flag off, streaming is unchanged.

---

## 11. Troubleshooting

### Configuration

- **Server exits with "Invalid configuration"** — a `.env` value failed validation; the message
  lists each bad variable.
- **`[Config] FIREWORKS_API_KEY is not set`** — expected until you add the key; `/health` still passes.
- **`npm run dev` looks hung** — `ts-node` cold start is ~80s. It isn't hung.
- **Port already in use** — change `PORT`, or `pkill -f "[t]s-node-dev"`.

### Answers are wrong or missing

- **Answers are placeholder text** — `DEFAULT_RETRIEVAL` is still `stub` ([§6](#6-retrieval-arms)).
- **The bot refuses every sensor question** — `SENSOR_TOOL` is not `true`. It has no sensor access
  at all and the prompt tells it to refuse rather than guess.
- **The bot answers sensor questions from documents instead of calling the tool** — check
  `tool_calls` is absent in the response. With `firestore-direct` the context is ~9.4K tokens of
  probe datasheets containing plausible-looking ranges, which can out-compete the tool. Compare the
  same question under `DEFAULT_RETRIEVAL=stub`; a difference is evidence for ◆G11.
- **Answers are empty, but the API call succeeded** — `LLM_MAX_TOKENS` too low. gpt-oss spends the
  budget on reasoning tokens and truncates the visible answer to nothing. Use `16384`.
- **A request ignored the `"retrieval"` field** — `DEBUG_RETRIEVAL` is not `true`. Check `mode`.

### Sensor data

- **`npm run verify:sensor` reports no devices** — the token is scoped to a different organization.
  That is the first thing to check, not a bug.
- **A pod returns `value: null`** — correct behaviour for an empty window. It must **never** return
  `0` for all six metrics; if it does, something is bypassing the decoder.
- **Raw `curl` disagrees with the bot on temperature** — expected. `/water/period` is °C,
  `/water/last` is °F; the decoder normalizes to °F ([§7c](#7c-query-the-device-api-directly)).
- **A "first reading" looks like garbage** — it may genuinely be a boot artifact whose error flags
  are unset ([§7e](#7e-known-limits)).

### Firestore

- **Auth errors** — re-run `gcloud auth application-default login`, confirm `FIRESTORE_PROJECT_ID`.
  Verify independently: `gcloud firestore databases list --project=<id>`.
- **`FAILED_PRECONDITION: The query requires an index`** — the `corpus_documents` composite index is
  missing ([§2b](#2b-google-cloud--firestore)). The error text includes a console link.
- **`firestore-vector` returns no context, but nothing errors** — the silent failure. In order of
  likelihood: collection unseeded, vector index missing or still `CREATING`, or embeddings written
  as plain arrays rather than `FieldValue.vector()`. The adapter logs a warning naming all three.
- **`PGVECTOR_URL is not configured`** — expected unless the dev-only sidecar is up.

### Tests

- **Tests fail after changing `.env`** — they shouldn't; the suites pin their own environment. If a
  test proves otherwise, that is a test-isolation bug worth fixing rather than working around.
