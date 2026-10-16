# Report omission: Mirror runbook

How to stand up the Mirror (a local copy of production with fabricated data) for the release's report omission, and test every part of it by hand with expected results.
Nothing here reads or writes production: Firestore is a local emulator, the CER server and dashboard are local, and the only outside call is the model provider during the paid steps.

Written 2026-10-15 and dry-run the same night: the setup in §3-§5 and the free checks in §6.1-§6.2 ran as written (53 of 53 automated checks passed); the browser checks in §6.3 and the paid chat steps in §7 have not run on this build.
Earlier results for the same feature: [`REPORT_OMIT_MIRROR_RESULTS_2026-10-10.md`](REPORT_OMIT_MIRROR_RESULTS_2026-10-10.md); the design is [`SPECS.md`](../SPECS.md) §10.7.

## 1. What is tested

| feature | where | how |
|---|---|---|
| The four `omit` groups each remove only their own notes; every number, flag, status and recommendation stays | cer-gilligan `POST /api/v1/reports` via cer-api | §6 script, checks C1-C7 |
| The PDF's "Omitted" row names exactly the groups left out; sections renumber when Data Quality goes | same | §6, C2, C3, C5-C7 |
| cer-api rejects a malformed `omit` without calling Gilligan; Gilligan rejects an unknown group and cer-api relays its message | cer-api `POST /api/v1/gilligan/report` | §6, V1-V5 |
| Rejected requests use no report allowance; the 6th report of the day is refused | same | §6, allowance checks |
| The model picks the right groups from plain requests, and leaves the report whole when the request is ambiguous or asks to remove numbers | Gilligan chat via the dashboard | §7, A1-A4, B1, C1, D1 |
| The server's own "New PDF in this reply" line always matches the `omit` actually passed; a reply that claims a copy it did not make is retried once (`report_retried`) | Gilligan chat, cer-api relay | §7, A3, and the helper in §7.1 |
| Download buttons carry each answer's own request, survive a reload, and download the copy that answer described | dashboard | §7, A5, E2 |
| A pod with no turbidity row takes `turbidity_notes` without error | dashboard | §7, E1 |

Not covered here:

- What `sensor_fault_notes` removes is visible only when a turbidity Flag cell reads "(all zero)" or "(off-scale)", and no Mirror pod produces either; on the Mirror it changes only the Omitted row (C7).
  The removed text is covered by `test/unit/reportRenderPdf.test.ts` and the offline sample `report-omit-samples/offline-S3-no-turbidity-or-fault-notes.pdf` that Michael approved.
- The rest of what `dev` carries (v2 flagging, the data-skepticism fix, the coverage line) runs on this stack but has its own checks; the flagging rework is not on `dev` yet.

## 2. The stack

```text
browser -> dashboard :3100 -> cer-api :5101 -> Firestore emulator :8080 (project demo-cer-mirror)
                                  \-> Gilligan :8010 -> model provider (paid steps only)
                                         \-> pod data from cer-api :5101, as the caller
```

| piece | directory | code | why this code |
|---|---|---|---|
| Firestore emulator and seed | `~/code/work/clean-earth-rovers/worktrees/mirror-report-omit` | server `mirror/release-rc1` `8594338` plus three patches (§3.1) | `8594338` is live cer-api's release `122136d` plus the Mirror fixtures |
| cer-api | same directory | same | the release plus the report-omit relay `ddcddc5` and the `report_retried` relay patch, which is what the server PR will carry |
| Gilligan (cer-gilligan) | `~/code/work/clean-earth-rovers/repo/cer-demo/.claude/worktrees/omit-mirror` | cer-demo `dev` `f0cb4d2`, detached | everything the next release ships from `dev`; detached so coordinator commits do not change it mid-test |
| Dashboard | `~/code/work/clean-earth-rovers/worktrees/dashboard-land` | dashboard `fc13d16`, detached | the live cer-ui build; it needs no change, since it posts back the request each answer offers |

Ports: 3100 (dashboard), 5101 (cer-api), 8010 (Gilligan), 8080 (emulator), plus the emulator's 4400, 4500 and 9150.
Port 3000 is avoided on purpose: Docker container `cer-ui-l8-local`, when running, serves a dashboard that proxies to the **live** cer-api.

## 3. One-time setup

All three directories exist on this machine as of 2026-10-15; skip to §4 unless one is missing or a newer build is to be tested.

### 3.1 Server tree

```bash
bash ~/code/work/clean-earth-rovers/repo/cer-demo/.claude/worktrees/dev/scripts/mirror/reportOmitTree.sh
```

Expected output ends with:

