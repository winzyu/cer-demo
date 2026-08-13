# Device API — sensor data access

How sensor data is actually queried out of the Clean Earth backend, and the plan for exploring
and recording it before `query_sensor_data` is built.

This is the ◆G8 follow-through. `timeline.md` Phase N3 recorded the contract as read from
`../user-dashboard`; this document adds the **server side** (`../clean-earth-rovers-server`) and
corrects three things the dashboard-only reading got slightly wrong.

Companion docs: [`../timeline.md`](../timeline.md) (Phase N3, ◆G8), [`../SPECS.md`](../SPECS.md)
(what is built), [`MIGRATION_SPEC.md`](MIGRATION_SPEC.md) §8 (the legacy `query_sensor_data`
behavior being restored).

> **Both reference repos were read only.** Nothing outside `cer-demo` was created, edited, or
> deleted. Everything below is cited to source files in those repos so it can be re-checked.

---

## 1. Status

| piece | state |
|---|---|
| Contract mapped from server + dashboard source | ✅ this document |
| `DeviceApiClient` (read-only typed client) | ✅ built, 45 unit tests, no network |
| Metric decoding (codes, units, error flags) | ✅ built |
| `npm run explore:devices` (discover + record) | ✅ built |
| **Live verification against production** | ✅ **2026-08-11 — 21 devices listed, both cleared pods sampled and recorded** |
| `query_sensor_data` tool + orchestration loop | ✅ **built 2026-08-13, behind `SENSOR_TOOL` (default off) — see §10** |

**Verified live 2026-08-11** against `https://cer-api-98242557946.us-central1.run.app/api/v1`.
The run answered the pod-name question (§2), confirmed the metric codes and error flags (§7), and
turned up **two silent-failure modes that source reading had missed** — a temperature unit that
changes per endpoint, and empty windows returned as zeros (§12). Both are now guarded and tested.

---

## 2. The test pods — resolved

Neither reference repo contains a single real device name. Both were grepped case-insensitively
across the working tree *and* full git history: zero hits for `Algalita`, zero real hits for
`OWC`. The device list is runtime-only, so this could only be answered by calling the API.

**Resolved live 2026-08-11.** The token sees **21 devices across 8 organizations** (i.e. it is
superadmin-scoped — worth knowing, since a narrower account will see fewer).

| pod | label | environment | status |
|---|---|---|---|
| **Algalita Pod** | `dev:351077454569099` | salt-water | reporting — 47 readings in the last day, latest Seal Beach CA |
| **Old Woman Creek 2026** | `dev:351077454567580` | **fresh-water** | **stale — last reading 2026-08-07, nothing in 4 days**, latest Huron OH |

Two traps in that table, both of which produce a wrong answer that looks right:

- **"OWC 2026" is registered as "Old Woman Creek 2026".** The acronym appears nowhere in the
  device name, so the obvious filter (`owc`) matches nothing and the run *succeeds* having sampled
  one pod instead of two. The script's default filter now carries both spellings.
- **"Algalita Pod" has three duplicate registry entries**, all pointing at the same label, two of
  them inside the same organization. A label is one physical pod, so sampling per document id
  recorded the same readings three times as if they were independent evidence. The script now
  dedupes by label and says so.

The other 19 devices include six with no name at all (their `name` is just the label string) and
one literally called `"Test 2"`, so the registry is not clean — do not assume a name exists.

**The response shapes in §6 were reconstructed from source, then checked against real bodies.**
The backend's own `API_ENDPOINTS.md` is stale — it documents `/users`, `/water-data`, `/device`,
`/duration`, `/test-db` and omits `/water/*`, `/devices`, `/organizations`, `/gilligan`, and
`/payments` entirely. **Do not trust it.**

---

## 3. Environments and base URLs

| environment | base URL | source |
|---|---|---|
| **Production** | `https://cer-api-98242557946.us-central1.run.app` | `cloud-run.env.example.yaml` (`PROD_BASE_URL`), `deploy.sh` |
| Local dev | `http://localhost:5001` | server `README.md`; dashboard `axios.config.js` fallback |
| QA | **no separate URL exists** | QA is a *database* selector only (`DB_ENVIRONMENT=qa` → Firestore database `qa-db`), not a distinct deployment |

