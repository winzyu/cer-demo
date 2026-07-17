# Canonical Conventions — new Node/Express + Firestore service

Reconciled from two reverse-engineered sources in this folder:

- **`CONVENTIONS.server.md`** — from `../clean-earth-rovers-server`, an **actual Node/Express +
  Firestore backend** (this is the `cer-api` service). TypeScript, strict, class-based.
- **`CONVENTIONS.dashboard.md`** — from `../user-dashboard` (`cer-ui`), a **Next.js frontend** that
  *consumes* that backend. It has no Firestore/validation/test code, so much of its "backend"
  guidance is inferred from how it calls the API.

**How they relate (important):** the server repo *is* the backend the dashboard talks to. The routes,
the login-key drift, and the `/auth` namespace that the dashboard reverse-engineered from its client
match the server's real code. Therefore:

- For **backend mechanics** (Firestore, error middleware, validation, tests, bootstrap) the server is
  authoritative and the dashboard simply had "no evidence" — no conflict, use the server.
- For the **wire contract** (success/error shapes, auth response), the dashboard tells you what a
  **deployed client already depends on**, so it constrains what the new service may emit.
- For **cross-cutting style** (naming, TS strictness, OOP vs functional, lint, package manager) the
  two teams genuinely **diverge** — those are flagged below with a recommendation, not silently merged.

> ⚠️ **Security note (carried from the server doc):** the server repo's `test/setup/jest.config.js` is
> a single line of obfuscated JavaScript that overrides `require` and self-decodes a payload. Do **not**
> copy it; treat it as suspect and investigate separately.

---

## Disagreements at a glance

| # | Topic | Server (`cer-api`) | Dashboard (`cer-ui`) | Recommendation |
| --- | --- | --- | --- | --- |
| 1 | File naming | `PascalCase` classes / `camelCase` modules / `*.schema.ts` | **kebab-case** + dotted suffix | **Server** for the backend; note the cross-repo drift |
| 2 | TS strictness | `strict: true`, full strict flags | `strict: false`, `allowJs`, liberal `any` | **Server** — strict; it's cleaner and more recent |
| 3 | Module output | `commonjs` | `esnext` | **Server** (`commonjs`) — correct for Node/Express |
| 4 | Export style | inline `export class`/`export const` | bottom-of-file `export { … }` | **Server** — inline |
| 5 | Paradigm | classes + constructor DI | functional arrow modules | **Server** — classes+DI (testing seam); genuine divergence |
| 6 | Success envelope | named-key wrap, **inconsistent** | inferred "raw data" | **Neither as-is** — pick ONE consistent shape (below) |
| 7 | Login response keys | `{accessToken, payload}` **and** `{access_token, user}` | normalizes to `{token, user}` | **`{ token, user }`** — kill the drift |
| 8 | Missing required env | **throws** in prod | `console.warn` | **Server** — throw for required, warn for optional |
| 9 | Body `status` field | mixed `404` / `"404"` | n/a | **Drop it or numeric-only** — HTTP status carries it |
| 10 | ESLint base | `airbnb-base` (no TS parser wired) | `next/core-web-vitals` | **`airbnb-base` + `@typescript-eslint`** (fix the gap) |
| 11 | Package manager | **npm** (`package-lock.json`) | Yarn (`yarn.lock`) | **npm** — matches the actual backend |

Everything else (routing, auth transport, config approach, error `error` field, double quotes, Cloud
Run) the two sources **agree** on — noted inline.

---

## 1. Project layout & file naming

**Canonical (server-based), grouped by technical role under `src/`:**

```
src/
  index.ts                 # entry: import app, listen on PORT
  app.ts                   # express assembly (middleware, routers), exported — no listen
  config/
    database.ts            # getFirestoreInstance()
    settings.ts            # env-derived URLs / required-var getters
  routes/
    index.ts               # aggregates feature routers under /api/v1
    userRoutes.ts          # one default-exported Router per resource
  controllers/  UserController.ts     # class, arrow-fn handlers
  services/     UserService.ts        # business logic, constructor DI
  models/       UserRepository.ts     # Firestore data-access layer
  schemas/      user.schema.ts        # zod schemas + z.infer types
  validators/   userValidators.ts     # zod-in-middleware
  dto/          userDTO.ts            # response formatters
  middleware/   auth.ts errorHandler.ts notFound.ts roles.ts
  types/        auth.types.ts express.types.ts
  utils/        errors.ts …
```

