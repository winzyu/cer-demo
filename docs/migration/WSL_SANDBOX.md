# WSL2 working checkout

The native WSL2 checkout where this service is developed and tested against copies of the upstream dashboard and server (decision D1 in [`GILLIGAN_TARGET_ARCHITECTURE.md`](GILLIGAN_TARGET_ARCHITECTURE.md)).

Rewritten 2026-09-21.
This was originally a guide for standing up a *second* copy alongside a primary OneDrive checkout.
That OneDrive checkout no longer exists: the machine was rebuilt after the 2026-09-19 incident ([`SECURITY_INCIDENT_2026-09-19.md`](SECURITY_INCIDENT_2026-09-19.md)).
**This WSL checkout is now the only copy**, and the two-copy sync rules that used to be in this document no longer apply.

## 1. Layout

The repository instructions refer to the reference repositories as `../user-dashboard` and `../clean-earth-rovers-server`, so all three must stay siblings.
Current layout:

```text
/home/winsy/code/clean-earth-rovers/
  repo/
    cer-demo/                    git@github.com:winzyu/cer-demo.git              (branch dev)
    user-dashboard/              git@github.com:Clean-Earth-Rovers-Technology/user-dashboard.git
    clean-earth-rovers-server/   git@github.com:Clean-Earth-Rovers-Technology/clean-earth-rovers-server.git
  incident-logs/                 recovered Claude transcripts, not a repo
```

## 2. Do not run the upstream repositories yet

The two Clean Earth Rovers repositories carry malware in `postcss.config.js` and both `jest.config.js` files, committed upstream and present on every branch.
It executes on `next dev`, `next build` and `npm test`.

Before running anything in `../user-dashboard` or `../clean-earth-rovers-server`:

```bash
grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .
```

Empty output means clean.
Re-run it after every clone, fetch, pull or branch switch in those two repositories.
Restoring the clean files and the current cleanup status are in [`SECURITY_INCIDENT_2026-09-19.md`](SECURITY_INCIDENT_2026-09-19.md).

cer-demo is unaffected and safe to run.

## 3. Clone

```bash
mkdir -p ~/code/clean-earth-rovers/repo && cd ~/code/clean-earth-rovers/repo
git clone -b dev git@github.com:winzyu/cer-demo.git
git clone git@github.com:Clean-Earth-Rovers-Technology/user-dashboard.git
git clone -b develop git@github.com:Clean-Earth-Rovers-Technology/clean-earth-rovers-server.git
```

## 4. What git does not carry

The old OneDrive checkout was the source for these and is gone.
Status as of 2026-09-21, after the rebuild session:

| item | state | detail |
|---|---|---|
| `.env` | **restored** | Scaffolded from the tracked `.env.example`, with `PORT=8010`. Every secret is deliberately left **empty**, not filled with a placeholder: `GET /health` reports `fireworksConfigured` as a plain `Boolean()` on the value (`src/controllers/HealthController.ts:18`), so a placeholder string makes the endpoint claim the service is configured when it is not, and it also suppresses the `FIREWORKS_API_KEY is not set` warning the config prints at boot. The backup's `.env` was read as a variable-name reference only — it carries 19 variables against the current 32, and every secret in it was on the compromised machine and has been rotated. No value was copied from it. |
| 12 corpus PDFs in `documents/` | **9 restored, 3 deliberately not** | The authoritative recovery key was not the sourcing brief: `DOC_META` in `src/ingestion/corpus.ts` records a `sourceUrl` for **every** corpus document, so the 8 in-corpus files (7 USGS chapters + the EPA SOP) were downloaded straight from it. The vetoed `water-quality-metrics-source-of-truth.pdf` came out of git at tag `corpus-archive-2026-09-13`, no download needed. The three documents cut on 2026-08-24 (`epa-wqs-handbook-ch3`, `epa-assessing-monitoring-floatable-debris`, `noaa-nhabon-framework-workshop-report`) were **not** restored: ingest never reads `_excluded/` and `documents/README.md` already records the measurements that justified cutting them. |
| `data/corpus/` (14 docs, 446 chunks) | **rebuilt** | `npm run ingest`. All 13 non-OCR documents reproduce their `documents/README.md` char counts **exactly**, summing to 806,076; the direct-feed slice is 26,096 chars and the chunk total is 446, both matching. |
| `data/embeddings/` | lost | Needs `FIREWORKS_API_KEY`; costs Fireworks embedding calls. `npm run ingest` does **not** touch it — ingest only parses and chunks, so the corpus above was rebuilt at zero spend. |
| `.ocr_cache/` | **rebuilt, not identical** | The backup's `.ocr_cache/` exists but is **empty**, so the 2026-08-21 cache is gone for good. Re-OCR'd here with `pdftoppm -r 300 -gray -png` → `tesseract --psm 1 -l eng`, but with **tesseract 4.1.1**, not the 5.3.4 that made the original. Result is 34,441 chars in the cache and 34,337 after ingest, against 34,349 and 34,251 before: **+86 chars**, and the document now yields 12 chunks rather than 10. Body text reads clean. Chunk ids for this one document have therefore shifted, so anything keyed to them is void. |
| `data/retrieval-eval/`, `data/device-fields/`, `data/backend-surface/` | still lost | `device-fields` and `backend-surface` need live device reads to re-record, so they need the rotated `DEVICE_API_TOKEN` first. |
| `water-quality-source-of-truth-v2.pdf` | **restored** | Taken from the 2026-09-19 backup, 100,366 bytes, sha256 `318b6f6b…87102`, 21 pages, no `/JavaScript`, `/OpenAction` or `/EmbeddedFile`. Two corrections to the old note: in the backup it sits at the **root** of `cer-demo/`, not under `documents/` — the backup's `documents/` directory is **empty** — and it belongs at the repo root here too. Putting it in `documents/` would silently ingest it as a 15th document, because `ingestCorpus` enumerates that directory with `readdirSync` and `metaFor` falls back to `{ title: filename }` for anything absent from `DOC_META` (`src/ingestion/corpus.ts:165`). It stays untracked, as it was before the wipe. |
| `eval/fixtures-wave1/_EXIT_CRITERIA.md` | **recovered** | Not from the OneDrive copy — that whole tree is empty (see the note below this table). Reconstructed from a `Read` tool result inside the recovered Claude transcripts, 84 lines, no truncation. It is the **46 / 92** version, so it still needs the 45 / 90 update. |
| `eval/grading/phase-1d-wave1-fixture-review.html` | **recovered** | The Phase 1d review sheet. Three copies exist: two older snapshots in `.claude/file-history/` inside `claude-codex-setup.tar.gz`, and the live artifact at `https://claude.ai/code/artifact/9ee30967-633b-42ca-86b4-418cff7858e6`, which is newest and is what was restored. **The review's decisions are not in the file** — the page writes them to `localStorage` in the browser where the review was done, so the live page is the only place any recorded decisions exist. |
| `serviceAccountKey.json` | still lost | Regenerate in GCP if a Firestore-backed mode is needed. Never commit it. |
| `.claude/settings.local.json` | lost | Re-approve prompts as they come. |

