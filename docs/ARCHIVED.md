# Archived documents

These files were removed from the working tree on 2026-08-30. They are **not lost** — every
one is preserved in git history under the tag `docs-archive-2026-08-30`.

Retrieve one by path:

```bash
git show docs-archive-2026-08-30:docs/HANDOFF.md
git show docs-archive-2026-08-30:docs/migration/CONVENTIONS.server.md > /tmp/conventions.server.md
```

They were removed rather than moved to `docs/archive/` so that a search of this repository does
not surface stale statements as though they described the current system. Every one of them was
accurate when written and is wrong now in at least one material way.

| file | lines | what it was | why it went |
|---|---:|---|---|
| `docs/HANDOFF.md` | 362 | Session record, 2026-08-13 | Superseded twice. Its state, branch table and "next task" all describe a tree that no longer exists. Current state is `HANDOFF_2026-08-27.md`. |
| `docs/HANDOFF_2026-08-26.md` | 333 | Session record, 2026-08-26 | Superseded by `HANDOFF_2026-08-27.md`. |
| `docs/DOC_CLEANUP_2026-08-24.md` | 115 | Record of a previous doc cleanup | A record of housekeeping, referenced by nothing. |
| `docs/notes/generation-2026-08-26.md` | 251 | Agent findings on generation quality | Its §5 describes a check as "not implemented" that was implemented the next day; its §0 describes a worktree that has since been corrected. The durable findings belong in the evaluation doc. |
| `docs/migration/CONVENTIONS.dashboard.md` | 391 | Conventions of `../user-dashboard` | Describes a reference repo that `CLAUDE.md` marks read-only. Not conventions this repo follows. |
| `docs/migration/CONVENTIONS.server.md` | 638 | Conventions of `../clean-earth-rovers-server` | Same. `docs/migration/CONVENTIONS.md` is the file that governs code here. |

**2,090 lines.**

## What was considered and kept

`docs/migration/MIGRATION_SPEC.md` was an archive candidate — the FastAPI to Node port it
describes is finished. It stays because **21 source files cite it by section** as the reason
their behaviour is what it is (`systemPrompt.ts`, `ChatOrchestrator.ts`, `chunk.ts`,
`querySensorData.ts`, and others). Archiving it would leave those comments pointing at nothing.

## Rules

- **Do not edit an archived file.** If one was wrong, that is part of the record.
- **Do not restore one to the tree** to consult it. `git show` prints it to stdout.
- Anything archived later gets its own tag and a row in this table.
