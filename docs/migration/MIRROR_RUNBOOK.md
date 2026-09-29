# Mirror runbook

How to start the Mirror stack from a stopped machine and test every launch item on it by hand.
The Mirror is the only local stack with Gilligan, so every B item and U5-U10 run here.
Everything uses fabricated data in a local Firestore emulator; nothing reads or writes production.

Written 2026-09-28 against the stack recorded in [`GILLIGAN_E2E_RESULTS_2026-09-27.md`](GILLIGAN_E2E_RESULTS_2026-09-27.md).
It replaces the setup half of [`GILLIGAN_MANUAL_TEST_GUIDE.md`](GILLIGAN_MANUAL_TEST_GUIDE.md), whose settings predate the `demo-` project change.

| document | use it for |
|---|---|
| this runbook | starting, checking and stopping the stack; order, cost and rules of the test session |
| [`LAUNCH_ISSUES_WALKTHROUGH.html`](LAUNCH_ISSUES_WALKTHROUGH.html) | the exact clicks and questions for each item |
| [`LAUNCH_ISSUES_EXPLAINED.html`](LAUNCH_ISSUES_EXPLAINED.html) | what each item means, the account levels, and which fake pod covers which item |
| [`LAUNCH_ISSUES_CHECKLIST.md`](LAUNCH_ISSUES_CHECKLIST.md) | recording results, evidence and spend |
| [`GILLIGAN_MANUAL_TEST_GUIDE.md`](GILLIGAN_MANUAL_TEST_GUIDE.md) | the full check list whose IDs (K6, M13 ...) the items cite |

## 0. Before anything

- **Ask first.** The Mirror ports (3000, 5101, 8010, 8080) are shared with the mirror end-to-end chat.
  Confirm with the person or chat that owns them before starting, stopping or reseeding anything; a reseed destroys their chats and allowance counts.
- **Budget.** Gilligan questions cost about $0.02 each and reports about $0.05-0.07, from a $10 mirror budget of which about $2.56 was spent by 2026-09-27.
  Get the session's budget approved before the first question.
  Logins, page loads, health checks and Console calls are free.
- **Allowance.** Each persona gets 20 questions and 5 reports per UTC day.
  Don't exhaust a persona unless the test calls for it.
- **Five terminals:** setup, emulator, server, Gilligan and dashboard.
  Stop each service with Ctrl-C in its own terminal.

## 1. Safety rules

1. The two CER repositories (`user-dashboard`, `clean-earth-rovers-server`) carry malware on `main` and `develop`.
   Never check those branches out, never run `npm install`, `next dev`, `next build` or `npm test` on them, and never push, force-push or merge in either repository.
2. After any clone, fetch, pull or branch switch in a CER repository, run the malware scan in step 3; it must print nothing.
3. Never open `serviceAccountKey.json` or `~/.config/gcloud/`, and never paste a token, `Authorization` header or login response into notes or chat.
4. Never stop the service on port 8000, and never use a broad `pkill`.
5. Stop and report if anything tries to reach `run.app` or another outside address.

## 2. What the stack is

```text
browser -> dashboard :3000 -> CER server :5101 -> Firestore emulator :8080 (project demo-cer-mirror)
                                   \-> Gilligan :8010 -> model provider (paid)
                                          \-> pod data from the CER server :5101, as the caller
```

| piece | checkout on this machine | commit | pushed? |
|---|---|---|---|
| Emulator and seed | `~/code/clean-earth-rovers/repo/clean-earth-rovers-server/.worktrees/mirror` | `1ef21a7` (`mirror/e2e-p3`) | yes, CER server `origin/mirror/e2e-p3` |
| CER server :5101 | same checkout | `1ef21a7` | yes, same branch |
| Gilligan :8010 | `~/code/clean-earth-rovers/repo/cer-demo/.claude/worktrees/e2e-rc` | `77cd4c9` (`test/e2e-rc`, a merge of `dev` and `feat/service-release`) | yes, `origin/test/e2e-rc` |
| Dashboard :3000 | `~/code/clean-earth-rovers/worktrees/dashboard-e2e` | `9e18555` (detached) | yes, CER dashboard `origin/release/gilligan-2026-09-30` |

