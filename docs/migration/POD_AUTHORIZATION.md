# Pod-level authorization — design

How a superadmin grants a **user** or an **organization** access to **specific pods**, how that
grant is enforced on every read, and how a report spanning several pods is authorized.

Three drivers, in the operator's words: *"authorize users or orgs to have access to only certain
pods … creating test users that only have access to certain pods … be able to create reports
across multiple pods."*

> **Design document. Nothing here is built.** No code in this change; `docs/migration/` is where
> planning artifacts live. Every claim about the upstream backend is cited to a file in
> `../clean-earth-rovers-server`, which was **read only** — nothing outside `cer-demo` was
> touched, and no exploit described below was exercised against production.

Companions: [`DEVICE_API.md`](DEVICE_API.md) (the contract, §4 auth, §6 endpoints),
[`BACKEND_FIELDS.md`](BACKEND_FIELDS.md) (the field census, §4 merge chains, §5 org scoping).

---

## 1. Status and scope

| piece | state |
|---|---|
| Permission model | ✅ this document |
| Grant storage decision | ✅ recommended (§3) — local Firestore, narrow-only |
| Merge-chain policy | ⚠️ **recommended, needs operator sign-off** (§5) |
| Cross-org history policy | ⚠️ **recommended, needs operator sign-off** (§6) |
| Multi-pod report authorization | ✅ recommended (§8) — refuse, don't partially fulfil |
| Test-user path | ✅ actionable today for **same-org** pods (§9); cross-org needs §9d or upstream |
| Anything requiring upstream change | 🔨 labelled **UPSTREAM** wherever it appears |

**Out of scope.** Quota/billing (`BACKEND_FIELDS.md` §7 — a separate contract on the same token),
chat-history privacy, and the dashboard's own access control. This document covers *which pods'
data a caller may read through `cer-demo`*.

---

## 2. What authorization actually is today

### 2a. Upstream: one level, org-scoped, no pod granularity

The whole mechanism is fifteen lines. `authenticateToken` verifies the bearer JWT and attaches the
decoded payload as `req.user` (`src/middleware/auth.ts`); every scoped controller then calls:

```ts
// clean-earth-rovers-server/src/utils/assignOrganization.ts
export const assignOrganization = (user: AuthUser, organization: string | null = null) => {
  if (user.role === "superadmin") return null;          // null === no filter === see everything
  if (organization) return organization;
  if (user.organization && typeof user.organization === "object") return user.organization.id;
  return (user.organization as string) || null;         // ⚠️ also null === no filter
};
```

That `organizationId` becomes a Firestore `where("organization", "==", id)` on the `devices`
collection (`DevicesService.findAll/findOne/findByLabel`). Two properties fall out:

- **The comparison is an opaque string compare.** It never resolves the organization document.
  So the two dangling org references (`BACKEND_FIELDS.md` §5a — `Marina Park` →
  `MWv7vOvPOL2xwNINk4eV`, `CWA Old` → `T0Cl83CJYvsMcYRej1jk`) do **not** throw. They simply match
  no real user's org, so those two pods are visible to **superadmin only**. That is accidental
  fail-closed behaviour, and §7 says how to keep it that way deliberately.
- **A user with no `organization` at all resolves to `null` — the superadmin filter.** In
  `assignOrganization` this yields an unfiltered query. (`findOrganizationDevices` takes the other
  branch and reads `user.organization.id` off `undefined`, which throws a 400.) Two code paths,
  two different answers to the same malformed user. See §11.

### 2b. `user.devices` is vestigial — do not build on it

The user record carries `account_device_list`, surfaced as `devices` on the JWT payload
(`UserRepository.cleanUserData` / `findAuthUserById`, `dto/userDTO.ts`). It looks exactly like the
hook we want. **It is never read by any authorization check.** Every occurrence in the upstream
repo is a field mapping:

```
src/dto/userDTO.ts:12          devices: user.devices || []
src/models/UserRepository.ts:32,91   devices: user.account_device_list
src/services/TeamUserService.ts:34,72  accountDeviceList: data.account_device_list
src/schemas/user.schema.ts:32  account_device_list: z.array(z.string()).optional()
test/fixtures/users.ts:9       account_device_list: ["device1"]
```

No `.where()`, no `.includes()`, no filter. `findOrganizationDevices` — the function that decides
which labels a caller may read — ignores it entirely and queries on `organization`. And
`TeamUserService.create()` does not accept a device list at all, so the superadmin "create team
user" route cannot populate it even if it were enforced.

**Verdict: the right long-term home, the wrong short-term hook.** It is a pre-existing field with
the correct shape, which makes it the natural thing for upstream to start enforcing (§10, P2). It
is *not* something `cer-demo` can rely on today, because writing it requires Firestore write
access we do not have and enforcing it requires upstream code.

### 2c. `cer-demo`: the caller's token *is* the authorization

This service forwards the caller's bearer token upstream rather than holding a service token
(`src/utils/bearerToken.ts`, `DEVICE_API.md` §4). Every pod name the model can resolve comes from
that caller's own `/devices` response:

`QuerySensorData.resolveDevice()` (`src/tools/querySensorData.ts`) matches the requested name
against `this.devices(token)` — the caller's org-scoped device list, cached per token — and
returns `No device matches "…"` for anything not in it. **The tool is already allow-list-driven,
and the allow-list is already derived from the token.** That is the seam pod-level grants should
be inserted into; it is not a rewrite.

