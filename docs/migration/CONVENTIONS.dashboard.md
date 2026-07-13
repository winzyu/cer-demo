# Conventions reverse-engineered from `../user-dashboard`

> Source: read-only analysis of `../user-dashboard` (git branch as checked out on 2026-07-12).
> Goal: let a **new Node/Express + Firestore service** read as if the same team wrote it.

## ⚠️ Important framing: the reference is a frontend, not a backend

`user-dashboard` is a **Next.js 13 App Router SPA** (`package.json` name: `cer-ui`), deployed to
Cloud Run. It is **not** an Express service and has **no Firestore code, no validation library, no
logging library, and no tests.** It talks to a *separate* backend called **`cer-api`** (that is the
`../backend` reference repo, which this task does not cover).

So this document splits into two kinds of guidance:

1. **Transferable conventions** — style, naming, module system, config, the service-layer envelope,
   and the auth/token flow. These are real and should be matched.
2. **Backend contract reverse-engineered from the client** — because the dashboard *consumes* the
   `cer-api` responses, its service layer reveals the response/error envelope, auth header format,
   and route naming the backend already uses. A new service should be consistent with these.
3. **No evidence in this repo** — Express bootstrap, middleware order, Firestore init, error
   classes/middleware, server-side validation, and a test framework. These are called out explicitly
   so you know they are *choices to make*, ideally cross-checked against `../backend`, not things I
   invented from the dashboard.

---

## 1. Project layout & file naming

**Pattern.** Everything lives under `src/`, addressed through the `@/*` path alias (→ `./src/*`).
Code is grouped by role, and files are **kebab-case** with a dotted role suffix.

```
src/
  app/
    services/        # one file per API resource — the data-access layer
      auth.ts
      users.js
      organizations.js
      device-data.js
      payments.js
    shared/          # pure, single-purpose helpers
      capitalize-first-letter.js
      currency-formatter.js
      credit-card.utils.js
    providers/       # React context (main.context.js / main.provider.js)
    components/      # UI (kebab-case: edit-user-dialog.js, line-chart-apex.js)
    api/v1/[...path]/route.ts   # server route handlers (Next runtime)
  lib/
    apiProxy.ts      # cross-cutting infra
```

**Naming conventions observed:**
- Files: **kebab-case**, with a role/type suffix after a dot — `axios.config.js`,
  `main.provider.js`, `credit-card.utils.js`, `main.context.js`.
- One resource per service file; the file name *is* the domain (`users.js`, `organizations.js`).
- Exported functions: **camelCase** verbs — `getUsers`, `updateUserAccount`, `validateTokenAndGetUser`.
- Types/interfaces: **PascalCase** — `AuthResponse`, `LoginResponse`.

**Backend mapping.** Keep `src/` + `@/*` alias. Group by role. A new Express service would map
`services/` → data-access/service layer (one file per Firestore collection/resource), `shared/` →
`utils/`, `lib/` → cross-cutting infra (Firestore client, middleware). Keep the kebab-case + dotted
suffix (`user.service.js`, `firestore.config.js`, `auth.middleware.js`).

---

## 2. Module system, language (TS/JS)

**Pattern.** ESM everywhere in `src/` (`import` / `export`). Root config files are CJS
(`module.exports` in `next.config.js`, `postcss.config.js`). **Mixed TS + JS**: newer / more critical
code is TypeScript (`route.ts`, `apiProxy.ts`, `services/auth.ts`); the bulk is plain `.js`.

`tsconfig.json` is **loose**: `"strict": false`, `"allowJs": true`, `"esModuleInterop": true`,
`"module": "esnext"`, `"moduleResolution": "node"`, path alias `"@/*": ["./src/*"]`. `any` is used
freely.

**Exports are collected at the bottom of the file**, not declared inline:

```ts
// services/auth.ts
const login = async (/* … */) => { /* … */ };
const register = async (/* … */) => { /* … */ };

export { login, register, registerInvitation, forgotPassword, resetPassword, getLocalUser, verifyEmail };
export type { AuthResponse, LoginResponse };   // types re-exported separately
```

