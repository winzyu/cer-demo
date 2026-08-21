# Backend fields available to the chatbot — live census, 2026-08-21

What the device registry and water-data documents **actually carry right now**, read live from
production, and what each field can and cannot support in the chat/report system.

Companion: [`DEVICE_API.md`](DEVICE_API.md) (how the API works, metric codes, unit traps).
This document is the **field inventory**; that one is the **contract**.

> Read-only. Both reference repos untouched. Every number below came from
> `scripts/exploreDeviceFields.sh` and `scripts/exploreBackendSurface.sh`, which record raw
> bodies under `data/` (git-ignored).

---

## 0. Access — what we have and what we don't

| path | status |
|---|---|
| **Device API + JWT** (`DEVICE_API_TOKEN`) | ✅ **working** — this is the only usable path |
| **Direct Firestore / gcloud** | ❌ **denied.** The data lives in GCP project `conductive-fold-343604` (`clean-earth-rovers-server/src/config/database.ts`). That project is not on our account; `gcloud firestore databases list` returns `caller does not have permission`. |

So "explore the Firestore backend" is, in practice, "read Firestore documents **through** the
device API" — which is fine, because `/devices` returns the raw Firestore document under `.data`
with no schema filtering. Undeclared fields come through intact, which is exactly how the
merge/archive fields below were found.

**To get direct Firestore access** we would need an IAM grant on `conductive-fold-343604`
(`roles/datastore.viewer`) for a Google account, or a service-account key. Worth asking for: it
would let us read the `chats`, `users`, and `water-data` collections that the API only exposes
in slices.

---

## 1. Registry snapshot

**15 devices across 8 organizations.** The count keeps moving — 21 (2026-08-11) → 17 (08-13) →
**15 (08-21)**. Nothing may hard-code it.

Of the 15: **5 are actively reporting**, 4 are `mergedInto` something else, 4 are `archived`,
and 2 are neither but idle.

---

## 2. Device document fields — full census

Count = how many of the 15 devices carry the field.

| field | n | type | usable for |
|---|---:|---|---|
| `label` | 15 | `dev:<imei>` | **the join key** to water-data. Not the doc id. |
| `name` | 15 | string | pod naming. **6 devices' name is just the label** — don't assume a human name. |
| `organization` | 15 | org doc id | **auth scoping.** See §5. |
| `operatingEnvironment` | 15 | `salt-water` \| `fresh-water` | **per-device water type** — this is the field that replaces the global `WATER_TYPE` env var (`DEVICE_API.md` §12c). Already used by `buildReportInput`. |
| `nextCalibrationDate` | 15 | ISO string **or** Firestore timestamp | calibration status. **Mixed type** — `CWA Old` stores `{_seconds,_nanoseconds}` while everything else stores ISO. Parse defensively. |
| `thresholds` | 13 | object, 10 keys | **operator-set acceptable ranges.** See §3. |
| `notificationFrequency` | 13 | `1x/hour\|1x/day\|1x/week` | alert cadence |
| `lastAlertSent` | 13 | Firestore timestamp | alert history |
| **`mergedInto`** | **5** | a `dev:` **label** | **device continuity.** See §4. |
| **`labels`** | **4** | array of `dev:` labels | **the survivor's continuity chain.** See §4. |
| **`archived`** | **4** | `true` | retired pod. See §4. |
| `displayed` | 4 | `true` | dashboard map visibility |
| `noaaTidesId` | 4 | NOAA station id | tide correlation. Only 4 devices have it; the backend now auto-derives it from coordinates (`Auto-derive NOAA tide station from device coordinates`). |
| `color` | 3 | hex | chart color |
| `lastCalibrationDate` | 2 | ISO | last calibration |
| `lastCalibrationData` | 1 | ISO | **typo of the above** — `East Anchorage DataPod™` only. Read both spellings or miss it. |

---

## 3. `thresholds` — the per-device acceptable ranges

Exactly **10 keys**, on 13 of 15 devices:

```
minTemperature maxTemperature   minPH maxPH   minDissolvedOxygen maxDissolvedOxygen
minORP maxORP                   minConductivity maxConductivity
```

Values are **strings**, not numbers (`"100000"`, `"8.5"`). Cast before comparing.

### 3a. Temperature baselines DO exist — the report just isn't using them

