# Data Access — Findings & How-To

How sensor/device data is read in the existing system, what's actually in the repos vs. not, and what you need to add a new data call. Source of these findings: a read-through of `user-dashboard/` and `clean-earth-rovers-server/`.

Companion docs: `timeline.md` (the plan this feeds), `SPECS.md`, `BACKLOG.md`.

---

## TL;DR

- **All dashboard data access goes through one axios instance** (`services/axios.config.js`) that auto-attaches a **JWT bearer token** from `localStorage`.
- **Service files** (`services/*.js`) are the only place that call a backend. Pages import from them; pages never call axios directly.
- **The backend that actually serves `/water/*` and `/devices` is NOT in either repo on hand.** Its URL is injected at deploy via `NEXT_PUBLIC_API_BASE_URL`. The `clean-earth-rovers-server` repo only implements **auth + a basic water-data subset** under `/api/v1`, with different path shapes — the dashboard uses it for **auth only**.
- **Adding a new data call ≈ copy an existing service function.** The token is handled for you. The two real complications: (1) sensor readings come back **numeric-keyed**, not named, and (2) you must point at whichever backend actually answers the route.

---

## Flow chart (read path)

```
┌─────────────┐   login()       ┌──────────────────────┐
│  Login page │ ──────────────► │ /api/v1/users/login  │ (cer-server: auth matches)
└─────┬───────┘  email+pass     └──────────┬───────────┘
      │                                    │ { token, user }
      │  localStorage.setItem('token')     │
      ▼                                    ▼
┌──────────────────────────────────────────────────────┐
│  localStorage: token + user                           │
└─────┬────────────────────────────────────────────────┘
      │  read on every request
      ▼
┌─────────────┐  import   ┌──────────────────┐  axios.get()  ┌────────────────────────┐
│  Page /     │ ────────► │ services/*.js    │ ────────────► │ loggedInstance (axios) │
│  component  │  call fn  │ (device-data,    │  /water/...   │  + interceptor:        │
└─────────────┘           │  users, ...)     │  /devices     │  Authorization: Bearer │
                          └──────────────────┘               └───────────┬────────────┘
                                                                         │
                                                       ┌─────────────────▼──────────────────┐
                                                       │ PRODUCTION backend (NOT in repo)    │
                                                       │ serves /water/*, /devices, etc.     │
                                                       │ URL = NEXT_PUBLIC_API_BASE_URL      │
                                                       └─────────────────┬──────────────────┘
                                                                         │ numeric-keyed JSON
                                                       ┌─────────────────▼──────────────────┐
                                                       │ client-side decode (MetricsDict.)   │
                                                       │ 99→pH, 97→DO, ... then chart/group  │
                                                       └─────────────────────────────────────┘
```

Server-side (only if/when a call hits `clean-earth-rovers-server`): `route → controller → service → repository → getFirestoreInstance() → Firestore`.

---

## Step-by-step with code

### 1. Auth — get a token

`user-dashboard/src/app/services/auth.ts` — login hits the one endpoint that **does** exist on the cer-server, and normalizes the token field (the API has been inconsistent: `accessToken` / `access_token` / `token`).

```ts
// auth.ts
const response = await axios.post(`${BASE_URL}/api/v1/users/login`, { email, password });
const token = rawData.accessToken || rawData.access_token || rawData.token;
const user  = rawData.payload || rawData.user;
```

`login/page.js` persists it — this is the credential every later data call relies on:

```js
// login/page.js (onSubmit)
localStorage.setItem("token", data.token);
localStorage.setItem("user", JSON.stringify(data.user));
```

### 2. Instance creation — the shared axios client

`user-dashboard/src/app/services/axios.config.js` — base URL from env, token auto-attached, 401 → logout. You never set the header yourself.

```js
const loggedInstance = axios.create({ baseURL: getBaseURL() }); // NEXT_PUBLIC_API_BASE_URL

loggedInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

loggedInstance.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response.status === 401) {        // token bad/expired
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);
```

`getBaseURL()` throws in production if `NEXT_PUBLIC_API_BASE_URL` is unset; falls back to `http://localhost:5001` only in dev. **This env var is the single pointer to the real backend — and it's set at deploy, not in any committed file.**

### 3. Data call — a service function

`user-dashboard/src/app/services/device-data.js` — the standard shape: call `loggedInstance`, return `{ success, data }`. Examples:

```js
// latest reading for one rover
const { data } = await axios.get(`/water/last/${device}`);

// time-series for a window, optionally filtered by device(s)
const { data } = await axios.get(`/water/period/${duration}/${unit}`, {
  params: device ? { device } : null,
});

// the list of rovers this user owns
const { data } = await axios.get(`/devices`);
```

### 4. Decode — readings are numeric-keyed

This is the non-obvious bit. The API returns metrics under numeric keys; the dashboard maps them to names client-side (`device-data.js`):

