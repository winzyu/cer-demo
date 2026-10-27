# Docs overhaul - handoff

Current as of 2026-10-21 at `docs/cleanup`, the commit that adds this version (`git log -1 docs/cleanup`); `dev` holds everything before it (`a6352c6`).
A fresh session reads this file, then follows "Next step".

## What this is

The docs cleanup chat for cer-demo reorganized `docs/` into folders by role (`reference/`, `runbooks/`, `plans/`, `people/`, `records/`, `captures/`); `docs/migration/` is gone, and every moved file got a content decision (D7).
Steps 1-7 are done and landed; what remains is the landing sweep for each open branch as it lands, and merging `dev` into the active branches, which a separate chat does from its own handoff.
Work happens only in the worktree `.claude/worktrees/docs-cleanup` on branch `docs/cleanup`; the coordinator chat lands each pushed commit on `dev` by squash after its own checks (the user does not review them, 2026-10-21).

## Standing decisions

- D1-D7 are in [`DOCS_OVERHAUL_PROPOSAL.md`](DOCS_OVERHAUL_PROPOSAL.md) section 9; still binding: D3 no renames; D4 any `src/catalogue/catalogue.json` path change regenerates `docs/catalogue/review.html` with `npm run catalogue:review` and runs `test/unit/catalogue.test.ts` and `test/unit/catalogueReviewPage.test.ts` singly with `--runInBand`; D6 eval docs stay at the `docs/` root; D7 every touched file gets keep, update, merge or archive.
- Archiving: an annotated tag `docs-archive-<date>[b,c...]` at the last commit containing the file, `git rm`, then a row and a section in `docs/ARCHIVED.md` in the existing style (latest tag: `git tag -l 'docs-archive-*'`, `docs-archive-2026-10-21c`); push the tag with the branch.
- Records keep their content and may gain only a pointer line or a link fix; living docs get updated, and every path an update writes must exist.
- This chat may edit STATUS, `timeline.md`, SPECS, `STAKEHOLDER_QUESTIONS.md`, `README.md`, `CLAUDE.md`, `AGENTS.md` and the agent memory (user, 2026-10-21: "you have my explicit permission"); list each such edit for the coordinator.
- Git history is not rewritten (user, 2026-10-20): the coordinator squash-lands; after each landing, merge `origin/dev` into `docs/cleanup` before the next commit, or the next squash conflicts (coordinator, 2026-10-21).
- Irreversible Git (worktree removal, `branch -D`, remote deletes) only after the user's yes to that exact command; this session's auto-mode check also refuses `git worktree remove` and stopping another stack's processes without it.
- The coordinator asks that moves of these docs be announced, because the reflection course reads them: EVAL_REBUILD, SPECS, timeline, GRADING_GUIDE, RETRIEVAL_*, ARCHIVED.md, `records/SECURITY_INCIDENT_2026-09-19.md` and the data-skepticism records.
- One sentence per line in Markdown, plain hyphens, no attribution lines, stage explicit paths only, one commit per step, push `docs/cleanup` after each.

## State

| Item | State |
|---|---|
| Batches 1-8, content pass C1-C4, Q10, test-doc merges M1-M3, `release/` leftovers | done and landed (last `3efe302`) |
| Step 5, superseded records | done, nothing archived: every record in `records/` still holds evidence a later record or `timeline.md` row cites, or reference content (for example, the 09-27 E2E run reran only groups A, C, F and G, so the 09-25 results for B, D, E, H and I stand) |
| Step 6, local stack re-run | done 2026-10-21, landed `2bf94a3`; `LOCAL_STACK.md` corrected; the Mirror runbook and the manual guide's three emulator scripts are verified at the Mirror's next real use, which the user does not plan (2026-10-21) |
| Corpus aligned to the live rc2 release (457 chunks) | done and landed `981c76e` (pin) and `79c0f5a` (the `local-vector` check against `corpus.json`); `timeline.md` 2026-10-21 row; old 446-chunk pair kept in the main checkout's `data/pre-rc2-446/` |
| Step 7, git tidy | done and landed `be2199d`; remaining worktrees and branches are in STATUS's worktree line |
| Merging `dev` into `task/tide-tool`, `docs/firestore-testing-plan`, `task/swell-rule`, `reflection`, `task/flagging-share-window` (user approved; `fix/window-note` skipped) | done 2026-10-21 per [`BRANCH_PROPAGATION_HANDOFF.md`](BRANCH_PROPAGATION_HANDOFF.md), at `dev` `feec091`: merges `ef044ee`, `ed3c06a`, `05ae58e`, `fad217a`, `dd2d650`, all pushed; each branch's `docs/migration/` files moved to `plans/` or `captures/` and relinked; SPECS §10.7-§19 intact on the flagging branch; the `swell-rule` worktree is removed again |
| Landing sweeps for `task/flagging-share-window`, `reflection`, `docs/firestore-testing-plan` | after each lands on `dev`, move or relink whatever it still brings under old paths; none landed (`git log --first-parent --oneline origin/dev -5`) |