The backup drive was written by the compromised machine.
Copy individual files from it after looking at them; do not bulk-restore.
The one file taken from it in this rebuild was the v2 PDF, verified as above before anything read it.

### What the OneDrive copy on the backup drive actually contains

Checked 2026-09-21, because it looks like a full checkout and is not one.
At `D:\onedrive-backup\Documents\work_and_school\coding\project\aic\clean-earth-rovers\repo\cer-demo` there are **15 files, all at the top level** — `.env`, `.env.example`, `package.json`, `package-lock.json`, `README.md`, `CLAUDE.md`, `AGENTS.md`, the config dotfiles, and `water-quality-source-of-truth-v2.pdf`.
**Every subdirectory is an empty shell**: `docs/`, `src/`, `eval/`, `data/`, `documents/`, `.ocr_cache/`, even `.git/`.
They carry their original modification times, which is what makes the tree look real.

This is not OneDrive Files-On-Demand and the content is not one hydration away: checked from Windows, the directories have plain `Directory` attributes with no `ReparsePoint`, `Offline` or `RecallOnDataAccess` flag, and a recursive count returns 0 files.
The live OneDrive folder on `C:` has re-synced since the rebuild and stops at `coding/` — it has no `project/` directory at all.
`D:\$RECYCLE.BIN` holds only unrelated 2021 images.

**So the recoverable project history is not in the OneDrive copy — it is in the Claude state.** `claude-codex-setup.tar.gz` (120 MB) carries `~/.claude`, including `file-history/` with 480 snapshots of files Claude edited, `plans/`, and `projects/` with the transcripts. The transcripts are already unpacked at `~/code/clean-earth-rovers/incident-logs/`. That is where `_EXIT_CRITERIA.md` and the Phase 1d review sheet came from, and it is the first place to look for anything else believed lost.

Two limits worth knowing before trusting it as a backup: generated artifacts never edited by hand are absent (there is no `corpus.json` snapshot, since ingest writes it), and long tool results are truncated, so a large file recovered this way may be partial — check for a truncation marker and for line-number prefixes covering every line.

`node_modules/`, `dist/` and `generated_reports/` are rebuilt or disposable.

## 5. Claude Code and Codex state

- Project memory is keyed by path. This checkout's directory is `~/.claude/projects/-home-winsy-code-clean-earth-rovers-repo/`. The pre-wipe memory lived under the old OneDrive path and is in the backup tarball if it is wanted.
- `AGENTS.md`, `CLAUDE.md` and `.claude/skills/` are tracked and arrive with the clone. They are on `dev`, not on `main`.
- `.claude/settings.json` denies edits to the upstream repositories, **but its deny paths still point at the old OneDrive locations and therefore match nothing**. They need updating to the paths in section 1 before that guard means anything.
- `gcloud` credentials live in the WSL home and did not survive the rebuild; re-authenticate as needed.

## 6. Verify

```bash
cd ~/code/clean-earth-rovers/repo/cer-demo
npm ci
npm run typecheck && npm run lint
npx jest test/unit/frontendAuth.test.ts --runInBand
npm run ingest                 # 14 documents, 446 chunks, slice 26,096 chars
PORT=8010 npm run dev          # then: curl -s localhost:8010/health
```

All of this passes as of 2026-09-21 and needs no secrets: `npm run ingest` never calls Fireworks or Firestore.
`/health` returns `status: ok` with both `fireworksConfigured` and `firestoreProjectConfigured` **false**, which is the correct reading of an `.env` whose secrets are still empty.

The strongest check is the ingest output rather than the exit code, because ingest exits 0 even when the Tier 1 files are missing.
Compare each per-document char count against the table in [`../../documents/README.md`](../../documents/README.md); a count that misses its row means the wrong edition or the wrong file, not a rounding difference.
Watch the `direct-feed slice:` line in particular — `0 chars` means the four Atlas datasheets are absent and every `firestore-direct` answer is ungrounded.

Re-OCR needs `poppler-utils` and `tesseract-ocr`, which are not in a default WSL image:

```bash
sudo apt install -y poppler-utils tesseract-ocr
```

Retrieval and eval still need the rotated secrets in `.env`; the corpus itself no longer blocks them.

For the dashboard, only after the malware check in section 2 passes: `cd ../user-dashboard && yarn install && yarn dev` (Next.js on port 3000); it needs its own `.env.local` from the dashboard owners.