```text
base: mirror/release-rc1 8594338
omit: task/gilligan-report-omit ddcddc5
tree ready: /home/winsy/code/work/clean-earth-rovers/worktrees/mirror-report-omit
```

The script exports `mirror/release-rc1` with `git archive` and applies three patches with `git apply`; nothing is committed, merged or checked out in the server repository, so none of the upstream Git rules is touched.

1. `git diff local task/gilligan-report-omit`: cer-api accepts and relays `omit`.
2. `~/code/work/clean-earth-rovers/handoff/2026-10-15/report-retried.patch`: cer-api relays `report_retried`.
3. `scripts/mirror/mirror-seed-turbidity.patch`: the seed stores the turbidity index in field 72, as production rows do, so Mirror reports get a turbidity row (before this, every Mirror pod read turbidity 0 and the turbidity notes could not be tested).

It refuses an existing target, links the server's `node_modules`, copies `.env.mirror.local` from `server-release-mirror` without printing it, and runs the malware scan; it stops if the scan finds anything.

Optional check of the two relay patches (free, about 20 seconds):

```bash
cd ~/code/work/clean-earth-rovers/worktrees/mirror-report-omit
FIRESTORE_EMULATOR_HOST=127.0.0.1:1 npx jest --runInBand "$PWD/test/unit/services/CerRagService.test.ts" "$PWD/test/unit/services/provenance.test.ts"
```

Expected: `PASS test/unit/services/CerRagService.test.ts` and `PASS test/unit/services/provenance.test.ts`.
Jest also finds the same suites in sibling server worktrees and reports many of them as failed; ignore every line that does not start with `PASS test/` or `FAIL test/`.

### 3.2 Gilligan worktree

```bash
cd ~/code/work/clean-earth-rovers/repo/cer-demo/.claude/worktrees/dev
git worktree add --detach ../omit-mirror dev
cd ../omit-mirror
ln -s ~/code/work/clean-earth-rovers/repo/cer-demo/node_modules node_modules
ln -s ~/code/work/clean-earth-rovers/repo/cer-demo/data/corpus data/corpus
ln -s ~/code/work/clean-earth-rovers/repo/cer-demo/data/embeddings data/embeddings
(umask 077 && cp ../dev/.env .env)
git rev-parse --short HEAD
```

The `.env` supplies only the model provider key; the settings file in §4 overrides every other setting in it.
To test a newer `dev`, run `git -C ~/code/work/clean-earth-rovers/repo/cer-demo/.claude/worktrees/omit-mirror checkout --detach dev` with Gilligan stopped.

### 3.3 Dashboard

`dashboard-land` is a clean, detached checkout of `fc13d16` with its own `node_modules`; check it before use:

```bash
cd ~/code/work/clean-earth-rovers/worktrees/dashboard-land
git rev-parse --short HEAD          # fc13d16
git status --short                  # nothing
grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next .   # nothing
```

Stop if any of the three differs.

## 4. Settings file

Run in a setup terminal:

```bash
cd ~/code/work/clean-earth-rovers/repo/cer-demo/.claude/worktrees/dev
node scripts/mirror/reportOmitEnv.mjs
```

It prints a path such as `/tmp/report-omit-mirror-env.1a2b3c4d`: a mode-600 file of `export` lines with fresh random secrets for this run, production's Gilligan model settings (`glm-5p3-flash`, reasoning low, 16 tool rounds, `local-vector` retrieval, the catalogue prompt, `WATER_TYPE=freshwater`, 20 questions and 5 reports a day), and every Firestore and device-API setting pointed at the emulator and the local cer-api.

In each of the five terminals, load it and check the guards (use the printed path):

```bash
source /tmp/report-omit-mirror-env.REPLACE
export PATH="$JAVA_HOME/bin:$PATH"
test "$FIRESTORE_EMULATOR_HOST" = 127.0.0.1:8080 && test -z "$DEVICE_API_TOKEN" && test "$DEVICE_API_BASE_URL" = http://localhost:5101/api/v1 && echo "guards ok"
```

Stop if `guards ok` does not print.

## 5. Start

Check the ports are free first:

```bash
ss -ltnp '( sport = :3100 or sport = :5101 or sport = :8010 or sport = :8080 or sport = :4400 or sport = :4500 or sport = :9150 )'
```

Expected: only the header line.
If a port is taken, find out whose it is before going on; never stop the service on port 8000.

