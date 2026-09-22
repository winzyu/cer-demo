# Status

Current state and next steps only.
Rewritten at the end of every session by `/handoff`; history is `git log -p docs/STATUS.md`.
Never cite this file from code or other docs: the reasoning lives in the docs under "Where things live".

Updated 2026-09-21 at commit `66242f3` (Gilligan R3: the upstream relay and the rebuilt page; other workstream notes keep their original verification dates).

## Start here

- **Environment rebuild — done.** The corpus is back, ingest reproduces it byte-for-byte, and the secrets are in. `npm ci`, typecheck, lint, `evalFixtures` + `frontendAuth` units, `npm run ingest` and a boot on 8010 all pass; `/health` returns `status: ok` with both checks true. `FIREWORKS_API_KEY` was validated against `/v1/models` (HTTP 200, `gpt-oss-120b` listed). Per-item state: [`migration/WSL_SANDBOX.md`](migration/WSL_SANDBOX.md) §4. Retrieval is now configured: `DEFAULT_RETRIEVAL=hybrid-slice-vector` with `CORPUS_SOURCE=artifact`, and `data/embeddings/cache.json` is built (7.1 MB, git-ignored).
- **Eval (claim inventory) - done.** All 12 dead `epa-sop-field-instrument-calibration-2010.pdf` chunk ids are re-resolved and **446/446 claim chunk ids now resolve**. One claim is flagged rather than changed (the user's item 11). Next: regenerate `eval/retrieval-labels/`, which still carries the old ids (Claude's item 1). Reasoning: [`EVAL_REBUILD.md`](EVAL_REBUILD.md) §"What is safe to change later".
- **Eval (Phase 1d, in progress and not this session's work)**: an agent verification of the 45 fixtures against the restored corpus is part-finished in `eval/reviews/wave1-agent-2026-09-21/`. Its `manifest.json` `corpus_sha256` matches `data/corpus/corpus.json` exactly. **5 of 9 batch reports exist (1-4 and 6); batches 5, 7, 8 and 9 are missing**, so 25 of 45 fixtures are covered — the refusal class (batch 9) and the three new `precedence` fixtures (batch 8) are among the unreviewed. Establish ownership before touching it.
- **Eval (Phase 3 baseline)**: capture the generation baseline on gold context in its own session. Spend approved 2026-09-17; no longer blocked on the corpus, still blocked on the Phase 1d fixture freeze. First step: the Phase 3 row of [`EVAL_REBUILD.md`](EVAL_REBUILD.md). Launch bar (D3): aim for every check; caveat or refuse weak question classes rather than delay the release.
- **Gilligan release (September 30), 9 days left. R3 is done; R1 and R2 have not started.** Read [`migration/GILLIGAN_PRODUCT_DIRECTION.md`](migration/GILLIGAN_PRODUCT_DIRECTION.md) then [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md). R3 was never the critical path: that is supervisor catalogue approval by Sep 25 and upstream IAM by Sep 28, and neither has moved. Next: step R1, the service contract in this repo (`/gilligan/answer`, cer-api identity check, report bytes, Firestore usage store, concurrency limiter) — `GET /api/v1/usage` and the history mapping already exist from R3. Confirm with the user before starting implementation.
- **Gilligan R3 — done 2026-09-21, verified end to end, nothing pushed.** The upstream server relays to this service behind `GILLIGAN_BACKEND=rag`; the dashboard page is rebuilt with markdown, citation chips, sources, a pod picker and the usage count; the report route is the one item deferred, to R1 (D8). Detail: [`migration/GILLIGAN_R3_PORT.md`](migration/GILLIGAN_R3_PORT.md). **There is no working rollback** (D9) — see the defect table.
- **Upstream repos — cleaned and running locally, 2026-09-21, nothing pushed.** Both checkouts are on branch `local`, cut from `security/remove-payload` (user-dashboard `5dff5fd` off `main` `9ce674b`; clean-earth-rovers-server `693fc96` off `develop` `500ceac`). **`origin` in both points at the live `Clean-Earth-Rovers-Technology` repositories**; it is only the `local` branch that has no upstream tracking, so `git push -u origin local` would publish straight into the org's infected repository. Upstream HEAD and every branch in the incident record are still infected and nothing may be pushed without explicit consent ([`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md)). Dashboard `:3000` and server `:5001` now run with no Firestore, Stripe, Gemini, OpenAI or nodemailer credentials: a dev-only passthrough forwards everything outside `DEV_LOCAL_PATHS` to the deployed cer-api, verified returning the same 5 pods directly and through the dashboard ([`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md)). Both checkouts now also carry the uncommitted R3 work; see "Working tree".
- **Catalogue (replaces the advice allowlist)**: a supervisor-approved, versioned catalogue built from source-of-truth v2 and the usable `docs/advice/` drafts, shared by chat and reports (architecture doc §2d). Waits on supervisor items 17-20.
- **Pod-scope/auth**: committed earlier; re-check code before continuing.

## Last session

- Built roadmap R3: the upstream relay behind `GILLIGAN_BACKEND` (defaulting to `gemini`, so it is inert when merged), history mapping with the `assistant: "cer-rag"` marker (D2), the `audit` field (D4), and `GET /api/v1/usage` here. The dashboard's Gilligan page is rebuilt: messages held as data, `chatId` tracked so a new chat keeps its history, refusals shown, no typing animation, and the citation quote stripped before markdown runs.
- Verified with all three services running: a question answered in 4.2 s with 4 citations, a follow-up resolved "it" from history in the same chat, the stored chat carried its marker and audit, the allowance moved 20→19→18 while status reads did not move it, 401/400/error passthrough correct, and both real answers leaked no quote text. cer-demo typecheck, lint and 8 new usage tests pass; the server typechecks; `/gilligan` compiles and serves 200.
- Set `DEFAULT_RETRIEVAL=hybrid-slice-vector` (D7) and built `data/embeddings/cache.json`: 446 chunks, ~245,671 embedding tokens. Measured on a dissolved-oxygen question it returns 4 direct documents plus 5 scored USGS chunks, where the direct arm alone reaches only its own 4-document slice.
- Spend: 2 chat questions (17,249 tokens, `gpt-oss-120b`) and the embedding build. No live device reads — `SENSOR_TOOL` was off throughout. Nothing pushed.
- Live-confirmed that production Gilligan fails every question (D9), from a request that proxied to the deployed API and returned `404 models/gemini-pro is not found`.

## Working tree

- Branch `dev`, tracking `origin/dev`, **ahead 7 and unpushed** (3 environment-rebuild commits, the claim re-resolution, the R3 usage endpoint, the local-stack docs, and this handoff). Nothing is pushed; `origin/dev` is still at `05ef730`, the pre-rebuild state.
- Eval claim inventory (earlier session): `eval/claims/epa-sop-field-instrument-calibration-2010.json` and `eval/claims/_STATUS.md`, committed. `docs/EVAL_REBUILD.md` is modified and is the eval workstream's, deliberately untouched here.
- **Upstream repos hold the whole R3 implementation uncommitted, which is the main durability risk.** Both are on `local` with the payload gone and no branch upstream, though `origin` does point at the live org repositories (see "Start here"). `clean-earth-rovers-server`: new `src/services/CerRagService.ts`, `src/services/DevChatStore.ts`, `src/middleware/devUpstreamProxy.ts`; modified `src/controllers/GilliganController.ts`, `src/services/GilliganService.ts`, `src/middleware/auth.ts`, `src/app.ts`. `user-dashboard`: new `src/app/shared/gilligan-citations.js`; modified `src/app/gilligan/page.js`, `src/app/components/gilligan-answer.js`, `src/app/components/gilligan-widget.js`, `src/app/services/gilligan.js`. Both hold git-ignored `.env` files carrying the R3 variables.
- **`eval/reviews/` is not this workstream's** — in-progress agent verification, ownership unestablished.
- Restored and untracked or git-ignored, so mostly invisible to `git status`: `node_modules/`, `.env`, the 8 downloaded corpus PDFs, `documents/_excluded/water-quality-metrics-source-of-truth.pdf` (from tag `corpus-archive-2026-09-13`), `.ocr_cache/`, `data/corpus/`, `water-quality-source-of-truth-v2.pdf` at the repo root, `eval/fixtures-wave1/_EXIT_CRITERIA.md` (the **46 / 92** version — the file the user's item 4 updates), `eval/grading/phase-1d-wave1-fixture-review.html`.
- `*.swp` and `.env.bak*` are **not git-ignored**, and either can hold the secrets verbatim. A vim swap of `.env` appeared once and was cleaned up on editor exit, and an `.env.bak-r3` was created and deleted on 2026-09-21; nothing leaked either time, but the gap is real. Add both patterns to `.gitignore`.
- `data/embeddings/cache.json` now exists (7.1 MB, git-ignored, so it does not survive a clone). Still missing: `data/retrieval-eval/`, `data/device-fields/`, `data/backend-surface/`, `serviceAccountKey.json`. See [`migration/WSL_SANDBOX.md`](migration/WSL_SANDBOX.md) §4.

## Open work

### Stakeholders

Tracked in [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md).
Release-critical: supervisor items 17-20 (v2 fallback ranges, turbidity exemption, worked examples and customer-facing recommendations, CER referral contacts), needed by about September 25.
Also blocking: item 1, the operator's review of pod alert limits (they drive event detection); item 6, the "configured thresholds" wording.

### The user's

1. Decide whether the R3 work in the two upstream checkouts should be committed on `local`. It is the whole relay and page, uncommitted, and a lost working tree loses it.
2. Confirm whether supervisor items 17-20 were sent; the roadmap R0 date of September 18 has passed.
3. Decide whether the September 30 Gilligan date still holds. R3 is done, but R1 and R2 have not started, R2 cannot start until the supervisor replies, and there is no rollback (D9). On the evidence the date is not reachable without descoping.
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
2. Port the remaining `frontend/` features onto the dashboard page, now that R3 has landed the base. In value order: WS-2 provenance detail (per-tool-call lines, freshness badge, caveat badges, `complete: false`), WS-4 series chart, WS-3 input controls (starter prompts, stop, copy, regenerate), the Wave 2 pod-status bar, and WS-6 error codes. **Blocked on one change first:** the relay keeps only tool-call *names* in `audit` and drops the results, so the data the chart and the detailed provenance need never reaches the browser. Widen `CerRagService.ts` to pass `tool_calls[].result` and `tool_round_cap_reached` through. Inventory: [`CHAT_UX_WORKPLAN.md`](CHAT_UX_WORKPLAN.md); what already landed: [`migration/GILLIGAN_R3_PORT.md`](migration/GILLIGAN_R3_PORT.md).
3. Propose the `.claude/settings.json` deny-path fix separately; the upstream read-only guard points at dead OneDrive paths and currently protects nothing.
4. Rebuild the hidden-payload scanner with a `--fix` mode, in pure Python so it never invokes npm, jest or next. Lost before it was committed.
5. Roadmap R1 and R2 in this repo, once the user confirms implementation may start. Where: `migration/GILLIGAN_TARGET_ARCHITECTURE.md` §3-4.
6. Phase 3 capture in its own session, once the fixture freeze lands; then measure quote quality (`MIN_QUOTE_CHARS` weakness in `src/eval/gates/checks.ts`).
7. Re-measure contamination for the three new `precedence` fixtures (`_EXIT_CRITERIA.md` "Reproducing").
8. Add tool results to transcripts: `TranscriptTurn` has no field for them, so the judge never sees them.
9. Browser check of the citation chip on the rebuilt dashboard page; use the `run-local` skill. The stripping logic was verified against two real captured answers in Node (no marker characters and no quote fragments survive), but nobody has looked at the rendered page while logged in.
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
| `../clean-earth-rovers-server` `GilliganService.askQuestionGemini` | Calls the retired `gemini-pro` model. **Live-confirmed 2026-09-21**: the deployed API returned `404 models/gemini-pro is not found for API version v1beta`, so production Gilligan fails every question today and `GILLIGAN_BACKEND=gemini` is not a rollback (D9). | high |
| `../clean-earth-rovers-server` ESLint | The TypeScript parser is not configured, so `npm run lint` there reports "Parsing error" on every file including untouched ones and checks nothing. `tsc --noEmit` is the only working gate. | medium |
| `src/retrieval/adapters/DirectFeedAdapter.ts:16`, `frontend/js/citations.js` | Two naming/cosmetic defects found during R3 and recorded in full in [`migration/GILLIGAN_R3_PORT.md`](migration/GILLIGAN_R3_PORT.md): the direct-feed arm registers under the key `firestore-direct`, and a marker closing `}]` leaves a stray `]` (quote still stripped). | low |
| `../clean-earth-rovers-server` `turbVoltToNTU.ts` | Returns 0 NTU for a missing voltage and for the offline sentinel, same as clear water. | medium |
| `../clean-earth-rovers-server` `src/routes/userRoutes.ts` | `UserController` is constructed at module import, which constructs `EmailService`, whose constructor throws without `NODEMAILER_APP_EMAIL` and `NODEMAILER_APP_PASSWORD`. The whole server fails to boot over credentials only the password-reset mail path needs; `PaymentService` does the same with `STRIPE_SECRET_KEY`. Found 2026-09-21 setting up the local stack. | medium |
| device registry | No sensor-model field, so quantitative and qualitative-only turbidity sensors cannot be told apart. Not needed for the release (turbidity stays qualitative). | low |

## Active traps

- **The two upstream CER repositories carry malware at HEAD on every branch.** It runs on `next dev`, `next build` and `npm test`. The local checkouts are on the clean `local` branch as of 2026-09-21, but their own `main` / `develop` still carry the payload, so switching back to those branches reinfects the working tree. Check with `grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .` after any clone, fetch, pull or branch switch, and read upstream code with `git show origin/develop:<path>` rather than trusting a working tree. cer-demo is clean.
- **An empty env var is not an unset one with a safe default — it silently takes `readString`'s fallback.** `DEFAULT_RETRIEVAL=` gives `stub`, whose three `[STUB CONTEXT]` chunks are deliberately recognizable but are not the corpus.
- **Both servers read their `.env` at boot only, and `ts-node-dev` watches source, not `.env`.** A server left running across an env edit silently keeps the old config: on 2026-09-21 that sent Gilligan questions to the deployed API while the relay appeared to be misbehaving. Restart after any env change, and compare process start time to the file's mtime before believing a symptom. Relatedly, `hybrid-slice-vector` needs the git-ignored `data/embeddings/cache.json`, so a fresh clone or worktree fails every request until the paid `npm run embed:cache` runs.
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

- **Gilligan**: [`migration/GILLIGAN_PRODUCT_DIRECTION.md`](migration/GILLIGAN_PRODUCT_DIRECTION.md) (decisions and research), [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md) (architecture, roadmap, decisions D1-D9), [`migration/GILLIGAN_R3_PORT.md`](migration/GILLIGAN_R3_PORT.md) (the relay and the rebuilt page).
- **Environment**: [`migration/WSL_SANDBOX.md`](migration/WSL_SANDBOX.md) (rebuild and what is missing), [`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md) (running dashboard and server locally), [`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md) (malware cleanup).
- **Behaviour and decisions**: [`SPECS.md`](SPECS.md) (how the built system works), [`timeline.md`](timeline.md) (phases, gates, decision log), [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md) (coding conventions).
- **Evaluation and corpus**: [`EVAL_REBUILD.md`](EVAL_REBUILD.md) (plan, phase state, chunk-id stability), [`CORPUS_SOURCING_BRIEF.md`](CORPUS_SOURCING_BRIEF.md) (expansion targets, not the restore), [`RESPONSIBILITY.md`](RESPONSIBILITY.md) (advice reasoning, now the catalogue).
- **People and history**: [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md) (answers owed), [`ARCHIVED.md`](ARCHIVED.md) (archived docs and past handoffs), house rules in [`../CLAUDE.md`](../CLAUDE.md), [`../AGENTS.md`](../AGENTS.md) and `.claude/skills/`.