The Mirror server has the A3 and A4 fixes but not the A2 or A5 fixes; test those two on the Release stack (:3300/:5301) instead.
If the release coordinator names a newer candidate (for example server `mirror/release-rc1` and cer-demo `release/rc1`), use its checkouts and commits and record them.

Files git does not carry, all present on this machine as of 2026-09-28:

| file | where | what |
|---|---|---|
| `.env` | Gilligan checkout | the model provider key (`FIREWORKS_API_KEY`) and model settings; the settings file below overrides everything else in it |
| `data/corpus/`, `data/embeddings/cache.json` | Gilligan checkout | the document library; never regenerate them for a test |
| `node_modules` | all three checkouts | linked from the main checkouts |
| `.env.mirror.local` | server checkout | loaded by the server scripts; the settings file takes precedence |
| Java 21 | `~/.local/opt/jdk-21.0.12.1+1` | the emulator needs Java 21 or newer |

## 3. Preflight

In the setup terminal:

```bash
export CER_REPOS=/home/winsy/code/clean-earth-rovers/repo
export MIRROR_SERVER="$CER_REPOS/clean-earth-rovers-server/.worktrees/mirror"
export GILLIGAN_DIR="$CER_REPOS/cer-demo/.claude/worktrees/e2e-rc"
export DASHBOARD_DIR=/home/winsy/code/clean-earth-rovers/worktrees/dashboard-e2e

git -C "$MIRROR_SERVER" rev-parse --short HEAD      # 1ef21a7
git -C "$GILLIGAN_DIR" rev-parse --short HEAD       # 77cd4c9
git -C "$DASHBOARD_DIR" rev-parse --short HEAD      # 9e18555
(cd "$MIRROR_SERVER" && grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .)
(cd "$DASHBOARD_DIR" && grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .)
ss -ltnp '( sport = :3000 or sport = :5101 or sport = :8010 or sport = :8080 or sport = :4400 or sport = :4500 or sport = :9150 )'
test -f "$GILLIGAN_DIR/.env" && test -d "$GILLIGAN_DIR/data/corpus" && test -f "$GILLIGAN_DIR/data/embeddings/cache.json" && echo "gilligan files ok"
```

Stop on an unexpected commit, any malware scan output, or a scan error (grep exit 2; exit 1 means no match).
If a port is already in use, find out who owns it before going on: another session may be running the Mirror, and you may be able to use it as is.
If all four services are already up and owned by a session that agrees, skip to step 6.

## 4. Settings file

This writes fresh, never-displayed secrets for this run into a private temporary file and changes no repository file.

```bash
export MIRROR_ENV=$(mktemp /tmp/mirror-env.XXXXXX)
chmod 600 "$MIRROR_ENV"
node - "$MIRROR_ENV" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const s = {
  MIRROR_SERVER: '/home/winsy/code/clean-earth-rovers/repo/clean-earth-rovers-server/.worktrees/mirror',
  GILLIGAN_DIR: '/home/winsy/code/clean-earth-rovers/repo/cer-demo/.claude/worktrees/e2e-rc',
  DASHBOARD_DIR: '/home/winsy/code/clean-earth-rovers/worktrees/dashboard-e2e',
  JAVA_HOME: '/home/winsy/.local/opt/jdk-21.0.12.1+1',
  MIRROR_PROJECT_ID: 'demo-cer-mirror',
  FIRESTORE_PROJECT_ID: 'demo-cer-mirror',
  FIRESTORE_DATABASE_ID: '(default)',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  DB_ENVIRONMENT: 'main',
  NODE_ENV: 'development',
  ACCESS_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'),
  CER_RAG_SERVICE_KEY: crypto.randomBytes(32).toString('hex'),
  DEV_UPSTREAM_BASE_URL: '', DEV_LOCAL_PATHS: '', DEV_CHAT_STORE: '', DEV_UNVERIFIED_AUTH: '',
  NODEMAILER_APP_EMAIL: 'mirror@example.invalid',
  NODEMAILER_APP_PASSWORD: 'mirror-only-placeholder',
  STRIPE_SECRET_KEY: 'sk_test_mirror_only',
  GILLIGAN_BACKEND: 'rag',
  CER_RAG_BASE_URL: 'http://localhost:8010',
  CER_RAG_TIMEOUT_MS: '120000',
  FRONTEND_URL: 'http://localhost:3000', DEV_FRONTEND_URL: 'http://localhost:3000',
  DEV_BASE_URL: 'http://localhost:5101',
  DEVICE_API_BASE_URL: 'http://localhost:5101/api/v1',
  DEVICE_API_TOKEN: '',
  SENSOR_TOOL: 'true', REPORT_TOOL: 'true',
  PREDECESSOR_PERIOD_HANDOFF: 'false',
  CORPUS_SOURCE: 'artifact', DEFAULT_RETRIEVAL: 'hybrid-slice-vector',
  AUDIT_LOG: 'false',
  QUERY_QUOTA: 'true', QUERY_QUOTA_STORE: 'firestore', QUERY_QUOTA_WINDOW: '1d', QUERY_QUOTA_SCOPE: 'caller',
  QUERY_QUOTA_REQUESTS: '20', QUERY_QUOTA_REPORTS: '5', QUERY_QUOTA_TOKENS: '1000000',
  NEXT_PUBLIC_API_BASE_URL: 'http://localhost:5101', API_PROXY_TARGET: 'http://localhost:5101',
  NEXT_TELEMETRY_DISABLED: '1'
};
fs.writeFileSync(process.argv[2], Object.entries(s).map(([k, v]) => `export ${k}='${v}'`).join('\n') + '\n');
NODE
echo "$MIRROR_ENV"
```