Every route is mounted under **`/api/v1`**, so the value this service wants is the whole thing:
`https://cer-api-98242557946.us-central1.run.app/api/v1`.

Two notes that matter:

- **The dashboard does not call the backend directly in production.** Its Docker build forces
  `NEXT_PUBLIC_API_BASE_URL=""`, so the browser makes same-origin calls to `/api/v1/*`, which a
  Next.js route handler proxies server-side to the URL above. Reading only the dashboard leaves
  you with an empty base URL and no idea where the API lives.
- **There is no QA mirror to test against.** `timeline.md` N3 listed "a working test token or QA
  mirror" as an open unknown; the mirror does not exist. Any live exploration hits **production
  data**, which is why §9 is scoped to read-only calls with a fixed, small sample.

---

## 4. Authentication

Bearer JWT. `Authorization: Bearer <jwt>` on every route that needs it.

```
POST /api/v1/users/login   { "email": "...", "password": "..." }
  → 200 { message, status, payload: <user>, accessToken }
```

- The legacy `POST /auth/signin` (mounted at `/auth`, **not** under `/api/v1`) does the same job
  but returns `{ access_token, user }`. The client accepts `accessToken`, `access_token`, and
  `token`, matching the dashboard's own normalization.
- **Tokens do not expire.** `jwt.sign` is called without `expiresIn`, so a token minted today
  keeps working. Convenient for us; it also means a leaked token is valid forever, so treat
  `DEVICE_API_TOKEN` as a live secret and never commit one.
- **Every response is org-scoped to the token holder.** `GET /devices` and all `/water/*` routes
  filter to the caller's organization (`superadmin` sees everything). If the pods you expect are
  missing from the exploration output, the token belongs to a different org — that is the first
  thing to check, not a bug in the client.
- **There is no service account or API key.** No machine-to-machine path exists; a caller logs in
  with a human's credentials or possesses a token minted from one.
- The JWT payload is the **entire user record** (id, name, email, role, organization, devices,
  customerId, profile picture), signed with `ACCESS_TOKEN_SECRET`. Anything that logs a decoded
  token logs personal data.

### The unauthenticated routes

Four families of endpoints return water data with **no authentication and no org scoping at all**:
`GET /water-data`, `GET /water-data/:id`, `GET /device?device=`, and every `GET /duration/*`.
`POST /water/check-alerts` is likewise open.

This is worth reporting upstream — it is their data, exposed. **We should not build on them**,
tempting as the "no credentials needed" shortcut is: they bypass the org scoping that keeps a chat
user from reading another customer's fleet, which is precisely the property `query_sensor_data`
needs. They also run responses through a Zod schema that silently strips undeclared top-level
fields (including the root-level `lat`/`lon` the `/water/*` routes read), so the same document
comes back differently depending on which route you asked. The client deliberately implements
none of them.

---

## 5. Where your credentials go

Two values, both in **`cer-demo/.env`** (git-ignored; `.env.example` carries the documented
placeholders). Nothing else needs configuring.

```bash
# .env
DEVICE_API_BASE_URL=https://cer-api-98242557946.us-central1.run.app/api/v1
DEVICE_API_TOKEN=<your JWT>
```

Three ways to get the token, easiest first:

1. **Copy it out of the dashboard.** Log into the Clean Earth dashboard in a browser, then
   DevTools → Application → Local Storage → key `token`. That is the exact value the dashboard
   sends. Since tokens do not expire, this keeps working.
2. **Log in from the command line** and paste the `accessToken` from the response:
   ```bash
   curl -s -X POST https://cer-api-98242557946.us-central1.run.app/api/v1/users/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"YOU@example.com","password":"YOUR_PASSWORD"}'
   ```
3. **Let the script log in for you**, if you would rather not store a token:
   ```bash
   npm run explore:devices -- --email=YOU@example.com --password='YOUR_PASSWORD'
   ```
   or export `CER_EMAIL` / `CER_PASSWORD`. The minted token is held in memory for the run and
   **never written to the recording** — the recorded output is meant to be read by people.

