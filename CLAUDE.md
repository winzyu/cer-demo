# CER Demo

`../user-dashboard` and `../clean-earth-rovers-server` are writable for local development, on branch `local` or a branch cut from it, and only there.
Their `main` and `develop` carry malware at HEAD: never check those branches out, never run `npm install`, `next dev`, `next build` or `npm test` while on them, and re-run `grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .` after any clone, fetch, pull or branch switch.
Never push, force-push or merge in either repository; pushing needs explicit consent in chat.
Do not read `~/.config/gcloud/` or `serviceAccountKey.json`, or print credentials.
The device API is production with no QA mirror; announce live reads and obtain approval for live writes or paid evaluation runs.
Migration planning artifacts belong in `docs/migration/`.

## Documentation

Start at `docs/STATUS.md`; open other docs only as needed.
Never cite STATUS from code or durable docs; put reasoning in `docs/SPECS.md`, `docs/EVAL_REBUILD.md`, or `docs/timeline.md`.
Do not search, read, or cite archived docs without permission; `docs/ARCHIVED.md` indexes them.
Retrieve approved archived content with `git show`, never restore it into the tree.
For substantial design comparisons, create a reviewable local Markdown/HTML artifact under `docs/migration/`; publish externally only when authorized.

## Verification and artifacts

Run only relevant Jest suites or named cases, never the full suite; the user runs `npm test`.
`npm run typecheck` and `npm run lint` are allowed; report actual checks and failures.
Use the `run-local` skill for end-to-end reproduction or smoke tests.
Preserve `eval/transcripts/` verbatim: captured runs cannot be reconstructed.
Regenerate `eval/grading/` with `npm run grade:packet`, `eval/retrieval-labels/` with `scripts/resolveRetrievalLabels.ts`, `data/corpus/` with `npm run ingest`, `dist/` with `npm run build`, and lockfiles with npm.

## Cloud sessions

These rules apply in a cloud session (a clone at `/home/user/cer-demo` with no `.env`).
Work only on the files the task prompt names; push only to a `cloud/*` branch, never to `dev` or `main`, and never merge.
Never run `npm test`, `npm run ingest`, `npm run embed:cache`, `seed:firestore*`, `bakeoff`, `judge` or other eval captures, `npm audit fix`, `npm install <pkg>`, or the server with `SENSOR_TOOL` or `REPORT_TOOL` on.
Never clone or fetch the upstream CER repositories, and never add secrets to the environment.
Read `docs/STATUS.md` only if the prompt asks; write results to the prompt's output file in its format.

## Git and delegation

Git in cer-demo runs without approval: follow `git-plan`, then report the commands that ran.
Ask first only before losing work or rewriting shared history; `git-plan` lists those commands.
Commit and push to cer-demo's `origin` when a verified unit of work is done or when asked.
Keep small edits inline; use worktrees for multi-step or overlapping work and always for delegated edits.
Before delegating, use `delegate`; delegate only when parallel work materially helps.
Subagents must not spawn subagents, and their actual diffs require review.
Use `handoff` only when explicitly requested.
