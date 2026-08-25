# Security findings — device authorization, 2026-08-21

What "check organization by auth" actually means once you look at how the upstream backend
enforces it, and what it forces us to do differently.

Sources: `../clean-earth-rovers-server` (read-only reference repo, read at commit `a3cc25d`) and a
live read-only field census (`docs/migration/BACKEND_FIELDS.md`).

> **Nothing here was exploited.** The finding in §1 is read from source. Our token is
> `superadmin`, which bypasses every org check by design, so it could not demonstrate the flaw
> even in principle — and probing production with a downgraded account is not ours to do. The code
> path is unambiguous; the verification belongs to the backend team.

---

## 1. ⚠️ `/water/period` does not authorize the `device` parameter

**This is the one that matters, because it is the only endpoint we read.**

`WaterAnalyticsService.findPeriodWaterData` (`src/services/WaterAnalyticsService.ts:832`):

```ts
if (devices && devices.length > 0) {
  query = query.where("device", "in", devices.slice(0, 10));   // ← caller-supplied, unchecked
} else if (organizationId) {
  //  ↑ else-if: the org filter only runs when NO device param was given
  const orgDevices = await this.firestoreService
    .getCollection("devices")
    .where("organization", "==", organizationId)
    .get();
  …
}
```

The organization filter sits in the **`else`** branch. Supplying `?device=` therefore does not
*narrow* an org-scoped query — it **replaces** it. The controller
(`WaterAnalyticsController.findPeriodWaterData:166`) does not compensate: it calls
`assignOrganization(req.user!)` and passes the label straight through, with no membership check.

**Consequence:** any authenticated user, of any organization and any role, can read the complete
sensor history of any device whose label they can name, by asking for
`GET /api/v1/water/period/5/fiveYears?device=dev:<label>`. Org scoping on this route is
effectively advisory.

### It is an outlier, which is why it reads as an oversight rather than a decision

Every sibling device-scoped route performs the membership check that this one omits:

| route | membership check | where |
|---|---|---|
| `/water/last/:device` | ✅ `findOrganizationDevices` → `throw "Device not found"` | `WaterAnalyticsController:195` |
| `/water/average/:duration/:unit?device=` | ✅ same pattern | `WaterAnalyticsController:117` |
| `/water/average/many-devices?devices=` | ✅ `devices.every(d => organizationDevices.includes(d))` | `WaterAnalyticsController:148` |
| **`/water/period/:duration/:unit?device=`** | ❌ **none** | `WaterAnalyticsController:172` |
| `/water/chart/...` | n/a — ignores any device param, always org-wide | — |

Four routes, one pattern, one gap.

### Labels are not a secret, so "you'd have to guess it" is not a mitigation

- `GET /devices` hands a caller every label in their own org, and merge chains (`labels[]`,
  `mergedInto`) name labels belonging to **other** orgs (§3).
- Labels are `dev:<IMEI>` — structured, not random.
- The **unauthenticated** routes (`GET /water-data`, `GET /device?device=`, `GET /duration/*`)
  return water-data documents with **no authentication and no org scoping at all**, and each
  document carries its `device` label. Anyone can enumerate the fleet's labels with no credentials
  whatsoever. `DEVICE_API.md` §4 already flagged those routes; this finding is what makes them
  more than untidy — they are the enumeration oracle for the gap above.

### Why this lands on us specifically

`query_sensor_data` computes **every** statistic from `/water/period` rows. That choice was
deliberate and correct for data-quality reasons — it sidesteps the all-zero empty window and the
whole-row exclusion that `/water/average` suffers (`DEVICE_API.md` §10). But it means:

> **The chatbot's only sensor-data path is the single endpoint with no authorization check.**

Everything else we could have used enforces org scoping. We picked the one that doesn't. That is
not a reason to switch — the data-quality reasons still hold, and switching would trade a correct
answer for an authorized one. It is a reason to **enforce authorization ourselves** (§4).

---

## 2. Two devices reference organizations that do not exist

| device | `organization` | present in `GET /organizations`? | reporting? |
|---|---|---|---|
| `Marina Park` | `MWv7vOvPOL2xwNINk4eV` | ❌ no | ✅ **actively reporting** |
| `CWA Old` | `T0Cl83CJYvsMcYRej1jk` | ❌ no | no (merged away) |

Eight organizations exist; devices reference ten distinct org ids.

**Why it matters for authorization code.** Two plausible implementations diverge here:

- A check that **resolves the org document** (`getCollection("organizations").doc(id)`) gets
  `undefined` and then behaves however its null-handling happens to behave — throw, or fall
  through to allow.