**Cautions.** Use an account whose organization actually contains the pods we are cleared to use;
org scoping is silent, and a wrong-org token produces a short, plausible device list rather than
an error. Never commit `.env` or paste a token into a doc, a commit message, or a recording —
it does not expire, so a leak has no natural end. And these calls hit **production**: there is no
QA mirror (§3).

---

## 6. Endpoint contract

All paths below are relative to `<base>/api/v1`. **`:device` means the full label**
(`dev:864622040478253`) everywhere except `/water/tides`, which wants the bare numeric id — the
one genuine inconsistency in the API.

| method | path | returns | notes |
|---|---|---|---|
| `GET` | `/devices` | `[{ id, data: { name, label, organization, operatingEnvironment, nextCalibrationDate, thresholds, notificationFrequency } }]` | **The only source of pod names.** Org-scoped. |
| `GET` | `/water/last/:device` | `{ id, data: { …doc, water_data } }` | Temperature in **°F**. **Returns `[]` when the newest reading has no GPS fix** — indistinguishable from "no data" unless you know. |
| `GET` | `/water/period/:duration/:unit?device=` | `[{ id, data }]` — raw documents | Rolling window ending now. Temperature in **°C** (§12). **Does not drop faulted rows**, which makes it the right source for N6's faulty-data work. Capped at 10 devices (Firestore `in` limit) when unfiltered. |
| `GET` | `/water/average/:duration/:unit?device=` | `{ "97": n, "98": n, "99": n, "100": n, "102": n, "72": n }` | Temperature in **°F**. Averages **only rows where every probe was healthy** — one faulty sensor removes the row from every metric. **An empty window returns all zeros, not an error** (§12). |
| `GET` | `/water/average/many-devices/:duration/:unit?devices=…` | `{ [label]: { …codes, lat, lng } }` | Repeat the `devices` param per device. |
| `GET` | `/water/chart/:duration/:unit/:metric/:timezone` | `{ labels, datasets: [{ label, data: [[msTimestamp, value]] }] }` | `timezone` is **base64-encoded** IANA. Ignores any device param — always all org devices. |
| `GET` | `/water/tides/:device/:start/:end` | `[{ level, type: "H"\|"L", timestamp }]` | NOAA passthrough. **Bare numeric id, no `dev:` prefix.** |
| `POST` | `/water/export/csv/:device` | `text/csv` | Body `{ startDate, endDate }`. Header row names turbidity `TURBIDITY (NTU)`. |

`:unit` ∈ `hour | day | week | month | year | fiveYears`.

**Write routes exist** (`POST /devices`, `POST /devices/:id`, both `superadmin`-only). The client
implements none of them, on purpose: this service answers questions about a fleet it does not own,
and a client that cannot write cannot corrupt someone else's device registry through a prompt.

---

## 7. Metric codes

Confirmed identical in both repos — the dashboard's `MetricsDictionary` and the server's
`WaterAnalyticsService.mapWaterData`. This is the mapping `timeline.md` already recorded, now
verified from the server side:

| code | metric | unit as returned | error flag |
|---:|---|---|---|
| 97 | Dissolved oxygen | mg/L | `doError` |
| 98 | ORP | mV | `orpError` |
| 99 | pH | — | `phError` |
| 100 | Conductivity | µS/cm | `ecError` |
| 102 | Temperature | **°F** | `rtdError` |
| 72 | Turbidity | NTU (see §8) | `turbError` |

**A third mapping exists in the backend and it is wrong.**
`DevicesService.checkWaterDataAndSendAlerts` uses a shifted table — it calls 100 "pH", 97 "ORP",
102 "Dissolved Oxygen", 98 "Conductivity", 99 "Temperature". Every key is displaced, so that
feature compares each metric against a different metric's thresholds and emails customers alerts
about the wrong parameter. It looks like a genuine bug rather than an alternate convention, and
it is theirs to fix, but it matters to us twice: **do not port it**, and do not read a
disagreement with it as ambiguity about the real codes. `test/unit/deviceApi.test.ts` pins our
table for exactly this reason — a silent "reconciliation" would turn every reading into another
metric while still producing plausible numbers.