In each service terminal, load it with the printed path and check the two guards:

```bash
source /tmp/mirror-env.REPLACE_WITH_PRINTED_SUFFIX
export PATH="$JAVA_HOME/bin:$PATH"
test "$FIRESTORE_EMULATOR_HOST" = 127.0.0.1:8080 && test -z "$DEVICE_API_TOKEN" && echo "guards ok"
```

Stop if `guards ok` doesn't print.
`PREDECESSOR_PERIOD_HANDOFF=false` is the launch setting; only item A4 switches it to `true`, and says when.
`MIRROR_PROJECT_ID` must start with `demo-`: the server and seed refuse anything else, which is the guard against reaching production.

## 5. Start the services

**Emulator** (emulator terminal):

```bash
cd "$MIRROR_SERVER" && npm run mirror:emulator
```

Wait for `All emulators ready` on `127.0.0.1:8080`.
The emulator keeps nothing on disk: every start needs a seed.

**Seed** (setup terminal, after sourcing the settings file):

```bash
cd "$MIRROR_SERVER" && npm run mirror:seed -- --fixtures
```

Expect 9 organizations, 27 users, 19 devices, 52 chats and 11,520 readings.
The seed wipes the emulator first, including chats and allowance counts.
Readings run up to the moment of seeding and do not grow afterwards, so write down the seed time.

**CER server** (server terminal):

```bash
cd "$MIRROR_SERVER" && PORT=5101 npm run dev:mirror
```

Expect `Listening: http://localhost:5101`.
A message about Application Default Credentials is expected; do not run `gcloud auth` to silence it.

**Gilligan** (Gilligan terminal):

```bash
cd "$GILLIGAN_DIR" && PORT=8010 npm run dev
```

A cold start takes about 80 seconds.
The startup log must show the sensor and report tools on and a Firestore quota of 20 requests, 5 reports and 1,000,000 tokens per day in project `demo-cer-mirror`.

**Dashboard** (dashboard terminal):

```bash
cd "$DASHBOARD_DIR" && npm run dev -- -p 3000 -H 127.0.0.1
```

Open `http://localhost:3000`; always use `localhost`, not `127.0.0.1`, so the login isn't split between the two.

## 6. Smoke checks (free)

From the setup terminal:

```bash
curl --noproxy '*' -s -o /dev/null -w '%{http_code}\n' http://localhost:5101/api/v1/devices   # 401
curl --noproxy '*' -s http://localhost:8010/health | head -c 300; echo                       # 200, fireworksConfigured true
ss -tnp | grep -E 'node|java' | awk '{print $5}' | sort -u                                     # local addresses only, plus the model provider during a paid run
```

In the browser, with Developer Tools open on Network, Preserve log on, and `*run.app*` blocked:

| check | expected |
|---|---|
| log in as Superadmin | lands on /home with 7 pods (the five base pods plus Lakeside Mobile Buoy and River Watch Float) |
| log in as Harbor admin | Harbor Pier Buoy only |
| wrong password | 401 and a readable "Login failed" |
| invited Harbor customer 3 | 500 on this server (finding 1, fixed only on Release) |
| `/gilligan` as Harbor customer | the chat page, and a line like "20 questions left, resets ..." |

Stop if any of these differ, or if any request tries to reach `run.app`.

## 7. Logins and tools

Every account uses the password `mirror-dev-password`.

| persona | email | sees |
|---|---|---|
| Superadmin | `user-super-1@mirror.example.invalid` | every current pod |
| Harbor admin | `user-harbor-admin-1@mirror.example.invalid` | Harbor Pier Buoy |
| Harbor customer | `user-harbor-cust-1@mirror.example.invalid` | Harbor Pier Buoy |
| Invited Harbor customer | `user-harbor-cust-3@mirror.example.invalid` | cannot log in (no password) |
| Lakeside customer | `user-lake-cust-1@mirror.example.invalid` | Lakeside Buoy 2026, Lakeside Mobile Buoy |
| River Watch customer | `user-river-cust-1@mirror.example.invalid` | River Watch Float |
| Orphan | `user-orphan-1@mirror.example.invalid` | should be nothing; today every pod |

For checks that call the server directly, paste the walkthrough's "Browser API helper" into the Console with `BASE = 'http://localhost:5101'`.

## 8. Test order

Run each item exactly as the walkthrough describes, click **New chat** before every question, and record each result in the checklist as you go: the status code or count, the exact answer text, the PDF file name, and the question count.

| order | items | cost | notes |
|---|---|---|---|
| 1 | smoke checks (step 6) | $0 | |
| 2 | A3 Mirror half, A6 Gilligan half | about $0.04 | one question each |
| 3 | U5, U6, U9 | about $0.04 | U9 reads the allowance line around U5 |
| 4 | U7, then U8 and U10 | about $0.07 | U8 and U10 reuse the chats from U5-U7 |
| 5 | B3, B1, B2, B5 | about $0.25 | B1, B2 and B5 each include a report |
| 6 | A4 | about $0.10 | needs Gilligan restarted with `PREDECESSOR_PERIOD_HANDOFF=true`, then `false`; restart only Gilligan, never the emulator |
| 7 | B4, B6, B7 | blocked | see "Known gaps" |

Items A1, A2, A5 and U1-U4 belong to the Current and Release stacks, not the Mirror.

## 9. Known gaps

- **B4** needs Gilligan at cer-demo `dev` `5922109` or later; `77cd4c9` predates it, so a run today only records "before".
- **B6** needs cer-demo `task/q9-land`, which doesn't exist yet.
  Its D1 part also needs a pod with pH below 3, and #4 needs sparse 30-minute data; the seed has neither.
  C1 needs a current pod that has stopped reporting; the seed has none built for it.
- **B7** needs the dashboard branch that adds the document caveat (U7), which doesn't exist yet.
- **B1-B3** after-fix checks wait for the Q10 fix round.

## 10. Stop, restart, reseed

- Stop in this order, each with Ctrl-C in its own terminal: dashboard, Gilligan, server, emulator.
- Check the ports are free with the `ss -ltnp` line from step 3.
- To change a Gilligan or server setting, restart only that service with the same settings file; leave the emulator running.
- Stopping the emulator or reseeding erases every chat, allowance count and piece of evidence held in it.
- When finished, delete the settings file: `rm -- "$MIRROR_ENV"`.

## 11. On another machine

This runbook uses this machine's paths and checkouts; all four commits are on GitHub as of 2026-09-28.
Before someone else can follow it elsewhere:

- Fetch the commits from `mirror/e2e-p3` (server), `release/gilligan-2026-09-30` (dashboard) and `test/e2e-rc` (cer-demo), each into its own worktree.
- The CER repositories must be cloned without a checkout and cleaned first, as [`SECURITY_INCIDENT_2026-09-19.md`](SECURITY_INCIDENT_2026-09-19.md) describes; a normal clone checks out malware.
- They need their own model provider key in the Gilligan `.env`, the document library (`data/corpus/`, `data/embeddings/cache.json`), Java 21 and the Firebase CLI; see [`LOCAL_STACK.md`](LOCAL_STACK.md).
- The ports and paths in steps 3-5 change to theirs.
