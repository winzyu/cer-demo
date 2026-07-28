# Server Conventions — reverse-engineered from `clean-earth-rovers-server`

Reference repo (read-only): `../clean-earth-rovers-server`. This document captures
the patterns a new Node/Express + Firestore service must follow to look like the
same team wrote it. Each section gives the convention plus a representative snippet
copied/adapted from the reference.

> ⚠️ **Security note (out of scope, but flagging):** `test/setup/jest.config.js` in the
> reference repo contains a single line of heavily obfuscated JavaScript that overrides
> `require` and self-decodes a payload. It does not reflect any real convention — do **not**
> copy it. Treat it as suspicious and worth a separate investigation.

---

## 0. Stack at a glance

| Aspect | Choice |
| --- | --- |
| Language | **TypeScript** (`typescript ^5.3`), compiled with `tsc` to `dist/` |
| Module system | **CommonJS** (`"module": "commonjs"`) with `esModuleInterop` — ESM-style `import` syntax, CJS output |
| Runtime | Node, Express 4 (`express ^4.18`) |
| Datastore | Firestore via `@google-cloud/firestore ^6` (server SDK, **not** `firebase-admin` for data access) |
| Validation | **Zod** (`zod ^3`) |
| Auth | JWT (`jsonwebtoken`) + Argon2 password hashing (`argon2`) |
| Errors | `http-errors` + thin custom subclasses |
| Logging | `morgan("dev")` |
| Tests | **Jest** + `ts-jest` + `supertest` |
| Lint | ESLint `airbnb-base` (see caveats) |
| Dev server | `ts-node-dev --respawn --transpile-only src/index.ts` |

`package.json` is still named `express-api-starter` (w3cj scaffold) — the codebase grew
from that starter, which explains the `src/app.ts` + `src/index.ts` split.

---

## 1. Project layout & file naming

Everything lives under `src/`, organized by **technical role** (not by feature):

```
src/
  index.ts                 # process entry: import app, listen
  app.ts                   # express app assembly (middleware, routers) — exported, no listen
  config/
    database.ts            # getFirestoreInstance()
    settings.ts            # env-derived URLs (envSwitchURL, getFrontendURL)
  routes/
    index.ts               # mounts all feature routers under /api/v1
    userRoutes.ts          # one file per resource, default-exports a Router
    legacyRoutes.ts        # legacy-compat endpoints mounted separately
  controllers/
    UserController.ts      # class, arrow-fn handlers, (req,res,next)
  services/
    UserService.ts         # business logic; class with constructor DI
    AuthService.ts
    FirestoreService.ts
  models/                  # <-- the data-access / repository layer
    UserRepository.ts      # class wrapping a Firestore collection
  schemas/
    user.schema.ts         # zod schemas + inferred types (source of truth for shapes)
    common.schema.ts
  validators/
    userValidators.ts      # express middleware that runs a zod schema on req.body
  dto/
    userDTO.ts             # static formatter class -> response shaping
  middleware/
    auth.ts errorHandler.ts notFound.ts roles.ts
  types/
    auth.types.ts express.types.ts user.types.ts   # *.types.ts for hand-written interfaces
  utils/
    errors.ts celsiusToFahrenheit.ts ...            # small pure helpers, camelCase files
  api/api_methods/*.js     # LEGACY plain-JS layer — do NOT extend; new work is TS
```

**Naming rules observed:**
- Classes and their files: `PascalCase` — `UserController.ts`, `UserRepository.ts`, `UserService.ts`.
- Non-class modules: `camelCase.ts` — `userRoutes.ts`, `userValidators.ts`, `assignOrganization.ts`.
- Dotted suffixes carve out sub-roles: `*.schema.ts` (zod), `*.types.ts` (interfaces).
- Repositories live in `models/` and are named `<Entity>Repository.ts`.
- One default-exported `Router` per route file; controllers/services/repos are **named** class exports.

---

## 2. Express bootstrap, middleware order, router registration

`index.ts` only starts the process; `app.ts` builds and exports the app (so tests can
`import app` into supertest without opening a port).

```ts
// src/index.ts
import app from './app';

const port = process.env.PORT || 5001;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Listening: http://localhost:${port}`);
});
```

```ts
// src/app.ts  — middleware order is load-bearing, keep it
import express, { Express } from "express";
import morgan from "morgan";
import helmet from "helmet";
import cors from "cors";
import "dotenv/config";

import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import api from "./routes";
import legacyAuthRoutes from "./routes/legacyRoutes";

const app: Express = express();

