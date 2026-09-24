# Task C handoff - 2026-09-24

Task C implementation and controlled verification are complete, with all changes uncommitted in the three approved worktrees.
No further implementation is queued within the agreed scope.
Next is review and integration when requested, following the git-plan approval workflow for every Git mutation.

## Exact worktrees

| Repository | Worktree | Branch | HEAD |
| --- | --- | --- | --- |
| cer-demo | `/home/winsy/code/clean-earth-rovers/repo/cer-demo/.claude/worktrees/task-c-provenance` | `task/c-provenance` | `50adac0` |
| server | `/home/winsy/code/clean-earth-rovers/repo/clean-earth-rovers-server/.worktrees/task-c-provenance` | `task/c-provenance` | `1f4703d` |
| dashboard | `/home/winsy/code/clean-earth-rovers/repo/user-dashboard/.worktrees/task-c-provenance` | `task/c-provenance` | `620e5b2` |

Write access was verified in all three at the start of implementation.
The earlier read-only-mount blocker is resolved for these paths.
Do not recreate the worktrees or modify the original checkouts or separate evaluation worktree.
All current changed paths in these three worktrees belong to Task C, including this handoff's documentation.
No commits, branch changes, merges, pushes or other Git mutations were performed.

## Delivered behavior

- Every invocation has a stable answer-local `Tn` handle, including deduplicated calls, and the model receives `{ handle, result }` in its tool messages.
- Optional `tool_calls` and `tool_round_cap_reached` survive the relay, saved answers, dashboard state and reopened history with document citations and report offers.
- The trace preserves effective arguments, raw argument text, result, round and deduplication status, including errors and unknown tool names.
- Both frontends render tool markers as controls opening the matching answer's provenance, separately from numeric document citations.
- Shared HTTP/evaluation assessment corrects numeric quote markers only when exactly one excerpt contains the quote verbatim and the currently cited excerpt does not.
- Audit metadata preserves the original answer, corrections and malformed, unknown or out-of-range markers before removing invalid markers from displayed text.
- SSE `done.answer` is authoritative after validation; future captures preserve it and the original-answer audit.
- Both frontend parsers consume doubled quote closers; report-period presence checks normalize Unicode hyphens without rewriting original answers.
- Dashboard evidence is collapsed by default while incomplete searches, stale/empty windows, provisional turbidity, tool errors and exhausted-round qualifications stay visible.
- Empty readings remain null and actual zero readings remain zero; legacy answers gain no invented provenance and explicit refusals have intentional styling.
- Future transcript, deterministic gate, judge and grading-packet inputs include recorded tool evidence; existing captures and generated grading artifacts were preserved.

The contract is in [SPECS.md section 10.4a](../SPECS.md#104a-citation-audit-and-display-contract), with checks in [Task C verification](TASK_C_VERIFICATION.md).
The separate `EVAL_REBUILD.md` note remains in this worktree because the target checkout has unrelated uncommitted edits in that file.
The decision is recorded in [timeline.md](../timeline.md).

## Verification and limits

[Task C verification](TASK_C_VERIFICATION.md) records the reproduction, test matrix and exact controlled-stack commands.
The initial HTTP regressions demonstrated the relay dropping evidence and the orchestrator lacking handles before fixes.
Final results: 311 demo tests across 13 relevant suites, 11 relay tests across two suites, and three dashboard checks passed.
Every Jest suite ran individually with `--runInBand`; the full suite was not run.
Demo and server typechecks passed, demo lint passed, and dashboard lint passed with existing warnings.
Server TypeScript lint remains blocked by its existing parser configuration, producing 119 parsing errors.
Browser checks passed through the actual dashboard, relay/history controller and demo renderer, including reopened and legacy history.

Verification used deterministic model/device responses and the development memory store.
It does not establish live Firestore capacity, live-model citation quality or production deployment behavior.
The scope included report-offer persistence, not downloading a production PDF.
No paid calls, production reads/writes or deployments occurred; spend was zero.

## Runtime left behind

All local stack and dashboard processes started by this task were stopped; the browser harness closes its Chromium process.
The cer-demo worktree still has its ignored `node_modules` link to the original checkout's installed dependencies.
Temporary dependency links in the server and dashboard worktrees were removed after verification.
Use the run-local skill to prepare those dependencies before rerunning checks; do not stage setup links.
No real environment files or credentials are needed for the controlled harness.
Disposable logs are under `/tmp/task-c-*.log` and the browser screenshot is `/tmp/task-c-dashboard.png`; these are not durable handoff dependencies.

## Coordination and next steps

1. Review the three actual diffs, including untracked source, tests and harness files listed below.
2. Keep Task C's changes in `systemPrompt.ts` confined to `TOOL_BLOCK` and `REPORT_TOOL_BLOCK` when integrating.
3. R4 was not contacted because the evaluated general citation rule was left unchanged; coordinate before changing that rule or combining prompt changes with R4.
4. Expect overlap with R4 in `systemPrompt.ts` and prompt-related tests even though Task C did not edit `prompt.test.ts`.
5. Obtain an exact approved git-plan before staging, committing or integrating; no integration or upstream push is authorized by this handoff.
6. Rerun affected suites after conflict resolution; the controlled stack remains available without paid or production access.

Task A owns turbidity interpretation.
Charts, input controls, persistent pod-status display, time-range controls, feedback storage and broader release infrastructure remain deferred.
No other workstream's recorded approvals, budgets or deadlines were changed.

## Changed-path inventory

Generated from read-only Git status at handoff, including untracked files.
The session-status document is also updated.

### cer-demo

- `docs/EVAL_REBUILD.md`
- `docs/SPECS.md`
- `docs/timeline.md`
- `frontend/js/citations.js`
- `frontend/js/main.js`
- `frontend/js/provenance.js`
- `frontend/js/render.js`
- `scripts/gradePacket.ts`
- `src/controllers/ChatController.ts`
- `src/eval/gates/checks.ts`
- `src/eval/gates/runner.ts`
- `src/eval/judge/prompts.ts`
- `src/eval/judge/runner.ts`
- `src/eval/runner.ts`
- `src/eval/transcript.ts`
- `src/eval/transport.ts`
- `src/prompt/systemPrompt.ts`
- `src/services/ChatOrchestrator.ts`
- `src/services/auditLog.ts`
- `src/types/tool.types.ts`
- `test/unit/bakeoffRunner.test.ts`
- `test/unit/chatOrchestrator.test.ts`
- `test/unit/frontendCitations.test.ts`
- `test/unit/gateCheck.test.ts`
- `test/unit/gradePacket.test.ts`
- `docs/migration/TASK_C_HANDOFF.md` (new)
- `docs/migration/TASK_C_VERIFICATION.md` (new)
- `scripts/taskCBrowser.mjs` (new)
- `scripts/taskCStack.ts` (new)
- `src/utils/citations.ts` (new)
- `test/integration/provenance.test.ts` (new)
- `test/unit/citationAudit.test.ts` (new)
- `test/unit/evidenceTransport.test.ts` (new)

### server

- `src/controllers/GilliganController.ts`
- `src/services/CerRagService.ts`
- `src/services/GilliganService.ts`
- `test/unit/services/CerRagService.test.ts`
- `test/unit/services/provenance.test.ts` (new)

### dashboard

- `src/app/components/gilligan-answer.js`
- `src/app/gilligan/page.js`
- `src/app/shared/gilligan-citations.js`
- `src/app/shared/gilligan-provenance.js` (new)
- `test/provenance.test.mjs` (new)
