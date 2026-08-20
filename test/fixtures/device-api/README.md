# Device-API test fixtures

Recorded production responses, frozen so `query_sensor_data` can be built and tested without
touching the network. **No test may hit the device API, need a token, or cost money** — these are
what make that possible.

## Where they came from

All derived from `data/device-api/2026-08-11T20-02-31-384Z/`, the live exploration run recorded
on 2026-08-11 (`npm run explore:devices`, documented in `docs/migration/DEVICE_API.md` §9).
`data/` is git-ignored because sensor data is confidential per `CLAUDE.md`; these are the small,
committed slice the test suite needs.

| file | what it is | shape |
|---|---|---|
| `devices.json` | 6 rows from `GET /devices` — both cleared pods plus an unnamed row | raw `[{id, data}]` |
| `algalita-period-1-day.json` | 47 real readings, `GET /water/period/1/day` | raw documents, **temperature in °C** |
| `owc-period-1-day.json` | the genuinely empty window: `[]` | raw |
| `owc-last.json` | Old Woman Creek's last reading, `GET /water/last/:device` | raw `{id, data}`, **temperature in °F** |

`devices.json` deliberately keeps **all three duplicate registry rows** for Algalita Pod. They
point at one `dev:` label and are the reason `dedupeByLabel` exists — a fixture that tidied them
away would delete the trap the test is for (`DEVICE_API.md` §2).

The two period files carry temperature in **different units** for the same reason: `/water/period`
returns the stored document in Celsius while `/water/last` and `/water/average` convert to
Fahrenheit, and nothing in either payload says which (`DEVICE_API.md` §12a). Normalizing them here
would hide the exact bug the decoder exists to prevent.

## What was changed

**Coordinates and place names are scrubbed**: `best_lat`, `best_lon`, `water_data.lat` and
`water_data.lon` are set to `0`, and `best_location` to `"Location Scrubbed"`. Nothing else was
touched — timestamps, metric codes, values and error flags are exactly as returned.

That is the whole edit, and it is a judgement call rather than a rule handed down: the readings
are what the tests assert on and are meaningless without them, while the coordinates pin a
customer's equipment to a dock. `DEVICE_API.md` §9 step 4 anticipates scrubbing them. If the
project would rather commit nothing real at all, these files are regenerable from a fresh
recording and the tests would need synthetic values instead.

`owc-last.json` is **reconstructed**, not recorded verbatim: the exploration script wrote `last`
in decoded form, so the raw wire envelope was rebuilt around those values (Fahrenheit, error flags
zeroed as they were in the recording).

## What is missing

There is **no recorded `/water/period/1/week` for Old Woman Creek**. The escalation path — an
empty 1-day window widening until it finds the reading that anchors a relative range — is
therefore tested against a one-row week series built in
`test/unit/querySensorData.test.ts` from `owc-last.json`. It is labelled synthetic there.

Recording the real one is a single read-only call and would make that test stronger:

```bash
npm run explore:devices -- --pods=Algalita,"Old Woman Creek"
```

Note that any such call reads **production** — there is no QA mirror (`DEVICE_API.md` §3).