**Backend mapping.** Match the ESM + bottom-of-file named-export style. TypeScript is acceptable and
already present; if you use TS keep it loose (`strict: false`, liberal `any`) to match. Declare
interfaces inline, re-export types with `export type { … }`.

---

## 3. The service-layer envelope (the single most important pattern)

**Pattern.** Every data-access function is an `async` arrow function wrapping the call in
`try/catch` and returning a **uniform result object** — never throwing to the caller:

```js
// services/users.js
const getUsers = async () => {
  try {
    const { data } = await axios.get(`/users`);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: error.response?.data.error };
  }
};
```

The envelope is `{ success: boolean, data?: T, message?: string }`. In TypeScript this is made
explicit:

```ts
// services/auth.ts
interface AuthResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
}
```

Error messages are dug out of the upstream response defensively, in priority order:

```ts
message: errorData?.message || errorData?.error || axiosError.message || "Login failed";
```

**Backend mapping.** This is the team's core idiom. A new Express service should return the **same
`{ success, data | message }` envelope** from its handlers so the dashboard's existing services keep
working unchanged (see §7 for the exact error field the client reads). Service/data-access functions
internally can follow the same never-throw-return-a-result shape, or throw and let a wrapper convert —
but the wire format must stay `{ success, data, message }` for success and `{ error }` for failures
(§7).

---

## 4. Config loading & validation

**Pattern.** Plain `process.env.X` reads, wrapped in small **getter functions**, with **inline
fallback defaults**, environment-aware branching, and `console.warn` on missing values. **No config
library, no schema validation.**

```js
// services/axios.config.js
const getBaseURL = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (apiUrl) { /* … guards … */ return apiUrl; }
  if (process.env.NODE_ENV === "development") {
    console.warn("NEXT_PUBLIC_API_BASE_URL not set, defaulting to http://localhost:5001");
    return "http://localhost:5001";
  }
  return "";                     // same-origin in prod
};
```

```ts
// lib/apiProxy.ts
const API_PROXY_TARGET =
  process.env.API_PROXY_TARGET || "https://cer-api-98242557946.us-central1.run.app";
```

Conventions: `NEXT_PUBLIC_`-prefixed vars are client-exposed; unprefixed (`API_PROXY_TARGET`) are
server-only. Env vars are injected as Docker build `ARG`/`ENV` (see `Dockerfile`), not committed
`.env` files (none exist in the repo).

**Backend mapping.** Read `process.env` directly through small getter helpers with sensible fallback
defaults; `console.warn` on a missing non-critical var. There is **no precedent here for a config
schema (zod/convict/joi)** — introducing one would be new. If you want validation, keep it minimal
and check `../backend` first for an existing pattern.

---

## 5. Auth & identity flow

**Pattern.** **JWT Bearer tokens.** The client stores `token` in `localStorage` and attaches it via
an axios **request interceptor**; a **response interceptor** handles 401 by clearing the token and
redirecting to login.

```js
// services/axios.config.js
loggedInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers["Cache-Control"] = "no-cache";
  return config;
});

loggedInstance.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);
```

Two axios instances exist: `loggedInstance` (auth header attached) and `nonLoggedInstance` (login /
register / forgot-password, no token).

**Login contract (reverse-engineered).** The backend accepts `POST /api/v1/users/login` with
`{ email, password }` and returns a token + user under **any of several key names** — the client
normalizes them, which tells you what `cer-api` actually emits over time:

```ts
const token = rawData.accessToken || rawData.access_token || rawData.token;
const user  = rawData.payload || rawData.user;
```

**Backend mapping.** A new service should authenticate via `Authorization: Bearer <jwt>` and return
the token + user on login. Pick **one** stable key pair for a fresh service — recommend
`{ token, user }` (the normalized shape the client ultimately uses) — rather than reproducing the
legacy `accessToken`/`access_token`/`payload` drift. Verify the JWT in Express middleware
(e.g. `auth.middleware.js`) and hang identity off `req.user`. Confirm the signing secret/claims
against `../backend`.

---

## 6. Error handling

