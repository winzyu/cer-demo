# Pod relocation and registry discrepancies — evidence and how to re-derive it

Read 2026-09-03 from the read-only recordings in `data/` (git-ignored) made by
`npm run explore:fields` and `npm run explore:surface`. **Nothing was queried live for this
document**; every command below reads a file already on disk.

Analysis and consequences live in [`BACKEND_FIELDS.md`](BACKEND_FIELDS.md) §4d. This file is the
evidence and the commands, so a reader can check the claims rather than trust them.

> Re-record with `npm run explore:fields` / `npm run explore:surface` (both read-only, both hit
> production). The commands below glob for the newest recording, so they keep working afterwards.

---

## 1. One device reported from two states in one month

`Marina Park` `dev:351077454591408`, one 1-month `/water/period` window, 703 rows.

```bash
python3 - <<'PY'
import glob, json, datetime
f = sorted(glob.glob('data/backend-surface/*/Marina_Park_survivor_period_*.json'))[-1]
rows = [(r['data']['timestamp'], r['data'].get('best_location'), r['data'].get('best_lat'),
         r['data'].get('best_lon'), r['data']['water_data'].get('100'), r['data']['water_data'].get('99'))
        for r in json.load(open(f))]
rows.sort()
t = lambda s: datetime.datetime.fromtimestamp(s, datetime.UTC).strftime('%Y-%m-%d %H:%M')
for place in sorted({r[1] for r in rows}):
    g = [r for r in rows if r[1] == place]
    print(f"{place:<22} n={len(g):<4} {t(g[0][0])} -> {t(g[-1][0])}  "
          f"lat {g[0][2]:.3f} lon {g[0][3]:.3f}  cond {min(r[4] for r in g):.0f}-{max(r[4] for r in g):.0f}  "
          f"pH {min(r[5] for r in g):.2f}-{max(r[5] for r in g):.2f}")
PY
```

```
Francisville KY        n=34   2026-07-22 01:32 -> 2026-07-24 18:50  lat 39.100 lon -84.674  cond 384-391    pH 5.66-14.00
Newport Beach CA       n=668  2026-08-04 01:01 -> 2026-08-21 01:00  lat 33.609 lon -117.923 cond 362-41915  pH 0.00-8.00
Newport Beach California n=1   2026-08-04 00:31 -> 2026-08-04 00:31  lat 33.610 lon -117.908 cond 39365      pH 4.62
```

**~2,000 miles apart, fresh water then seawater, one device id, with an 11-day silence between
them.** Commissioned or bench-tested inland, then shipped and deployed. The Kentucky block reports
**pH 14.00** — the top of the scale, a rail rather than a reading. Note also two spellings of the
same place, so `best_location` is free text and cannot be grouped on safely.

## 2. A pod can leave the water without leaving its location

```bash
python3 - <<'PY'
import glob, json, datetime
f = sorted(glob.glob('data/backend-surface/*/Marina_Park_survivor_period_*.json'))[-1]
rows = sorted((r['data']['timestamp'], r['data'].get('best_location'), r['data']['water_data'].get('100'))
              for r in json.load(open(f)))
t = lambda s: datetime.datetime.fromtimestamp(s, datetime.UTC).strftime('%m-%d %H:%M')
for ts, place, cond in [r for r in rows if 'Newport' in (r[1] or '') and r[2] < 20000]:
    print(f"  {t(ts)}  {cond:>8.0f} uS/cm")
PY
```

```
  08-11 18:02      3387 uS/cm
  08-11 18:55       393 uS/cm      <- seawater is ~40,000
  08-11 19:21       380 uS/cm
  ...
  08-11 19:56       362 uS/cm
```

Two hours, position unchanged, then it returns to ~40,000. A lift or a servicing, not an estuary
event. **`best_location` does not tell you whether a reading was taken in water.**

## 3. The registry contradicts itself about where pods are and what they sit in

```bash
python3 - <<'PY'
import glob, json
f = sorted(glob.glob('data/device-fields/*/devices.json'))[-1]
orgs = {o['id']: o['name'].strip() for o in json.load(open(sorted(glob.glob('data/backend-surface/*/organizations_.json'))[-1]))}
for e in json.load(open(f)):
    d = e['data']
    print(f"{d.get('label'):<22} {str(d.get('name'))[:26]:<27} {orgs.get(d.get('organization'), 'DANGLING'):<24}"
          f" {str(d.get('operatingEnvironment')):<12} noaa={d.get('noaaTidesId')} merged={d.get('mergedInto')}")
PY
```

