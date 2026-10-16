# Documentation map

Use this page to find the maintained reference for a task.
The dated documents in `migration/` record decisions, tests, and releases at a point in time; do not treat their old task lists as current instructions.

| Need | Start here |
| --- | --- |
| Product behavior and implementation rules | [`SPECS.md`](SPECS.md) |
| Open decisions for CER stakeholders | [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md) |
| Decision history | [`timeline.md`](timeline.md) |
| Evaluation method and results | [`EVAL_REBUILD.md`](EVAL_REBUILD.md) and [`GRADING_GUIDE.md`](GRADING_GUIDE.md) |
| Remaining launch work | [`migration/POST_LAUNCH_BACKLOG.md`](migration/POST_LAUNCH_BACKLOG.md) |
| Deployment procedure and release record | [`migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md`](migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md) and [`migration/GILLIGAN_LANDING_2026-09-29.md`](migration/GILLIGAN_LANDING_2026-09-29.md) |
| Manual and mirror testing | [`migration/GILLIGAN_MANUAL_TEST_GUIDE.md`](migration/GILLIGAN_MANUAL_TEST_GUIDE.md) and [`migration/MIRROR_RUNBOOK.md`](migration/MIRROR_RUNBOOK.md) |
| Security findings and local setup | [`migration/SECURITY_FINDINGS.md`](migration/SECURITY_FINDINGS.md) and [`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md) |

Completed handoffs, draft pull request text, and superseded test plans are available in Git history.
For example, `git show 650451c:docs/migration/TASK_C_HANDOFF.md` retrieves the retired Task C handoff without restoring it.
The file-by-file reasons for this cleanup are in [`migration/DOCS_CLEANUP_REVIEW_2026-10-15.md`](migration/DOCS_CLEANUP_REVIEW_2026-10-15.md).
