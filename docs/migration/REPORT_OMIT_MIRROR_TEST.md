# Report omit: Mirror test plan, 2026-10-10

Plan for testing the report `omit` option (`SPECS.md` §10.7, `POST_LAUNCH_BACKLOG.md` §6) end to end on the user's Mirror stack.
Nothing here touches production: the Mirror runs on a Firestore emulator with fabricated pods, and the only outside call is the model provider.
The user approved the approach; each paid step still needs the user's budget approval in chat before it runs.

## What is under test

| piece | branch | commit | state |
|---|---|---|---|
| cer-gilligan | cer-demo `task/report-omit` (from `dev` `cde5a1a`) | `97e396e` | pushed to cer-demo `origin` |
| cer-api relay | server `task/gilligan-report-omit` (from `local` `d12ad6d`), worktree `~/code/work/clean-earth-rovers/worktrees/server-report-omit` | `ddcddc5` | local only; never push |
| dashboard | none needed: it posts back the `request` cer-api gave it | live cer-ui `fc13d16` | unchanged |

Already verified offline: the report Jest suites, `npm run typecheck`, `npm run lint`, cer-api's `CerRagService` and `provenance` suites, and three sample PDFs rendered from the Algalita fixture (each group removes only its notes; numbers identical; sections renumber).
Not yet verified: the relay and route together over HTTP, and whether the model picks the right groups from real requests.

## Stack

`MIRROR_RUNBOOK.md` predates the 2026-10-04 move to `~/code/work/`; use it for the commands but with these changes.

| service | port | checkout |
|---|---|---|
| Firestore emulator | 8080 | the server worktree below |
| CER server (cer-api) | 5101 | new worktree `~/code/work/clean-earth-rovers/worktrees/server-mirror-report-omit`, branch `mirror/report-omit` |
| Gilligan (cer-gilligan) | 8010 | `~/code/work/clean-earth-rovers/repo/cer-demo/.claude/worktrees/report-omit` |
| Dashboard | **3100** | new detached worktree `~/code/work/clean-earth-rovers/worktrees/dashboard-mirror-fc13d16` at `fc13d16` |

- Port 3000 is held by Docker container `cer-ui-l8-local`, which proxies to the **live** cer-api; never use it for this test, and leave it running unless the user says to stop it.
- `mirror/report-omit` is `mirror/release-rc1` (`8594338`, release `122136d` plus fixtures) with `task/gilligan-report-omit` merged in; `git merge-tree` reported no conflict on 2026-10-10.
- `server-release-mirror`'s `node_modules` link points at the pre-move path and is broken; link the new worktree's to `~/code/work/clean-earth-rovers/repo/clean-earth-rovers-server/node_modules` and copy `.env.mirror.local` from `server-release-mirror` without printing it.
- The dashboard worktree links `node_modules` to `~/code/work/clean-earth-rovers/repo/user-dashboard/node_modules`, as `dashboard-rc2` does.
- The Gilligan worktree already links `node_modules`; it still needs `.env` copied and `data/corpus/` and `data/embeddings/` linked per `run-local`'s `references/worktree.md`.
- Run the malware scan in both new CER worktrees after creating them; it must print nothing.
- Settings file: runbook §4 with every path moved under `~/code/work/`, `FRONTEND_URL` and `DEV_FRONTEND_URL` on 3100, and the production model settings added: `LLM_MODEL=accounts/fireworks/models/glm-5p3-flash`, `LLM_REASONING_EFFORT=low`, `LLM_MAX_TOKENS=16384`, `MAX_TOOL_ROUNDS=16`, `QUERY_REWRITE_FIRST_TURN=true`.
  The Gilligan `.env` says `gpt-oss-120b`, which is not what production runs.
- Start the dashboard with `npm run dev -- -p 3100 -H 127.0.0.1` and open `http://localhost:3100`.

## Fixture caveat