Three discrepancies fall out of that one table:

- **A chain that changes water type.** `Old Woman Creek 2026` is `fresh-water`; both labels it
  absorbs (`CWA 2025 testbed`, `CWA Old`) are registered **`salt-water`**. Old Woman Creek is a
  Lake Erie estuary. `operatingEnvironment` selects the entire baseline table — 0-1,500 µS/cm
  freshwater against 40,000-50,000 saltwater.
- **Two pods 2,300 miles apart share a tide station.** `noaaTidesId` `9087057` appears on both
  `Trinidad Island DataPod™` (City of Huntington Beach) and `CWA 2025 testbed` (Cleveland Water
  Alliance). One of those rows is wrong; any tide correlation drawn from it is meaningless.
- **The names record the move.** `East Anchorage DataPod™` merges into `PCH Public Dock Buoy`;
  `Marina Park DataPod™` into `Marina Park`. Those are place names, and they changed at the merge.

## 4. One label, two registry rows, contradictory water types

```bash
python3 - <<'PY'
import glob, json, collections
f = sorted(glob.glob('data/device-fields/*/devices.json'))[-1]
seen = collections.defaultdict(list)
for e in json.load(open(f)):
    seen[e['data'].get('label')].append((e['id'], e['data'].get('organization'), e['data'].get('operatingEnvironment')))
for label, rows in seen.items():
    if len(rows) > 1:
        print(label, '->', len(rows), 'registry rows')
        for doc, org, env in rows:
            print('   doc', doc[:12], 'org', str(org)[:12], 'env', env)
PY
```

```
dev:860322068098448 -> 2 registry rows
   doc I9WfjVjx1Gl6 org FF8Syo9Sypom env fresh-water
   doc dySNENR4iKqX org FF8Syo9Sypom env salt-water
```

Same physical pod, same organization, **registered as both fresh and salt water**. Whichever row a
name-keyed lookup happens to hit decides the baseline table. This is why every lookup keys on
`label` and collapses duplicates (`dedupeByLabel`).

## 5. Two organizations own no devices at all

`UC Davis` and `Cape Fear River Watch` appear in `GET /organizations` and on no device. That trips
upstream's zero-device fail-open in `findPeriodWaterData`: an empty label list adds no `where`
clause, so the query returns **every organization's** rows
([`POD_AUTHORIZATION.md`](POD_AUTHORIZATION.md) §2d(4)). The most restricted accounts that exist
would read the whole fleet's history. Two live instances, not a hypothetical — raise it upstream.

## 6. ⚠️ The decisive one: a merged chain is the *instrument's* history, not the site's (2026-09-03)

Sections 1-5 read recordings. This one queries the retired labels directly, and it is the finding
that should drive the design.

```bash
key=$(grep '^DEVICE_API_TOKEN=' .env | cut -d= -f2-)
base=$(grep '^DEVICE_API_BASE_URL=' .env | cut -d= -f2-)
for label in dev:868050040248466 dev:860322068093894 dev:351077454528640 dev:868050045747025; do
  echo "== $label"
  curl -s -H "Authorization: Bearer $key" "$base/water/period/5/fiveYears?device=$label" \
   | python3 -c "
import json,sys,collections,datetime
rows=json.load(sys.stdin)
c=collections.Counter(); span={}
for r in rows:
    d=r['data']; loc=d.get('best_location') or '(no location)'
    c[loc]+=1; ts=d.get('timestamp')
    if ts: span.setdefault(loc,[ts,ts]); span[loc][0]=min(span[loc][0],ts); span[loc][1]=max(span[loc][1],ts)
f=lambda s: datetime.datetime.fromtimestamp(s, datetime.UTC).strftime('%Y-%m-%d')
print(f'   {len(rows)} rows across {len(c)} distinct locations')
for loc,n in c.most_common(4): print(f'   {n:>6}  {loc:<26} {f(span[loc][0])} -> {f(span[loc][1])}')"
done
```