---

## 8. Turbidity — the finding that touches a pinned control

`timeline.md` records the turbidity unit as **resolved**: the fleet reports NTU, confirmed by the
operator 2026-07-29, and the system prompt carries an authoritative range of `0-25 NTU`
freshwater / `0-10 NTU` saltwater.

The server tells a more qualified story. Turbidity is **not a stored measurement**. The backend
derives it from a raw analog voltage (`water_data.turbVolt`) via `turbVoltToNTU`, whose own source
file marks the conversion **PROVISIONAL and not lab-calibrated** — fixed constants, a clear-water
reference voltage of 3.35 V, 300 NTU per volt of drop, ceiling 4550. The dashboard labels the
metric **"Turbidity (Relative)"** for that reason, and a recent commit there
(`Label turbidity as Relative to reflect provisional calibration`) made that explicit.

So the value is a **monotonic relative index expressed in NTU**, not a calibrated NTU measurement.
Comparing it against `0-25 NTU` is defensible for "is this rising?" and much weaker for "is this
within the operator's normal range?".

**This does not change anything yet, and must not.** The system prompt is a pinned control for the
N2 bake-off (`RETRIEVAL_BAKEOFF.md` §4) — editing it now voids every arm that has run. The correct
sequence is: finish N2, then take this to the operator as a question (is the `0-25` range meant to
apply to the derived index, or to a calibrated instrument?), then change the prompt once with the
answer. Recorded here so it is not rediscovered later as a surprise.

---

## 9. The exploration and recording plan

Read-only, cheap, and staged so the expensive/risky parts come last. **Steps 1–3 need nothing
from the LLM and spend no inference tokens.**

### Step 0 — credentials (yours)

Put `DEVICE_API_BASE_URL` and `DEVICE_API_TOKEN` in `.env` per §5. Everything below is blocked
on this and nothing else.

### Step 1 — discover the fleet *(one API call)*

```bash
npm run explore:devices
```

Lists every pod the token can see: name, label, operating environment. Records `devices.json`.
**This is the step that answers the pod-name question** — whether "Algalita pod" and "OWC 2026"
exist, how they are spelled, and what their `dev:…` labels are.

Read the names before going further. If neither target appears, the token is scoped to the wrong
organization (§4) and steps 2+ will sample the wrong fleet.

### Step 2 — sample the cleared pods and record raw responses

```bash
npm run explore:devices -- --pods=Algalita,OWC
```

