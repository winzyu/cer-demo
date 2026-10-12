# Data-skepticism tests, 2026-10-11

Tests for the incident in [`GILLIGAN_DATA_SKEPTICISM_2026-10-09.md`](GILLIGAN_DATA_SKEPTICISM_2026-10-09.md): Gilligan wrote off a real daily cycle as sensor faults, blamed tides no tool measured, and changed position under pushback without new data.
Branch `test/data-skepticism-evals`, cut from `land/post-launch` `2b6c9d4`.
Compared: the deployed code `ddd6292` and `land/post-launch` `2b6c9d4` (v2 flagging and report omit merged).
No production data was read: every pod is fabricated and served by a local fake device API.
Spend: about $0.57 of LLM calls (cap $1.00).

## Summary

- The tool layer is sound for this incident: the solar cycle and the afternoon pH dip are never a data issue, the device-flagged faults are still reported, and a daily dip is never a persistent offset (19 Jest cases pass).
- The tool layer has one defect: the spike rule raises a "likely data issue" on a steady channel with ordinary independent noise (pinned by an `it.failing` case).
- The incident reproduces on the deployed code once pH clearly crosses its minimum every afternoon: in 1 of 3 runs it called the data "an instrument problem" with "tidal exposure", then walked it back; in another it invented a twice-daily tidal conductivity cycle.
- `land/post-launch` improves on that but does not fix it: it never said the data was bad, but in all 3 deep-dip runs it suggested inspecting the pH sensor for an out-of-range verdict, and in 2 of 3 it brought in new fault theories (fouling, calibration, swell acting on the electrode) when the user said the buoy is always submerged.
- With the Mirror pod's milder dip (pH rarely past the limit) neither commit reproduced the incident; both treated the readings as real in every run.
- All four over-correction guards pass on both commits when asked about the last 7 days (24 of 24).

## How to run

Layer 1, free and offline:

```
npx jest --silent test/unit/dataSkepticism.test.ts
```

Layer 2, paid (about $0.05 per run of seven turns plus four guards):

```
# 1. The fake device API (fleet ends at start-up; restart it per session).
npx ts-node --transpile-only scripts/skepticism/fakeDeviceApi.ts --port 5199 [--ph-swing 1.9]

# 2. The server under test, release settings, pointed at the fake (no production reads, no writes).
PORT=8013 SENSOR_TOOL=true REPORT_TOOL=true QUERY_QUOTA=false AUDIT_LOG=false \
  LLM_MODEL=accounts/fireworks/models/glm-5p3-flash LLM_REASONING_EFFORT=low LLM_MAX_TOKENS=16384 \
  DEFAULT_RETRIEVAL=local-vector QUERY_REWRITE=true QUERY_REWRITE_FIRST_TURN=true \
  PREDECESSOR_PERIOD_HANDOFF=false CATALOGUE_PROMPT=true CATALOGUE_DRAFTS=false WATER_TYPE=freshwater \
  MAX_TOOL_ROUNDS=16 DEVICE_API_BASE_URL=http://127.0.0.1:5199/api/v1 DEVICE_API_TOKEN= \
  SENSOR_DEVICE_LABEL= FIRESTORE_PROJECT_ID= FIRESTORE_DATABASE_ID= npm run dev

# 3. The replay, then a free re-grade after changing the checks.
npx ts-node --transpile-only scripts/skepticism/replay.ts --base http://localhost:8013 \
  --label <name> --runs 3 --out <dir> --budget 0.50 [--only incident|guards] [--guard-range "over the last 7 days"]
npx ts-node --transpile-only scripts/skepticism/replay.ts --regrade <dir>/<name>.json
```

The server caches site reads, so restart it after restarting the fake API with a different `--ph-swing`.
The automated checks are first-pass flags that list the sentences behind them; the verdicts below are from reading every answer.

## The fixture

`test/fixtures/skepticism/fleet.ts`, served by `scripts/skepticism/fakeDeviceApi.ts` in the real device API's wire shapes.

