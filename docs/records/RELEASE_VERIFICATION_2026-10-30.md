# Release verification, 2026-10-30

The combined `dev` (data-skepticism fix, report omission, flagging rework) checked before the next release, by the coordinator with the user's approval of up to $1.00 (2026-10-29).
Nothing read or wrote production: the Mirror (emulator, local cer-api and dashboard) and two fake device APIs; the model provider was the only outside call.

## What ran

| part | code | result |
|---|---|---|
| Mirror start ([`runbooks/MIRROR_RUNBOOK.md`](../runbooks/MIRROR_RUNBOOK.md) §4-§6) | Gilligan `6bcde43`, then `2cb5523`; server tree `mirror/release-rc1` with the report-omit patches; dashboard `fc13d16` | ran as written; seed 9 organizations, 27 users, 22 devices, 13,680 readings; all four smoke checks as expected |
| Report omission, route checks ([`runbooks/REPORT_OMIT_MIRROR_RUNBOOK.md`](../runbooks/REPORT_OMIT_MIRROR_RUNBOOK.md) §6.2) | `6bcde43` | 53 of 53 PASS |
| Report omission, chat steps (§7, scripted) | `6bcde43`; A1-A5 again on `2cb5523` | A1-A3, B1, E1, E2 pass; A4 failed on `6bcde43` and passed on `2cb5523` (below); C1 and D1 made a full report, which §7.2 allows |
| Flagging replay (`scripts/flagging/replay.ts`, 3 runs, fake Algalita API) | `2cb5523` | Sep 24: 3/3 in range with the servicing window named; 30-day report: 3/3 Watch, conductivity Normal; Sep 26: no fault verdict; $0.025 |
| Data-skepticism replay (`scripts/skepticism/replay.ts`, 3 runs, fake fleet) | `2cb5523` | no regression against the code before the flagging landing (below); $0.27 |

Spend: $0.295 measured by the replays, plus about $0.15 estimated for the Mirror chat steps and a six-question baseline check (the Mirror logs no usage); about $0.45 in all.
Run files stayed in the coordinator's scratchpad; the counts above are from reading the answers, not from the replays' first-pass flags.

## Found and fixed

- **A4, an offer read as a claim** (`2cb5523`). Asked to "take the pH numbers out", Gilligan refused correctly but ended "if you'd like a copy without the explanatory notes ..., I can regenerate it with any of those left out".
  `reportClaim` (`src/report/delivery.ts`) read that offer as claiming a copy, forced `generate_report`, and the chat got an unrequested full report (which also used the persona's fifth report, so A5's second download was refused).
  Offers ("if you'd like", "would you like", "I can", "I could", or a question) no longer count; three cases added to `test/unit/reportDelivery.test.ts`, which failed before the fix; `SPECS.md` §10.7 updated. A1-A5 rerun after a reseed: A4 made no report and no retry, and both A5 buttons downloaded their own copies.

## Seen, not regressions

- **Michael's first turn leans to tides.** In 3 of 3 runs the answer called Bay Mouth's pH cycle tide-like, from the tool's `daily_cycle` (timing "unclear", peaks drifting 22 minutes earlier a day on this fixture end time).
  The same question asked 3 times on `74098ba` (before the flagging landing) gave the same lean, hedged the same way ("no tool measures tides ... compare against a tide table"), and `daily_cycle` was identical apart from the new `daily_lows_local_solar`. The fixture's timing depends on when the fake API starts, so earlier runs saw a cleaner solar cycle.
- **"How is the water this week?" makes a PDF report** (G3 in 3/3, and Mirror D1). The deployed `ddd6292` does the same (G3 3/3 in `captures/data-skepticism-runs/deployed-ddd6292.json`); it uses one of the day's five reports.
- The replays' first-pass checks over-flag: sentences ruling out a sewage spill or a tide, or quoting the approved "a sensor problem can look like a water-quality change", trip them.

## Not run

- The browser checks (logins, the Network tab, downloads by clicking, reload, phone layout: Mirror runbook §6, report-omission §6.3) and the manual guide's short run need a person.
- The full `npm test` (the user runs it).
