# Worktree runtime setup

A worktree starts from committed HEAD, not the main checkout's uncommitted files.
If the task needs those changes, obtain a Git plan to land them first or stop.
From a fresh worktree, identify the main checkout with `git worktree list --porcelain` and use absolute paths.
Check existing destinations before setup; do not overwrite them.

- Link the main checkout's `node_modules` if available.
- Copy `.env` only when needed for an authorized local run, without printing its contents; confirm it remains ignored.
- Link ignored `data/` subdirectories individually, excluding tracked `data/results/`.
  Do not link the entire `data` directory: it already exists in the worktree.
- Linked caches are shared writes into the main checkout.
  Do not run ingest, embed:cache, or exploration pulls against shared caches unless regeneration was authorized.
- Keep `data/results/` local to the worktree; never stage setup links or secrets.
- A new worktree may lack uncommitted agent configuration from the main checkout.
  Supply the current task constraints explicitly rather than assuming those files are present.
