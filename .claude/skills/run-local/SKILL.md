---
name: run-local
description: Start the cer-demo server locally, prove a change end-to-end with a real request, and stop it; also worktree setup. Use when running, smoke-testing or screenshotting the app, reproducing a bug before fixing it, or preparing a git worktree to run in.
---

# Running cer-demo locally

The run recipes live in `README.md` §4 (flag combinations, per-request arm switching, two servers
side by side, stopping). Read the row you need there; this skill adds only what an agent needs on
top.

## Reproduce first

For a bug fix, reproduce it the way a user hits it before editing — through the running server, or
a supertest integration test in `test/integration/` — not only a unit test. After the fix, show the
same request succeeding.

## Start, check, stop

```bash
PORT=8010 npm run dev          # run in the background; pick a port no other session is using
curl -s localhost:8010/health  # wait for 200 before sending requests
curl -s -X POST localhost:8010/api/v1/chat -H 'Content-Type: application/json' \
  -d '{"query":"What does ORP measure?"}'
pkill -f "[t]s-node-dev"       # never pkill -f "src/index.ts" — it matches your own shell
```

- `/health` is unversioned; everything else is under `/api/v1`.
- A chat request calls the LLM and costs a little. `DEFAULT_RETRIEVAL=stub` avoids retrieval cost
  when the change is not about retrieval.
- With `DEBUG_RETRIEVAL=true`, check the echoed `mode` — it is the only proof of which arm answered.

## Traps

- **The device API is production. There is no QA mirror.** `SENSOR_TOOL=true`, `REPORT_TOOL=true`,
  `verify:sensor`, `report:render` and `explore:*` all read real pod data. Read-only is fine; say
  so before doing it.
- `SENSOR_TOOL` and `REPORT_TOOL` change the pinned system prompt. Never capture eval runs with
  either on (`README.md` §4b bake-off row).
- Jest never reads `.env` — `test/setupEnv.ts` points `DOTENV_CONFIG_PATH` at a missing file.
  Shell-exported variables still apply.
- The frontend must be served, not opened from disk: `python3 -m http.server 5173` from
  `frontend/`, then `http://localhost:5173?backend=http://localhost:8010`.

## Running inside a git worktree

A fresh worktree has no `node_modules`, `.env` or `data/`. From the worktree root:

```bash
ln -s <repo-root>/node_modules node_modules
cp <repo-root>/.env .env
ln -sfn <repo-root>/data data
```

`.env` holds secrets — it is gitignored; never add it.