- A check that **string-compares ids** (`device.organization === user.organization`) never notices,
  and simply denies everyone — including whoever legitimately owns Marina Park.

Neither is right, and the difference is invisible until it bites. Note the upstream org filter is
itself a string comparison (`.where("organization", "==", organizationId)`), so today Marina Park
is reachable only by `superadmin` — an actively reporting pod that no ordinary user can see.

**Rule: fail closed, and treat an unresolvable organization as a distinct, logged condition** —
not as "no organization", and never as a wildcard.

---

## 3. Merge chains cross organization boundaries

Device continuity is expressed by `mergedInto` (on the retired device) and `labels[]` (on the
survivor). Three of the four live chains change organization partway along:

| survivor (org) | absorbs (org) | same org? |
|---|---|---|
| `Marina Park` (`MWv7vOv…` — **dangling**) | `Marina Park DataPod™` (`yYSvuUP…` City of Newport Beach) | ❌ |
| `PCH Public Dock Buoy` (`FF8Syo9…` CER Super Admin) | `East Anchorage DataPod™` (`yYSvuUP…` City of Newport Beach) | ❌ |
| `Old Woman Creek 2026` (`bLTGwdVS…` Cleveland Water Alliance) | `CWA Old` (`T0Cl83CJ…` — **dangling**) | ❌ |
| | `CWA 2025 testbed` (`bLTGwdVS…`) | ✅ |
| `New Trinidad Island DataPod™` (`L7k8LKke…` Huntington Beach) | `Trinidad Island DataPod™` (`L7k8LKke…`) | ✅ |

### The mechanism that makes this dangerous

**Water-data documents carry no organization field.** A row's keys are exactly:

```
device, timestamp, date, best_lat, best_lon, best_location, event, water_data
```

There is no `organization` on a reading — verified live. So **authorization for sensor data is
derived entirely from the device registry lookup**; there is nothing on the row itself to check
against. Once code resolves a chain to a set of labels and queries them, no downstream layer can
tell that one of those labels belonged to someone else.

Combine with §1: because `/water/period` doesn't check the label either, a naive continuity
implementation that fans out over `labels[]` **succeeds silently** at reading another
organization's history. No error, no empty result — exactly the "plausible answer, wrong data"
failure class this codebase treats as the dangerous one.

### The policy question this forces

Continuity and org scoping are in genuine tension:

- **Reconstruct the chain** and a report about Marina Park spans 2023→now — but ~19,286 of its
  20,069 readings were recorded while the pod belonged to City of Newport Beach.
- **Don't reconstruct it** and the same report silently covers six weeks and 783 readings while
  looking complete (`BACKEND_FIELDS.md` §4a).

**Does inheriting a buoy inherit its data?** That is the operator's call, not a default we should
pick. It is genuinely arguable both ways — the physical asset and its record moved, but the
readings describe a site under another customer's stewardship. **This is blocking for continuity
work**, and it is the single most important question to take back to them.

---

## 4. What this explicitly changes about what we build

1. **Do not treat the upstream API as an authorization boundary for `/water/period`.** It isn't
   one. Anything we expose that lets a caller influence which label gets queried must be checked
   **before** the call goes out.
2. **Resolve the caller's authorized label set from `GET /devices` with the caller's own token,
   then intersect.** `/devices` *is* properly org-scoped, so it is the trustworthy source of "what
   may this caller see." Never pass a label to `/water/period` that did not come out of that set.
3. **Keep forwarding the caller's token.** `src/utils/bearerToken.ts` already does this rather than
   using a shared service token. Under §1 a shared service token would be far worse than untidy:
   with no per-device check upstream, one leaked service token reads the entire fleet.
4. **Make merge-chain expansion an explicit, authorized step.** Expanding `labels[]` must run
   through the same intersection, and the report must **disclose** which labels it used and which
   it skipped. Silent expansion is the bug; disclosed expansion is a feature.
5. **Fail closed on unresolvable orgs** (§2) and log them distinctly.
6. **Cap the fan-out.** Firestore's `in` operator caps at 10 (`devices.slice(0, 10)`), and the
   backend **silently truncates** rather than erroring. A chain or multi-pod report that expands
   past 10 labels gets a quietly partial answer. Chunk deliberately, or refuse.
7. **This is the foundation the pod-level permission model has to sit on**
   (`POD_AUTHORIZATION.md`). Pod-granular grants are strictly finer than org grants, so every
   issue above applies to them a fortiori: if the org boundary isn't enforced on the data path,
   a pod boundary certainly isn't.