> ⚠️ **Disagreement #1 — file naming.** The **server** uses `PascalCase` for class files
> (`UserController.ts`, `UserRepository.ts`), `camelCase` for non-class modules (`userRoutes.ts`),
> and `*.schema.ts` / `*.types.ts` dotted suffixes. The **dashboard** uses uniform **kebab-case with
> dotted role suffixes** (`credit-card.utils.js`, `main.provider.js`, and — mapped to a backend —
> `user.service.js`, `auth.middleware.js`).
> **Recommendation: follow the server.** You are writing a backend, and the server is the reference
> backend. Use PascalCase for class files, camelCase for the rest. If cross-repo file-name consistency
> with the frontend team matters more than matching the backend, kebab-case is their house style — but
> don't mix both in one service.

Shared rules **both** repos agree on: one resource per file; the filename *is* the domain; exported
functions are `camelCase` verbs; types/interfaces are `PascalCase`.

---

## 2. Module system, language, TS config

**Canonical:** TypeScript compiled with `tsc`, **CommonJS output + ESM import syntax**, **strict**.

```jsonc
// tsconfig.json (from the server — adopt as-is)
{
  "compilerOptions": {
    "target": "ES2020", "module": "commonjs", "lib": ["ES2020"],
    "outDir": "./dist", "rootDir": "./src",
    "strict": true, "esModuleInterop": true, "resolveJsonModule": true,
    "noUnusedLocals": true, "noUnusedParameters": true,
    "noImplicitReturns": true, "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- Import default-interop packages as `import x from "..."`; namespace-import Node builtins as
  `import * as path from "path"`.
- Unused params prefixed `_` (`_req`, `_res`, `_next`) to satisfy `noUnusedParameters`.

> ⚠️ **Disagreements #2, #3, #4.** The **dashboard** is loose (`strict: false`, `allowJs: true`,
> liberal `any`), targets `esnext` modules (correct for Next.js, not for Node), and collects
> **exports at the bottom** of each file (`export { login, register }`). The **server** is
> `strict: true`, `commonjs`, and exports **inline** (`export class UserService`).
> **Recommendation: server on all three.** Strict TS is cleaner and is the more recent of the two
> codebases; `commonjs` is the right module target for Express; inline exports read better. Reserve
> `any` for genuine Firestore-snapshot escapes, not as a default.

---

## 3. Express bootstrap, middleware order, routing

**Canonical (server; the dashboard's inferred routing agrees exactly).** Split `index.ts`
(listen only) from `app.ts` (assembly, exported for supertest).

```ts
// src/app.ts — middleware order is load-bearing
const app = express();
app.use(morgan("dev"));
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json());

app.use("/api/v1", api);              // versioned API surface
app.use("/auth", legacyAuthRoutes);   // separate legacy namespace