**Pattern.** **Try/catch at every call site**, returning the failure envelope. **No custom error
classes, no central error middleware, no error boundary** in the data layer. Defensive normalization
of uncertain upstream shapes (e.g. `normalizeAuthPayload` returns `null` rather than throwing when
the server payload is malformed).

**Backend mapping.** There is **no error-class or error-middleware precedent in this repo** — that is
a genuine design choice for the new service (and worth aligning with `../backend`). Whatever you
choose internally, the *wire contract* the dashboard expects is fixed: failures must serialize to an
`{ error: string }` body with the right HTTP status (see §7). A single Express error-handling
middleware that maps thrown errors → `{ error: err.message }` + status would satisfy the client while
staying clean; just don't expect the reference frontend to show you how they did it.

---

## 7. Success / error response envelope (the backend contract, read from the client)

The dashboard never defines the backend envelope, but its consumption pins it down:

**Success:** handlers return the resource **data directly** (not wrapped). The client wraps it into
its own `{ success: true, data }`:

```js
const { data } = await axios.get(`/users`);   // data === the array/object itself
return { success: true, data };
```

**Errors:** the client reads the error message from **`error.response.data.error`** as the primary
field (older JS services read *only* this), and TS services also fall back to `.message`:

```js
// users.js / organizations.js  — primary field is `error`
message: error.response?.data.error
```
```ts
// auth.ts  — accepts either, error first-ish
errorData?.message || errorData?.error || axiosError.message
```

**Conclusion / backend contract:**
- **Success:** respond with the raw resource JSON and an appropriate 2xx.
- **Error:** respond `{ "error": "<human message>" }` with a 4xx/5xx status. Including `message` too
  is harmless (TS services read it) but **`error` is the field the whole client relies on** — it is
  mandatory.
- **Auth success:** return the token + user object (recommend `{ token, user }`; §5).

---

## 8. Firestore / data access

**No evidence in this repo.** The dashboard has no database code — it is a pure API client. There is
no Firestore SDK, no collection references, no data-access-to-DB layer here.

**Recommendation.** Determine the Firestore conventions (client library — `@google-cloud/firestore`
vs `firebase-admin` —, initialization, collection reference style, direct calls vs a repository
layer) from **`../backend`**, not from this repo. What *this* repo dictates is only the shape the DB
layer must ultimately return over the wire (§3, §7) and the resource/route naming (§9).

---

## 9. Routing & API path conventions (observed via the client + the Next proxy)

**Pattern.** API is **versioned under `/api/v1`**. The Next.js `route.ts` handlers are a thin
catch-all proxy — a useful model for how a backend router is organized by resource, and it enumerates
the HTTP verbs explicitly:

```ts
// app/api/v1/[...path]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const path = params.path.join("/");
  return proxyToCerApi(request, `/api/v1/${path}`);
}
export const GET = handler; export const POST = handler; export const PUT = handler;
export const PATCH = handler; export const DELETE = handler; export const OPTIONS = handler;
```

**Endpoint naming seen in the service layer** (this is the real `cer-api` surface):
- Resource-oriented: `GET /users`, `POST /users`, `DELETE /users/:id`, `GET /organizations`.
- Some **RPC-style verbs** under a resource: `POST /users/login`, `POST /users/create`,
  `POST /users/forgot-password`, `POST /users/verify-email`,
  `PUT /users/reset-password/update/:id`, `GET /users/check-invitation/:email/:token`.
- IDs and tokens are **path params**, not query strings.
- A separate top-level `/auth/*` namespace exists alongside `/api/v1/*` (its own proxy route).

**Backend mapping.** Mount routers under `/api/v1`, one router per resource (`users`,
`organizations`, …). Match the existing mix of REST + RPC-ish action routes so URLs line up with what
the dashboard already calls. Keep IDs/tokens as path params.

---

## 10. Validation

**No evidence in this repo.** No zod/joi/yup; input "validation" is limited to light client-side
normalization (`email.trim().toLowerCase()`, `decodeURIComponent(token)`). Server-side validation
happens in `cer-api`, not here.

