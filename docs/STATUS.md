# Status

Current state and next steps only.
Rewritten at the end of every session by `/handoff`; history is `git log -p docs/STATUS.md`.
Never cite this file from code or other docs: the reasoning lives in the docs under "Where things live".

Updated 2026-09-21 at commit `6799d18` (eval claim-inventory re-resolution, then the upstream cleanup and local stack; other workstream notes keep their original verification dates).

## Start here

- **Environment rebuild — done.** The corpus is back, ingest reproduces it byte-for-byte, and the secrets are in. `npm ci`, typecheck, lint, `evalFixtures` + `frontendAuth` units, `npm run ingest` and a boot on 8010 all pass; `/health` returns `status: ok` with both checks true. `FIREWORKS_API_KEY` was validated against `/v1/models` (HTTP 200, `gpt-oss-120b` listed). Per-item state: [`migration/WSL_SANDBOX.md`](migration/WSL_SANDBOX.md) §4. **One config decision is open before anything can retrieve: `DEFAULT_RETRIEVAL` is empty on disk, which `readString` resolves to `stub`** — three hard-coded `[STUB CONTEXT]` chunks, safe but ungrounded. See the user's item 1.
- **Eval (claim inventory) - done.** All 12 dead `epa-sop-field-instrument-calibration-2010.pdf` chunk ids are re-resolved and **446/446 claim chunk ids now resolve**. One claim is flagged rather than changed (the user's item 11). Next: regenerate `eval/retrieval-labels/`, which still carries the old ids (Claude's item 1). Reasoning: [`EVAL_REBUILD.md`](EVAL_REBUILD.md) §"What is safe to change later".
- **Eval (Phase 1d, in progress and not this session's work)**: an agent verification of the 45 fixtures against the restored corpus is part-finished in `eval/reviews/wave1-agent-2026-09-21/`. Its `manifest.json` `corpus_sha256` matches `data/corpus/corpus.json` exactly. **5 of 9 batch reports exist (1-4 and 6); batches 5, 7, 8 and 9 are missing**, so 25 of 45 fixtures are covered — the refusal class (batch 9) and the three new `precedence` fixtures (batch 8) are among the unreviewed. Establish ownership before touching it.
- **Eval (Phase 3 baseline)**: capture the generation baseline on gold context in its own session. Spend approved 2026-09-17; no longer blocked on the corpus, still blocked on the Phase 1d fixture freeze. First step: the Phase 3 row of [`EVAL_REBUILD.md`](EVAL_REBUILD.md). Launch bar (D3): aim for every check; caveat or refuse weak question classes rather than delay the release.
- **Gilligan release (September 30)**: planning is done and no implementation has started; 9 days left. Read [`migration/GILLIGAN_PRODUCT_DIRECTION.md`](migration/GILLIGAN_PRODUCT_DIRECTION.md) then [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md). Next: step R1, the service contract in this repo (`/gilligan/answer`, cer-api identity check, history mapping with Gemini-era chats ignored, report bytes, Firestore usage limits and status endpoint, `audit` field, concurrency limiter). Confirm with the user before starting implementation.
- **Upstream repos — cleaned and running locally, 2026-09-21, nothing pushed.** Both checkouts are on branch `local`, cut from `security/remove-payload` (user-dashboard `5dff5fd` off `main` `9ce674b`; clean-earth-rovers-server `693fc96` off `develop` `500ceac`), with no upstream configured. Upstream HEAD and every branch in the incident record are still infected and nothing may be pushed without explicit consent ([`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md)). Dashboard `:3000` and server `:5001` now run with no Firestore, Stripe, Gemini, OpenAI or nodemailer credentials: a dev-only passthrough forwards everything outside `DEV_LOCAL_PATHS` to the deployed cer-api, verified returning the same 5 pods directly and through the dashboard ([`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md)). **Next, handed to a separate chat on 2026-09-21: port this service's Gilligan implementation onto the dashboard's Gilligan page** (roadmap R3, Claude's item 2).
- **Catalogue (replaces the advice allowlist)**: a supervisor-approved, versioned catalogue built from source-of-truth v2 and the usable `docs/advice/` drafts, shared by chat and reports (architecture doc §2d). Waits on supervisor items 17-20.
- **Pod-scope/auth**: committed earlier; re-check code before continuing.

## Last session

- Re-resolved all 12 dead `epa-sop-field-instrument-calibration-2010.pdf` chunk ids in `eval/claims/` onto the corpus chunk of the same index, confirmed by exact-quote evidence rather than assumed from it, and refreshed the 11 `quote` values the re-OCR broke. Claim ids, claim text, `type`, `metrics`, `specificity`, `locator` and the summary blocks are byte-identical, so nothing was re-extracted. Verified: **446/446 chunk ids resolve, 2177 claims, no duplicate ids, no quote over 200 chars.**
- One claim (`epa-oxygen-solubility-chart-01`) crossed the chunk 9/10 boundary and is flagged, not changed: the user's item 11. No suites run (the change is JSON and Markdown only), no paid runs, no network, nothing pushed.
- Cleaned the committed malware in both upstream repositories (branch `security/remove-payload`, then `local` cut from it), restoring the three config files from known-good blobs that differ from the infected prefixes only at the trailing newline; then installed both repositories, wrote their git-ignored env files, added the server's dev passthrough and verified dashboard to server to live API end to end. House rules now allow writing upstream on `local` only, superseding D1's WSL sandbox (architecture doc §7, timeline). Nothing pushed, no paid runs.

## Working tree

- Branch `dev`, tracking `origin/dev`, **ahead 5 and unpushed** (3 environment-rebuild commits, then the claim re-resolution and this handoff). Nothing is pushed; `origin/dev` is still at the pre-rebuild state.
- Eval claim inventory (this session): `eval/claims/epa-sop-field-instrument-calibration-2010.json` and `eval/claims/_STATUS.md`. The worktree it was built in has been removed.
- Upstream repos, not cer-demo: both on branch `local` with no upstream configured and the payload gone. `clean-earth-rovers-server` carries the uncommitted dev passthrough (`src/middleware/devUpstreamProxy.ts` new, `src/app.ts` modified); both hold git-ignored `.env` files. Uncommitted here from this workstream: `CLAUDE.md`, `AGENTS.md`, `docs/timeline.md`, `docs/migration/SECURITY_INCIDENT_2026-09-19.md`, `docs/migration/GILLIGAN_TARGET_ARCHITECTURE.md`, `docs/migration/LOCAL_STACK.md`.
- **`eval/reviews/` is not this workstream's** — in-progress agent verification, ownership unestablished.
- Restored and untracked or git-ignored, so mostly invisible to `git status`: `node_modules/`, `.env`, the 8 downloaded corpus PDFs, `documents/_excluded/water-quality-metrics-source-of-truth.pdf` (from tag `corpus-archive-2026-09-13`), `.ocr_cache/`, `data/corpus/`, `water-quality-source-of-truth-v2.pdf` at the repo root, `eval/fixtures-wave1/_EXIT_CRITERIA.md` (the **46 / 92** version — the file the user's item 4 updates), `eval/grading/phase-1d-wave1-fixture-review.html`.
- `*.swp` is **not git-ignored**, and a vim swap of `.env` is a buffer of the secrets. One appeared and was cleaned up when the editor exited, so nothing leaked, but the gap is real: add `*.swp` to `.gitignore`.
- Still missing: `data/embeddings/`, `data/retrieval-eval/`, `data/device-fields/`, `data/backend-surface/`, `serviceAccountKey.json`. See [`migration/WSL_SANDBOX.md`](migration/WSL_SANDBOX.md) §4.

## Open work

### Stakeholders

Tracked in [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md).
Release-critical: supervisor items 17-20 (v2 fallback ranges, turbidity exemption, worked examples and customer-facing recommendations, CER referral contacts), needed by about September 25.
Also blocking: item 1, the operator's review of pod alert limits (they drive event detection); item 6, the "configured thresholds" wording.

### The user's

1. Set `DEFAULT_RETRIEVAL`. Empty resolves to `stub`. Only `direct-feed` and `gold-context` run today: the `firestore-*` arms need credentials that do not exist (no `serviceAccountKey.json`, no gcloud ADC), and `local-vector` and the hybrids need `data/embeddings/`, which costs Fireworks calls. `direct-feed` with `CORPUS_SOURCE=artifact` is the working default.
2. Confirm whether supervisor items 17-20 were sent; the roadmap R0 date of September 18 has passed.
3. Decide whether the September 30 Gilligan date still holds.
4. Phase 1d fixture review on the 45 / 90 set; then update `_EXIT_CRITERIA.md` to 45 / 90 and 3 `precedence` fixtures. The restored sheet describes the superseded 46 / 92 set and needs regenerating first. Blocks: Phase 3.
5. Say who owns `eval/reviews/wave1-agent-2026-09-21/` and whether its four missing batches should be finished.
6. Confirm the Fireworks account has a payment method; a third-party source says accounts without one are held to 10 requests per minute.
7. Approve `npm run seed:firestore` (writes Firestore; the collection still holds the removed document). Blocks: any `CORPUS_SOURCE=firestore` capture.
8. Decide the slice-coverage overshoot before wave 2 spends budget (defects below).
9. Choose the `ADVICE_TIER` test design, if the catalogue keeps tiers: append-only tier blocks (recommended) or a pinned prompt per tier.
10. Check whether the malware ever ran on a build machine (Cloud Build, App Engine); a `next build` there would trigger it.
11. Decide `epa-oxygen-solubility-chart-01` (chunk index 9): the +86-char re-OCR moved its quoted chart header row past the chunk 9/10 boundary, so its evidence now sits wholly in chunk index 10, whose `locator` already describes that chart block. Re-parent it to chunk 10 (recommended) or re-quote it from what chunk 9 still holds. Re-parenting changes the per-chunk counts in `eval/claims/_STATUS.md`. It is the only claim failing the verbatim-quote invariant.

### Claude's

1. Regenerate `eval/retrieval-labels/` with `scripts/resolveRetrievalLabels.ts`: 5 label files still carry 30 old `epa-sop` chunk ids, and the script builds its claim-id to chunk map from `eval/claims/`, so it will emit the new ids. It does not delete stale label files, so sweep for leftovers. The old ids in `eval/transcripts/warm/gold-context/` (30) and `data/results/judge/warm.*` (6) are historical captures and must keep them.
2. **Port cer-demo's Gilligan implementation onto the dashboard's Gilligan page (roadmap R3) — handed to a separate chat on 2026-09-21.** The page is `user-dashboard/src/app/gilligan/page.js`, and `src/app/services/gilligan.js` calls `GET /gilligan/question?question&chatId`, `/gilligan/chats` and `/gilligan/check-quota`; this service answers `POST /api/v1/chat` with `{query, history?, device?}` returning `{answer, model, citations, usage}`. First decision: build R1's `/gilligan/answer` contract here first, or relay to `/api/v1/chat` as it stands. Serve those routes locally with `DEV_LOCAL_PATHS=/api/v1/gilligan` and read the auth boundary in [`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md). The upstream cleanup that unblocked it is done (Start here).
3. Propose the `.claude/settings.json` deny-path fix separately; the upstream read-only guard points at dead OneDrive paths and currently protects nothing.
4. Rebuild the hidden-payload scanner with a `--fix` mode, in pure Python so it never invokes npm, jest or next. Lost before it was committed.
5. Roadmap R1 and R2 in this repo, once the user confirms implementation may start. Where: `migration/GILLIGAN_TARGET_ARCHITECTURE.md` §3-4.
6. Phase 3 capture in its own session, once the fixture freeze lands; then measure quote quality (`MIN_QUOTE_CHARS` weakness in `src/eval/gates/checks.ts`).
7. Re-measure contamination for the three new `precedence` fixtures (`_EXIT_CRITERIA.md` "Reproducing").
8. Add tool results to transcripts: `TranscriptTurn` has no field for them, so the judge never sees them.
9. Browser check of the citation chip (unit-tested only); use the `run-local` skill.
10. Phase 1e remainder: per-turn label splits, candidate sweep, hard negatives, grade differentiation. Blocks Phase 4, not Phase 3.

## Unfixed defects

Reported 2026-09-10 to 2026-09-13; the first two rows re-checked 2026-09-17.

| where | defect | severity |
|---|---|---|
| `src/report/events.ts:221,263` | `Saltwater intrusion` (0.45) and `Industrial` (0.3) classify below `CONFIDENCE_FLOOR` (0.5), so they are always rewritten to `Inconclusive` and can never appear. | medium |
| `src/report/events.ts` | The sewage rule ignores water type: it scores highest when conductivity rises (v2's freshwater signature), while v2's marine signature has conductivity falling (v2 §6.2-6.3). | medium |
| `src/report/buildReportInput.ts` | No diel/tidal classifier: every live parameter is tagged `pattern: "unknown"`, which disables `detectAlgalBloom` on live data and the skip that stops normal daily swings opening event windows. | high |
| `src/report/events.ts` | No `Pattern` value for a slow multi-week trend (for example drought-driven salinity creep). | low |
| `src/report/reportOwnership.ts` | Report PDF access is bound to an exact bearer-token hash, not a verified identity; replaced by returned bytes in R1. | medium |
| `src/quota/InMemoryQuotaStore.ts` | Quotas live in process memory: reset on redeploy and multiplied per instance; replaced by a Firestore store in R1. | medium |
| `eval/fixtures-wave1/` | Slice-coverage overshoot: 88% of answerable turns sit outside the ◆G9 slice, so Phase 4 conclusions only hold for manual-heavy questions. | medium |
| `documents/README.md` | The per-document **chunk** column does not reproduce and does not sum to its own stated total (388 against 446). The char column is exact and the 446 total is exact, so the corpus is right and this column is stale. Verify a restore on chars, not chunks. | low |
| `src/controllers/HealthController.ts:18` | `fireworksConfigured` and `firestoreProjectConfigured` are a plain `Boolean()` on the value, so any non-empty string passes. `/health` cannot tell a real credential from a placeholder, and reports Firestore configured while no credentials exist. | low |
| `../clean-earth-rovers-server` `WaterAnalyticsService.findPeriodWaterData` | Explicit device filters are not checked against membership (`migration/SECURITY_FINDINGS.md` §1); upstream fix, tracked in the architecture doc. | high |
| `../clean-earth-rovers-server` `GilliganService.askQuestionGemini` | Calls the retired `gemini-pro` model at `origin/develop` `b221702`; current production Gilligan likely fails every question (not live-tested). | high |
| `../clean-earth-rovers-server` `turbVoltToNTU.ts` | Returns 0 NTU for a missing voltage and for the offline sentinel, same as clear water. | medium |
| `../clean-earth-rovers-server` `src/routes/userRoutes.ts` | `UserController` is constructed at module import, which constructs `EmailService`, whose constructor throws without `NODEMAILER_APP_EMAIL` and `NODEMAILER_APP_PASSWORD`. The whole server fails to boot over credentials only the password-reset mail path needs; `PaymentService` does the same with `STRIPE_SECRET_KEY`. Found 2026-09-21 setting up the local stack. | medium |
| device registry | No sensor-model field, so quantitative and qualitative-only turbidity sensors cannot be told apart. Not needed for the release (turbidity stays qualitative). | low |

## Active traps

- **The two upstream CER repositories carry malware at HEAD on every branch.** It runs on `next dev`, `next build` and `npm test`. The local checkouts are on the clean `local` branch as of 2026-09-21, but their own `main` / `develop` still carry the payload, so switching back to those branches reinfects the working tree. Check with `grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .` after any clone, fetch, pull or branch switch, and read upstream code with `git show origin/develop:<path>` rather than trusting a working tree. cer-demo is clean.
- **An empty env var is not an unset one with a safe default — it silently takes `readString`'s fallback.** `DEFAULT_RETRIEVAL=` gives `stub`, whose three `[STUB CONTEXT]` chunks are deliberately recognizable but are not the corpus.
- `.ocr_cache/` is tesseract 4.1.1 output, not the original 5.3.4, and the original OCR text is unrecoverable. `epa-sop-field-instrument-calibration-2010.pdf`'s 12 chunk ids moved because of it; they are re-resolved in `eval/claims/`, so **any re-ingest from a different tesseract build moves them again**. Chunk *count* was unaffected at 12, and the other 13 documents are byte-stable.
- Anything dropped into `documents/` is ingested whether or not it is in `DOC_META` — `metaFor` falls back to the filename as the title. Keep `water-quality-source-of-truth-v2.pdf` at the repo root; in `documents/` it would silently become a 15th corpus document carrying vetoed operator ranges.
- `.claude/settings.json` deny rules point at the old OneDrive paths and match nothing, so the upstream read-only guard is currently inert.
- Fireworks documents no free tier for `gpt-oss-120b`; budget and rate limits assume a paid account.
- Run jest suites one at a time with `--runInBand`; parallel runs on this filesystem get killed for memory.
- Captures need `SENSOR_TOOL=false` on both server and runner. Use port 8010; never kill 8000.
- Re-chunking voids every label. `scripts/resolveRetrievalLabels.ts` does not delete stale label files, and any `-NN`-shaped token in fixture `notes` is read as a claim id.
- The configured device token sees 5 pods (the August census saw 15); tokens are scoped to one organization, and the JWT carries **no `exp` claim**, so it never expires on its own and works until revoked server-side.
- Nothing is deployed; all testing is local.

## Where things live

| what | where |
|---|---|
| Security incident and cleanup status | [`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md) |
| Environment rebuild, what is missing, and what the backup actually holds | [`migration/WSL_SANDBOX.md`](migration/WSL_SANDBOX.md) |
| Running the dashboard and server locally without the missing credentials | [`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md) |
| Gilligan release decisions and research | [`migration/GILLIGAN_PRODUCT_DIRECTION.md`](migration/GILLIGAN_PRODUCT_DIRECTION.md) |
| Gilligan architecture and roadmap | [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md) |
| How the built system works | [`SPECS.md`](SPECS.md) |
| Phases, gates, decision log | [`timeline.md`](timeline.md) |
| Eval plan, phase state, chunk-id stability | [`EVAL_REBUILD.md`](EVAL_REBUILD.md) |
| Corpus expansion targets (not the restore) | [`CORPUS_SOURCING_BRIEF.md`](CORPUS_SOURCING_BRIEF.md) |
| Advice allowlist reasoning (now the catalogue) | [`RESPONSIBILITY.md`](RESPONSIBILITY.md) |
| Answers owed by stakeholders | [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md) |
| Coding conventions | [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md) |
| House rules for agents | [`../CLAUDE.md`](../CLAUDE.md), [`../AGENTS.md`](../AGENTS.md), `.claude/skills/` |
| Archived docs, including past handoffs | [`ARCHIVED.md`](ARCHIVED.md) |