```js
const MetricsDictionary = { PH:99, ORP:98, DISSOLVED_OXYGEN:97, CONDUCTIVITY:100, TEMPERATURE:102 };
// turbidity code: TBD — confirm during real-data discovery

// mapMetrics(): for each row, water_data[99] -> "PH", water_data[97] -> "DISSOLVED_OXYGEN", ...
const value = water_data[MetricsDictionary[key]];
```

Anything consuming raw water data (a chart, a report, the RAG sensor tool) must apply this decode.

### 5. (Server side) Firestore instance — only relevant if a call hits the cer-server

`clean-earth-rovers-server/src/config/database.ts` — how the in-repo server connects. `DB_ENVIRONMENT` only switches *which database*, not which endpoints exist.

```ts
const dbEnv = process.env.DB_ENVIRONMENT || "main";          // 'main' | 'qa'
const databaseId = dbEnv === "qa" ? "qa-db" : "(default)";   // same GCP project
return new Firestore({ projectId, databaseId, keyFilename? }); // key file if present, else ADC
```

Server query pattern (repository → Firestore), e.g. `WaterDataRepository.findByDevices`:

```ts
this.waterDataCollection = this.db.collection("water-data");
const snap = await this.waterDataCollection.where("device", "in", devices).get();
```

---

## What's in `clean-earth-rovers-server` (and what isn't)

**Implemented** (under `/api/v1`): `users` (incl. `/login`, `/create`, `/verify-email`, password reset), `water-data` (`/`, `/:id`), `duration` (`/live`, `/week`, `/month`, `/six-months`, `/year`, `/five-years`, each + `/device`), `device` (`/?device=`), `test-db`.

**NOT implemented anywhere in the repo:** `/devices` (the user's rover list), `/water/period`, `/water/chart`, `/water/last`, `/water/average`, `/water/tides`, `/water/export/csv`, `/payments/*`, `/gilligan/*`, `/organizations`, `/users/profile-picture`, `/users/account/:id`, `/users/check-invitation`.

The dashboard calls all of the second list. So **the cer-server is not the backend behind the dashboard's data** — it's a partial rewrite that overlaps on auth only, and the routes don't even share a prefix (`/api/v1/water-data` vs. the dashboard's `/water/...`). The live data backend is a separate service not in your checkout.

**Implication for your work:** don't model new data calls on the cer-server's routes — model them on the **dashboard service functions**, and resolve which backend URL actually answers them (see `timeline.md` Phase 4 access-discovery).

---

## Adding a new data call — what you need

Your instinct is right: **it's mostly copy an existing service function.** Minimum recipe:

```js
// services/your-feature.js
import { loggedInstance as axios } from './axios.config';

export const getYourData = async (params) => {
  try {
    const { data } = await axios.get(`/your/endpoint`, { params });
    return { success: true, data };
  } catch (error) {
    return { success: false, message: error.response?.data.error };
  }
};
```

The token, base URL, and 401 handling are inherited from `loggedInstance` for free.

**The added complexity to be aware of (not huge, but real):**

1. **The endpoint must exist on the live backend.** New *read* shapes you want may not be served yet — and that backend isn't in the repo, so you can't add a route to it from here. Confirm the route exists (or who owns adding it) before building the UI against it.
2. **Numeric-key decode.** Any new consumer of water data must apply `MetricsDictionary` (§4). Don't assume named fields.
3. **Auth scoping.** Data is per-user via the token; the user must be logged in (token in `localStorage`). A call made server-side or pre-login has no token unless you forward one.
4. **Response-shape inconsistency.** The API wraps results differently per route (`{ returnArray }`, `{ deviceData }`, `{ waterData }`, or a bare array). Check the shape per endpoint.
5. **Env dependency.** Everything keys off `NEXT_PUBLIC_API_BASE_URL`. Locally you need it set (or the dev fallback); in prod it's required.

**For the RAG / backend-mediated path (per `timeline.md`):** the same calls apply, but instead of reading the token from `localStorage` (browser-only), the chatbot backend must **receive and forward the user's JWT** on the outbound request — that's the one structural difference from the dashboard's pattern. Everything else (route, params, decode) is identical.

---

## Quick reference — dashboard service → endpoint

| Service file | Function(s) | Endpoint(s) |
|---|---|---|
| `device-data.js` | `getLastDataByDevice` | `/water/last/:device` |
| | `getDeviceData` | `/water/period/:duration/:unit` |
| | `getChartData` | `/water/chart/:duration/:unit/:metric/:tz` |
| | `getDeviceDataGauge` / `getDeviceDataAverage` | `/water/average/...` |
| | `getDeviceTides` | `/water/tides/:device/:start/:end` |
| | `exportCSV` | `/water/export/csv/:device` |
| | `getDevices` / `getDevicesGlobal` | `/devices` |
| | `createDevice` / `updateDevice` | `/devices`, `/devices/:id` |
| `users.js` | `getUsers`, `createUser`, ... | `/users`, `/users/:id`, ... |
| `auth.ts` | `login`, `register`, ... | `/api/v1/users/*` *(matches cer-server)* |
| `payments.js`, `gilligan.js`, `organizations.js` | various | `/payments/*`, `/gilligan/*`, `/organizations` |