## Waiting on the user

- **The rest of the Mirror**: "Its dashboard (3100), server (5101) and emulator (8080) are still running; say if you want those stopped too." Options: (a) stop all three, losing the emulator's seeded fabricated data, (b) leave them. No recommendation was given; the user does not plan Mirror tests (2026-10-21).
- **`reflection`**: waits on "the user's OK to merge" (coordinator, 2026-10-21).
- **`docs/firestore-testing-plan`**: waits on "the user's keep-or-archive call" (coordinator, 2026-10-21); the proposal's rule is `plans/` if still open, else `records/`.

## Next step

1. `git fetch origin`; if `origin/dev` moved, merge it into `docs/cleanup` (no rebase) before any commit.
2. If the coordinator reports a branch landed on `dev`, run its landing sweep: `git diff --name-status <before>..origin/dev -- docs` for what it added, move anything under an old path to its folder (proposal section 4), relink with `git grep -n <name>`, then the checks in item 4.
3. If the user answers a question under "Waiting on the user", act on that answer only; stopping the Mirror means stopping only its own process groups (`ss -ltnp` for 3100, 5101, 8080; check each process's working directory first).
4. Checks before every commit: the link resolver over every tracked `docs/` `.md` and `.html` outside `captures/` (0 unresolved), `git grep` for each old path, `git diff --check`, `node --check` and `bash -n` on edited scripts, and `npm run typecheck` and `npm run lint` when `src/`, `scripts/` or `test/` change.

Resume with: `Read docs/plans/DOCS_OVERHAUL_HANDOFF.md on branch docs/cleanup (worktree .claude/worktrees/docs-cleanup), then continue the docs overhaul.`

## Facts, with their sources

- The flagging branch deletes SPECS §10.7-§19, which looks unintended; the propagation handoff checks it after its merge (`git diff -U0 origin/dev...origin/task/flagging-share-window -- docs/SPECS.md | grep '^@@'`).
- `release/cer-gilligan.env.yaml` is on `dev` since `0921140`; whether it matches the live revision `00004-r5q` is unchecked (`docs/plans/POST_LAUNCH_BACKLOG.md` §4 item 9).
- The main checkout's corpus and cache match the pin: `sha256sum -c release/artifacts.sha256` from the main checkout.
- This worktree links the main checkout's `data/corpus`, `data/embeddings`, `.ocr_cache` and corpus PDFs and has its own `node_modules` and a `.env` copy (mode 600); `.ocr_cache` shows as untracked because `.gitignore` matches only a directory, so never stage it.
- Link tools from this session were scratchpad scripts and are gone; a resolver is a short script that checks that every relative Markdown link target and every `href=` and `src=` target exists.

## Do not touch

- `eval/transcripts/`, `eval/grading/`, captured folders' contents, `archive/`, `data/`, `dist/`, and untracked files (including the user's `*_EXPLAINED.html` in the main checkout).
- The five branches in the propagation handoff while that chat runs; `fix/window-note` (production hotfix line).
- `~/code/work/clean-earth-rovers/handoff/`, `../clean-earth-rovers-server`, `../user-dashboard`, and other branches' worktrees.
- Live device-API writes and paid model runs without the user's approval; live reads only after announcing them.