---

## 5. To report upstream

Theirs to fix, ours to raise. Bundled with the two already-known items so it goes over once:

1. **`/water/period` does not authorize its `device` parameter** (§1). The one-line shape of the
   fix is to apply the same `findOrganizationDevices` membership check its three sibling routes
   already use, and to make the org filter an `AND` rather than an `else`.
2. **Unauthenticated water-data routes** (`/water-data`, `/device`, `/duration/*`,
   `POST /water/check-alerts`) expose sensor data with no auth and no scoping, and enumerate device
   labels for §1 (`DEVICE_API.md` §4).
3. **Shifted metric-code table in `DevicesService.checkWaterDataAndSendAlerts`** — every key
   displaced, so customer threshold alerts compare each metric against a *different* metric's
   limits. Advertised, customer-facing behavior (`DEVICE_API.md` §7, §14b).
4. **Dangling organization references** on `Marina Park` and `CWA Old` (§2).
5. **Tokens are minted with no expiry** (`DEVICE_API.md` §4), so every issue above has an
   unbounded blast radius once a token leaks.

---

## 6. Two holes in **this** service — found 2026-08-21, fixed the same day

Everything above is upstream and theirs to fix. These two were ours, and are now closed on
`fix/unauthenticated-endpoints`. Both were found by reading the code, not by exploitation.

### 6a. `GET /api/v1/devices` served unauthenticated callers out of the superadmin token

`src/routes/deviceRoutes.ts` mounted the route with **no auth middleware**, and
`DeviceApiClient` defaulted its token: `options.token ?? config.deviceApi.devToken`. A request
with no `Authorization` header therefore fell through to `DEVICE_API_TOKEN` from `.env` — a
**superadmin** token in this deployment, which sees all 8 organizations. The controller's own
docstring claimed the endpoint was "org-scoped by the caller's token", which held only when a
caller token was present.

**Fixed in the class, not the route.** The implicit default is gone; the deployment credential is
reachable only via an explicit `useConfiguredToken: true` at the call site, so *which code may use
it* is a property of the code rather than a setting. The legitimate users of that fallback are
offline (`scripts/exploreDeviceApi.ts`, `scripts/verifySensorTool.ts`) and now say so. A new
`requireCallerToken` middleware returns 401 + `WWW-Authenticate: Bearer` with code
`caller_token_required`.

Deliberately **not** gated on `NODE_ENV === "production"` (the shape `POD_AUTHORIZATION.md` §10
P0(1) originally proposed): that leaves the hole open in exactly the environment developers
exercise, so the security-relevant behaviour would differ from the one that matters.

`/chat` is **not** gated wholesale — a corpus-only question reads nothing org-scoped, so refusing
it would deny answers the service can correctly give. The org-scoped half enforces it where it
applies (`QuerySensorData.client()`, `GenerateReport.run()`).

### 6b. `GET /api/v1/reports/:filename` had no authentication at all

Generated PDFs contain customer water-quality data. Filenames are
`report_${randomUUID().slice(0, 8)}.pdf` — **32 bits of entropy**, no expiry, persisted on local
disk. Path traversal was already correctly guarded and remains so.

**Fixed with a token requirement plus ownership binding.** `generate_report` writes a sha256 of
the generating caller's token to a `.owner` sidecar; the controller refuses anything else. A
login-only gate was rejected because it would let organization A read organization B's report by
guessing eight hex characters — the one place this service's own org scoping would leak.

Both "no such file" and "not yours" answer **404**: a distinguishable 403 confirms a filename
guess and turns 32 bits of entropy into an enumeration oracle.

The owner key is a **token hash, not a user id** — with no `ACCESS_TOKEN_SECRET` an unverified
`sub` claim is forgeable, the same constraint `quotaKey.ts` and `POD_AUTHORIZATION.md` §9 both
run into. A sidecar rather than an in-memory map because the PDF outlives the process.

**Residual risk, accepted and documented:** re-login mints a different token string, so a user
loses access to reports generated under a previous one. No revocation, no expiry.

### 6c. Knock-on: the bundled demo frontend's pod picker now fails closed

`frontend/js/api.js` sends no `Authorization` header. That page only ever worked because it was
being served every organization's fleet through the fallback in §6a — it was a symptom of the bug,
not a feature. It now shows a `caller_token_required` message telling the user to sign in.

This was **not** papered over with a `?token=` URL parameter: that puts a non-expiring bearer
credential into browser history, referrer headers, and server logs.
