# Documentation cleanup plan

Written and approved by the user on 2026-09-19.
Goal: a small set of current documents that future sessions can read without contradictions or overlap.
Starting point: 36 Markdown files, about 13,100 lines, with four overlapping task lists.
Target: about half the lines, one task list, and no statement that contradicts the live system.

Archiving follows the existing practice in [`../ARCHIVED.md`](../ARCHIVED.md): remove the file, tag the commit, add a row there, and repoint inbound links.
Git steps go through `git-plan`.

## Verdicts

| Document | Lines | Verdict | Where its live content goes |
|---|---|---|---|
| `STATUS.md` | 104 | Keep; rewrite last | - |
| `SPECS.md` | 1392 | Keep; fix stale facts | - |
| `timeline.md` | 879 | Keep; fix stale facts | - |
| `STAKEHOLDER_QUESTIONS.md` | 209 | Keep; record answers when they arrive | - |
| `ARCHIVED.md` | 227 | Keep; add this cleanup's row | - |
| `migration/CONVENTIONS.md` | 434 | Keep | - |
| `migration/GILLIGAN_PRODUCT_DIRECTION.md` | 199 | Keep | - |
| `migration/GILLIGAN_TARGET_ARCHITECTURE.md` | 205 | Keep; drop its §4 roadmap | Roadmap rows move to `RELEASE_GOAL_AND_PLAN.md` |
| `migration/RELEASE_GOAL_AND_PLAN.md` | 169 | Keep as **the single task list** | Absorbs the four task files below |
| `migration/WSL_SANDBOX.md` | 170 | Keep | Absorbs the relay setup from `LOCAL_RELAY_NOTES.md` |
| `migration/SECURITY_FINDINGS.md` | 301 | Keep; trim the fixed §6 items to one line each | - |
| `migration/POD_AUTHORIZATION.md` | 790 | Keep; trim to the current policy | - |
| `migration/DEVICE_API.md` | 698 | Keep as the one device and data reference; drop the historical §9-§14 | Absorbs `BACKEND_FIELDS.md` and `POD_RELOCATION_EVIDENCE.md`, refreshed from the 2026-09-19 live read |
| `migration/BACKEND_FIELDS.md` | 384 | Archive | `DEVICE_API.md` |
| `migration/POD_RELOCATION_EVIDENCE.md` | 243 | Archive | `DEVICE_API.md` (findings); the commands stay retrievable by tag |
| `migration/WSL_SANDBOX_TASKS.md` | 328 | Archive | Open packets become rows in `RELEASE_GOAL_AND_PLAN.md` |
| `migration/SUPPORTING_DOCS_TASKS.md` | 265 | Archive | Same |
| `migration/DELEGATION_TASKS.md` | 62 | Archive | Same |
| `migration/BASIC_CONVERSATION_PACKET.md` | 63 | Archive | Its 12-case rubric moves to `RELEASE_GOAL_AND_PLAN.md` or `EVAL_REBUILD.md` |
| `migration/LOCAL_RELAY_NOTES.md` | 48 | Archive | `WSL_SANDBOX.md` |
| `migration/INTEGRATION_PLAN.md` | 302 | Archive | Superseded by `GILLIGAN_TARGET_ARCHITECTURE.md` |
| `migration/MIGRATION_SPEC.md` | 400 | Archive | Describes the retired FastAPI service |
| `migration/codex-migration-report.md` | 155 | Archive | Tooling record; nothing links to it |
| `migration/V2_CORPUS_DECISION.md` | 77 | Archive | One decision row in `timeline.md` |
| `CHAT_UX_WORKPLAN.md` | 374 | Archive | August N5 work plan, superseded by the release plan's page tasks |
| `migration/SUPERVISOR_QUESTIONS_FINAL.md`, `_SEND.md` | 485 | Archive after the answers are recorded | `STAKEHOLDER_QUESTIONS.md` |
| `migration/CORPUS_SEEDING.md` | 153 | Keep | - |
| Eval set: `EVAL_REBUILD`, `EVAL_FIXTURE_QUALIFICATION`, `GRADING_GUIDE`, `RETRIEVAL_BAKEOFF`, `RETRIEVAL_EVAL`, `RETRIEVAL_LABELS`, `CORPUS_SOURCING_BRIEF`, `RESPONSIBILITY` | 4287 | Keep; fix only statements that contradict the current system | - |

Estimated result: about 4,300 lines archived or merged away, plus trims to `DEVICE_API`, `POD_AUTHORIZATION` and `SECURITY_FINDINGS`.

## Stale facts to fix

Found on 2026-09-18 and 2026-09-19 by live reads and code checks.

1. Firestore in `conductive-fold-343604` is readable with the user's gcloud credentials (`POD_AUTHORIZATION.md` §3b and `BACKEND_FIELDS.md` §0 say access is denied).
2. `qa-db` exists: a 2024-02-22 snapshot with 3 pods, 22 organizations and no current accounts; `cer-api-qa` and `cer-ui-qa` were last deployed 2024-11-19 (fixed in `CLAUDE.md` and `AGENTS.md` at handoff).
3. Firestore holds 15 device records; `/devices` hides archived and merged ones, so the owners of merged pods are still knowable (`POD_RELOCATION_EVIDENCE.md` §7 says they are not).
4. Marina Park and PCH Public Dock Buoy now belong to City of Newport Beach; only CWA Old points at a missing organization, whose ID matches Cleveland Water Alliance in `qa-db`.
5. The turbidity formula was given to us by the supervisor, and the server code (`src/utils/turbVoltToNTU.ts`, 2026-07-08) documents 3.35 V as a measured clear-water voltage and 300 NTU per volt as provisional (`timeline.md` 2026-09-10 row fixed at handoff; `STAKEHOLDER_QUESTIONS.md` items 18 and 22 still ask where it came from).
6. The catalogue is at `2026-09-19.1` with 38 entries (`STATUS.md` and `STAKEHOLDER_QUESTIONS.md` item 19 fixed at handoff; check `SPECS.md` §4b, `SUPPORTING_DOCS_TASKS.md` C5 and `SUPERVISOR_QUESTIONS_FINAL.md`).
7. Fixed in `STATUS.md` at handoff; still check other documents for: device tokens "scoped to one organization" (the configured token is superadmin and sees all 5 active pods), the sandbox path `~/code/cer-local-stack` on `local/offline-gilligan` (not `~/code/clean-earth-rovers`), and the "87 commits behind" note.
8. Production `cer-api` and `cer-ui` were deployed 2026-08-26 and match `origin/develop` `b221702` and dashboard `main` `c55f65d`.
9. No Gilligan chat has been created since 2025-01-09.

## Order

1. Fix the stale facts in the documents that are staying.
2. Merge live content into its destination, then archive the source files in one tagged commit.
3. Repoint inbound links: `grep -rl <file name>` must return only `ARCHIVED.md`.
4. Rewrite `STATUS.md`.
5. Archive the supervisor-question files once the answers are recorded.