Per matched pod, sequentially (no parallel bursts against someone else's production API):
last reading, 1-day and 1-week averages, and a 1-day raw period series. Every raw body is written
to `data/device-api/<timestamp>/<label>/`.

**The recording is the deliverable, not the printout.** Those files become the offline fixtures
for `query_sensor_data`, so the rest of N3 can be built and tested without re-hitting production —
the same "capture once, replay many" rule the bake-off already follows for the corpus. `data/` is
git-ignored, which is correct: sensor data is confidential per `CLAUDE.md`.

Adjust `--pods=` to whatever step 1 actually showed. `--all` samples everything; `--no-record`
prints without writing.

### Step 3 — reconcile this document against reality ✅ done 2026-08-11

All three open questions are answered, from a real `dev:351077454569099` document:

- **Coordinates live at the document root as `best_lat`/`best_lon` (numbers), and inside
  `water_data` as `lat`/`lon` (also numbers).** There is **no** root-level `lat`/`lon` on current
  firmware, and the values are *not* strings as the backend's own Zod schema declares. The
  decoder's fallback chain handles it; the schema is wrong, not the data.
- **Error flags are fully populated** — `doError`, `ecError`, `orpError`, `phError`, `rtdError`,
  `turbError` all present, all `0` on healthy readings. The "missing flag means healthy" default
  is therefore an archive concern only, not the live path.
- **Turbidity arrives as code `72` *and* as `turbVolt`** on the same document. On the sampled pod
  `turbVolt` was `4.20 V` against the conversion's clear-water reference of `3.35 V` — a
  *negative* drop, which clamps the derived value to `0 NTU`. So a `0` turbidity here can mean
  "above the clear-water reference voltage", not "measurably clear water". Further evidence for §8.

Full observed document shape (`/water/period`):

```
root:       device, timestamp, date, best_lat, best_lon, best_location, event, water_data
water_data: 72, 97, 98, 99, 100, 102,
            doError, ecError, orpError, phError, rtdError, turbError,
            turbVolt, NCvoltage, NCtemp, count, lat, lon
```

### Step 4 — freeze fixtures, then build the tool

Copy a small, stable slice of the recording into a committed fixture set (scrubbed of coordinates
if that is a concern), and build `query_sensor_data` against it. Only then re-verify live.

---

## 10. The tool loop — deferred here, built 2026-08-13 behind a flag

> **Resolved.** The section below is the original reasoning for deferring it, kept because the
> constraint it describes is still live. What changed is the answer: rather than wait for ◆G7 or
> re-run the arms, the tool block and the loop landed behind **`SENSOR_TOOL`, default off**, so the
> default prompt stays byte-identical to the one the three captured arms ran against (pinned by a
> SHA-256 in `test/unit/prompt.test.ts`) and no `tools` array is attached to a request. The
> recommended sequence below still holds for *turning it on* in a measured run.
>
> Built: `src/tools/querySensorData.ts`, `src/tools/timeRange.ts`, `src/tools/aggregate.ts`,
> `src/services/ChatOrchestrator.ts`, `TOOL_BLOCK` in `src/prompt/systemPrompt.ts`. Offline
> fixtures in `test/fixtures/device-api/`. See `timeline.md` Phase N3 and `SPECS.md` §10.3a.
>
> Two contract notes this document should carry forward:
>
> - **`/water/average` is not used by the tool.** Every statistic is computed locally from
>   `/water/period` rows, which sidesteps §12b's all-zero empty window and §6's whole-row exclusion
>   on a single faulted probe, and makes validity per-metric. A test asserts the endpoint stays
>   unused.
> - **An empty window escalates** one rung at a time (day → week → month, at most twice) rather than
>   reporting no data immediately — the reference instant that anchors a relative range lives inside
>   the data, and Old Woman Creek needs a week-wide look-back to find it.

### The original reasoning, for the record

`query_sensor_data` needs two things that N2 has pinned:

- **A tool inventory in the system prompt.** The legacy prompt had one; ours deliberately does not
  (`SPECS.md` §10.2), and the prompt is a pinned bake-off control.
- **The tool-calling orchestration loop** — 5 tool rounds + 1 forced text round — which changes
  the shape of every chat request.

Doing either now voids the arms and forces a re-run of a sweep that has not even happened yet.
The data layer built in this detour — client, decoder, exploration, fixtures — touches **neither**:
no prompt change, no chat-pipeline change, no new dependency, and every new test is offline. It is
the half of N3 that can safely land before the bake-off runs, and it removes the "needs a person,
not code" blocker that `timeline.md` flagged.

**Recommended sequence:** finish the N2 sweep and `RETRIEVAL_COMPARISON.md` → close ◆G7 → then
wire the tool loop and the prompt block in one deliberate change, re-running arms only if the
comparison is still open.

---

## 11. What is built

| file | role |
|---|---|
| `src/types/device.types.ts` | device, reading, and metric shapes |
| `src/devices/metrics.ts` | the code table, error-flag validity, reading/average decoding |
| `src/devices/DeviceApiClient.ts` | read-only typed client: login, devices, last, period, averages |
| `scripts/exploreDeviceApi.ts` | `npm run explore:devices` — discover, sample, record |
| `test/unit/deviceApi.test.ts` | 36 tests, no network, no credentials, no cost |

Guards worth knowing about, each covering a failure that otherwise produces plausible-looking
numbers rather than an error:

- **Epoch seconds, converted once.** `timestamp` is seconds; `new Date(timestamp)` yields 1970 —
  a wrong date that still looks like a date. Everything downstream reads `observedAt`.
- **`0` is a real reading** for ORP and turbidity (`timeline.md`), so nothing falsy-checks a value.
- **`0` latitude means "no fix"**, not the equator — the fallback chain reproduces the backend's.
- **Error flags are per-metric**, and a faulted probe keeps its plausible-looking value. The
  decoder marks the metric invalid rather than dropping it, so a caller can say *why*.
- **A 401 is surfaced, never retried.** The dashboard silently drops the token and redirects to a
  login page; this service has neither.
- **A timeout is enforced.** Node's default is effectively none, so a hung upstream would hold a
  chat request open until the caller gave up.

---

## 12. What the live run found that reading the source did not

Both of these produce **plausible numbers rather than an error**, which is the failure class this
codebase treats as the dangerous one. Both are now guarded and pinned by tests.

### 12a. Temperature's unit depends on which endpoint you asked

One document — `dev:351077454569099`, timestamp `1786477045` — returned:

| endpoint | code `102` |
|---|---|
| `/water/last/:device` | `78.7838020324707` (**°F**) |
| `/water/period/1/day` | `25.99100112915039` (**°C**) |

Same reading; `25.991 × 9/5 + 32 = 78.7838…` exactly. The backend converts on `last` and
`average` and returns the stored document untouched on `period`, and **nothing in the payload
says which**. Treating period data as °F reports 26 °C water as "26 °F" — below the system
prompt's authoritative `32 to 95 °F` range, so a warm ocean reads as near-freezing and gets
flagged as an anomaly.

The decoder now takes the payload's unit from the call site that knows which endpoint it asked,
normalizes everything to °F, and records `convertedFrom: "celsius"` so the conversion is visible
rather than assumed.

### 12b. An empty window is returned as zeros, not as "no data"

`Old Woman Creek 2026` had not reported for four days. Its 1-day average came back:

```json
{ "72": 0, "97": 0, "98": 0, "99": 0, "100": 0, "102": 0 }
```

Read as data, that is anoxic water at pH 0, 0 µS/cm, and 0 °F — six catastrophic readings, none
of them measured. There is no error, no empty body, and no count field to disambiguate. The
matching `/water/period` call returned `0` rows, which is the honest signal.

`DeviceAverages.empty` now flags this, and it requires **all six** metrics to be exactly zero at
once. That constraint is load-bearing: **0 is a genuinely valid reading for ORP and turbidity**
(`timeline.md`), so no single zero may be read as missing — but pH 0 with 0 µS/cm and 0 °F
simultaneously is not water, it is an empty result set.

**This is a `query_sensor_data` requirement, not a display detail.** An arm that answers "average
dissolved oxygen was 0 mg/L last day" has fabricated a figure, which the N2 quality floor treats
as an automatic disqualification.

### 12c. One deployment cannot serve both pods

The two cleared pods are in **different water types**, and `WATER_TYPE` is a single global env var
that selects the conductivity *and* turbidity ranges in the system prompt:

| pod | environment | conductivity observed | prompt range for that type |
|---|---|---|---|
| Algalita Pod | salt-water | 54,105–60,186 µS/cm | 40,000–50,000 µS/cm |
| Old Woman Creek 2026 | fresh-water | 128–164 µS/cm | 0–1,500 µS/cm |

Two consequences:

1. **Water type has to become per-device**, read from the device's `operatingEnvironment` field,
   not from deployment config. That is Phase N4's site/device metadata store and it bears on ◆G3.
   Not a change to make now — the prompt is a pinned N2 control.
2. **Algalita reads above the saltwater range**, by 4,000–10,000 µS/cm consistently. Either the
   operator range is wrong for this site or the probe needs attention. A question for the
   operator, and a good example of why ◆G3 matters.

Two more readings sit outside the prompt's ranges: Old Woman Creek at **pH 9.12–9.15** (range
6.5–8.5) and **DO 4.26 mg/L** (range 5–14). And its 1-week average turbidity was **817 NTU**
against a stated range of 0–25 — 33× the maximum, which is hard to read as anything but further
confirmation that the derived turbidity index (§8) is not a calibrated NTU measurement.
