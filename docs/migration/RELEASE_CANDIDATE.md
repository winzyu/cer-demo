# Release candidate rc2

Cut 2026-09-29 for release task L4 of [`GILLIGAN_RELEASE_PLAN.md`](GILLIGAN_RELEASE_PLAN.md).
From here on these commits and files do not change: manual testing ([`GILLIGAN_MANUAL_TEST_GUIDE.md`](GILLIGAN_MANUAL_TEST_GUIDE.md)) and the deploy ([`GILLIGAN_DEPLOYMENT_RUNBOOK.md`](GILLIGAN_DEPLOYMENT_RUNBOOK.md)) use exactly them.
Anything found during testing goes into the findings list at the end, not into code, unless the user approves a fix; an approved fix makes a new candidate (rc3) with its own record.

## 1. Commits

| service | repository | commit | branch |
|---|---|---|---|
| cer-gilligan | cer-demo | final `dev` `5f00487` (code identical to `303280d`), plus one commit that changes only `release/artifacts.sha256` and adds this file | `release/rc2` |
| cer-ui | user-dashboard | `fc13d16` | `release/gilligan-2026-09-30-rc2` (pushed) |
| cer-api | clean-earth-rovers-server | `8463545`, pending Michael | `release/gilligan-2026-09-30-rc2` (pushed) |

Michael chooses the server commit at the demo from `8463545`, `008dad6` and `122136d` (manual test guide, section L); the row is pinned only after his answer.
The coordinator ran the full `npm test` on `303280d`: 1584 tests pass.

## 2. Packaged data files

The image carries these two files; the Docker build fails unless both match `release/artifacts.sha256`.

```text
4b8fd3ed581f5712467dca82640d75f2afa38be9270f750fb8cd17aadb049731  data/corpus/corpus.json
97363feba75e2e8c8c1828b09341086998f370958b4976f8d2bc7971c6b4e009  data/embeddings/cache.json
```

How they were made, in the `release/rc2` worktree:

- `npm run ingest` from the committed ingestion code, the main checkout's `documents/` and its `.ocr_cache/` (the one scanned document, the EPA calibration SOP, read from the cache, not re-OCRed).
  Result: 16 documents, 457 chunks, 864,321 characters, direct-feed slice 26,096 characters.
- `npm run embed:cache`, starting from the `e7-corpus` worktree's cache, which already held a `nomic-ai/nomic-embed-text-v1.5` vector for every one of the 457 chunk ids: 0 embedded, 457 reused, 0 dropped, no API call and no cost.
  Chunk ids are the filename plus a hash of the chunk text, so a reused vector belongs to exactly that text.
- `sha256sum data/corpus/corpus.json data/embeddings/cache.json > release/artifacts.sha256`.

Against the Sep 21 corpus in the main checkout, the new corpus adds 11 chunks and removes none.
Both files embed a generation timestamp, so re-running either command produces a different hash: build from these exact files, never from a rebuild.
They are git-ignored; copies are in the `release/rc2` worktree (`.claude/worktrees/rc2/data/`) and in `~/release/rc2-artifacts/data/`.
The main checkout's `data/` still holds the Sep 21 files, which do not match these checksums.

## 3. cer-gilligan configuration

The release configuration is runbook §4.1 at `5f00487`, verbatim; it is kept outside every repository as `~/release/cer-gilligan.env.yaml`.

```yaml
NODE_ENV: "production"
LOG_LEVEL: "info"
DEFAULT_RETRIEVAL: "local-vector"
QUERY_REWRITE: "true"
QUERY_REWRITE_FIRST_TURN: "true"
PREDECESSOR_PERIOD_HANDOFF: "false"
CORPUS_SOURCE: "artifact"
DEBUG_RETRIEVAL: "false"
FIRESTORE_PROJECT_ID: "conductive-fold-343604"
FIRESTORE_DATABASE_ID: "gilligan"
LLM_MODEL: "accounts/fireworks/models/glm-5p3-flash"
LLM_REASONING_EFFORT: "low"
EMBEDDING_MODEL: "nomic-ai/nomic-embed-text-v1.5"
LLM_MAX_TOKENS: "16384"
LLM_MAX_CONCURRENT: "8"
LLM_QUEUE_TIMEOUT_MS: "20000"
LLM_RETRY_DELAY_MS: "2000"
DEVICE_API_BASE_URL: "https://cer-api-98242557946.us-central1.run.app/api/v1"
DEVICE_API_TIMEOUT_MS: "10000"
SENSOR_TOOL: "true"
REPORT_TOOL: "true"
MAX_TOOL_ROUNDS: "16"
CATALOGUE_PROMPT: "true"
CATALOGUE_DRAFTS: "false"
AUDIT_LOG: "false"
WATER_TYPE: "freshwater"
QUERY_QUOTA: "true"
QUERY_QUOTA_REQUESTS: "20"
QUERY_QUOTA_REPORTS: "5"
QUERY_QUOTA_TOKENS: "1000000"
QUERY_QUOTA_WINDOW: "1d"
QUERY_QUOTA_SCOPE: "caller"
QUERY_QUOTA_STORE: "firestore"
QUERY_QUOTA_WARN_AT: "0.2"
```