| step | terminal | command | expected |
|---|---|---|---|
| 1 | emulator | `cd "$MIRROR_SERVER" && npm run mirror:emulator` | `All emulators ready!` and `Firestore │ 127.0.0.1:8080` |
| 2 | setup | `cd "$MIRROR_SERVER" && npm run mirror:seed -- --fixtures && date -u` | `[Mirror] Seeded (default) on 127.0.0.1:8080: 9 organizations, 27 users, 22 devices, 52 chats, 13680 readings (30 days).`; write down the time |
| 3 | cer-api | `cd "$MIRROR_SERVER" && PORT=5101 npm run dev:mirror` | `[Mirror] Firestore emulator at 127.0.0.1:8080, project demo-cer-mirror.`; a line about Application Default Credentials is expected, do not run `gcloud auth` |
| 4 | Gilligan | `cd "$GILLIGAN_DIR" && PORT=8010 npm run dev` | within a minute or two: `SENSOR_TOOL is ON`, `REPORT_TOOL is ON`, `CATALOGUE_PROMPT is ON`, `QUERY_QUOTA is ON — requests=20, tokens=1000000, reports=5 per 1d per caller`, `Listening on http://localhost:8010` |
| 5 | dashboard | `cd "$DASHBOARD_DIR" && npm run dev -- -p 3100 -H 127.0.0.1` | `Ready`; a Browserslist warning is harmless |

The emulator keeps nothing on disk: every start needs a seed, and a seed wipes every chat and allowance count.
If the seed crashes with "Request time should not be before the last token refill time" (a WSL clock step), run it again.
Readings end at the seed time and do not grow, so "last 7 days" means the 7 days before the seed.

## 6. Free checks (no model calls)

### 6.1 Smoke

From the setup terminal:

```bash
curl --noproxy '*' -s -o /dev/null -w '%{http_code}\n' http://localhost:5101/api/v1/devices     # 401
curl --noproxy '*' -s http://localhost:8010/health; echo                                         # "status":"ok", "fireworksConfigured":true
curl --noproxy '*' -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/api/v1/devices     # 401, proxied to the local cer-api
ss -tnp | grep -E 'node|java' | awk '{print $5}' | sort -u | grep -vE '^(127\.0\.0\.1|\[::1\]|\[::ffff:127)'   # nothing
```

The last line must print nothing outside a paid step; during one, only the model provider appears.

### 6.2 Automated route checks

Run right after a seed (it uses 4 of `user-super-1`'s 5 reports and all 5 of the River Watch customer's):

```bash
cd ~/code/work/clean-earth-rovers/repo/cer-demo/.claude/worktrees/dev
node scripts/mirror/reportOmitChecks.mjs ~/report-omit-checks-$(date +%F)
```

Expected: 53 lines starting `PASS` and a final `ALL PASS`, with these details:

| check | request | expected |
|---|---|---|
| C1 | Superadmin, Demo Public Dock Buoy, last 7 days, no `omit` | 200 PDF; no Omitted row; the turbidity footnote, the summary's "bands over an uncalibrated scale", the table's "No range (relative index)", the analysis's "provisional, uncalibrated conversion", the "Site Baseline for ..." footnotes and section "5. Data Quality" all printed |
| C2 | same, `omit: ["turbidity_notes"]` | Omitted row `turbidity notes (at the requester's request)`; the four turbidity notes gone, the Baseline cell shows `—`; the band ("Turbid") and every figure unchanged; threshold notes and Data Quality kept |
| C3 | same, all four groups with `data_quality` repeated | Omitted row `turbidity notes, sensor fault notes, threshold notes, Data Quality section (at the requester's request)`, each once; every note above gone; sections run 1-5 with "5. Recommendations" (was 6); 3 pages instead of 4; every figure unchanged |
| V1 | `omit: "turbidity_notes"` (a string) | 400 from cer-api: `A report needs a time_range of at most 100 characters, an optional device and an optional omit list.` |
| V2 | `omit: ["Bad!"]` | the same 400 |
| V3 | eleven entries | the same 400 |
| V4 | `omit: ["recommendations"]` | 400 relayed from Gilligan: `"omit" must be a list drawn from: turbidity_notes, sensor_fault_notes, threshold_notes, data_quality.` |
| V5 | `omit: []` | 200, the full report |
| allowance | Superadmin's count | 0 before, 4 after: the three valid copies and V5; V1-V4 not counted |
| C4-C7 | River Watch customer, River Watch Float: full, then `threshold_notes`, `data_quality`, `sensor_fault_notes` alone | each 200 with the matching Omitted row and identical figures; `threshold_notes` removes "Site Baseline for"; `data_quality` removes the section; `sensor_fault_notes` changes only the Omitted row (see §1) |
| allowance | River Watch, 5th and 6th reports | the 5th 200; the 6th 429 `Report quota exceeded: 5 of 5 reports used in the current 1d window. Quota resets at <next 00:00 UTC>` |