**Backend mapping.** Server-side request validation is a **new choice** — check `../backend` for the
prevailing library before introducing one. If none exists, a lightweight approach (manual checks or a
small schema lib) that returns the standard `{ error }` body (§7) on failure keeps consistency.

---

## 11. Logging

**Pattern.** `console.warn` / `console.log` only. **No logging library** (no winston/pino), no
structured/JSON logging, no request logging.

**Backend mapping.** `console.*` is the established norm. A structured logger would be new — reasonable
for a server, but call it out as a deviation and prefer matching `../backend` if it has one.

---

## 12. Lint / format / editor

- **ESLint:** `.eslintrc.json` extends **`next/core-web-vitals`** only. Lint script: `next lint`.
  (This preset is Next-specific and won't apply to a standalone Express service — you'll need a base
  config; there is no team ESLint ruleset to inherit beyond Next defaults.)
- **Prettier:** no config file, but the code is uniformly **Prettier-default**: **2-space** indent,
  **semicolons**, **trailing commas** in multiline. Editor enforces `tabSize: 2`, spaces.
- **Quote-style drift to be aware of:** newer **TS** files use **double quotes** (`route.ts`,
  `apiProxy.ts`, `auth.ts`); older **JS** services use **single quotes** (`users.js`,
  `organizations.js`). For new code, follow the **TS convention: double quotes** + trailing commas.
- `.npmrc`: `legacy-peer-deps=true` (+ a private `@here` registry, map-vendor specific).
- Package manager: **Yarn** (`yarn.lock`, `yarn install --frozen-lockfile` in Dockerfile).

---

## 13. Testing

**None.** No test framework in `package.json` (no jest/vitest/mocha/supertest), no `*.test.*` /
`*.spec.*` files anywhere in the repo.

**Backend mapping.** There is **no testing convention to match** — starting tests on the new service
is greenfield. Recommend a standard Node stack (Jest or Vitest + Supertest for HTTP) and mirror the
`src/` layout with co-located or `__tests__/` specs. Note explicitly in the migration plan that this
introduces a practice the reference team did not have.

---

## 14. Deployment / runtime (context)

- **Docker multi-stage** (`node:18` builder → `node:18-alpine` runtime), `EXPOSE 8080`,
  `NODE_ENV=production`, secrets injected as build `ARG`/`ENV`.
- Target platform: **Google Cloud Run** (`cloudbuild.yaml`, `deploy-cloud-run.sh`); legacy App Engine
  configs (`app.yaml`) also present.
- A new service should assume Cloud Run, listen on `PORT`/`8080`, and read secrets from env.

---

## Summary: what to copy vs. what to decide

| Category | Verdict | Source |
| --- | --- | --- |
| `src/` + `@/*` alias, kebab-case + dotted-suffix files, role-based folders | **Copy** | layout |
| ESM, bottom-of-file named exports, loose TS (`strict:false`, `any`) | **Copy** | tsconfig, services |
| `{ success, data, message }` service envelope | **Copy** | services/*.ts,js |
| Backend wire contract: raw data on success, `{ error }` on failure | **Match (client depends on it)** | users.js, auth.ts |
| Auth: `Authorization: Bearer <jwt>`, token+user on login | **Match** | axios.config.js, auth.ts |
| `/api/v1` versioning, resource+RPC route naming, path-param IDs | **Match** | route.ts, services |
| Config via `process.env` getters + fallbacks, `console.warn` | **Copy** | axios.config.js, apiProxy.ts |
| `console.*` logging, no logger | **Copy (or justify a logger)** | throughout |
| Prettier-default style, double quotes for new TS, 2-space, Yarn | **Copy** | TS files, .npmrc |
| Express bootstrap & middleware order | **Decide** — no precedent here | — (check `../backend`) |
| Firestore client, init, collection refs, repo layer | **Decide** — no precedent here | — (check `../backend`) |
| Error classes / central error middleware | **Decide** — no precedent here | — |
| Server-side validation library | **Decide** — no precedent here | — |
| Test framework & structure | **Decide** — greenfield, none exists | — |