app.use(notFound);       // -> http-errors NotFound
app.use(errorHandler);   // terminal, always last
```

Routers: one `Router` per resource, aggregated in `routes/index.ts`, mounted under `/api/v1`.

**Both sources agree** on the API surface:
- Versioned under **`/api/v1`**, plus a separate top-level **`/auth/*`** namespace.
- Resource routes **+ RPC-style action routes** under a resource: `POST /users/login`,
  `POST /users/create`, `POST /users/forgot-password`, `POST /users/verify-email`,
  `PUT /users/reset-password/update/:id`, `GET /users/check-invitation/:email/:token`.
- IDs and tokens are **path params**, never query strings.

Order to replicate: `morgan → helmet → cors → express.json → routers → notFound → errorHandler`.

---

## 4. Firestore & data-access layer

**Canonical: server (the dashboard has no DB code — it explicitly defers here, no conflict).**

- Client library: **`@google-cloud/firestore`** (`new Firestore(...)`), *not* the Firebase client SDK.
  (`firebase-admin` is a dep but data access goes through the GCP SDK.)
- One factory `getFirestoreInstance()`; credentials fall back from local `serviceAccountKey.json` to
  ADC; `DB_ENVIRONMENT` selects the database id (`(default)` vs `qa-db`).
- **Data access = Repository classes in `models/`.** Controllers/services never touch Firestore
  directly. The repo caches its collection ref in the constructor and takes an injectable `db`.

```ts
export class UserRepository implements UserRepositoryInterface {
  private db: Firestore;
  private usersCollection: FirebaseFirestore.CollectionReference;
  constructor(db?: Firestore) {
    this.db = db || getFirestoreInstance();
    this.usersCollection = this.db.collection("users");
  }
  async findById(id: string): Promise<UserResponse | null> {
    const doc = await this.usersCollection.doc(id).get();
    if (!doc.exists || !doc.data()) return null;
    return this.cleanUserData(doc);          // snapshot -> domain, injects id: doc.id
  }
  async create(data: UserDocument) {
    const validated = userDocumentSchema.parse(data);   // zod on write
    const ref = await this.usersCollection.add(validated);
    return { id: ref.id, user: validated };
  }
}
```

Conventions: reads return `T | null`, lists return `T[]`; `.parse()` documents with the zod
`*DocumentSchema` on the way in; private `cleanUserData(doc)` maps snapshot → response injecting
`doc.id`.

---

## 5. Validation

**Canonical: server (dashboard had none — no conflict).** **Zod**, schemas in `schemas/*.schema.ts`
as the single source of truth (types via `z.infer`), run as **route-level middleware** before the
controller.

```ts
export const createUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

// validators/userValidators.ts
export const validateCreateUser = (req, _res, next): void => {
  try { createUserSchema.parse(req.body); next(); }
  catch (e: any) {
    const msg = e.errors?.map((x: any) => `${x.path.join(".")}: ${x.message}`).join(", ");
    throw new ValidationError(msg || "Invalid user data");   // -> §6, becomes { error }
  }
};

// wired before the handler:
router.post("/create", validateCreateUser, userController.createUser);
```

Keep the two schema flavors distinct: **input schemas** for request validation vs **document schemas**
for the Firestore shape.

---

## 6. Error handling & the response envelope

This is the area where the two sources **most need reconciling**, because the server's *actual* output
and the dashboard's *inferred* contract don't fully line up.

### Error handling mechanics — canonical: server

`http-errors` + thin subclasses in `utils/errors.ts`, one terminal `errorHandler` middleware.
Controllers `try/catch → next(error)`; sync middleware `throw`s an error class.

```ts
export class ValidationError extends createError.BadRequest { constructor(m = "Validation error") { super(m); } }
export class ConflictError  extends createError.Conflict   { constructor(m = "Conflict") { super(m); } }
// … NotFound / Unauthorized / Forbidden similarly
```

### The wire contract — reconciled

**Errors — the two sources are compatible, so this one is settled:**
- The dashboard client reads **`error.response.data.error`** as its primary field (TS services also
  fall back to `.message`).
- The server already emits `{ message, error, status }` — i.e. it **includes `error`**.
- ✅ **Canonical error body: `{ "error": "<message>", "message": "<message>" }` with a 4xx/5xx HTTP
  status.** `error` is **mandatory** (the whole client depends on it); duplicating into `message` is
  harmless and satisfies the TS services. Make `errorHandler` guarantee the `error` key.

> ⚠️ **Disagreement #9 — the body `status` field.** The server sprinkles a `status` field into bodies
> and is **inconsistent**: sometimes numeric (`status: 404`), sometimes a string (`status: "404"`).
> The dashboard neither sets nor reads it. **Recommendation: drop `status` from the body** (the HTTP
> status line already carries it); if you keep it for legacy reasons, make it **numeric, always**.
> Do not replicate the string/number drift.

> ⚠️ **Disagreement #6 — the SUCCESS envelope (the real conflict).** The **dashboard doc** states the
> backend "returns the resource data directly (not wrapped)" and the client re-wraps it into its own
> `{ success, data }`. The **server actually wraps** responses in **named keys** and does so
> inconsistently: `{ allUsers: [...] }`, `{ userById: {...} }`, and for login
> `{ message, status, payload, accessToken }`. These descriptions contradict each other; in reality
> the client's generic wrapper just stuffs whatever the server returns into `.data`, and each
> component then reaches for the named key.
> **Recommendation: adopt ONE consistent success shape for the new service — do not inherit the
> server's ad-hoc mix.** Two clean options:
> - **(Preferred) Envelope:** `{ "success": true, "data": <payload> }` for every success. This is the
>   shape the dashboard's own service layer already produces internally, so it reads as native to the
>   team, and it is uniform.
> - **Raw payload:** return the resource JSON directly with a 2xx. Simpler, also matches the
>   dashboard's stated assumption.
> Pick one and apply it everywhere. **Avoid** the server's per-endpoint named keys and its
> string-typed `status`. If you must stay drop-in compatible with the *currently deployed* dashboard
> for a specific endpoint, match that endpoint's existing key precisely and leave a `// legacy shape`
> comment — don't generalize the inconsistency.

DTO formatter classes (`dto/*`) remain the right place to centralize response shaping regardless of
which envelope you choose.

---

## 7. Auth & identity

**Both sources agree on the transport; they diverge only on the login response keys.**

Agreed and canonical:
- **JWT Bearer** — `Authorization: Bearer <jwt>`. Verify in middleware, hang identity off `req.user`
  via an `AuthenticatedRequest` type.
- Passwords hashed with **Argon2** (server; the dashboard is a client and has no opinion — adopt it).
- Role authorization via a composable `requireRoles(...roles)` guard (server).

```ts
export const authenticateToken = (req: AuthenticatedRequest, _res, next): void => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) throw new UnauthorizedError("Access token is required");
  try { req.user = new AuthService().verifyToken(token); next(); }
  catch { throw new UnauthorizedError("Invalid or expired token"); }
};
```

> ⚠️ **Disagreement #7 — login response keys.** The **server emits drifted shapes**: its newer
> `login` returns `{ message, status, payload, accessToken }` while `legacyLogin` (under `/auth/signin`)
> returns `{ access_token, user }`. The **dashboard** has to normalize all of it:
> `token = accessToken || access_token || token` and `user = payload || user`.
> **Recommendation: emit ONE stable pair — `{ token, user }`** (the shape the client normalizes *to*).
> It's the cleanest and drops three legacy aliases. Only keep an `accessToken`/`access_token` alias if
> a not-yet-updated client build still needs it, and mark it legacy. Confirm the signing secret/claims
> against `../backend` before finalizing.

---

## 8. Config loading & validation

**Both sources agree on the approach**, with one refinement to take from the server.

- Read `process.env` through **small getter functions** with sensible fallback defaults; load via
  `import "dotenv/config"`. **No config-schema library** (neither repo uses zod/convict/joi for
  config, and introducing one would be new — check `../backend` first if you want it).
- `NEXT_PUBLIC_`-style client/server env split is a frontend concern; for the backend just keep
  server-only vars unprefixed.

> ⚠️ **Disagreement #8 — missing required vars.** The **dashboard** only `console.warn`s. The
> **server** *throws* in production when a required var (e.g. `PROD_BASE_URL`, `ACCESS_TOKEN_SECRET`)
> is missing, and ships a `scripts/check-production-env.js` pre-deploy gate.
> **Recommendation: server behavior** — throw for genuinely required secrets, `console.warn` for
> optional ones with a default. Keep a pre-deploy env check.

Key vars: `NODE_ENV`, `PORT`, `DB_ENVIRONMENT` (`main`|`qa`), `ACCESS_TOKEN_SECRET`, base/frontend URL
family, mail creds.

---

## 9. Logging

- **HTTP request logging: `morgan("dev")`** (server; the dashboard is a frontend and has none —
  morgan is the right add for a backend). Register first in the chain.
- Ad-hoc diagnostics: **`console.*`** — *both* repos use it, no structured logger (no pino/winston).
  Prefix with a bracketed subsystem tag, e.g. `[DB Config] …` (server style).
- A structured logger would be a **new** practice for this team — reasonable, but flag it as a
  deviation and check `../backend` first.

---

## 10. Lint / format / tooling

**Agreed:** 2-space indent, semicolons, trailing commas, and **double quotes for new code** (both
repos' newer TS files use double quotes; both have quote drift in older files — don't churn them).
No Prettier config exists in either; the code is Prettier-default regardless.

> ⚠️ **Disagreement #10 — ESLint base.** The **server** extends `airbnb-base` but **never wires in the
> `@typescript-eslint` parser** (so its TS isn't really linted, and `quotes` is disabled → mixed
> quotes). The **dashboard** extends `next/core-web-vitals`, which is Next-specific and doesn't apply
> to a standalone Express service.
> **Recommendation: `airbnb-base` + `@typescript-eslint/parser` + `plugin:@typescript-eslint/recommended`**
> — i.e. keep the server's chosen base but fix its gap. Re-enable `quotes: ["error", "double"]`.

> ⚠️ **Disagreement #11 — package manager.** Server uses **npm** (`package-lock.json`); dashboard uses
> **Yarn** (`yarn.lock`, `--frozen-lockfile`). **Recommendation: npm**, to match the actual backend
> and its `predeploy` script chain.

---

## 11. Testing

**Canonical: server (the dashboard has no tests — greenfield, no conflict).**

- **Jest + `ts-jest` + `supertest`** against the exported `app`; `@faker-js/faker` for factories.
- Layout under `test/` (excluded from the build): `unit/` and `integration/` mirroring `src/`,
  files `*.test.ts`, `describe`/`it`, class-based helpers (`AuthHelper.generateTokenForUser`).
- Scripts: `test`, `test:watch`, `test:coverage`; `predeploy = build && check-prod && test`.

```ts
import request from "supertest";
import app from "../../../src/app";
describe("GET /api/v1/users/all", () => {
  it("returns users", async () => {
    const res = await request(app).get("/api/v1/users/all").expect("Content-Type", /json/);
    expect([200, 404]).toContain(res.status);
  });
});
```

> ⚠️ Do **not** base your Jest config on the server's `test/setup/jest.config.js` (obfuscated payload —
> see the note at the top). Write a clean `ts-jest` config from scratch.

---

## 12. Paradigm note (cross-cutting)

> ⚠️ **Disagreement #5 — OOP vs functional.** The **server** is class-based: controllers, services, and
> repositories are classes with **constructor dependency injection** (optional args defaulting to
> `new Concrete()`), which is its testing seam. The **dashboard** is functional: modules of `async`
> arrow functions, no classes.
> **Recommendation: server's class + DI style for the backend.** The DI seam is what makes the
> services unit-testable, and it's the established pattern in the reference backend. Handlers are
> class-property arrow functions (`async (req, res, next): Promise<void>`) so `this` binds when passed
> as route handlers. (If a piece of logic is genuinely a pure helper, a plain exported function —
> dashboard-style — is fine; reserve classes for controllers/services/repositories.)

---

## 13. Deployment (context, both repos agree)

Target **Google Cloud Run**, Docker multi-stage (`node:18` → `node:18-alpine`), listen on
`PORT`/`8080`, `NODE_ENV=production`, secrets injected as env (no committed `.env`).

---

## One-screen checklist for the new service

1. TS + **CommonJS + strict**; `src/` role-based folders; `app.ts`/`index.ts` split. *(server)*
2. File naming: PascalCase classes, camelCase modules, `*.schema.ts`/`*.types.ts`. *(server; #1)*
3. Middleware order morgan → helmet → cors → json → routers → notFound → errorHandler; `/api/v1` +
   `/auth`, REST+RPC routes, path-param IDs. *(both agree)*
4. Firestore via `@google-cloud/firestore` + `getFirestoreInstance()`; **Repository classes in
   `models/`** with injectable `db`. *(server)*
5. **Zod** schemas + validation middleware. *(server)*
6. `http-errors` + `errorHandler`; **error body `{ error, message }`**, `error` mandatory; **drop
   body `status`** or keep numeric. *(reconciled; #6, #9)*
7. Pick **one** success envelope (`{ success, data }` preferred) — not the server's ad-hoc named keys. *(#6)*
8. JWT Bearer + `req.user` + Argon2 + `requireRoles`; login returns **`{ token, user }`**. *(#7)*
9. `process.env` getters, **throw on missing required var**, no config-schema lib. *(#8)*
10. `morgan` + tagged `console.*`. *(server)*
11. `airbnb-base` + `@typescript-eslint`, double quotes, **npm**. *(#10, #11)*
12. Jest + supertest, `unit/`+`integration/` mirroring `src/`; clean jest config. *(server)*
13. Class + constructor-DI for controllers/services/repositories. *(server; #5)*

*Open items to confirm against `../backend` before finalizing: JWT signing secret/claims, whether a
config-schema or structured logger is already in use, and the exact success envelope the currently
deployed dashboard requires per endpoint.*
