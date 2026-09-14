---
name: handoff
description: End-of-session handoff for cer-demo. Updates the durable docs, rewrites docs/STATUS.md in place, verifies links and numbers, and hands over a docs-only git plan.
disable-model-invocation: true
---

# Handoff

Run only when the user invokes `/handoff`.
An optional argument names this session's workstream.

`docs/STATUS.md` holds what is true now and what comes next, nothing else.
It is rewritten in place; its history is `git log -p docs/STATUS.md`.
Anything that must outlive the next session goes in a durable doc first.

If `docs/STATUS.md` does not exist, stop: the STATUS.md migration has not run yet. Tell the user.

## 1. Gather

Keep every command's output bounded.

- Commits since the last handoff: `git log --format='%h %s' "$(git log -1 --format=%H -- docs/STATUS.md)"..HEAD`
- `git status -sb | head -1` and `git status --short`.
- From this conversation: checks run and their results, money spent and on what, artifacts published (URLs), decisions made, defects found, questions still open, lessons about how Claude should work here.
- The workstream name: the argument, else the matching bullet under "Start here" in `STATUS.md`, else ask.
- Ownership of each uncommitted path: this workstream, another workstream, or unknown. Ask about unknown paths; never guess.

## 2. Update the durable docs first

| What changed | Where it goes |
|---|---|
| How the built system behaves, and why | `docs/SPECS.md`, or the design doc for that area |
| A decision, or a gate opening or closing | a dated row in the `docs/timeline.md` decision log, and "Open gates summary" if a gate moved |
| Eval phase state | `docs/EVAL_REBUILD.md` phase table |
| Commands, env vars, setup | `README.md` |
| A lesson about how Claude should work here | propose the CLAUDE.md or skill edit; apply it only if the user agrees |

- **Staleness sweep.** For every fact that changed (a count, a name, a removed file or flag), search for the old value and fix each hit, or list it for the user:
  `grep -rn -- "<old value>" docs eval README.md --include=*.md | grep -v ARCHIVED.md`
- Code comments and docs cite durable docs only. Never cite `STATUS.md`.
- Do not edit files another workstream has uncommitted changes in. List what they need instead.

## 3. Rewrite `docs/STATUS.md`

Follow `TEMPLATE.md` in this skill's directory.

- Re-read `STATUS.md` immediately before editing. Another session may have changed it.
- Rewrite this workstream's bullets. Leave other workstreams' bullets alone.
- Regenerate "Working tree" from `git status`, not from memory.
- Delete a finished item only once its outcome is recorded in a durable doc.
- Overwrite "Last session" (5 lines at most).
- One sentence per line. No em dashes. Link to durable docs instead of restating them.
- 120 lines at most. If it runs over, the excess is durable content that belongs in step 2.

## 4. Verify

- Links in every doc edited this handoff resolve:
  ```bash
  for f in <edited docs>; do d=$(dirname "$f"); grep -oE '\]\([^)#: ]+' "$f" | cut -c3- | while read -r p; do [ -e "$d/$p" ] || echo "$f: broken $p"; done; done
  ```
- `wc -l docs/STATUS.md` is 120 or less.
- `grep -rn "STATUS.md" src test` prints nothing.
- `grep -n "—" docs/STATUS.md` prints nothing.
- Every number in `STATUS.md` is re-derived from its source now (for example `ls eval/fixtures-wave1/*.json | wc -l`), not copied from the old file.
- Every uncommitted path in "Working tree" appears in `git status --short`, and vice versa.

## 5. Hand over

1. A docs-only git plan, via the `git-plan` skill. Its Verification line lists the step 4 checks and their results.
2. A final message, short:
   - the workstreams touched and what landed, in 3 lines at most;
   - anything the user must decide;
   - the starter prompt for the next session: `Read docs/STATUS.md, then continue <workstream>.`
