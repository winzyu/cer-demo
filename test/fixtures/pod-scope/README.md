# Pod-scope fixtures — a dummy fleet for authorization work

Synthetic, offline, and safe to commit. Nothing here is real: labels are `dev:1000000000000NN`,
organization ids are `org-…`, emails are `@example.invalid`. **No credential of any kind belongs
in this directory.**

## Why these exist

Pod-level authorization (`docs/migration/POD_AUTHORIZATION.md`) cannot be demonstrated with the
credential we hold. `DEVICE_API_TOKEN` is a **superadmin** token, and superadmin bypasses every
organization check upstream by design (`assignOrganization` returns `null`, which means *no
filter*). So it cannot show a narrowed account behaving differently — not because the code is
wrong, but because that token is the one account for which the answer is always "everything".

Getting a real narrowed account needs a human: a superadmin creating a team user through
`POST /api/v1/users`. These fixtures let every layer below that be built and proved first, and
they encode the registry's real hazards rather than a clean world that would let bugs through.

## Files

| file | mirrors | shape |
|---|---|---|
| `organizations.json` | `GET /organizations` | `{ id, name }` — that is genuinely all the API returns |
| `devices.json` | `GET /devices` | `{ id, data: {...} }`, the raw Firestore document under `data` |
| `users.json` | the JWT payload | the whole user record, which is what upstream signs |
| `pod-grants.json` | our proposed `pod_grants` collection | `POD_AUTHORIZATION.md` §3b |

## The hazards each fixture encodes

Every one of these is copied from a verified live condition (`BACKEND_FIELDS.md`), because an
authorization resolver that only works on a tidy registry is not finished.

- **A duplicate registry row.** `doc-harbor-pier-duplicate` repeats `dev:100000000000001` under a
  *different organization*. Live, "Algalita Pod" has three such rows. A resolver keyed on document
  id sees three pods; one keyed on label sees one. Label wins.
- **A dangling organization.** `Lakeside Legacy Pod` points at `org-ghost-0000000001`, which is
  absent from `organizations.json` — as `Marina Park` and `CWA Old` are live. Compare org ids as
  opaque strings; never resolve the document.
- **A cross-organization merge chain.** `Demo Public Dock Buoy` (CER) absorbs `Old Anchorage
  DataPod™` (Harbor City), mirroring PCH Public Dock ← East Anchorage. Its history must be
  withheld by default.
- **A same-organization chain that changes water type.** `Lakeside Buoy 2026` is `fresh-water`;
  its own predecessor `Lakeside Testbed` is registered `salt-water`, exactly as `Old Woman Creek
  2026` (fresh) absorbs `CWA 2025 testbed` (salt). Authorized to merge, and still not obviously
  the same water body — see `BACKEND_FIELDS.md` §4d.
- **A tide station shared by two distant pods.** `Lakeside Testbed` carries `9087057`, the same id
  live data puts on both a Lake Erie pod and a Huntington Beach pod. Two pods 2,300 miles apart
  cannot share a tide station; one of those rows is wrong.
- **Junk thresholds.** `Harbor Pier DataPod™` has all ten values `0`; `Demo Public Dock Buoy` has
  the `maxPH=100` / `maxDissolvedOxygen=100` placeholder set. Both must be treated as unset.
- **A mixed-type calibration date.** `Harbor Pier DataPod™` stores a Firestore timestamp while
  everything else stores ISO, as `CWA Old` does live.
- **A `lastCalibrationData` typo**, an `archived` pod, and an unnamed pod whose `name` is its
  label — all live conditions.
- **An account with no organization** (`user-orphan-000001`). Upstream resolves this to `null`,
  which means *unfiltered*. Ours must resolve it to the empty set. This is the one place we
  deliberately do not copy upstream behaviour.

## The grants, and what each proves

- `role:superadmin → *` — the bootstrap grant. Without it an empty store denies everyone on the
  first deploy.
- `user-harbor-cust-01 → chain dev:…0001, history same-org` — the ordinary case. Sees its pod and
  its pod's predecessor; must not see Lakeside or the dock.
- `org-lake-… → chain dev:…0003, history same-org` — an org-wide grant whose chain reaches the
  same-org testbed but stops at the dangling-org legacy pod.
- `user-lake-cust-0001 → pod dev:…0006` — **a deliberate trap.** It grants a pod that user's own
  token cannot see. Because effective access is `visible ∩ granted`, the result must be empty. A
  resolver that "optimises" by trusting an explicit grant without the `/devices` intersection
  passes every other test and fails this one — which is the exact accident
  `POD_AUTHORIZATION.md` §12c warns about.

## Using them

Serve `devices.json` through a stubbed `fetch` into the real `DeviceApiClient`, the way
`test/unit/mergeChains.test.ts` already does. That exercises the real client, decoder and
resolver rather than a mock of them, and needs no network, no token and no cost.