The output directory keeps every PDF and its text; `diff C1-dock-full.txt C3-dock-all-four.txt` shows exactly what the four groups remove.
A FAIL names the check; stop and report it with the directory.

### 6.3 Browser

Open `http://localhost:3100` (always `localhost`, not `127.0.0.1`, so the login is not split), with Developer Tools open on Network and "Preserve log" on.
Every account's password is `mirror-dev-password`.

| check | expected |
|---|---|
| log in as `user-super-2@mirror.example.invalid` | the home page lists the Mirror's current pods, including Demo Public Dock Buoy |
| open Gilligan | the chat page and `20 questions left, resets <date> <time>` |
| Network tab | every request goes to `localhost:3100`; nothing to `run.app` |

## 7. Paid chat checks

Get the budget approved first: 8 questions, roughly $0.10-0.20 at the 2026-10-10/11 rates (at most about $0.45 if every token were billed at the output rate); a forced retry adds about 24,000 tokens to that answer.
Downloads cost no model time but use the persona's 5 reports a day.

Rules for every step:

- Click **New chat** where the table says "new chat", and only there: A1-A5 are one conversation.
- After each answer, run the helper (§7.1) for that persona and record its output.
- When the answer offers a button, click it and check the PDF: open it, or run `pdftotext -layout <file> - | grep -A1 '^Omitted'`.
- The PDF lands in the browser's download folder as `cer-report-<pod>-<start>-to-<end>.pdf`; rename it to the step ID before the next download.

### 7.1 Helper

```bash
cd ~/code/work/clean-earth-rovers/repo/cer-demo/.claude/worktrees/dev
node scripts/mirror/reportOmitLastChat.mjs user-super-2@mirror.example.invalid
```

For each turn of that persona's latest chat it prints the question, every `generate_report` call's arguments (including `omit`), `report_retried`, the server's delivery line, the download offers and the start of the answer.
It is free and reads only the saved chat.

### 7.2 Steps

Personas: `user-super-2` (chat A), `user-super-3` (chat C), `user-lake-cust-1` (chats B and D), `user-harbor-cust-1` (chat E), all `@mirror.example.invalid`.
`<period>` below is the 7 days before the seed, such as `2026-10-09 to 2026-10-16`.

| step | persona, chat | type exactly | expected `generate_report` | expected delivery line (last paragraph of the answer) | expected button and PDF |
|---|---|---|---|---|---|
| A1 | super-2, new chat | `Give me a water quality report for Demo Public Dock Buoy for the last 7 days.` | one call, no `omit` | `New PDF in this reply: Demo Public Dock Buoy, <period>, full report.` | `Download report - Demo Public Dock Buoy (PDF)`; no Omitted row; turbidity footnote present |
| A2 | same chat | `Can you exclude the turbidity disclaimers so I can share a clean PDF copy online?` | one call with `omit` containing `turbidity_notes` (adding `sensor_fault_notes` is acceptable) | `New PDF in this reply: Demo Public Dock Buoy, <period>, leaving out the turbidity notes` (`and sensor fault notes` if added) | a new button; Omitted row names the same groups; turbidity band still "Turbid"; figures as A1 |
| A3 | same chat | `Remove all the warnings and the data quality section.` | one call with all four groups; `report_retried` may be true (the retry is what makes this step pass) | `... leaving out the turbidity notes, sensor fault notes, threshold notes and Data Quality section.` | Omitted row names the same groups as the call; no section "Data Quality"; Recommendations is section 5 |
| A4 | same chat | `Take the pH numbers out of the report.` | none, or a call that still keeps every number | `No new PDF was made in this reply.` when no call was made | the answer says numbers cannot be removed; no claim that pH was removed |
| A5 | same chat | (no question) reload the page, open chat A from the chat list, click A1's button, then A2's | none | none | A1's button downloads a copy with no Omitted row; A2's downloads its own omitted copy |
| B1 | lake-cust-1, new chat | `Report for Lakeside Mobile Buoy, last 7 days, without the notes about where the thresholds come from.` | one call, `omit: ["threshold_notes"]` | `New PDF in this reply: Lakeside Mobile Buoy, <period>, leaving out the threshold notes.` | Omitted row `threshold notes (at the requester's request)`; no "Site Baseline for ..." footnote; turbidity notes still present |
| C1 | super-3, new chat | `Make me a shorter report for Demo Public Dock Buoy.` | none with `omit`; offering the note groups instead of guessing is the expected behaviour | if it made a report: `... full report.` | if a button appears, its PDF has no Omitted row |
| D1 | lake-cust-1, new chat | `How has the water been at Lakeside Mobile Buoy this week?` | none expected; if one is made, no `omit` | none if no report was made | no button, or a full report |
| E1 | harbor-cust-1, new chat | `Give me a report for Harbor Pier Buoy for the last 7 days without the turbidity notes.` | one call, `omit: ["turbidity_notes"]` | `New PDF in this reply: Harbor Pier Buoy, <period>, leaving out the turbidity notes.` | Omitted row `turbidity notes (at the requester's request)`; the pod has no turbidity row, so nothing else differs; no error |
| E2 | same chat | (no question) reload, reopen chat E, click E1's button | none | none | the same omitted copy as E1 |