### 2d. ⚠️ Four holes that a pod-granularity design must not paper over

These were found while mapping the model. They are stated here because a permission model that
assumes upstream enforces per-device scoping would be wrong.

**(1) `cer-demo` falls back to the dev token when the caller sends no token.**

```ts
// src/devices/DeviceApiClient.ts
this.token = options.token ?? config.deviceApi.devToken;
```

`DeviceController.listDevices` passes `callerToken(req)`, which is `undefined` for a request with
no `Authorization` header — so an **unauthenticated** `GET /api/v1/devices` answers out of
`DEVICE_API_TOKEN`'s fleet. Our token is superadmin, so that is all 15 pods. Ours to fix (P0).

> **FIXED 2026-08-21.** The fallback is gone, not merely gated: `token` has no default, and
> `DEVICE_API_TOKEN` is reached only by passing `useConfiguredToken: true`, which nothing behind an
> HTTP handler does. Broader than P0 item 1 proposed — the plan said drop it *when
> `NODE_ENV === "production"`*, which would have left the hole open on every non-production
> deployment and made the security-relevant behaviour differ between the environment developers
> test in and the one that matters. `requireCallerToken` refuses the route outright (401
> `caller_token_required`), and the same requirement now applies to the sensor and report tools
> reached through chat, which had the identical fallback. See `docs/SPECS.md` §10.5.

**(2) `GET /api/v1/reports/:filename` has no authentication at all.**
`ReportController.getReport` validates the filename against a path-traversal regex and then
`sendFile`s. Whoever holds the URL holds the report, forever, with no revocation. A multi-pod
report is precisely the artifact this matters for. Ours to fix (P0).

> **FIXED 2026-08-21, in the proportionate subset.** A bearer token is required, and the report is
> bound to the credential that generated it: a sha256 of that token goes in a `.pdf.owner` sidecar
> beside the PDF, and a token that does not match gets the same 404 a missing file gets (§8b's
> `{ owner }` field, on disk). What is deliberately **not** built: the `report_manifests` Firestore
> record, `labels`/`chains`, `expiresAt`, and fetch-time grant re-checking. Those need `PodScope`
> (P0 item 3), which does not exist yet — there are no grants to re-check. Revocation is therefore
> still absent, and a re-login loses access to earlier reports because a new token hashes
> differently. Both are recorded as accepted residual risk in `src/report/reportOwnership.ts`.

**(3) UPSTREAM — `GET /water/period/:duration/:unit?device=` is not org-scoped.**

```ts
// clean-earth-rovers-server/src/services/WaterAnalyticsService.ts:846
if (devices && devices.length > 0) {
  query = query.where("device", "in", devices.slice(0, 10));   // org filter SKIPPED
} else if (organizationId) { … }
```

`WaterAnalyticsController.findPeriodWaterData` passes the `device` query param straight through
with no membership check — unlike `findAverageWaterData`, `findAverageWaterDataManyDevices`, and
`getLastDataByDevice`, which all check `organizationDevices.includes(device)` first. So **any
authenticated user can read any pod's rows** by naming its label. `POST /water/export/csv/:device`
(`exportCsv`) has no check either, and exports the full history as CSV.

This is the endpoint `cer-demo` uses most (`DeviceApiClient.getPeriod`). Consequence for this
design: **upstream does not enforce per-label scoping on the read path we depend on. Our
allow-list is load-bearing, not defence in depth.** Report it upstream; design as if it will not
be fixed soon.

**(4) UPSTREAM — the same function fails *open* for a device-less org.** If `organizationId` is
set but its org has no devices, `labels.length === 0`, no `where` is added, and the query returns
**every organization's** rows in the window. A freshly created test org — which is exactly what
public `POST /users/create` produces (§9b) — hits this path.

---

## 3. The permission model

### 3a. Subject × object × grant

```
Grant := (subject, object, capability, source)

subject    ::= user:<upstream user id>
             | org:<upstream organization id>
             | role:<superadmin|admin|customer|user>

object     ::= pod:<dev:label>          -- one physical Notecard, one label
             | chain:<dev:survivor>     -- a pod's whole continuity chain (§5)

capability ::= read_current             -- the survivor label's own rows
             | read_history             -- predecessor labels' rows (§5, §6)
             | report                   -- may appear in a generated PDF

source     ::= "upstream-org"           -- implied by the caller's own org membership
             | "local-grant"            -- a row in cer-demo's grant store
```

Four deliberate choices:

- **The object key is the `dev:` label, never the pod name and never the Firestore document id.**
  The label is the only identifier `/water/*` accepts, three registry rows point at the same
  Algalita label (`DEVICE_API.md` §2), and six devices' `name` is just their label
  (`BACKEND_FIELDS.md` §2). A name-keyed grant is ambiguous; a doc-id-keyed grant does not reach
  the data.
- **`read_current` and `read_history` are separate capabilities.** That is the whole reason the
  merge-chain question (§5) is answerable rather than a coin flip.
- **Org subjects expand to labels at resolution time by string compare.** They are never resolved
  through the `organizations` collection (§7).
- **Grants are additive and there are no deny rules.** Default is deny; a grant is the only thing
  that permits. Deny rules invite ordering bugs, and with 15 pods there is no scale argument for
  them.

### 3b. Where grants live — and the invariant that makes it safe