The meeting note "no baseline for temperature" is a **report-gen gap, not a data gap**.
`minTemperature`/`maxTemperature` are set on all 13 devices that have thresholds
(e.g. Algalita 50–80 °F, Marina Park 40–95 °F). The field is there; the report needs to read it.

### 3b. Turbidity has **no threshold field at all**

There is no `minTurbidity`/`maxTurbidity`. An operator **cannot** set an acceptable turbidity
range today, on any device.

This is the strongest support yet for **"turbidity qualitative, not quantitative."** Every other
metric has an operator-owned numeric range to compare against; turbidity has none, is derived from
a voltage by a conversion its own source marks `PROVISIONAL`, and is labelled "Turbidity
(Relative)" in the dashboard (`DEVICE_API.md` §8). Qualitative bands — clear / slightly turbid /
turbid — are the honest presentation, and the dashboard has already started down that road
("turbidity clarity bands" landed in `user-dashboard`).

### 3c. Several threshold sets are junk — validate before trusting

| device | problem |
|---|---|
| `Trinidad Island DataPod™` | **all 10 values are `0`** — min=max=0, so every reading is "out of range" |
| `dev:860322068098448` | **all 10 values are `0`** — same |
| `CER Conference Pod` | `maxPH=100`, `maxDissolvedOxygen=100`, `maxORP=1000` — placeholders, not ranges |
| `Marina Park DataPod™` | `minORP=-2200` — almost certainly a typo for `-200` (its sibling New Trinidad uses `-200`) |
| `Balboa Basin Buoy` | `minConductivity=40024`, `maxDissolvedOxygen=27` — oddly precise / out of physical range |

**A range where `min == max`, or where min > max, must be treated as unset.** Reporting "pH 7.1 is
outside the acceptable range of 0–0" is the fabricated-figure failure class.

Live counter-example worth knowing: Marina Park's 1-day average DO is **19.3 mg/L** against its own
`maxDissolvedOxygen=10`. Either the threshold or the probe is wrong — an operator question.

---

## 4. Device merge & archive — the new fields, and the trap in them

This is the change the meeting flagged, and it is **not in either reference repo checkout** —
both predate it. It exists only in live data.

### The model

When a buoy is damaged, the Notecard is replaced, which mints a **new device id**. The backend
sees a new device. Three fields tie the old and new together:

- **`mergedInto: "dev:<label>"`** on the **retired** device — points at its successor, **by label**.
- **`labels: ["dev:<self>", "dev:<older>", …]`** on the **survivor** — the full chain, self first.
- **`archived: true`** — retired with **no** successor (customer gone, pod decommissioned).
  Independent of `mergedInto`; no device has both.

Four merge groups and four archived devices are live today:

| survivor | absorbs | chain length |
|---|---|---:|
| `Old Woman Creek 2026` `dev:…567580` | `CWA Old` `dev:…248466`, `CWA 2025 testbed` `dev:…093894` | **3** |
| `Marina Park` `dev:…591408` | `Marina Park DataPod™` `dev:…528640` | 2 |
| `PCH Public Dock Buoy` `dev:…467096` | `East Anchorage DataPod™` `dev:…747025` | 2 |
| `New Trinidad Island DataPod™` `dev:…068417` | `Trinidad Island DataPod™` `dev:…097184` | 2 |

Archived, no successor: `CER Conference Pod`, `Braid Theory DataPod`, `Braid Theory DataPod 2`,
and the unnamed `dev:860322068098448`.

> The meeting recalled 3 device ids on **Marina Park**; live data puts the 3-label chain on
> **Old Woman Creek 2026**. Marina Park has 2. (There are two Marina Park entries, which is
> probably where the impression came from.)

### 4a. ⚠️ The merge is registry metadata ONLY — the data does not follow

**This is the finding that matters most for the chatbot.** Querying a survivor returns **only its
own label's rows**. The historical rows keep the old label and are never rewritten:

| group | merged-in label's span | survivor's span | survivor's share |
|---|---|---|---:|
| Old Woman Creek | `CWA Old` 2023-08-08→2023-11-01 (5,989 rows)<br>`CWA 2025` 2024-02-02→2025-08-22 (8,554 rows) | 2026-06-12→now (**729 rows**) | **4.8 %** |
| Marina Park | 2023-08-14→2025-07-08 (19,286 rows) | 2026-07-09→now (**783 rows**) | **3.9 %** |
| PCH Public Dock | 2023-04-27→2025-04-14 (13,003 rows) | 2026-06-14→now (**621 rows**) | **4.6 %** |
| New Trinidad | 2024-03-01→2024-12-16 (3,058 rows) | 2024-07-04→2026-04-21 (1,852 rows) | 37.7 % |

So **"what's the trend at Marina Park over the last two years?"** answered off the survivor label
alone uses **783 of 20,069 readings** and silently reports a six-week history as if it were the
site's full record. No error, no empty result — a confident wrong answer, which is this codebase's
designated dangerous failure class.

**The tool must fan out over `labels[]`** whenever a question's window predates the survivor's
first reading. Two consequences:

1. **No multi-device fan-out in one call.** Repeating `device=` on `/water/period` returns
   **0 rows** — the param is not treated as a list there. One call per label, then merge locally.
   (`/water/average/many-devices` *does* accept repeated `devices=` and works — but it is an
   averages endpoint, and `DEVICE_API.md` §10 already rules averages out for good reasons.)
2. **Chains can overlap in time.** New Trinidad ran 2024-07-04→2026-04-21 while Trinidad Island ran
   2024-03-01→2024-12-16 — a **five-month overlap** where both labels reported. Naive
   concatenation double-counts that window. De-duplicate by timestamp, or prefer the survivor's
   row where both exist.

### 4b. Retired labels stay fully readable

`/water/last/dev:351077454528640` (a merged-away label) still returns its final reading
(2025-07-08). Nothing is deleted. Continuity is therefore **reconstructable** — it just isn't
reconstructed for us.

### 4c. Archived devices are still returned by `/devices`

`GET /devices` includes all 4 archived devices with no filtering. A chatbot that answers "how many
buoys do I have?" off a raw device count says **15** when 5 are reporting and 4 are retired.
Filter on `archived !== true` for "current fleet" questions, and on `mergedInto == null` to avoid
listing the same physical buoy under three names.

---

## 5. Organizations & auth scoping

`GET /organizations` returns **8** organizations:

```
Braid Theory, Inc · UC Davis · Cape Fear River Watch · CER Super Admin
City of Huntington Beach · Algalita · Cleveland Water Alliance · City of Newport Beach
```

Every device carries `organization`, and `/devices` + all `/water/*` routes filter to the caller's
org (superadmin sees all). That is the mechanism for the meeting's "check organization by auth"
requirement, and it is **per-device**, so fleet-wide summarization *within* an org is achievable —
list the org's devices, then fan out.

### 5a. ⚠️ Two devices point at organizations that don't exist

| device | `organization` | in `/organizations`? |
|---|---|---|
| `Marina Park` | `MWv7vOvPOL2xwNINk4eV` | ❌ **no** |
| `CWA Old` | `T0Cl83CJYvsMcYRej1jk` | ❌ **no** |

Dangling references. Worth reporting upstream, and worth handling: an org-scoping check that
resolves the org document will throw or silently exclude these; one that string-compares ids will
not. `Marina Park` is an **actively reporting** pod, so this is not a dormant edge case.

### 5b. ⚠️ Merge chains cross organization boundaries

| survivor (org) | absorbed device (org) |
|---|---|
| `Marina Park` (`MWv7vOv…`) | `Marina Park DataPod™` (`yYSvuUP…` = City of Newport Beach) |
| `PCH Public Dock Buoy` (`FF8Syo9…` = CER Super Admin) | `East Anchorage DataPod™` (`yYSvuUP…` = City of Newport Beach) |
| `Old Woman Creek 2026` (`bLTGwdVS…` = Cleveland Water Alliance) | `CWA Old` (`T0Cl83CJ…`) |

**Following `labels[]` to build history can read rows that belong to a different organization than
the caller.** The org filter is applied to the *device*, not to the historical rows behind a merged
label — water-data documents carry no organization field at all. Before shipping continuity, decide
deliberately: does inheriting a buoy inherit its data? This needs an answer from the operator, not a
default from us.

