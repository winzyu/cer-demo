# Documentation cleanup review, 2026-10-15

Base: `dev` at `650451c`.
Branch: `docs/cleanup`.
Scope: the five retired migration documents below, a navigation page, and references that pointed to the retired files.
No captured test result data, sent stakeholder messages, or archived documents were changed or removed.

## Why each file was retired

| Removed file | Reason | Maintained location or recovery |
| --- | --- | --- |
| `RELEASE_GOAL_AND_PLAN.md` | This 2026-09-18 one-page goal was copied into the supervisor's A1 question. Its own introduction points to the target architecture for the roadmap, and its September 30 target has passed. | The release goal remains in `SUPERVISOR_QUESTIONS_SEND.md` §A1; product rules remain in `SPECS.md`. |
| `UPSTREAM_PR_BODIES.md` | These are draft PR descriptions for the September 24 feature branches. They describe an earlier integration state and should not be reused for the next upstream landing. | The upstream landing state is in `GILLIGAN_LANDING_2026-09-29.md`; the historical drafts remain in Git. |
| `GILLIGAN_E2E_TEST_TICKET.md` | Its opening says `GILLIGAN_MANUAL_TEST_GUIDE.md` replaced it as the checklist of record. Leaving both in the working tree creates competing test instructions. | The manual guide is the maintained checklist. The September 25 result now names its historical ticket's `git show` command. |
| `TASK_C_HANDOFF.md` | This 2026-09-24 handoff describes uncommitted worktrees and next steps from that day. Those operational instructions expired when the work landed. | The durable behavior contract is in `SPECS.md` §10.4a, and `TASK_C_VERIFICATION.md` retains the observed checks. |
| `POST_LAUNCH_MERGE_TESTS.md` | This was the plan for a completed October 11 merge; its landing conditions are no longer actionable. | `POST_LAUNCH_MERGE_RESULTS_2026-10-11.md` retains what passed and points to the plan in Git. |

All five originals can be retrieved with `git show 650451c:docs/migration/<filename>`.
They were deleted from the working tree, not rewritten in place.

## Reference changes

- `docs/README.md` is the new entry point for maintained references and explains that dated migration task lists are historical.
- `GILLIGAN_RELEASE_PLAN.md` now points to the sent supervisor question for the goal and to the manual guide for mirror personas; its old PR-draft pointer was removed.
- `GILLIGAN_E2E_RESULTS_2026-09-25.md` and `POST_LAUNCH_MERGE_RESULTS_2026-10-11.md` retain explicit `git show` commands for their source plans.
- `LIVE_TEST_LIST.md` and two `scripts/e2e/` comments point to the manual guide.
- `SECURITY_INCIDENT_2026-09-19.md` says the retired PR draft remains in Git history.

## Review points

- The PR drafts may still be useful as source text for a new PR. Restore them from Git if the coordinator plans to revise rather than write new descriptions.
- The E2E ticket has scenario details beyond the current guide. Its September 25 run record is retained, but a coordinator should compare those details before treating the manual guide as complete for a future run.
- This pass leaves dated evidence and decision records visible. They contain unique observations and are linked from current work, so removing them needs a separate content review.

## Verification

- `git diff --cached --check` passed before this note was added; rerun after staging it.
- Relative Markdown links in the changed documents and the new navigation page resolved locally.
- `node --check` passed for both edited E2E scripts.
- No product behavior or tests were changed; no Jest suite was run.