We **cannot write upstream.** Firestore for `conductive-fold-343604` is IAM-denied
(`BACKEND_FIELDS.md` §0), and every registry write route is `superadmin`-only
(`devicesRoutes.ts` → `requireRoles("superadmin")`). Even with a superadmin token, writing pod
ownership into the production registry would move billing (`/payments/devices-quantity` counts by
org), alerting, and the customer dashboard — for a chatbot test account. That is not a trade we
should make.

> ### Recommendation
> **Grants live in `cer-demo`'s own Firestore, in a `pod_grants` collection, and may only ever
> _narrow_ what the caller's upstream token already returns.**
>
> ```
> effective_labels(caller) = labels(GET /devices with the caller's token)
>                            ∩ closure(grants for that caller)
> ```
>
> If no grant row matches the caller, the intersection is empty and they see nothing
> (**default deny**) — with one bootstrap exemption in §3d.

`cer-demo` already has its own Firestore client (`src/config/database.ts`, `FIRESTORE_PROJECT_ID`
/ `FIRESTORE_DATABASE_ID`), separate from the upstream project, already used for the corpus. The
grant store is a small collection there. Grant documents:

```jsonc
// pod_grants/<auto-id>
{
  "subject":  { "kind": "user", "id": "7f3…" },   // or { kind: "org", id: "yYSvuUP…" }
  "objects":  [
    { "kind": "chain", "label": "dev:351077454567580", "history": "same-org" },
    { "kind": "pod",   "label": "dev:351077454569099" }
  ],
  "capabilities": ["read_current", "read_history", "report"],
  "note":        "QA account — OWC + Algalita only",
  "grantedBy":   "user:<superadmin id>",
  "grantedAt":   "2026-08-20T…Z",
  "expiresAt":   "2026-11-20T…Z"     // optional; see §12 on non-expiring tokens
}
```

**Why narrow-only is the load-bearing invariant, not a limitation.**

`cer-demo` has no `ACCESS_TOKEN_SECRET` (it is not in `.env.example`, not in `src/config/`), so it
**cannot verify the upstream JWT's signature** — it can only base64-decode the payload to read the
user id. An identity read from an unverified token is attacker-controlled, and a grant store keyed
on that identity looks forgeable.

It is not, *provided the local layer can only narrow and every read still travels upstream on the
caller's own token*: a forged JWT claiming a different user id also fails upstream signature
verification, so its `/devices` call 401s and the intersection is empty. Forging the local half of
the check buys an attacker nothing, because the upstream half is the one that actually returns
data.

⚠️ **This argument dies the moment the local layer substitutes a different upstream credential.**
Any "delegated read" mode (§9d) or service account (§10, P2) makes local identity the *sole* gate
and therefore **requires real JWT verification first**. Do not ship one without the other.

### 3c. Trade-offs of a local store, honestly

| | local `pod_grants` (recommended) | upstream `account_device_list` (P2/P3) |
|---|---|---|
| We can build it | **now, alone** | needs another team's roadmap |
| Enforced for the dashboard too | ❌ no — chatbot only | ✅ yes, everywhere |
| Can widen access | ❌ **no, by construction** | ✅ yes (cross-org grants become possible) |
| Needs JWT verification | ❌ no (see §3b) | ✅ upstream already verifies |
| Source of truth for "who owns this pod" | ❌ a second, drifting copy | ✅ single |
| Revocation latency | one request (store read per request) | one request |

The second row is the real cost and should be said plainly to the operator: **a local grant
restricts Gilligan, not the product.** A test user narrowed to two pods here still sees their
whole organization in the customer dashboard. For "create a test account for the chatbot" that is
fine. For "this customer must never see that pod", it is not — that is upstream work.

### 3d. Bootstrap and the `role:` subject

A grant store that starts empty and denies everything breaks the current deployment on day one.
Two mitigations, both explicit:

- Ship a seeded `role:superadmin → *` grant, so superadmin behaviour is unchanged.
- Ship `POD_GRANTS_MODE` with values `off` (today's behaviour: upstream scoping only),
  `shadow` (resolve grants, log what *would* be denied, deny nothing), `enforce`. Default `off`,
  flip to `shadow` in staging, then `enforce`. This matches how `SENSOR_TOOL` / `REPORT_TOOL` are
  handled in `src/config/index.ts`, and it means the first deploy cannot lock anyone out.

Administer grants with a **CLI script** (`npm run grants:list|grant|revoke`, alongside
`scripts/explore*.sh`), **not an HTTP admin route**. A privileged HTTP surface on a service that
cannot verify JWT signatures is a hole waiting to be found; a script run by someone who already
has GCP credentials for our project adds no new attack surface.

---

## 4. Resolving a grant at request time

### 4a. One choke point, computed once per request

```
POST /api/v1/chat  (or the report path)
  │
  ├─ callerToken(req)                      -- src/utils/bearerToken.ts, unchanged
  ├─ subject = decodeUnverified(token).id  -- identity, NOT authority (§3b)
  │
  ├─ PodScope.resolve(token, subject) ─────────────────────────────┐
  │     visible  = labels from GET /devices with the caller's token │  one upstream call,
  │     granted  = closure(pod_grants for user + their org + role)  │  cached per token as
  │     allowed  = visible ∩ granted            <-- default deny    │  QuerySensorData already
  │     chains   = chainIndex ∩ allowed (§5)                        │  caches /devices
  └───────────────────────────────────────────────────────────────┘
  │
  └─ ToolContext { token, scope }  ->  every tool  ->  DeviceApiClient
                                        ↑
                        no label reaches the client without passing through `scope`
```

`ToolContext` already threads `token` to every tool (`src/services/ChatOrchestrator.ts:216`,
`src/types/tool.types.ts`); `scope` rides beside it. `QuerySensorData.resolveDevice` changes from
"match against `devices(token)`" to "match against `scope.allowed`" — a substitution, not new
machinery.

**Make it a compile error to skip the check.** Give `DeviceApiClient`'s label-taking methods a
branded parameter type:

```ts
export type AuthorizedLabel = string & { readonly __authorized: unique symbol };
// only PodScope.authorize(label): AuthorizedLabel | null can mint one
```

Then `getPeriod(duration, unit, rawLabel)` does not typecheck. Given §2d(3) — upstream will hand
over any label you name — a convention is not enough; the type system should hold the line.

### 4b. Rules

1. **Default deny.** No grant → no pods. An empty allow-list is reported as *"this account is not
   authorized for any pods"*, never as *"no pods exist"*. The distinction already matters in this
   codebase (`DeviceController`'s comment on why an unconfigured deployment 503s rather than
   returning an empty array); it matters more now.
2. **Authorize before fetching, never fetch and filter.** The check is cheap (an in-memory set)
   and fetch-then-filter has a habit of leaking through error messages, row counts, and caches.
3. **Deny is specific, not silent.** *"Marina Park is not in your authorized pods"* — naming a pod
   the caller asked about by name is not a disclosure, since they already named it. Do **not**
   enumerate pods they cannot see.
4. **No org-document resolution anywhere in the path** (§7).
5. **Every denial is audited**: subject id, labels requested, labels allowed, route. Log the
   **user id only** — the JWT payload is the entire user record including email and profile
   picture (`DEVICE_API.md` §4), and `src/utils/logger.ts` output is not a PII sink.
6. **Grants are read per request** (with a short TTL cache, seconds, keyed on subject). Revocation
   that takes effect on next login is not revocation — the tokens never expire (§12).

---

## 5. Merge chains — the policy question, and the answer

The registry ties a replaced Notecard to its successor with `mergedInto` on the retired device and
`labels: [...]` on the survivor, but **the historical rows are never rewritten** — they keep the
old label (`BACKEND_FIELDS.md` §4a). Answering "how has Marina Park been over two years" therefore
requires reading several labels. Authorization has to be defined over the chain, or it will be
defined over one label and silently answer from 3.9 % of the record.

**The question:** if a user is granted the survivor pod, are they granted its predecessors'
history?

> ### Recommendation
> **Yes — grant the chain, not the label, when the whole chain is inside one organization.**
> Cross-organization predecessors are excluded by default and require an explicit per-chain
> opt-in (§6).

Encoded as the `history` field on a chain object, three values:

| `history` | meaning | when |
|---|---|---|
| `"none"` | survivor label only | a genuinely new deployment at a reused site |
| `"same-org"` | **default** — predecessors whose `organization` equals the survivor's | the ordinary Notecard swap |
| `"all"` | every label in `labels[]`, including cross-org | **explicit operator opt-in only** (§6) |

Why `same-org` is the default rather than `none`: a chain within one org is *the same customer's
own site*. Its data was theirs before the swap and is theirs after. Defaulting to `none` there
would make Old Woman Creek's own operator unable to see 95.2 % of their own record — and would do
it silently, producing the confident-wrong-answer failure this codebase treats as the dangerous
class (`BACKEND_FIELDS.md` §4a). Why not `all` by default: §6.

**Two mechanics that come with it.**

- **Building the chain index.** Chain membership must be computed from the survivor's `labels[]`
  and the retirees' `mergedInto` — both already arrive intact in `DeviceSummary.raw`, because
  upstream's `mapDeviceProps` returns the whole Firestore document unfiltered
  (`DevicesService.ts:169`). Nothing in `cer-demo` reads them yet (grep: no hits for `mergedInto`
  / `labels` in `src/`), so chain resolution and this design land together.

  ⚠️ **A caller's own `/devices` view is not enough to build the chain.** `/devices` is org-scoped,
  so City of Newport Beach sees the retired `Marina Park DataPod™` (with its `mergedInto` pointer)
  but cannot see the survivor that names the chain. Recommended: build the chain index **once,
  server-side, from a `DEVICE_API_TOKEN` snapshot of `/devices`** — registry *topology* only,
  cached, **never returned to a caller** and never used to fetch a reading. Every read still goes
  out on the caller's token against `scope.allowed`, so the topology snapshot cannot widen a
  grant. If the operator is not comfortable with that bounded use of the service token, the
  fallback is caller-visible chains only, which under-reports history — a safe failure, disclosed
  under §8c.
- **De-duplicate on merge.** New Trinidad and Trinidad Island overlap for five months
  (`BACKEND_FIELDS.md` §4a); naive concatenation double-counts. Prefer the survivor's row at a
  duplicated timestamp. This is a correctness requirement of chain reads, not of authorization,
  but it lands in the same code.

---

## 6. Cross-organization chains

Verified, live (`BACKEND_FIELDS.md` §5b): `Marina Park` (org `MWv7vOv…`) absorbed
`Marina Park DataPod™` (City of Newport Beach). `PCH Public Dock Buoy` (CER Super Admin) absorbed
`East Anchorage DataPod™` (City of Newport Beach). `Old Woman Creek 2026` (Cleveland Water
Alliance) absorbed `CWA Old` (dangling org `T0Cl83CJ…`).

So following `labels[]` can read rows that belonged to a **different customer**. And because of
§2d(3), upstream will serve them: `/water/period?device=<other org's label>` does not check.

> ### Recommendation
> **Cross-org history does not transfer by default. Deny it, and disclose the denial.**
>
> Granting the survivor grants `read_current` on the survivor and `read_history` on same-org
> predecessors. A cross-org predecessor requires the operator to set `history: "all"` on that
> specific chain object — a deliberate, per-chain, recorded act.

The reasoning is asymmetric risk, not symmetry of argument. Both readings are defensible —
"we bought the buoy, we bought its record" versus "those readings are Newport Beach's". But the
two errors are not equal: showing one customer another customer's water data is a contractual and
possibly regulatory problem that cannot be undone once a PDF exists, while showing *less* history
is a visible, complainable, fixable gap. Default to the reversible error.

`history: "all"` must be **per chain**, never a global switch, and the grant record keeps
`grantedBy` and `grantedAt` so the decision has a name and a date on it.

**Open question for the operator (§11, Q1):** these three merges look like acquisitions of the
physical site, not just the hardware. If the operator says the site transferred, `"all"` on those
three chains is a one-line change. We should not guess.

---

## 7. Dangling organization references — fail closed

Two devices point at organizations absent from `GET /organizations`, and one of them
(`Marina Park`) is **actively reporting** (`BACKEND_FIELDS.md` §5a).

> ### Rules
> 1. **Never resolve the organization document during a permission check.** Compare `organization`
>    ids as opaque strings, exactly as `assignOrganization` does. A lookup either throws (crash =
>    denial of service) or returns nothing (silent deny) — and `UserRepository.findAuthUserById`
>    already demonstrates the failure: when the org doc is missing it leaves `organization` as a
>    bare string, so downstream code sees two different shapes for the same field.
> 2. **A device whose `organization` is missing, empty, or unresolvable is _not_ covered by any
>    `org:` grant.** It can only be reached by an explicit `pod:` or `chain:` grant on its label.
> 3. **A subject whose own organization is missing or empty resolves to the empty set**, never to
>    "no filter". This is the one place `cer-demo` must *not* copy upstream's behaviour:
>    `assignOrganization` returns `null` for a user with no org, and `null` means *unfiltered*
>    (§2a). Our resolver must return `∅`.

Concrete consequence to state to the operator up front: because `Marina Park`'s org matches no
user's org, **no non-superadmin token can see it upstream at all**, and narrow-only (§3b) means we
cannot grant it to a test user either. Fixing that means fixing the dangling reference upstream —
worth reporting regardless, since it is a live pod in a nonexistent org.

---

## 8. Multi-pod reports

`generate_report` takes a single `device` today (`src/tools/generateReport.ts`), and the report
model is single-site: `SiteMetadata { siteName, … }` in `src/report/types.ts`. Multi-pod needs
`devices: string[]` and a site *list*. The authorization design should land with that change, not
after it.

### 8a. Partial results or refusal?

> ### Recommendation
> **Refuse the whole report, and name the pods that were denied.** Do not silently generate a
> report over the authorized subset.

A multi-pod report is a *comparison artifact*. Its fleet averages, its rankings, its "the site
with the highest turbidity was…" are all computed over the set. Dropping a pod does not remove a
section — it changes every aggregate number in the document, and a PDF titled "5-pod summary"
containing 3 pods' arithmetic is a fabricated figure, which is this codebase's designated
dangerous failure class (`BACKEND_FIELDS.md` §4a). A report also outlives the conversation that
produced it; a caveat in the chat window does not travel with the file.

The refusal must be **useful**, not a wall:

```
I can't build that report — it covers Balboa Basin Buoy, which this account isn't
authorized for. I can run it over the 4 pods you do have access to (Algalita Pod,
Old Woman Creek 2026, PCH Public Dock Buoy, New Trinidad Island DataPod™) — say
the word and I'll do that instead.
```

The narrowed report is then a **second, explicit request**, and its scope block (§8c) records that
it was narrowed. That is the difference between a partial result the user chose and one we chose
for them.

Contrast with a *single*-pod report whose chain history is partly cross-org (§6): there, proceed
with the authorized span and disclose the gap, because the report is still about the site it says
it is about. **Missing pods change the subject; missing history changes the window.**

### 8b. The mechanics

- **Authorize the full requested set before a single fetch.** `scope.authorizeAll(labels)` returns
  either every label branded, or the list of denials. No partial fetch, so no cache is warmed with
  data the caller may not have.
- **Then expand each authorized pod to its chain** under §5/§6, and fetch per label. There is no
  fan-out endpoint: repeating `device=` on `/water/period` returns **0 rows**
  (`BACKEND_FIELDS.md` §4a), and `/water/average/many-devices` is an averages endpoint, ruled out
  by `DEVICE_API.md` §10. So a 5-pod, 2-window report is 5 × chain-length × window calls.
  Budget it; the per-token `/devices` cache in `QuerySensorData` already exists, the per-label
  window results should join it.
- ⚠️ **Our allow-list is the only gate here.** Because of §2d(3), every one of those
  `?device=<label>` calls would succeed against upstream even for another org's pod. A multi-pod
  report built without §4a's choke point is a cross-tenant data leak with a PDF attached.
- **Fix the report fetch route** (§2d(2)) in the same change: write a
  `report_manifests/<id>` record `{ owner, labels, chains, createdAt, expiresAt }`, require a
  bearer token on `GET /api/v1/reports/:filename`, and **re-check the grant at fetch time** so a
  revoked grant kills the link. The PDF still cannot be recalled once downloaded — generation-time
  authorization is the real gate; fetch-time re-checking just closes the link-sharing window.

### 8c. Disclosing scope in the report

Every report gets a **Data scope** block, on page 1, above the findings:

```
Data scope
  Pods in this report ......... 3 of 3 requested
  Old Woman Creek 2026        dev:…567580   2026-06-12 → 2026-08-20    729 rows
    ↳ continuity: CWA 2025 testbed  dev:…093894   2024-02-02 → 2025-08-22   8,554 rows
    ↳ withheld:   CWA Old           dev:…248466   2023-08-08 → 2023-11-01
                  (different organization — history not transferred)
  Algalita Pod                dev:…569099   …
  Generated for: <account>   Authorized pods at generation: 4
```

Three things it does: says which labels the numbers came from (so a 6-week window is never read as
a 2-year record), names history that was *withheld for authorization* rather than absent, and
stamps the scope the report was generated under so a stale PDF is recognisable as one. The
`SiteMetadata.waterBodyTypeSource` field already sets this precedent — the report explains where
its inputs came from when the choice changes the output.

---

## 9. Test users — what to do on Monday

The nearest-term need. Here is what actually works today, ranked.

### 9a. What a test user *is*, mechanically

An upstream account (email + password → JWT via `POST /api/v1/users/login`) that `cer-demo`
narrows further with a local grant. There is **no service account and no API key** upstream
(`DEVICE_API.md` §4), so there is no other kind of credential to issue.

### 9b. Two ways to create the upstream account

| path | route | what you get | caveat |
|---|---|---|---|
| **Team user in an existing org** | `POST /api/v1/users` — `requireRoles("superadmin","admin")`, body `{ name, email, role, organization }`, sends an invite email | a real user in a real org, sees that org's pods | ✅ **recommended** — no registry writes, no billing impact |
| Public self-signup | `POST /api/v1/users/create` — unauthenticated, body `{ email, password, name, organization }` | ⚠️ **creates a brand-new organization** (`organization` is a *name*, not an id) and makes the user its `admin`; the new org owns **zero** devices | a zero-device org trips upstream's fail-open (§2d(4)) on `/water/period` |

Note the second row carefully: `UserService.createUser` calls `organizationService.create(…)`
unconditionally. Self-signup cannot join an existing organization, so it cannot be used to get at
anyone's pods — but it also cannot be used to make a useful test user, because narrow-only (§3b)
over an empty upstream fleet yields an empty fleet.

### 9c. The recommended near-term recipe (same-org pods)

> ### Recommendation
> **Test users are restricted *within* one organization: upstream gives them the org, `cer-demo`
> narrows them to the named pods.** No production registry writes. Buildable entirely in P0/P1.

1. Superadmin creates the account: `POST /api/v1/users` with `role: "customer"` (the least
   privileged role that `requireRoles` currently recognises for the read paths) and
   `organization: <the org whose pods you want to test against>`.
2. The invitee completes `register-invitation` and sets a password. They can now log in and get a
   token that upstream scopes to that org.
3. Superadmin records the narrowing:
   `npm run grants:grant -- --user=<id> --chain=dev:351077454567580 --history=same-org --report`
4. Verify with `POD_GRANTS_MODE=shadow` first, then `enforce`. `GET /api/v1/devices` with that
   account's token must return exactly the granted pods.

**Which orgs are usable for this today.** `CER Super Admin` (`FF8Syo9…`) owns `PCH Public Dock
Buoy` and is CER's own org — the natural home for test pods. `Cleveland Water Alliance` owns
`Old Woman Creek 2026`, one of the two cleared test pods (`DEVICE_API.md` §2). `Algalita` owns
the other. Those three orgs cover both cleared pods and CER's own buoy, which is most of what a
test account needs.

**What this recipe cannot do:** span organizations, or reach `Marina Park` / `CWA Old` (§7).

### 9d. Cross-org test users — possible, but it costs the safety argument

There is no upstream credential that sees pods from two organizations except a **superadmin**
token. So a cross-org test user means `cer-demo` holds a broad credential and the local grant
becomes the *only* gate — which invalidates §3b's reasoning.

> ### Recommendation
> **Do not build this for the initial test-user need.** If the operator needs it before upstream
> lands pod ACLs, build it as an explicitly-flagged **delegated read** mode with all of:
>
> 1. **Real JWT verification.** `cer-demo` must hold `ACCESS_TOKEN_SECRET` and verify signatures
>    (UPSTREAM — requires the secret to be shared, which is itself a decision).
> 2. `POD_GRANTS_DELEGATED=false` by default; the delegated credential in Secret Manager, never
>    in `.env` alongside anything else.
> 3. The delegated credential is the **least-privileged token that covers the grant**. Use a
>    superadmin token only where nothing narrower exists, and record that on the grant.
> 4. The §4a choke point plus the branded-label type is mandatory, not optional — it is the
>    entire security boundary at that point.
> 5. Full audit log of every label read under delegation.
>
> Cheaper alternative worth putting to the operator first: **move the test pods into one test
> organization upstream**, if any of them are CER's own hardware rather than a customer's. One
> registry write, no delegation, no new secret.

---

## 10. Phased plan

### P0 — close the holes, add the seam (cer-demo only, no upstream)

Nothing here needs another team, and three items are bugs that exist today regardless of pod
granularity.

1. ~~**Require a caller token in production.**~~ **DONE 2026-08-21**, and in every environment
   rather than only production — see §2d(1). The fallback is opt-in at the call site
   (`useConfiguredToken`) instead of environment-gated, so the offline scripts keep working and no
   request path can reach it.
2. ~~**Authenticate `GET /api/v1/reports/:filename`**~~ **DONE 2026-08-21** — token required, plus
   an owner-binding sidecar. The `report_manifests` record and fetch-time grant re-checking are
   **still open** and wait on item 3; see §2d(2).
3. **Build `PodScope`** (`src/auth/podScope.ts`) — one resolver, per-request, `AuthorizedLabel`
   branded type, `POD_GRANTS_MODE=off|shadow|enforce` defaulting to `off`. (§4a)
4. **Route every label through it**: `QuerySensorData.resolveDevice`, `DeviceController.toEntry`,
   `GenerateReport`. Make the raw-string path a compile error.
5. **`pod_grants` collection + CLI** (`scripts/grants.ts`, `npm run grants:*`), seeded with
   `role:superadmin → *`. (§3b, §3d)
6. **Audit logging**, user id only, never the decoded payload. (§4b.5)

*Verifiable end state:* a `customer`-role account with a two-pod grant sees exactly two pods in
`GET /api/v1/devices`, and `query_sensor_data` refuses a third by name.

### P1 — chains, and multi-pod reports (cer-demo only, no upstream)

7. **Chain index** from `labels[]` / `mergedInto` / `archived` (present in `DeviceSummary.raw`,
   unread today), built from a server-side topology snapshot, with de-duplication on overlap. (§5)
8. **`history` on grants** (`none` / `same-org` / `all`), cross-org denied by default. (§6)
9. **`generate_report({ devices: [...] })`** plus a multi-site `SiteMetadata`; authorize-all-then-
   fetch; refuse-and-name on any denial. (§8a, §8b)
10. **Data scope block** in the PDF, including withheld history. (§8c)

### P2 — UPSTREAM: make the backend enforce what we are asserting

Everything below is another team's repo. Ordered by ratio of security value to effort.

11. **Org-check `/water/period` and `/water/export/csv`.** Both already have the helper
    (`findOrganizationDevices`) and three sibling handlers already call it. Roughly a four-line
    fix each, and it closes a cross-tenant read on the endpoint we depend on. (§2d(3))
12. **Fix the zero-device fail-open** in `findPeriodWaterData` — an org with no devices must match
    nothing, not everything. (§2d(4))
13. **Token expiry + refresh.** `jwt.sign` is called with no `expiresIn`
    (`AuthService.signToken`); `signToken(payload, "7d")` is already used for invitation links, so
    the parameter exists. (§12)
14. **Enforce `account_device_list`** in `findOrganizationDevices` / `assignOrganization` —
    intersect the org's labels with the user's list when it is non-empty — and accept a device
    list in `TeamUserService.create/update` so it can be populated. This is the field that already
    has the right shape (§2b). At that point our local store can begin to shrink.
15. **Repair the two dangling organization references.** (§7)

### P3 — UPSTREAM: pod ACLs as a first-class concept

16. A `pod_grants`-equivalent collection upstream, enforced in every read path, with subjects for
    user and org and an explicit cross-org history flag — i.e. §3a promoted to the source of
    truth, with superadmin UI in the dashboard.
17. `cer-demo` drops its local store and reads the upstream grant, keeping only the choke point.
18. Cross-org test users become ordinary grants (§9d disappears).

---

## 11. Open questions for the operator

Separated from the recommendations above on purpose — these need a human answer, not a default.

| # | question | blocks | our default if unanswered |
|---|---|---|---|
| **Q1** | The three cross-org merges (Marina Park, PCH Public Dock, Old Woman Creek) — did the **site** transfer, or only the hardware? | §6, chain history | deny cross-org history |
| **Q2** | Should a pod grant restrict the **dashboard** too, or only Gilligan? If the dashboard, this is P3 work and P0/P1 is a stopgap. | scope of the whole effort | chatbot only |
| **Q3** | Are the test pods CER's own hardware? If yes, **moving them into one test org upstream** is far cheaper than delegated read (§9d). | cross-org test users | assume customer-owned; no registry writes |
| **Q4** | Can `cer-demo` be given `ACCESS_TOKEN_SECRET` (to verify JWTs), or IAM read on `conductive-fold-343604`? Either changes what is safely buildable. | §9d, §3b | assume neither |
| **Q5** | Should a grant **expire** by default (30/90 days)? Given non-expiring tokens, grant expiry is the only time-bound we control. | §12 | optional `expiresAt`, unset |
| **Q6** | Who counts as a grant administrator — `superadmin` only, or `admin` within their own org? | §3a `role:` subjects | superadmin only |
| **Q7** | `Marina Park` is live in a nonexistent org (§7). Fix the reference, or is that org intentionally external? | §7, and its own bug report | leave; superadmin-only visibility |
| **Q8** | Does a granted pod's **quota** (`BACKEND_FIELDS.md` §7 — 2 msgs/user/week) apply to test accounts, or should test users be quota-exempt? | test-user usability | inherit upstream quota |

---

## 12. Security analysis

### 12a. Never-expiring tokens

`AuthService.signToken` omits `expiresIn`, so every access token is valid forever
(`DEVICE_API.md` §4). Three consequences for this design, and they drive three rules.

- **Never put a pod grant in a JWT claim.** A claim minted today is un-revocable; a grant that
  lives in a claim is a permanent grant. This is the single strongest argument against the
  otherwise-attractive "just populate `account_device_list` and read it off the token" shortcut —
  it would be *correct* only if tokens expired. Resolve grants **server-side, per request, from a
  store** (§4b.6). Revocation then takes effect on the next request.
- **A leaked test-user token is a permanent leak of that pod set.** Grant expiry (`expiresAt`,
  Q5) is the only time-bound we control, so it is worth having even though it is a partial
  mitigation. Treat test-account credentials as production secrets.
- **Changing a user's organization upstream does not invalidate their old token.** `assignOrganization`
  reads `req.user.organization` — the payload signed at login, not the current record. So an old
  token keeps the *old* org's scope indefinitely. Our narrow-only intersection limits the blast
  radius (the local grant still applies), but the upstream half of the intersection is stale.
  UPSTREAM P2.13 is the real fix.

### 12b. The full-user-record JWT payload

`signToken(result.verifiedUserObj)` signs the entire user record — id, name, email, role,
organization, devices, `customerId`, profile picture (`UserController.login`,
`UserRepository.findAuthUserById`). Two effects:

- **Anything that logs a decoded token logs personal data**, including a Stripe customer id. The
  audit log (§4b.5) records the **user id only**. No decoded payloads, no emails, not in errors
  either — `src/utils/errors.ts` messages reach the client.
- **The payload is readable by the token holder** (JWT is signed, not encrypted). Whatever we put
  in a claim, we publish. Another reason grants belong in a store.

### 12c. Unverifiable identity

`cer-demo` has no `ACCESS_TOKEN_SECRET` and cannot verify the JWT signature. The narrow-only
invariant (§3b) makes that survivable: a forged identity still cannot get data, because the
upstream call on the same forged token 401s. **The invariant must be tested, not just documented**
— a unit test that asserts `effective ⊆ visible` for every resolver path, and a test that a grant
naming a label absent from `/devices` yields nothing.

Two ways this could silently break, both worth a comment in the code: adding a service token
(§9d/P2), or "optimising" the resolver to skip the `/devices` call when a grant already names
explicit labels. The second is the more likely accident.

### 12d. Failure modes, and how each fails

| failure | today | with this design |
|---|---|---|
| Request arrives with no `Authorization` header | ⚠️ answered from `DEVICE_API_TOKEN` (superadmin) | **401** (P0.1) |
| Grant store unreachable (Firestore down) | n/a | **deny all**, coded 503 — never "no grants found, allow" |
| Caller's org is missing/empty | ⚠️ upstream `assignOrganization` → `null` → **unfiltered** | `∅` (§7.3) |
| Device's org is a dangling reference | superadmin-only by accident | superadmin-only **by rule**; explicit label grant still possible (§7) |
| Chain crosses orgs | n/a (chains unimplemented) | history denied, **disclosed** in the report (§6, §8c) |
| Caller asks for an unauthorized pod by name | resolves if it is in their org | specific deny, no enumeration (§4b.3) |
| Multi-pod report, one pod unauthorized | n/a | **whole report refused**, denied pods named (§8a) |
| Grant revoked while a report URL is in circulation | n/a | fetch-time re-check kills the link; the downloaded PDF cannot be recalled (§8b) |
| Someone passes a raw label to `DeviceApiClient` | works, and upstream serves it (§2d(3)) | **compile error** (§4a) |
| Prompt injection tells the model to read another pod | tool resolves against `/devices`, so org-bounded | resolves against `scope.allowed`; the model never sees a raw label it may not use |

### 12e. On prompt injection specifically

The model is not part of the security boundary and must not become part of it. It never receives a
label it is not authorized for, it cannot construct one that passes the branded type, and
`generate_report` calls `QuerySensorData.query()` directly rather than through the tool loop
(`src/tools/generateReport.ts`) — so the report path does not depend on the model behaving. Keep
it that way: **authorization is enforced below the tool boundary, never in the system prompt.**

---

## 13. What this design deliberately does not do

- **Does not touch the four unauthenticated upstream endpoint families** (`/water-data`,
  `/device`, `/duration/*`, `POST /water/check-alerts` — `DEVICE_API.md` §4). They return water
  data with no auth and no org scoping at all. Any pod-authorization scheme that read from them
  would be theatre. `DeviceApiClient` implements none of them and must continue not to.
  ⚠️ Related, and worth an upstream report of its own: `GET /users/all` and `GET /users/:id` are
  also unauthenticated (`userRoutes.ts` — no `authenticateToken`), so user records enumerate
  freely. That is upstream's to fix; we build on neither.
- **Does not add write routes.** `DeviceApiClient` stays read-only on purpose
  (`DEVICE_API.md` §6): a client that cannot write cannot corrupt someone else's registry
  through a prompt.
  Grant administration is a local CLI against **our** Firestore.
- **Does not invent upstream capability.** Everything requiring another team is labelled
  **UPSTREAM** and confined to §10 P2/P3.
- **Does not use `user.devices` from the JWT.** It is vestigial (§2b) and, given non-expiring
  tokens, would be un-revocable even if it were enforced (§12a).
