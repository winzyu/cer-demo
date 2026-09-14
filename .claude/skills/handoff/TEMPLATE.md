# Status

Current state and next steps only.
Rewritten at the end of every session by `/handoff`; history is `git log -p docs/STATUS.md`.
Never cite this file from code or other docs: the reasoning lives in the docs under "Where things live".

Updated YYYY-MM-DD at commit `abc1234`.

## Start here

<!-- One bullet per active workstream. Each session edits only its own bullet. -->
- **<workstream>**: <goal, one line>. First step: <exact file, doc section or command>.

## Last session

<!-- 5 lines at most. Overwritten every handoff. -->
- Landed: `abc1234` <subject>.
- Half done: <what, and where it stopped>.

## Working tree

- Branch `<branch>`, <level with / ahead N of / behind N> `origin/<branch>`.
- Uncommitted, by workstream:
  - <workstream>: `<path>`, `<path>`.

## Open work

### The user's

1. <item>. Blocks: <what cannot proceed until it is done>.

### Claude's

1. <item>. Where: <file or doc section>.

## Unfixed defects

| where | defect | severity |
|---|---|---|
| `<file>:<line>` | <one line> | <high / medium / low> |

## Active traps

- <trap that still bites, and how to avoid it>.

## Where things live

| what | where |
|---|---|
| How the built system works | `docs/SPECS.md` |
| Phases, gates, decision log | `docs/timeline.md` |
| Eval plan and phase state | `docs/EVAL_REBUILD.md` |
| Coding conventions | `docs/migration/CONVENTIONS.md` |
| House rules for Claude | `CLAUDE.md`, `.claude/skills/` |
| Archived docs | `docs/ARCHIVED.md` |