app.use(morgan("dev"));
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(cors());               // wide-open CORS
app.use(express.json());       // JSON body parsing (no urlencoded)

app.get("/", (_req, res) => {
  res.json({ message: "😢 🙈 Sorry no data here 🙅 🚫" });
});

app.use("/api/v1", api);            // versioned API surface
app.use("/auth", legacyAuthRoutes); // legacy endpoints mounted at a separate root

app.use(notFound);      // 404 -> forwards an http-errors NotFound
app.use(errorHandler);  // terminal error middleware, always last
```

**Router aggregation** — `routes/index.ts` is the single mount point; add new resources here:

```ts
// src/routes/index.ts
const router = Router();
router.use("/users", userRoutes);
router.use("/water-data", waterDataRoutes);
router.use("/devices", devicesRoutes);
// ...
export default router;
```

Order to replicate: `morgan` → `helmet` → `cors` → `express.json` → app routes →
`notFound` → `errorHandler`.

---

## 3. Firestore: client, init, collection references, data access

- Client library: **`@google-cloud/firestore`** (`new Firestore(...)`), not the Firebase
  client SDK. (`firebase-admin` is a dependency but data access goes through the GCP SDK.)
- A single factory, `getFirestoreInstance()`, builds the client. Credentials fall back
  from a local `serviceAccountKey.json` to Application Default Credentials.
- Environment picks the database ID (`(default)` for main, `qa-db` for QA).

```ts
// src/config/database.ts
import * as path from "path";
import * as fs from "fs";
import { Firestore } from "@google-cloud/firestore";
import "dotenv/config";

export const getFirestoreInstance = (): Firestore => {
  const dbEnv = process.env.DB_ENVIRONMENT || "main"; // 'main' | 'qa'
  const projectId = "conductive-fold-343604";
  const keyFilename = path.join(__dirname, "../../serviceAccountKey.json");
  const databaseId = dbEnv === "qa" ? "qa-db" : "(default)";

  const config: { projectId: string; databaseId: string; keyFilename?: string } = {
    projectId,
    databaseId,
  };
  if (fs.existsSync(keyFilename)) {
    config.keyFilename = keyFilename;               // explicit SA key if present
  }                                                  // else ADC
  return new Firestore(config);
};
```

**Data-access layer = Repository classes in `models/`.** Controllers/services never touch
Firestore directly; they go through a `<Entity>Repository`. The repo caches the collection
reference in its constructor and accepts an injectable `db` for testing.

```ts
// src/models/UserRepository.ts (shape)
export class UserRepository implements UserRepositoryInterface {
  private db: Firestore;
  private usersCollection: FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>;

  constructor(db?: Firestore) {
    this.db = db || getFirestoreInstance();
    this.usersCollection = this.db.collection("users");
  }

  async findById(id: string): Promise<UserResponse | null> {
    const doc = await this.usersCollection.doc(id).get();
    if (!doc.exists || !doc.data()) return null;
    return this.cleanUserData(doc);
  }

  async create(userData: UserDocument): Promise<{ id: string; user: UserDocument }> {
    const validated = userDocumentSchema.parse(userData);  // zod-validate before write
    const ref = await this.usersCollection.add(validated);
    return { id: ref.id, user: validated };
  }
}
```

Conventions inside repos:
- Read methods return `T | null` (null for missing), list methods return `T[]`.
- Documents are re-validated with the zod `*DocumentSchema` on the way in (`.parse`) and on
  the way out where practical.
- Private `cleanUserData(doc)` helpers map a Firestore snapshot → domain/response object,
  injecting `id: doc.id`.
- `FirestoreService` exists as a minimal generic wrapper (`getCollection(name)`) for ad-hoc
  collections, but the Repository pattern is the norm for real entities.

---

## 4. Error handling

- Base library: **`http-errors`**. Custom error classes in `src/utils/errors.ts` are thin
  subclasses that just set a default message — they preserve `statusCode` from `http-errors`.
- One terminal `errorHandler` middleware formats everything. Handlers/middleware either
  `throw` an error class (sync middleware) or `catch (error) { next(error); }` (async
  controllers).

```ts
// src/utils/errors.ts
import createError from 'http-errors';

