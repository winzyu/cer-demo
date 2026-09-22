# WSL2 integration sandbox

Checklist for the native WSL2 sandbox where the user tests this service against copies of the upstream dashboard and server (decision D1 in [`GILLIGAN_TARGET_ARCHITECTURE.md`](GILLIGAN_TARGET_ARCHITECTURE.md)).
The OneDrive checkout stays the primary copy of cer-demo, where evaluation and service work continue; the sandbox is a second copy for integration testing.
Written 2026-09-17 from the state of the OneDrive checkout at that date.
The work that follows this checklist is split into one-per-session packets in [`WSL_SANDBOX_TASKS.md`](WSL_SANDBOX_TASKS.md).

## 1. Layout

The repository instructions refer to the reference repositories as `../user-dashboard` and `../clean-earth-rovers-server`, so all three must stay siblings:

```text
~/code/clean-earth-rovers/
  cer-demo/                      git@github.com:winzyu/cer-demo.git
  user-dashboard/                git@github.com:Clean-Earth-Rovers-Technology/user-dashboard.git
  clean-earth-rovers-server/     git@github.com:Clean-Earth-Rovers-Technology/clean-earth-rovers-server.git
```

`~/code/clean-earth-rovers` is a suggestion; any path under your WSL home works.

## 2. Before cloning

- [ ] Push the cer-demo work the sandbox should have; the sandbox clones from GitHub, so uncommitted files in the OneDrive checkout do not arrive.
- [ ] The OneDrive `../clean-earth-rovers-server` checkout has a local commit that is not on its remote (`a3cc25d`, "Auto-derive NOAA tide station from device coordinates") and is 87 commits behind its last fetch. A fresh clone will not contain that commit; carry it over as a patch (`git format-patch -1 a3cc25d`) if the sandbox needs it.
- [ ] The OneDrive `../user-dashboard` checkout was clean on `main` at `c55f65d`.

## 3. Clone

```bash
mkdir -p ~/code/clean-earth-rovers && cd ~/code/clean-earth-rovers
git clone -b dev git@github.com:winzyu/cer-demo.git
git clone git@github.com:Clean-Earth-Rovers-Technology/user-dashboard.git
git clone -b develop git@github.com:Clean-Earth-Rovers-Technology/clean-earth-rovers-server.git
```

The two upstream clones pick up everything merged since the old checkout's last fetch.

## 4. Copy what git does not carry

Copy each item from the OneDrive checkout into the same path in the sandbox's `cer-demo/`.
None of these is in the remote.

| item | why it is needed | if missing |
|---|---|---|
| `.env` | API keys, device API URL, Firestore project, feature flags | the service cannot call Fireworks or the device API |
| `serviceAccountKey.json`, if you use one | Firestore credentials for seeding and `CORPUS_SOURCE=firestore` | Firestore-backed modes fail; never commit it |
| `documents/` (all files, including `_excluded/`) | 12 corpus PDFs are gitignored; only 6 are tracked | `npm run ingest` cannot rebuild the corpus |
| `data/corpus/` | the ingested 14-document, 446-chunk corpus | rebuild with `npm run ingest` once `documents/` is present |
| `data/embeddings/` | cached embeddings | rebuilding costs Fireworks embedding calls |
| `.ocr_cache/` | OCR output for the scanned PDF | ingest re-runs OCR, which is slow |
| `data/retrieval-eval/`, `data/device-fields/`, `data/backend-surface/` | recorded evaluation and exploration output cited by docs | the evidence is lost; `data/device-fields` and `data/backend-surface` need live reads to re-record |
| `water-quality-source-of-truth-v2.pdf` (repo root, untracked) | the v2 review source | ask the supervisor for it again |
| `.claude/settings.local.json` | your local Claude Code permissions | you re-approve prompts |

One command for the whole list, run from the new `cer-demo/`:

```bash
OLD=/mnt/c/Users/winsy/OneDrive/Documents/work_and_school/coding/project/aic/clean-earth-rovers/repo/cer-demo
cp -a "$OLD/.env" .
cp -a "$OLD/documents/." documents/
mkdir -p data .claude
cp -a "$OLD/data/." data/
cp -a "$OLD/.ocr_cache" .
cp -a "$OLD/water-quality-source-of-truth-v2.pdf" .
cp -a "$OLD/.claude/settings.local.json" .claude/
# and the service account key, if you use one
```

Do not copy `node_modules/`, `dist/` or `generated_reports/`; they are rebuilt or disposable.

## 5. Claude Code and Codex state

- [ ] Claude Code keys project memory by path, so a session in the sandbox starts with no memory. To share it, copy `~/.claude/projects/-mnt-c-Users-winsy-OneDrive-Documents-work-and-school-coding-project-aic-clean-earth-rovers-repo-cer-demo/memory/` into the sandbox project's directory, which Claude Code creates on first launch (`~/.claude/projects/-home-winsy-code-clean-earth-rovers-cer-demo/` for the suggested layout).
- [ ] The sandbox's `CLAUDE.md` still says the upstream repositories are read-only. If you want Claude's help there, that copy needs its own exception; the OneDrive copy keeps the rule.
- [ ] `gcloud` credentials already live in your WSL home and do not move.
- [ ] `AGENTS.md`, `CLAUDE.md` and `.claude/skills/` are tracked and arrive with the clone.

## 6. Verify

```bash
cd ~/code/clean-earth-rovers/cer-demo
npm ci
npm run typecheck && npm run lint
npx jest test/unit/frontendAuth.test.ts --runInBand
PORT=8010 npm run dev          # then: curl -s localhost:8010/health
```

For the dashboard later: `cd ../user-dashboard && yarn install && yarn dev` (Next.js on port 3000); it needs its own `.env.local` from the dashboard owners.

## 7. Keeping the two cer-demo copies in step

- Service changes are made in the OneDrive checkout, pushed, and pulled into the sandbox; do not edit cer-demo in both places.
- A service change the sandbox reveals is noted and made back in the OneDrive checkout.
- `.env` and `data/` do not sync; re-copy them when they change.
- Upstream changes made in the sandbox stay there until the supervisor approves their transfer.