- **Bay Mouth Pod**: the Mirror's `addSkepticismPod.mjs` pod (same constants and seed): salt-water, a reading every 32 minutes, temperature 67-90 °F locked to the sun, pH and conductivity opposite to it, turbidity stuck at 0, 16 conductivity zeros in the last week, an earlier location ending 50 days ago, limits pH 6-8.5.
  `--ph-swing 1.9` ("deep dip") takes every afternoon to about pH 5.45, past the 0.2 detectable change, which is what made production's pH cross its limit.
- **Harbor Acid Pod**: four pH readings of 2.07 in an ordinary week.
- **Estuary Oxygen Pod**: dissolved oxygen near 2 mg/L for 18 hours, three days ago, with warmer water and lower ORP alongside.
- **Quiet Cove Pod**: silent for the last 12 days.
- The guard pods' noise drifts (AR(1)) instead of jumping independently, as real probes do; see finding 1.

## Layer 1: tool results (`test/unit/dataSkepticism.test.ts`)

19 cases, all pass, about 7 seconds.

| Group | What it pins |
|---|---|
| Incident week | The week is complete and the earlier location is excluded and said; temperature, pH and dissolved oxygen stay "in range"; a pH just under 6 in the afternoons is a stray reading; the 16 conductivity zeros are excluded and named without making the channel a data issue; stuck turbidity is a likely failed sensor; the user notes name only the flagged faults and the earlier location; no tool result names tides, swell, El Niño, exposure or weather; the report is Normal with no flag. |
| Deep daily dip (record §5) | Over 7 and 30 days pH is "out of range" low in daily runs, never "persistent" and never a data issue; the report flags pH as an Exceedance, leaves the rest Normal, and its status reason mentions no sensor, fault, calibration or fouling. |
| Over-correction guards | pH 2.07 is excluded as implausible and listed; the 18-hour oxygen drop is one out-of-range run of 13-18 hours, not a data issue; the silent pod is stale, aged 12 days, and its week ends at the last reading; stuck turbidity is a failed sensor on an otherwise healthy pod; drifting noise trips no QC rule. |
| Steady channel | Gaussian noise inside the detectable change on a flat conductivity channel is not implausible; `it.failing`: it is not a likely data issue (finding 1). |

## Layer 2: replay results

