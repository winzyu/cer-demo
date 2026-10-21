# Mirror runbook

How to stand up the Mirror, a local copy of production with fabricated data, check it, and stop it.
Nothing here reads or writes production: Firestore is a local emulator, the CER server (cer-api) and dashboard are local, and the only outside call is the model provider during paid steps.

Rebuilt on 2026-10-21 from the setup in [`REPORT_OMIT_MIRROR_RUNBOOK.md`](REPORT_OMIT_MIRROR_RUNBOOK.md), which ran as written on 2026-10-15 (§3-§5 and the free checks); this combined version has not been run end to end yet.
The September version, for the launch items on the 2026-09-28 stack, is `git show 2dd024a:docs/runbooks/MIRROR_RUNBOOK.md`; its test order is now in [`LAUNCH_ISSUES_CHECKLIST.md`](../records/LAUNCH_ISSUES_CHECKLIST.md).

What to test once the stack is up lives in the feature's own document:

| document | use it for |
|---|---|
| this runbook | starting, checking and stopping the stack, and the rules of a session |
| [`GILLIGAN_MANUAL_TEST_GUIDE.md`](GILLIGAN_MANUAL_TEST_GUIDE.md) | the full checklist (IDs such as K6 and M13) and the short run |
| [`REPORT_OMIT_MIRROR_RUNBOOK.md`](REPORT_OMIT_MIRROR_RUNBOOK.md) | the report omission checks |

## 0. Before anything

- **Port 3000 may be live.** Docker container `cer-ui-l8-local`, when running, holds port 3000 with a dashboard that proxies to the **live** cer-api; the Mirror dashboard runs on 3100 for that reason, and never on 3000.
- **Ask first.** Other chats may be using the Mirror ports (3100, 5101, 8010, 8080).
  Confirm with whoever owns them before starting, stopping or reseeding anything; a reseed destroys their chats and allowance counts.
- **Budget.** Get the session's model budget approved before the first question; each feature document gives its own estimate.
  Logins, page loads, health checks, seeding and Console calls are free.
- **Allowance.** Each persona gets 20 questions and 5 reports per UTC day, as in production; a reseed starts them over.
- **Five terminals:** setup, emulator, cer-api, Gilligan and dashboard.
  Stop each service with Ctrl-C in its own terminal.

## 1. Safety rules

1. The two CER repositories (`user-dashboard`, `clean-earth-rovers-server`) carry malware on `main` and `develop`.
   Never check those branches out, never run `npm install`, `next dev`, `next build` or `npm test` on them, and never push, force-push or merge in either repository.
2. After any clone, fetch, pull or branch switch in a CER repository, run the malware scan (§3.3 shows it); it must print nothing.
3. Never open `serviceAccountKey.json` or `~/.config/gcloud/`, and never paste a token, `Authorization` header or login response into notes or chat.
4. Never stop the service on port 8000, and never use a broad `pkill`.
5. Stop and report if anything tries to reach `run.app` or another outside address.

## 2. The stack

```text
browser -> dashboard :3100 -> cer-api :5101 -> Firestore emulator :8080 (project demo-cer-mirror)
                                  \-> Gilligan :8010 -> model provider (paid steps only)
                                         \-> pod data from cer-api :5101, as the caller
```

