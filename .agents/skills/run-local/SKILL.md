---
name: run-local
description: Run or smoke-test CER Demo, reproduce bugs end-to-end, or prepare worktree runtime dependencies.
---

# Run CER locally

Read only the relevant run recipe in `README.md` section 4.
Reproduce a bug through the server or a Supertest integration test before editing; verify the same request afterward.

- Start `PORT=8010 npm run dev` in a controlled terminal session; choose an unused port.
- Wait for `curl -s localhost:8010/health` to return 200; API routes otherwise use `/api/v1`.
- Stop the session you started with Ctrl-C or its verified process group; never use broad `pkill` patterns.
- Chat requests incur LLM cost; `DEFAULT_RETRIEVAL=stub` avoids retrieval cost, not generation cost.
- `DEBUG_RETRIEVAL=true` echoes `mode`; inspect it to verify which retrieval arm answered.
- `SENSOR_TOOL`, `REPORT_TOOL`, `verify:sensor`, `report:render`, and `explore:*` touch production pod data.
  Announce live reads and honor configured approval gates; obtain approval for writes or paid evaluations.
- Never capture evaluation runs with `SENSOR_TOOL` or `REPORT_TOOL` enabled: they change the pinned system prompt.
- Jest's `test/setupEnv.ts` blocks `.env` loading; shell-exported variables still apply.
- Serve the frontend from `frontend/` with `python3 -m http.server 5173`, then open `http://localhost:5173?backend=http://localhost:8010`.

Only when preparing a worktree, read [references/worktree.md](references/worktree.md).