export class NotFoundError extends createError.NotFound {
  constructor(message = 'Resource not found') { super(message); }
}
export class ValidationError extends createError.BadRequest {
  constructor(message = 'Validation error') { super(message); }
}
export class UnauthorizedError extends createError.Unauthorized {
  constructor(message = 'Unauthorized') { super(message); }
}
export class ForbiddenError extends createError.Forbidden {
  constructor(message = 'Forbidden') { super(message); }
}
export class ConflictError extends createError.Conflict {
  constructor(message = 'Conflict') { super(message); }
}
```

```ts
// src/middleware/errorHandler.ts
export const errorHandler = (
  err: Error | createError.HttpError,
  _req: Request, res: Response, next: NextFunction,
): void => {
  if (res.headersSent) { next(err); return; }

  if (createError.isHttpError(err)) {
    res.status(err.statusCode).json({
      message: err.message,
      error: err.message,
      status: err.statusCode,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
    return;
  }
  res.status(500).json({
    message: err.message || "Internal Server Error",
    status: 500,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
```

Controller pattern — arrow methods, try/catch, delegate to `next` on unexpected errors,
but handle *known* domain errors inline with an explicit status:

```ts
createUser = async (req, res, next): Promise<void> => {
  try {
    const result = await this.userService.createUser(req.body);
    res.status(200).json(UserDTO.formatCreateResponse(result.id, result.user.name));
  } catch (error: any) {
    if (error.message === "Email already in use") {
      res.status(409).json({ message: "Email already in use", error: "Email already in use", status: 409 });
      return;
    }
    next(error);   // unknown -> errorHandler
  }
};
```

> Consistency caveat: services `throw new Error("...")` with sentinel message strings, and
> controllers branch on `error.message`. Newer code should prefer the typed error classes
> (`ConflictError`, etc.), but match the surrounding file when editing existing ones.

---

## 5. Validation

- Library: **Zod**. Schemas are declared in `src/schemas/*.schema.ts` and are the single
  source of truth — TypeScript types are `z.infer<>`ed from them (no hand-duplicated shapes).
- Validation runs as **route-level middleware** (in `src/validators/`) placed *before* the
  controller. The middleware `.parse()`s `req.body` and rethrows failures as `ValidationError`.

```ts
// src/schemas/user.schema.ts
import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
  organization: z.string().min(1, "Organization is required"),
  role: z.string().optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;
```

```ts
// src/validators/userValidators.ts
export const validateCreateUser = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    createUserSchema.parse(req.body);
    next();
  } catch (error: any) {
    if (error.errors) {
      const messages = error.errors
        .map((e: any) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      throw new ValidationError(messages);
    }
    throw new ValidationError('Invalid user data');
  }
};
```

```ts
// wired in the route, before the handler:
router.post("/create", validateCreateUser, userController.createUser);
```

Two distinct schema flavors live side by side: **input schemas** (`createUserSchema`,
`loginSchema`) for request validation, and **document schemas** (`userDocumentSchema`) that
model the Firestore shape and are `.parse()`d inside repositories.

---

## 6. Config loading & validation

- `dotenv` via `import "dotenv/config"` at the top of entry-ish modules (`app.ts`,
  `database.ts`). No central typed-config object — env vars are read at point of use.
- Environment-dependent URLs are centralized in `src/config/settings.ts` as small
  functions that **throw in production** if a required var is missing.
- A standalone pre-deploy script (`scripts/check-production-env.js`, run via
  `npm run check-prod`) asserts required vars before deploy — this is the closest thing to
  formal config validation.

```ts
// src/config/settings.ts
export const getFrontendURL = (): string => {
  const isProduction = (process.env.NODE_ENV || "development") === "production";
  if (isProduction) {
    const url = process.env.FRONTEND_URL || process.env.PROD_FRONTEND_URL || process.env.PROD_BASE_URL;
    if (!url) throw new Error("FRONTEND_URL or PROD_FRONTEND_URL is required in production. ...");
    return url;
  }
  return process.env.FRONTEND_URL || process.env.DEV_FRONTEND_URL || "http://localhost:3000";
};
```

Key env vars in play: `NODE_ENV`, `PORT`, `DB_ENVIRONMENT` (`main`|`qa`),
`ACCESS_TOKEN_SECRET`, `PROD_BASE_URL` / `DEV_BASE_URL`, `FRONTEND_URL` family,
`NODEMAILER_APP_EMAIL` / `NODEMAILER_APP_PASSWORD`.

---

## 7. Auth: authentication & identity flow

- **JWT bearer tokens.** `AuthService` (wraps `jsonwebtoken` + `argon2`) signs/verifies;
  `ACCESS_TOKEN_SECRET` is required at construction (throws if unset).
- `authenticateToken` middleware pulls `Authorization: Bearer <token>`, verifies it, and
  attaches the decoded payload to `req.user`.
- Identity type flows via `AuthenticatedRequest` (`Request & { user?: AuthUser }`).
- Role checks are a separate composable middleware, `requireRoles(...roles)`.
- Passwords are hashed with **Argon2** (`argon2.hash` / `argon2.verify`).

```ts
// src/services/AuthService.ts (core)
export class AuthService {
  private readonly accessTokenSecret: string;
  constructor() {
    if (!process.env.ACCESS_TOKEN_SECRET) throw new Error("ACCESS_TOKEN_SECRET environment variable is not set");
    this.accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
  }
  hashPassword = (p: string) => argon2.hash(p);
  verifyPassword = (hash: string, plain: string) => argon2.verify(hash, plain);
  signToken(payload: object, expiresIn?: string): string { /* jwt.sign */ }
  verifyToken(token: string): any { return jwt.verify(token, this.accessTokenSecret); }
}
```

```ts
// src/middleware/auth.ts
export const authenticateToken = (req: AuthenticatedRequest, _res, next): void => {
  const token = req.headers.authorization?.split(' ')[1]; // "Bearer TOKEN"
  if (!token) throw new UnauthorizedError('Access token is required');
  try {
    req.user = new AuthService().verifyToken(token);
    next();
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
};
```

```ts
// src/middleware/roles.ts — curried role guard
export const requireRoles = (...roles: string[]) =>
  (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    next();
  };
```

```ts
// composed on protected routes, identity read from req.user:
router.post("/", authenticateToken, requireRoles("superadmin", "admin"), userController.createTeamUser);
```

```ts
// src/types/express.types.ts
export interface AuthenticatedRequest extends Request { user?: AuthUser; }
```

---

## 8. Logging

- HTTP request logging: **`morgan("dev")`**, registered first in the middleware chain.
- Ad-hoc diagnostics use `console.log`/`console.error` directly (e.g. `[DB Config] ...`
  prefixes in `database.ts`). There is **no** structured logger (no pino/winston).
- `no-console` is disabled inline where needed (`// eslint-disable-next-line no-console`).

```ts
app.use(morgan("dev"));
// ...
console.log(`[DB Config] Using ${dbEnv} database: ${databaseId} in project ${projectId}`);
```

Match this: prefix ad-hoc logs with a bracketed subsystem tag, e.g. `[DB Config]`.

---

## 9. Module system, TS config, lint/format, naming

- **CommonJS output, ESM import syntax.** `tsconfig.json`: `target ES2020`,
  `module commonjs`, `strict: true`, `esModuleInterop`, `resolveJsonModule`,
  `noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns`/`noFallthroughCasesInSwitch`
  all on. `rootDir: src`, `outDir: dist`, `test` excluded from the build.
- Import default-interop packages as `import x from "..."` and namespace-import Node
  builtins as `import * as path from "path"` / `import * as argon2 from "argon2"`.
- **Unused params must be prefixed `_`** (e.g. `_req`, `_res`, `_next`) to satisfy
  `noUnusedParameters`.
- Lint: ESLint extends **`airbnb-base`**, with `no-underscore-dangle`, `no-param-reassign`,
  `no-return-assign`, `camelcase`, and `quotes` all disabled. `npm run lint` = `eslint --fix src`.
  > Note: `.eslintrc.js` extends `airbnb-base` (a JS config) without the
  > `@typescript-eslint` parser wired in, and `quotes` is off — hence the repo mixes single
  > and double quotes freely. **Prefer double quotes** (the dominant style in newer `src`
  > files) but don't churn existing files.
- No Prettier config is present.

```jsonc
// tsconfig.json (essentials)
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

**Dependency injection idiom** — every controller/service/repository takes its collaborators
as optional constructor args, defaulting to `new Concrete()`. This is the team's testing seam:

```ts
constructor(userService?: UserService, authService?: AuthService) {
  this.userService = userService || new UserService();
  this.authService = authService || new AuthService();
}
```

Controller handler methods are **class-property arrow functions** (so `this` binds when passed
as route handlers), typed `async (req, res, next): Promise<void>`.

---

## 10. Success / error response envelope

There is **no single strict envelope** — shapes are hand-built per endpoint and shaped by
`dto/*` static formatter classes. Observed conventions:

**Success** — resource wrapped under a named key, or a formatted DTO payload:

```ts
res.status(200).json({ allUsers: UserDTO.formatMany(allUsers) }); // list under a named key
res.status(200).json({ userById: UserDTO.format(user) });         // single under a named key

// login envelope (from UserDTO.formatLoginResponse)
{ message: "log in successful!", status: 200, payload: { /* user */ }, accessToken }
```

DTOs are static-method classes that centralize response shaping:

```ts
// src/dto/userDTO.ts
export class UserDTO {
  static format(user: UserResponse | AuthUser) {
    const authUser = user as AuthUser;
    return {
      id: user.id,
      userName: user.userName || authUser.name || "",
      name: authUser.name || user.userName,
      email: user.email,
      devices: user.devices || [],
      role: authUser.role,
      organization: authUser.organization,
      profilePicture: authUser.profilePicture,
    };
  }
  static formatMany(users: UserResponse[]) { return users.map((u) => this.format(u)); }
}
```

**Error** — object with `message`, often `error` (duplicated string), and `status`. Note the
inconsistency: `status` is sometimes a number, sometimes a string (`"404"`). The canonical
form from `errorHandler` is:

```ts
{ message, error: message, status: <number>, stack?: <dev only> }
```

Guidance for new code: prefer numeric `status`, always include `message`, mirror it in
`error` for the deployed frontend's sake, and route through DTO formatters + `http-errors`
classes rather than inventing new shapes. A `legacy*` handler variant exists where the old
NestJS shape (`{ access_token, user }`, `{ status, error }`) is still required by the
deployed frontend — keep those separate rather than "fixing" them.

---

## 11. Testing

- Framework: **Jest** with `ts-jest`; HTTP via **`supertest`** against the exported `app`.
- Faker (`@faker-js/faker`) for factories.
- Layout under `test/` (excluded from the TS build):

```
test/
  unit/services/AuthService.test.ts       # *.test.ts, mirrors src/ path under unit/
  unit/config/settings.test.ts
  integration/routes/userRoutes.test.ts   # supertest against app
  factories/userFactory.ts                # faker-based builders
  fixtures/users.ts                        # static fixtures
  support/helpers/authHelper.ts           # AuthHelper.generateToken(...) etc.
  support/mocks/emailService.mock.ts
  setup/testDb.ts testHelpers.ts
```

- Scripts: `npm test` (jest), `test:watch`, `test:coverage`. `predeploy` runs
  `build && check-prod && test`.
- Test file naming: `*.test.ts`, `describe`/`it`, folders `unit/` and `integration/`
  mirroring `src/` structure. Helpers are classes with static methods.

```ts
// test/integration/routes/userRoutes.test.ts
import request from 'supertest';
import app from '../../../src/app';

describe('User Routes Integration Tests', () => {
  it('should return a list of users', async () => {
    const res = await request(app).get('/api/v1/users/all').expect('Content-Type', /json/);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) expect(Array.isArray(res.body.allUsers)).toBe(true);
  });
});
```

```ts
// test/support/helpers/authHelper.ts — reusable auth for protected-route tests
export class AuthHelper {
  private static authService = new AuthService();
  static generateTokenForUser(userData: Partial<UserResponse>): string {
    const user: UserResponse = {
      id: userData.id || 'test-id',
      userName: userData.userName || 'Test User',
      email: userData.email || 'test@example.com',
      devices: userData.devices || [],
    };
    return this.authService.signToken(user);
  }
  static getAuthHeader(token: string) { return { Authorization: `Bearer ${token}` }; }
}
```

> ⚠️ Do not model the Jest config on `test/setup/jest.config.js` — see the security note at
> the top of this document. Use a clean, conventional `ts-jest` config.

---

## Checklist for the new service (to "look like the same team wrote it")

1. TS + CommonJS, `src/` role-based folders exactly as above; `app.ts`/`index.ts` split.
2. Middleware order: morgan → helmet → cors → json → routers → notFound → errorHandler.
3. Routers: one `Router` per resource, aggregated in `routes/index.ts`, mounted at `/api/v1`.
4. Firestore via `@google-cloud/firestore` behind a `getFirestoreInstance()` factory.
5. Data access through `<Entity>Repository` classes in `models/`, collection ref cached in
   constructor, injectable `db`.
6. Zod schemas in `schemas/*.schema.ts`; validation middleware in `validators/`; types via
   `z.infer`.
7. `http-errors` + `utils/errors.ts` subclasses; single terminal `errorHandler`; controllers
   try/catch → `next(error)`.
8. JWT + Argon2 in `AuthService`; `authenticateToken` sets `req.user`; `requireRoles(...)`
   for authorization; `AuthenticatedRequest` type.
9. Constructor DI everywhere (optional args defaulting to `new Concrete()`).
10. DTO static formatter classes for responses; named-key success bodies; `{message,error,status}`
    error bodies.
11. Jest + supertest, `unit/` & `integration/` mirroring `src/`, `*.test.ts`, class helpers.