| piece | directory | code |
|---|---|---|
| Firestore emulator and seed | `~/code/work/clean-earth-rovers/worktrees/mirror-report-omit` | server `mirror/release-rc1` `8594338` (live cer-api's release `122136d` plus the Mirror fixtures; local, not pushed) with three patches (§3.1) |
| cer-api | same directory | same |
| Gilligan | `~/code/work/clean-earth-rovers/repo/cer-demo/.claude/worktrees/omit-mirror` | cer-demo `dev`, detached (`acb9d7d` on 2026-10-21), so commits to `dev` do not change it mid-test |
| Dashboard | `~/code/work/clean-earth-rovers/worktrees/dashboard-land` | dashboard `fc13d16`, detached: the live cer-ui build |

All three directories exist on this machine as of 2026-10-21.
Ports: 3100 (dashboard), 5101 (cer-api), 8010 (Gilligan), 8080 (emulator), plus the emulator's 4400, 4500 and 9150.

Files Git does not carry:

| file | where | what |
|---|---|---|
| `.env` | Gilligan directory | the model provider key; the settings file (§4) overrides everything else in it |
| `data/corpus/`, `data/embeddings/` | Gilligan directory | links to the main checkout's document library; never regenerate them for a test |
| `node_modules` | all three directories | the server tree and Gilligan link the main checkouts' copies; `dashboard-land` has its own |
| `.env.mirror.local` | server tree | copied by §3.1's script; the settings file takes precedence |
| Java 21 | `~/.local/opt/jdk-21.0.12.1+1` | the emulator needs Java 21 or newer |

## 3. One-time setup

Skip to §4 unless a directory in §2 is missing or a newer build is to be tested.

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

1. `git diff local task/gilligan-report-omit`: cer-api accepts and relays a report's `omit` list.
2. `~/code/work/clean-earth-rovers/handoff/2026-10-15/report-retried.patch`: cer-api relays `report_retried`.
3. `scripts/mirror/mirror-seed-turbidity.patch`: the seed stores the turbidity index in field 72, as production rows do, so Mirror reports get a turbidity row.

It refuses an existing target, links the server's `node_modules`, copies `.env.mirror.local` from `server-release-mirror` without printing it, and runs the malware scan; it stops if the scan finds anything.
The script is named for the report omission work, but its tree is the general Mirror server: the release plus what the next server PR carries.

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

To test a newer `dev`, run `git -C ~/code/work/clean-earth-rovers/repo/cer-demo/.claude/worktrees/omit-mirror checkout --detach dev` with Gilligan stopped, and record the commit.

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

In the setup terminal:

```bash
cd ~/code/work/clean-earth-rovers/repo/cer-demo/.claude/worktrees/dev
node scripts/mirror/reportOmitEnv.mjs
```

It prints a path such as `/tmp/report-omit-mirror-env.1a2b3c4d`: a mode-600 file of `export` lines with fresh random secrets for this run, the three directories of §2, production's Gilligan model settings (`glm-5p3-flash`, reasoning low, 16 tool rounds, `local-vector` retrieval, the catalogue prompt, `WATER_TYPE=freshwater`, 20 questions and 5 reports a day), and every Firestore and device-API setting pointed at the emulator and the local cer-api.
`PREDECESSOR_PERIOD_HANDOFF` is `false`, the production setting.
`MIRROR_PROJECT_ID` must start with `demo-`: the server and seed refuse anything else, which is the guard against reaching production.

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
If a port is taken, find out whose it is before going on: another session may be running the Mirror, and you may be able to use it as is; never stop the service on port 8000.

| step | terminal | command | expected |
|---|---|---|---|
| 1 | emulator | `cd "$MIRROR_SERVER" && npm run mirror:emulator` | `All emulators ready!` and `Firestore │ 127.0.0.1:8080` |
| 2 | setup | `cd "$MIRROR_SERVER" && npm run mirror:seed -- --fixtures && date -u` | `[Mirror] Seeded (default) on 127.0.0.1:8080: 9 organizations, 27 users, 22 devices, 52 chats, 13680 readings (30 days).`; write down the time |
| 3 | cer-api | `cd "$MIRROR_SERVER" && PORT=5101 npm run dev:mirror` | `[Mirror] Firestore emulator at 127.0.0.1:8080, project demo-cer-mirror.`; a line about Application Default Credentials is expected, do not run `gcloud auth` |
| 4 | Gilligan | `cd "$GILLIGAN_DIR" && PORT=8010 npm run dev` | within a minute or two: `SENSOR_TOOL is ON`, `REPORT_TOOL is ON`, `CATALOGUE_PROMPT is ON`, `QUERY_QUOTA is ON — requests=20, tokens=1000000, reports=5 per 1d per caller`, `Listening on http://localhost:8010` |
| 5 | dashboard | `cd "$DASHBOARD_DIR" && npm run dev -- -p 3100 -H 127.0.0.1` | `Ready`; a Browserslist warning is harmless |

The emulator keeps nothing on disk: every start needs a seed, and a seed wipes every chat and allowance count.
Readings end at the seed time and do not grow, so "last 7 days" means the 7 days before the seed, and reports find no readings once the seed is more than 7 days old.

## 6. Smoke checks (free)

From the setup terminal:

```bash
curl --noproxy '*' -s -o /dev/null -w '%{http_code}\n' http://localhost:5101/api/v1/devices     # 401
curl --noproxy '*' -s http://localhost:8010/health; echo                                         # "status":"ok", "fireworksConfigured":true
curl --noproxy '*' -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/api/v1/devices     # 401, proxied to the local cer-api
ss -tnp | grep -E 'node|java' | awk '{print $5}' | sort -u | grep -vE '^(127\.0\.0\.1|\[::1\]|\[::ffff:127)'   # nothing
```

The last line must print nothing outside a paid step; during one, only the model provider appears.

In the browser, open `http://localhost:3100` (always `localhost`, not `127.0.0.1`, so the login is not split) with Developer Tools on Network, "Preserve log" on, and `*run.app*` blocked:

| check | expected |
|---|---|
| log in as Superadmin | the home page lists the Mirror's current pods, including Demo Public Dock Buoy, Lakeside Mobile Buoy and River Watch Float |
| log in as Harbor admin | Harbor Pier Buoy only |
| wrong password | 401 and a readable "Login failed" |
| `/gilligan` as Harbor customer | the chat page and `20 questions left, resets <date> <time>` |
| Network tab | every request goes to `localhost:3100`; nothing to `run.app` |

Stop if any of these differ.

## 7. Logins

Every account's password is `mirror-dev-password`; all addresses end `@mirror.example.invalid`.

| persona | account | sees |
|---|---|---|
| Superadmin | `user-super-1` (also `-2`, `-3`, `-5`) | every current pod |
| Harbor admin | `user-harbor-admin-1` | Harbor Pier Buoy |
| Harbor customer | `user-harbor-cust-1` | Harbor Pier Buoy |
| Invited Harbor customer | `user-harbor-cust-3` | cannot log in (no password) |
| Lakeside customer | `user-lake-cust-1` | Lakeside Buoy 2026, Lakeside Mobile Buoy |
| Seaview customer | `user-seaview-cust-1` | Seaview Marina, Seaview Outfall Buoy |
| River Watch customer | `user-river-cust-1` | River Watch Float |
| Orphan | `user-orphan-1` | should be nothing; on this seed, every pod (a known server finding) |

For checks that call cer-api directly, paste the "Browser API helper" from [`LAUNCH_ISSUES_WALKTHROUGH.html`](../records/LAUNCH_ISSUES_WALKTHROUGH.html) into the Console with `BASE = 'http://localhost:5101'`.

## 8. Stop and reset

- Stop with Ctrl-C in each terminal, in this order: dashboard, Gilligan, cer-api, emulator; then rerun the `ss -ltnp` line from §5 and expect only the header.
- To change a Gilligan or cer-api setting, restart only that service with the same settings file; leave the emulator running.
- To start the day's allowances over, rerun the seed (§5 step 2); it also erases every chat and any evidence held in the emulator.
  The running cer-api, Gilligan and dashboard need no restart after a reseed.
- When finished, delete the settings file: `rm -- /tmp/report-omit-mirror-env.REPLACE`.
- The three directories may stay for the next run; `mirror-report-omit` is an export with no Git history and can be deleted with `rm -r` once it is no longer wanted.

## 9. On another machine

This runbook uses this machine's paths and checkouts, and the server tree's base `mirror/release-rc1` is a local branch that has not been pushed.
Before someone else can follow it elsewhere:

- The server base and its patches must be shared first; the dashboard's `fc13d16` and cer-demo's `dev` are on GitHub.
- The CER repositories must be cloned without a checkout and cleaned first, as [`SECURITY_INCIDENT_2026-09-19.md`](../records/SECURITY_INCIDENT_2026-09-19.md) describes; a normal clone checks out malware.
- They need their own model provider key in the Gilligan `.env`, the document library (`data/corpus/`, `data/embeddings/`), Java 21 and the Firebase CLI; see [`LOCAL_STACK.md`](LOCAL_STACK.md).

## Troubleshooting

| symptom | cause and fix |
|---|---|
| cer-api exits with `FIRESTORE_EMULATOR_HOST must point at a local emulator` or `MIRROR_PROJECT_ID must name a demo- project` | the settings file was not sourced in that terminal; source it and check `guards ok` |
| Gilligan answers 401 or "service key" errors to cer-api | the two services were started from different settings files; restart both from the same one |
| a report says "no readings in that window" | more than 7 days have passed since the seed; reseed |
| a download button reads `Report limit reached - try again later` | the persona used its 5 reports; use another persona or reseed |
| the dashboard shows real CER pods or the login fails for a Mirror account | it is proxying to the live cer-api: stop it, check `API_PROXY_TARGET` is `http://localhost:5101` in that terminal, and restart |
| the seed crashes with "Request time should not be before the last token refill time" | WSL clock step; run the seed again |