```
== dev:868050040248466   (CWA Old)
   5989 rows across 24 distinct locations
     4488  South Salt Lake UT         2023-08-08 -> 2023-09-01
     1359  Huron OH                   2023-09-19 -> 2023-10-08
== dev:860322068093894   (CWA 2025 testbed)
   8554 rows across 19 distinct locations
     2749  Wilmington NC              2024-07-16 -> 2024-10-16
     2587  Hightsville NC             2024-10-23 -> 2024-12-16
     2487  Huron OH                   2025-06-10 -> 2025-08-06
      417  South Salt Lake UT         2024-02-02 -> 2024-06-21
== dev:868050045747025   (East Anchorage DataPod)
   13003 rows across 7 distinct locations
     5344  Newport Beach CA           2023-08-15 -> 2025-03-17
     4727  South Salt Lake UT         2023-04-27 -> 2023-08-05
== dev:351077454528640   (Marina Park DataPod)
   19286 rows across 9 distinct locations
    17231  Newport Beach CA           2023-08-15 -> 2025-07-08
      656  Francisville KY            2024-08-21 -> 2024-10-25
```

**Pods are refurbished and redeployed to different customers, in different states.** South Salt
Lake UT and Francisville KY / Cincinnati OH recur across several devices and read as staging or
integration sites; Wilmington and Hightsville NC are a Cape Fear deployment; Huron OH is Old Woman
Creek. One instrument passes through several of them.

Quantified on the three-label chain we would merge for `Old Woman Creek 2026`:

```
Old Woman Creek 2026 chain, all three labels merged: 15446 rows
     5336  ( 34.5%)  NC
     5019  ( 32.5%)  UT
     4713  ( 30.5%)  OH
   at the actual site (Huron OH): 4679 rows = 30.3% of the merged chain
```

**Merging that chain by label and calling it "Old Woman Creek's history" would make 70% of the rows
come from North Carolina and Utah.** The unmerged survivor under-reports the site (~5% of its
record); the naively merged chain misreports it worse, because the extra rows are confidently wrong
rather than merely absent. Marina Park's chain is the benign case — 17,231 of 19,286 predecessor
rows really are Newport Beach.

**So label identity is necessary but not sufficient.** The merge fields answer "same instrument";
they do not answer "same site", and only the second question makes a water-quality time series
meaningful. Continuity has to be **positional**: segment a chain by `best_location` /
`best_lat`/`best_lon`, keep the segments at the survivor's site, and disclose the rest — the same
shape the withheld-history disclosure already has.

## 7. The chains are no longer resolvable from `/devices` (2026-09-03)

The registry was cleaned between 2026-08-21 and 2026-09-03: 15 devices became 5, every archived and
merged-away row disappeared from `/devices`, `Marina Park`'s dangling organization was repaired to
City of Newport Beach, and `PCH Public Dock Buoy` and `Balboa Basin Buoy` (renamed `Balboa Yacht
Basin Buoy`) both moved from CER Super Admin to City of Newport Beach.

Comparing each survivor's `labels[]` against what `/devices` returns today:

```
labels /devices returns today: 5
Old Woman Creek 2026 -> ['dev:868050040248466', 'dev:860322068093894'] not visible
Marina Park          -> ['dev:351077454528640'] not visible
PCH Public Dock Buoy -> ['dev:868050045747025'] not visible
```

Two consequences. Our resolver only reads a predecessor that appears in the caller's own
`/devices`, so **every chain now resolves to survivor-only and reports the rest as withheld** — it
fails safely and says so, but continuity is effectively off. And the predecessors' organization is
no longer knowable at all, so the same-org rule has nothing left to check.

Given §6, that accidental conservatism is closer to right than the naive merge would have been.

---

## What this changes

Merging stays correct: the merge fields are unambiguous about which device ids are one instrument.
What it costs is the assumption that a chain describes one **site**. A mean over Marina Park's
month is arithmetic across Kentucky tap water and Pacific seawater, and it will not look like an
error — it will look like a number. A relocation also looks exactly like a simultaneous step change
in every parameter, which is what event detection hunts for.

The guard is positional and not yet built: readings already carry `best_lat`/`best_lon`, so a
window whose fixes span more than a few kilometres, or whose `best_location` changes, can be
flagged and disclosed the way withheld history already is. §6 upgrades this from a nicety to a
**precondition for merging at all** — on the Old Woman Creek chain, label-only merging would put
70% of the rows in the wrong state.
