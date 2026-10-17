# Task C verification - 2026-09-24

Task C adds answer-local tool citations, preserves invocation evidence through the relay and saved history, and records citation corrections and invalid markers before display cleanup.
The durable contract is in [SPECS.md, section 10.4a](../SPECS.md#104a-citation-audit-and-display-contract).

## Reproduction and browser verification

The initial controlled HTTP regression returned 200 but omitted `tool_calls` from the relay response.
The initial controlled chat HTTP regression produced invocations without handles.
Both regressions now pass with JSON, tool-enabled SSE, document-only SSE, stored evidence and the real history controller.

`scripts/taskCStack.ts` runs the actual chat controller and orchestrator with deterministic model/tool implementations, plus the actual relay controller, relay service and development memory store.
It blocks nonlocal fetches and supplies controlled device, quota and model responses.
`scripts/taskCBrowser.mjs` uses headless Chromium against the actual dashboard and demo modules, blocking external browser requests.

The browser verified:

- Mixed document and tool markers, a document source disclosure, and answer-local tool navigation.
- Removal of empty, unknown, out-of-range and malformed markers from display.
- A collapsed evidence disclosure with incomplete-search, stale-window, provisional-turbidity, error and exhausted-round qualifications still visible.
- Empty readings remaining null, actual zero measurements remaining zero, duplicate-call evidence and report offers.
- Starting another conversation and reopening saved history with the same evidence and working tool links.
- Intentional styling for explicit refusals and legacy saved messages without invented provenance.

Unique verbatim quote corrections, ambiguous quotes, Unicode report-period hyphens and invalid-citation assessment are covered by deterministic tests.
The browser also receives those cases from the controlled stack.
The browser run uses in-memory storage, not live Firestore.
It validates transport, serialization and reopening behavior without asserting production storage capacity or live model behavior.

## Checks

Every Jest suite ran individually with `--runInBand`.
The full suite was not run.

| Checkout | Check | Result |
| --- | --- | --- |
| cer-demo | `citationAudit`, `frontendCitations`, `chatOrchestrator`, `gateCheck`, `prompt`, `bakeoffRunner`, `judge`, `auditLog`, `evidenceTransport`, `gradePacket` unit suites | 267 tests passed |
| cer-demo | `provenance`, `sensorChat`, `chat` integration suites | 44 tests passed |
| cer-demo | `npm run typecheck`, `npm run lint` | Passed |
| server | `CerRagService`, `provenance` suites | 11 tests passed |
| server | `tsc --noEmit` | Passed |
| server | `eslint src --ext .ts --no-fix` | Existing configuration cannot parse TypeScript: 119 parsing errors |
| dashboard | `node test/provenance.test.mjs` | 3 tests passed |
| dashboard | `npm run lint` | Passed with existing hook/image warnings |
| dashboard and demo | Controlled Chromium check | Passed |
| all three worktrees | `git diff --check` | Passed |

The server's plain JavaScript lint check also completed with four existing console warnings in `src/api/api_methods/db_config.js`.
The dashboard has existing hook dependency warnings in pages such as `src/app/datahub-chart/page.js` and image/accessibility warnings in `src/app/team/page.js`.
These unrelated findings were not changed.

## Repeating the local check

Prepare worktree dependencies with the run-local skill.
No environment file or real credential is needed.
Use an unused instance of each named port; do not stop unrelated servers.

From the cer-demo worktree:

```bash
TASK_C_SERVER_WORKTREE=/path/to/server/worktree \
  node_modules/.bin/ts-node --transpile-only scripts/taskCStack.ts
```

From the dashboard worktree:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:5001 \
API_PROXY_TARGET=http://127.0.0.1:5001 \
NEXT_TELEMETRY_DISABLED=1 npm run dev -- -p 3000 -H 127.0.0.1
```

From the cer-demo worktree:

```bash
TASK_C_CHROME=/path/to/chromium node scripts/taskCBrowser.mjs
```

The stack listens on 8010 and 5001.
The browser harness uses debugging port 9223 and a dedicated temporary profile, then closes its Chromium process.
Stop the two local stack processes after the check.

## Scope boundaries

All implementation edits are confined to the three approved `task/c-provenance` worktrees.
No Git mutations, paid calls, production reads or writes, deployments or pushes were performed.
Existing `eval/transcripts/` and generated grading artifacts were preserved.
Task C changes only the tools-only prompt sections; the evaluated general prompt and separate R4 worktree were not modified.
Turbidity interpretation remains unchanged pending Task A.