Every guard fails open when its variable is missing, so the three limits (20 messages, 5 reports, 1,000,000 tokens per user per UTC day) are set explicitly and must stay.
`FIREWORKS_API_KEY` and `CER_RAG_SERVICE_KEY` are attached as secrets at deploy time (runbook §6.1), never written here.

Staging fallback, only while Firestore access for cer-gilligan is pending: `~/release/cer-gilligan.memory-fallback.env.yaml` is the same file with `QUERY_QUOTA_STORE: "memory"`, deployed with `--max-instances=1`.
Its counts reset on every restart, including every scale to zero, so it may serve L5-L7 but never L9; before L9 cer-gilligan is redeployed on the release file and the runbook §6.1 tests 5 and 6 are repeated.
With `CORPUS_SOURCE=artifact`, `DEFAULT_RETRIEVAL=local-vector` and `AUDIT_LOG=false`, the quota store is the only part of cer-gilligan that uses Firestore.

## 4. Production-mode check

Run 2026-09-29 on the compiled `dist/index.js` under Node 24 with `NODE_ENV=production`, which is what the image runs; Docker is not installed here, so the image itself was not built locally (runbook §3.3 S1).
The environment was exactly the §4.1 file plus `PORT=8011`, a random 32-character test service key and `FIRESTORE_EMULATOR_HOST` pointing at a fresh emulator on 8081, with no `.env` and no Fireworks key, so nothing could reach production Firestore or spend.

| check | result |
|---|---|
| Both env files load through `src/config` in production mode | pass: quota on, 20 / 1,000,000 / 5 per 1d per caller, database `gilligan` |
| Boot | pass: `[Firestore] Initialized (database=gilligan, project=conductive-fold-343604)`, listening in production mode, no errors |
| `GET /health` | pass: 200, `environment: production` |
| `POST /api/v1/chat` without a key, and with a wrong key | pass: 401 `service_key_invalid` both times |
| `GET /api/v1/usage` with the key and a user id | pass: 200, questions 20, tokens 1,000,000, reports 5, window `1d`, read through the Firestore store |
| `POST /api/v1/chat` with the key and an empty body | pass: 400 `"query" is required` |
| No usage document in `(default)` or `gilligan` after a refused request | pass |
| `test/unit/dockerContext.test.ts` against the new checksums | pass: 36 tests |

Not covered here: a counted answer writing its usage document (it needs a model call; the paid delta test below exercises it), and the Docker build (Cloud Build runs it at §3.3, and it checks the checksums).

## 5. Delta test

The paid rc2 rows, capped at $0.15 and run only with the user's approval: G1, G3, and the B1, C1 and F2 rechecks.
Status: not run.

## 6. Findings

Found while cutting rc2; none changes these commits.

1. Runbook §3.3 copies `corpus.json` and `cache.json` from the main checkout, which still holds the Sep 21 files; the build would fail its checksum check.
   Copy them from `.claude/worktrees/rc2/data/` or `~/release/rc2-artifacts/data/` instead.
2. Michael's setup, read-only checks by the user on 2026-09-28: `cer-gilligan-runtime` and the `gilligan` database do not exist, and the `cer-ui` trigger `8ad67b17` is still enabled.
   The user's account cannot read the secrets, IAM policies or the compute account's policy, so those need Michael's confirmation.
   The memory-store fallback removes the database from L5's prerequisites, not the runtime account or the two secrets.