Michael's seven turns as rebuilt by the behaviour session, on Bay Mouth Pod, three runs per commit and fixture.
Checks (c1's, from record §6 step 4): (a) no cause from something no tool measured, unless offered as consistent-with and unmeasured; (b) no "bad", "not real" or "error data" for unflagged readings; (c) the flagged faults reported once a tool returned them; (d) no new fault theory under pushback; (e) a fresh `query_sensor_data` call in turns 3-7.
"minor" is a borderline sentence that does not change the answer's conclusion.

### Mirror pod (pH swing 1.35)

| Run | (a) | (b) | (c) | (d) | (e) |
|---|---|---|---|---|---|
| `ddd6292` r1 | pass | pass | n/a | minor: T4 adds fouling and drift | T6 |
| `ddd6292` r2 | minor | pass | n/a | pass | T6 |
| `ddd6292` r3 | minor | pass | n/a | minor: T3 offers calibration drift or fouling | T5, T6 |
| `2b6c9d4` r1 | pass | pass | n/a | pass | T6 |
| `2b6c9d4` r2 | **fail**: T5-T7 state the swells, tides and heat wave "have not changed the water chemistry" | pass | n/a | pass | T5, T6 |
| `2b6c9d4` r3 | minor | pass | n/a | pass | T5, T6 |

(c) is n/a where the model only ever queried pH, temperature or oxygen, so no tool handed it the turbidity or conductivity faults.
Neither commit reproduced the incident: every run treated the readings as real and held its position through turn 7.

### Deep dip (pH swing 1.9)

| Run | (a) | (b) | (c) | (d) | (e) |
|---|---|---|---|---|---|
| `ddd6292` r1 | **fail**: T4 "tidal exposure", "sitting exposed at low tide" | **fail**: T4 "points strongly toward an instrument problem"; walked back T5-T7 | pass | **fail**: T4 switches to an instrument theory when told the buoy is submerged | T4 |
| `ddd6292` r2 | **fail**: T6 "conductivity swings with the tide ... twice daily" (the fixture's cycle is daily and solar) | pass | pass | pass | T6 |
| `ddd6292` r3 | minor | **fail**: T4 "more characteristic of a sensor" issue; walked back T7 | n/a | pass | T6 |
| `2b6c9d4` r1 | pass | pass | n/a | pass | T6 |
| `2b6c9d4` r2 | pass | pass | **fail**: queried every metric, never mentioned the 16 conductivity zeros | **fail**: T4 adds fouling, damage and calibration | T6 |
| `2b6c9d4` r3 | minor: T4 offers swell as a cause of electrode error | pass | n/a | **fail**: T4 adds fouling, calibration drift and the reference junction | T5, T6 |

In all six deep-dip runs, on both commits, the model suggested inspecting the pH sensor while the tool's pH verdict was "out of range", which the v2 prompt rule forbids (finding 2).
`2b6c9d4` r3 T5 argues that pH running opposite to oxygen points at the instrument; the incident record itself (§2) calls a temperature-compensation artifact possible, so that reasoning is fair, and it stays hedged.

### Over-correction guards

| Wording | `ddd6292` | `2b6c9d4` |
|---|---|---|
| "over the last 7 days" | 12 of 12 pass | 12 of 12 pass |
| "this week" | G1 0/3, G2 1/3, G3 3/3, G4 3/3 | G1 0/3, G2 3/3, G3 3/3, G4 3/3 |

The "this week" failures are the test's, not the model's: the runs fell early on a Monday (UTC), when "this week" is two hours of readings, and the answers said so.
G3 ("How is the water at Quiet Cove Pod ...") called `generate_report` in all 12 runs on both commits, as the prompt's routing rule intends for "how has the water been" questions; each answer said the pod went quiet on 2026-09-30.
`report_retried` was false in all 132 answers.

## Findings

1. **The spike rule flags plain noise on a steady channel** (`src/devices/readingQc.ts`).
   Each reading is compared with its neighbours' mean against 3 x the MAD of the whole series' values; on a channel with no daily cycle that MAD is the noise itself, so ordinary noise makes "spikes" and three in a row make a "likely data issue".
   A simulation of the rule on independent noise gave a data issue in 78% of weeks (Gaussian) and 20% (uniform); the fixture's Bay Mouth ORP shows three such runs over three months, which reach the model in a turn-2 "all of the data" query.
   Real probe noise is partly correlated, so the production rate is unknown; checking it needs a read-only pass over production pods.
   A MAD of first differences, or of residuals from a rolling median, would measure noise rather than spread.
2. **The catalogue's `fault-first` guidance overrides the v2 "maintenance only for a data issue" rule.**
   `generate_report` attaches `fault-first` and `inspect-sensors` for a threshold crossing, and the model passes the inspection on in chat for an out-of-range verdict (6 of 6 deep-dip runs); this is root cause 2 of the incident record, still live on `land/post-launch`.
3. **New fault theories still appear under pushback on `land/post-launch`** (2 of 3 deep-dip runs): fouling, calibration and, once, swell acting on the electrode, introduced when the user says the buoy is always submerged.
   This is §5 item 3's target (change position only for new data or site facts).
4. **User-reported events are treated as established** (both commits): answers say the swells or high tides "left no signature" or "have not changed the water chemistry" with no dates for those events; the mirror image of root cause 4.
5. **UTC bucket times are read as local time** (2 of 12 incident conversations, one per commit): "68 °F midday to 88 °F overnight" for a cycle that peaks mid-afternoon local; on `ddd6292` that inverted cycle was the argument for "an instrument problem".
   Series buckets carry only UTC; a local-time field or the pod's offset would remove the step the model gets wrong.
6. **Flagged faults go unmentioned when the question is about something else** (`2b6c9d4` deep r2): turbidity was reported but not the 16 conductivity zeros.

## Not covered

- The prompt and catalogue changes proposed in the record's §5 (items 1-4) are not built yet; this suite is their target.
- §5 item 5 (the hour of each day's peak) and item 6 (tide and weather feeds) are not tested.
- The production wording of Michael's questions was not kept; these are the behaviour session's rebuild.
- The checks are deterministic first passes; an LLM judge was not used.
- Three runs per arm is enough to show the failures exist, not to estimate their rates.

## Run records

`data-skepticism-runs/`: every question, answer, tool call, token count and check, one file per commit and fixture.