Pass:

- A1, A2, A3, B1 and E1 each make a report, and in each the delivery line, the helper's `omit` and the PDF's Omitted row name the same groups.
- No answer's delivery line or text claims a copy that was not made, and the fallback `That copy was not regenerated; please ask again.` never appears (if it does, record it: the retry made no report).
- A4, C1 and D1 pass no `omit` the user did not ask for, and A4 removes no numbers.
- A5 and E2 download the copy each button's answer described.
- Nothing in the Network tab or the `ss` line in §6.1 reaches anything but localhost and the model provider.

Record, but do not fail on: A2 adding `sensor_fault_notes`; A3 leaving out `threshold_notes` when its delivery line and Omitted row both say so (the 2026-10-11 run saw this once); the wording of A4, C1 and D1.
A wrong pick or a delivery line that disagrees with the call is a cer-demo prompt or tool-description fix; rerun only the failed steps after a new budget approval.

## 8. Recording

Write results to `docs/migration/REPORT_OMIT_MIRROR_RESULTS_<date>.md` in the format of the 2026-10-10 file: the stack table with the seed time and commits, the §6 script output (PASS count), one row per §7 step (the helper's `omit`, `report_retried`, the delivery line, the PDF's Omitted row, pass or fail), and the spend.
Mirror PDFs hold only fabricated data, so they may be kept in `docs/migration/report-omit-samples/` if wanted as evidence.

## 9. Stop and reset

- Stop with Ctrl-C in each terminal, in this order: dashboard, Gilligan, cer-api, emulator; then rerun the `ss -ltnp` line from §5 and expect only the header.
- To change a Gilligan or cer-api setting, restart only that service with the same settings file; leave the emulator running.
- To start the day's allowances over, rerun the seed (§5 step 2); it also erases every chat.
- When finished, delete the settings file: `rm -- /tmp/report-omit-mirror-env.REPLACE`.
- The three directories may stay for the next run; `mirror-report-omit` is an export with no Git history and can be deleted with `rm -r` once it is no longer wanted.

## 10. After the test: the server PR

The tree tested in §6-§7 is the server PR's content applied to the release.
Once the results are recorded, the PR goes ahead in this order; each Git or GitHub command is the user's to run, and each push or PR needs the user's approval of that exact command in chat.

1. Apply the retry patch to the PR branch (auto mode refuses this from the agent): `! git -C /home/winsy/code/work/clean-earth-rovers/worktrees/server-report-omit am /home/winsy/code/work/clean-earth-rovers/handoff/2026-10-15/report-retried.patch`
2. Push `task/gilligan-report-omit` (separate approval; the coordinator supplies the exact command).
3. Open the PR against `develop`: `! gh pr create --repo Clean-Earth-Rovers-Technology/clean-earth-rovers-server --base develop --head task/gilligan-report-omit --title "Relay a report request's omit list to cer-gilligan" --body-file /home/winsy/code/work/clean-earth-rovers/handoff/2026-10-15/report-omit-pr-body.md`
4. Deploy cer-gilligan first or together with the server change: the live cer-gilligan ignores `omit`.

## Troubleshooting

| symptom | cause and fix |
|---|---|
| cer-api exits with `FIRESTORE_EMULATOR_HOST must point at a local emulator` or `MIRROR_PROJECT_ID must name a demo- project` | the settings file was not sourced in that terminal; source it and check `guards ok` |
| Gilligan answers 401 or "service key" errors to cer-api | the two services were started from different settings files; restart both from the same one |
| a report says "no readings in that window" | more than 7 days have passed since the seed; reseed |
| a download button reads `Report limit reached - try again later` | the persona used its 5 reports; use another persona from §7 or reseed |
| the dashboard shows real CER pods or the login fails for a Mirror account | it is proxying to the live cer-api: stop it, check `API_PROXY_TARGET` is `http://localhost:5101` in that terminal, and restart |
| the seed crashes with "Request time should not be before the last token refill time" | WSL clock step; run the seed again |