> ⚠️ **This is worse than it looks, and it is written up in full in
> [`SECURITY_FINDINGS.md`](SECURITY_FINDINGS.md).** `/water/period` — the *only* endpoint
> `query_sensor_data` reads — does not authorize its `device` parameter at all: the org filter sits
> in an `else` branch, so supplying `?device=` replaces org scoping rather than narrowing it. Its
> three sibling routes all perform the membership check it omits. A naive fan-out over `labels[]`
> therefore succeeds silently at reading another organization's data.

---

## 6. Water-data document fields

Root: `device`, `timestamp` (epoch **seconds**), `date` (ISO), `best_lat`, `best_lon`,
`best_location` (e.g. `"Seal Beach CA"`), `event`, `water_data`.

`water_data`: `72 97 98 99 100 102` (metrics), `doError ecError orpError phError rtdError
turbError` (all present, `0` = healthy), `turbVolt`, `NCvoltage`, `NCtemp`, `count`, `lat`, `lon`.

Unchanged from `DEVICE_API.md` §9 — including the °C-on-`/period` vs °F-on-`/last` trap.

### 6a. `event` is a per-reading GUID, not an event type

The meeting listed "event type" as a report-gen gap. **There is no event-type field.** A 48-row
sample returned **48 distinct** `event` values, all UUID-shaped
(`fa1c31d1-04e6-8ff7-9587-ae8f12eaf78b`) — one per reading. It is the Notecard sync/event id, an
opaque per-transmission identifier with no category, severity, or label.

So event classification is **something we would derive** (threshold breach, sensor fault via the
error flags, gap in reporting, rate-of-change), not something we can read. Worth confirming with
the operator that no separate event collection exists — direct Firestore access (§0) would settle
it, since we can only see collections the API exposes.

### 6b. `best_location` is a free-text place name

`"Seal Beach CA"`, `"Huron OH"`. Useful for narrating *where* a reading came from without
reverse-geocoding, and the closest thing to the `Location:` field that v0's report left as
`Not provided` (`DEVICE_API.md` §14c).

---

## 7. Subscriptions and query quota

The meeting's "monthly subscriptions / X amount of queries" is **already built** in the backend.

`GET /gilligan/check-quota` → `true|false`. From `GilliganService.checkQuota`, a user may ask when
**any** of:

- fewer than **2 messages by that user in the last week**, or
- fewer than **10 messages by the whole organization this month**, or
- they hold **any active Stripe subscription**, or
- their role is `superadmin`.

So the free tier is roughly *2 questions/user/week, 10/org/month*, and a subscription lifts it.
Our token returns `true` (superadmin).

Also live: `GET /gilligan/chats` (persisted chat history per user — the sidebar that
`DEVICE_API.md` §14c calls parity, currently `[]` for our token), and billing —
`/payments/product` → `{ "DataPod™ Subscription", 733.5 }`, `/payments/devices-quantity` → `15`
(note: **counts archived devices**), `/payments/check-subscription`, `/payments/next-invoice-date`.

**If this chatbot replaces Gilligan, it inherits this quota contract.** Enforcement belongs on the
caller's token, which is the same auth decision as §5.

---

## 8. What we still can't see, and how to get it

| unknown | how to resolve |
|---|---|
| Is there an **events/alerts collection**? (§6a) | Firestore read access, or ask. The API exposes no such route. |
| What do `users` documents carry (role, org, `customerId`)? | Only reachable via the unauthenticated `/users/all`, which we deliberately don't build on (`DEVICE_API.md` §4). Firestore access would be the clean answer. |
| Does inheriting a merged buoy inherit its **data across orgs**? (§5b) | Operator decision. Blocking for continuity work. |
| Are the **all-zero threshold sets** intentional? (§3c) | Operator. Assume unset until told otherwise. |
| **EPA / USGS as source-of-truth** — no backend field exists for it | Nothing in Firestore references either. This is corpus/reference work, not a data-layer field. |

---

## 9. Reproducing this

```bash
npm run explore:fields      # scripts/exploreDeviceFields.sh  — device field census
npm run explore:surface     # scripts/exploreBackendSurface.sh — merge continuity, orgs, quota, billing
```

Both read `DEVICE_API_BASE_URL` / `DEVICE_API_TOKEN` from `.env`, pass the token via a header file
so it never appears in `argv`, never print it, and record raw bodies under `data/` (git-ignored).
Both are read-only: no `POST`, no write route, ever.