The seed sets Harbor Pier Buoy, Lakeside Buoy 2026 and Seaview Marina to `missing: ["turbidity"]`, so their reports have no turbidity row.
Other pods derive turbidity from a seeded `turbVolt` around 0.6 V, which should band as Turbid, with occasional failure values.
Step F2 confirms which pod carries a turbidity row before any paid step; if none does, `turbidity_notes` and `sensor_fault_notes` can only be checked offline, and the plan says so in the results.

## Steps

Every report counts against a persona's 5 a day and every question against its 20; spread the work across Superadmin and the River Watch and Lakeside customers.

### Free (no model calls)

- **F1.** Runbook §3 preflight and §6 smoke checks, with the port and path changes above.
- **F2.** Log in through cer-api (`POST /api/v1/users/login`, or the runbook's Browser API helper) and keep the token in a shell variable, never printed.
  Post `{ time_range: "last 7 days", device: <pod> }` to cer-api's `POST /api/v1/gilligan/report` for a pod with turbidity, save the PDF, and check its text with `pdftotext -layout`.
- **F3.** Same request with `omit: ["turbidity_notes"]`, then with all four groups.
  Pass: the Omitted row names exactly the requested groups; `diff` against F2 shows only the removed notes and the renumbered section; every number matches.
- **F4.** `omit: "turbidity_notes"` (not a list) and `omit: ["Bad!"]`: cer-api answers 400 without calling Gilligan.
  `omit: ["recommendations"]`: cer-api relays it and Gilligan answers 400 naming the allowed groups; record what status and text cer-api passes back.

### Paid (ask for budget first: about 8 questions plus up to 6 reports, roughly $0.30-0.50 at the runbook's rates)

Ask through cer-api's `GET /api/v1/gilligan/question` or the dashboard, with **New chat** before each first question.
For each, record the `generate_report` arguments (tool calls in the response or the audit), the reply text, and the downloaded PDF's Omitted row.

| # | message | expected `omit` |
|---|---|---|
| P1 | "Give me a water quality report for <pod> for the last 7 days." | none |
| P2 | (follow-up) "Can you exclude the turbidity disclaimers so I can share a clean PDF copy online?" | `turbidity_notes` |
| P3 | (follow-up) "Remove all the warnings and the data quality section." | all four |
| P4 | (follow-up) "Take the pH numbers out of the report." | none; says numbers cannot be removed |
| P5 | (new chat) "Report for <pod>, last 7 days, without the notes about where the thresholds come from." | `threshold_notes` |
| P6 | (new chat) "Make me a shorter report for <pod>." | none (ambiguous; record what it does) |
| P7 | (new chat) "How has the water been at <pod> this week?" | none if it calls `generate_report` |

Pass: P2, P3 and P5 pick exactly the expected groups, the reply names them, and the PDF's Omitted row matches `omitted_from_pdf`; P1, P4, P6 and P7 pass no `omit`; nothing reaches `run.app`.
A wrong pick is a prompt or tool-description fix in cer-demo, followed by rerunning only the failed rows after a new budget approval.

### Samples for Michael

Keep the F2 and F3 PDFs (Mirror data is fabricated, so they are safe to share) as the before-and-after pair for Michael to approve.

## After the test

- Record results, spend and the PDF file names in `docs/migration/REPORT_OMIT_MIRROR_RESULTS_<date>.md` on `task/report-omit`.
- Stop in runbook §10 order, check the ports are free, and delete the settings file.
- Leave both new worktrees and `mirror/report-omit` local; pushing either CER branch needs the user's consent in chat.
- Production follows only after Michael approves the samples: the coordinator lands `task/report-omit` on `dev`, the server change is merged into the next release branch, and the user runs the builds and deploys.

## Related

- Design discussion and caveat inventory: `docs/migration/REPORT_EDITING_OPTIONS.html` (untracked in the main checkout).
- Michael's over-flagging change (backlog §1) is out of scope for this chat by the user's decision; it will change which notes a report prints, not the `omit` mechanism.
