# Status

Current state and next steps only.
Rewritten at the end of every session by `/handoff`; history is `git log -p docs/STATUS.md`.
Never cite this file from code or other docs: the reasoning lives in the docs under "Where things live".

Updated 2026-09-22 at commit `d290472` (Gilligan: the tool-access fix; other workstream notes keep their original verification dates).

## Start here

- **Gilligan release (September 30), 8 days left. R3 and the tool-access fix are done; R1 and R2 have not started.** Read [`migration/GILLIGAN_PRODUCT_DIRECTION.md`](migration/GILLIGAN_PRODUCT_DIRECTION.md) then [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md). The critical path is unchanged and still has not moved: supervisor catalogue approval by Sep 25 and upstream IAM by Sep 28. On the evidence the date is not reachable without descoping. **Three tasks are queued for their own sessions** - turbidity, reports, chatbot next steps; see "Next conversations" below, each with its own starting prompt.
- **Gilligan tool access - fixed and verified live 2026-09-22, nothing pushed.** The assistant had no tools at all (`SENSOR_TOOL=false`), so every question about a reading refused; R3 missed it by verifying with the flag off. Added `list_pods`, carved greetings out of the refusal rule, and settled D10. All three of the user's failing questions now answer. Detail: [`migration/GILLIGAN_TOOL_ACCESS.md`](migration/GILLIGAN_TOOL_ACCESS.md). **`cer-demo/.env` still carries `SENSOR_TOOL=false`** - D10 records that the release runs it `true`, but flipping the local file arms live production reads on every boot, so it is the user's item 1.
- **Environment rebuild - done.** Corpus restored and byte-reproducible, secrets in, `/health` ok. `DEFAULT_RETRIEVAL=hybrid-slice-vector` with `CORPUS_SOURCE=artifact`, and `data/embeddings/cache.json` is built (7.1 MB, git-ignored). Per-item state: [`migration/WSL_SANDBOX.md`](migration/WSL_SANDBOX.md) §4.
- **Eval - claim inventory done; Phase 1d verification complete and committed** at `c41ffb5`. 446/446 claim chunk ids resolve, one claim flagged rather than changed (the user's item 6); all 9 batch reports exist and `verdicts.json` covers all 45 fixtures, with `manifest.json` `corpus_sha256` matching `data/corpus/corpus.json`. Not this workstream's. Next: regenerate `eval/retrieval-labels/`, which still carries the old ids (Claude's item 1); applying the EDIT verdicts is the user's item 4.
- **Eval (Phase 3 baseline)**: capture on gold context in its own session. Spend approved 2026-09-17; still blocked on the Phase 1d fixture freeze. **The 2026-09-22 prompt edit invalidates any capture made before it** - land prompt changes before a capture, never after.
- **Upstream repos - cleaned and running locally, nothing pushed.** Both on branch `local`, cut from `security/remove-payload`. **`origin` in both points at the live `Clean-Earth-Rovers-Technology` repositories**, so `git push -u origin local` would publish into the org's infected repository ([`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md)). Dashboard `:3000` and server `:5001` run credential-free via a dev-only passthrough ([`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md)), and both were still up at the end of this session.
- **Catalogue (replaces the advice allowlist)**: a supervisor-approved, versioned catalogue built from source-of-truth v2 and the usable `docs/advice/` drafts, shared by chat and reports (architecture doc §2d). Waits on supervisor items 17-20.

## Next conversations

Three independent tasks, written to be handed to separate sessions. None blocks another.

- **Task A - Turbidity information. Needs an interview with the user first.** Everything the system says about turbidity flows from one place, and nobody has confirmed it is right: `TURBIDITY_BAND_EDGES` and the voltage conversion in `src/report/referenceRanges.ts` feed `get_turbidity_info`, the report's clarity bands and the prompt's "provisional, uncalibrated index" framing. Open questions the agent must put to the user before editing anything: which bands are current, whether the v2 turbidity exemption (supervisor item 18) changes them, what a 0 index should be reported as given `turbVoltToNTU.ts` returns 0 for a missing voltage and for the offline sentinel alike, and whether any pod has quantitative hardware (there is no sensor-model field to tell). A live read on 2026-09-22 returned 14 days of all-zero turbidity on a reporting pod, which is exactly the ambiguity this task has to resolve. Start with: `Read docs/STATUS.md, then work Task A, turbidity information - interview me before changing anything.`
- **Task B - Report integration.** `REPORT_TOOL` is off and `generate_report` is not reachable from Gilligan at all. R3 deferred the report route (D8) because reports are written to disk behind a bearer-token-hash sidecar that R1 replaces with bytes returned in the response; two recorded defects are about that sidecar. The work is R1's report half plus the upstream relay route, and it should land before `REPORT_TOOL` is turned on. Three report-model defects are in the table below and are worth fixing in the same pass: the two classifications that can never fire, the sewage rule's water-type error, and the missing diel/tidal classifier. Where: [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md) §3-4. Start with: `Read docs/STATUS.md, then work Task B, report integration.`
- **Task C - Chatbot next steps.** The assistant answers now, so the next gains are provenance and quality. In value order: widen `CerRagService.ts` to pass `tool_calls[].result` and `tool_round_cap_reached` through (everything else is blocked on it, because the relay keeps only tool-call *names*), then WS-2 provenance detail, WS-4 series chart, WS-3 input controls, the Wave 2 pod-status bar, WS-6 error codes. The citation-placement defect below belongs to this task: the model cited a tool-derived claim with a non-supporting quote, and the prompt already forbids exactly that, so the question is why the rule was ignored. Inventory: [`CHAT_UX_WORKPLAN.md`](CHAT_UX_WORKPLAN.md); what landed: [`migration/GILLIGAN_R3_PORT.md`](migration/GILLIGAN_R3_PORT.md), [`migration/GILLIGAN_TOOL_ACCESS.md`](migration/GILLIGAN_TOOL_ACCESS.md). Start with: `Read docs/STATUS.md, then work Task C, chatbot next steps.`

## Last session

- Diagnosed the user's three-refusal session: the model had no tools, because `SENSOR_TOOL`/`REPORT_TOOL` gate the prompt block, the `tools` array and the registry together, and both were off.
- Added `list_pods` (caller-scoped fleet, best-effort freshness, 20-pod probe cap), two routing rules, and a greeting/capability carve-out that stops the refusal sentence firing on messages that ask nothing; refusals now also name the closest thing the system can do, which the wave-1 rubrics already required.
- Verified offline (typecheck, lint, 47 tests in the two changed suites, 95 in three adjacent ones) and live: all three questions answer, the turbidity answer matches its tool result field for field, and the same question through the relay at `:5001` records `"toolCalls": ["list_pods"]` in its `audit`, which confirms the caller's token reaches the device API.
- Settled D10 and recorded it in `timeline.md`; wrote `migration/GILLIGAN_TOOL_ACCESS.md`; updated `SPECS.md` §10.2 and §10.3a.
- Spend: 4 chat questions, 106,158 tokens (`gpt-oss-120b`), plus live production device reads against the account's own pods. No writes. Nothing pushed.

## Working tree

- Branch `dev`, tracking `origin/dev`, **ahead 4 and unpushed**. `origin/dev` is now at `c41ffb5`: the earlier backlog **has been pushed** to `git@github.com:winzyu/cer-demo.git` (this repo's own remote, not the org's), which the previous STATUS predated. The unpushed commits are this session's, all merged into `dev`, so no Gilligan change is left uncommitted here.
- Eval workstream, not this one: `docs/EVAL_REBUILD.md` is modified and deliberately untouched; `eval/fixtures-wave1/_EXIT_CRITERIA.md`, `eval/grading/` and `water-quality-source-of-truth-v2.pdf` are untracked. Two worktrees belong to other sessions: `.claude/worktrees/eval-claims-reresolve` and `.claude/worktrees/wave1-corrections`.
- **Upstream repos hold the whole R3 implementation uncommitted, which is the main durability risk.** `clean-earth-rovers-server`: new `src/services/CerRagService.ts`, `src/services/DevChatStore.ts`, `src/middleware/devUpstreamProxy.ts`; modified `src/controllers/GilliganController.ts`, `src/services/GilliganService.ts`, `src/middleware/auth.ts`, `src/app.ts`. `user-dashboard`: new `src/app/shared/gilligan-citations.js`; modified `src/app/gilligan/page.js`, `src/app/components/gilligan-answer.js`, `src/app/components/gilligan-widget.js`, `src/app/services/gilligan.js`. Both hold git-ignored `.env` files carrying the R3 variables.
- Restored and untracked or git-ignored, so invisible to `git status`: `node_modules/`, `.env`, the 8 downloaded corpus PDFs, `documents/_excluded/water-quality-metrics-source-of-truth.pdf`, `.ocr_cache/`, `data/corpus/`, `data/embeddings/cache.json` (7.1 MB). Still missing: `data/retrieval-eval/`, `data/device-fields/`, `data/backend-surface/`, `serviceAccountKey.json` ([`migration/WSL_SANDBOX.md`](migration/WSL_SANDBOX.md) §4).
- `*.swp` and `.env.bak*` are **not git-ignored** and either can hold the secrets verbatim. Add both patterns to `.gitignore`.

## Open work

### Stakeholders

Tracked in [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md). Release-critical: supervisor items 17-20 (v2 fallback ranges, turbidity exemption, worked examples and customer-facing recommendations, CER referral contacts), needed by about September 25.
Also blocking: item 1, the operator's review of pod alert limits (they drive event detection); item 6, the "configured thresholds" wording.

### The user's

1. Decide whether `cer-demo/.env` should set `SENSOR_TOOL=true` now, per D10. Until it does, a local boot still has no tools.
2. Decide whether the R3 work in the two upstream checkouts should be committed on `local`. It is the whole relay and page, uncommitted, and a lost working tree loses it.
3. Confirm whether supervisor items 17-20 were sent; the roadmap R0 date of September 18 has passed.
4. Phase 1d: apply the review's EDIT verdicts on the 45 / 90 set, then update `_EXIT_CRITERIA.md` to 45 / 90 and 3 `precedence` fixtures. The restored sheet describes the superseded 46 / 92 set. Blocks: Phase 3.
5. Decide whether the September 30 date still holds. R1 and R2 have not started, R2 cannot start until the supervisor replies, and there is no rollback (D9).
6. Decide `epa-oxygen-solubility-chart-01` (chunk index 9): the +86-char re-OCR moved its quoted chart header row into chunk index 10, whose `locator` already describes that chart block. Re-parent to chunk 10 (recommended) or re-quote from what chunk 9 still holds. It is the only claim failing the verbatim-quote invariant.
7. Confirm the Fireworks account has a payment method; a third-party source says accounts without one are held to 10 requests per minute.
8. Approve `npm run seed:firestore` (writes Firestore; the collection still holds the removed document). Blocks: any `CORPUS_SOURCE=firestore` capture.
9. Decide the slice-coverage overshoot before wave 2 spends budget (defects below).
10. Choose the `ADVICE_TIER` test design, if the catalogue keeps tiers: append-only tier blocks (recommended) or a pinned prompt per tier.
11. Check whether the malware ever ran on a build machine (Cloud Build, App Engine); a `next build` there would trigger it.

### Claude's

1. Regenerate `eval/retrieval-labels/` with `scripts/resolveRetrievalLabels.ts`: 5 label files still carry 30 old `epa-sop` chunk ids. It does not delete stale label files, so sweep for leftovers. The old ids in `eval/transcripts/warm/gold-context/` (30) and `data/results/judge/warm.*` (6) are historical captures and must keep them.
2. Tasks A, B and C above, each in its own session.
3. Propose the `.claude/settings.json` deny-path fix separately; the upstream read-only guard points at dead OneDrive paths and currently protects nothing.
4. Rebuild the hidden-payload scanner with a `--fix` mode, in pure Python so it never invokes npm, jest or next. Lost before it was committed.
5. Phase 3 capture in its own session, once the fixture freeze lands; then measure quote quality (`MIN_QUOTE_CHARS` weakness in `src/eval/gates/checks.ts`), and re-measure contamination for the three new `precedence` fixtures (`_EXIT_CRITERIA.md` "Reproducing").
6. Add tool results to transcripts: `TranscriptTurn` has no field for them, so the judge never sees them.
7. Browser check of the citation chip on the rebuilt dashboard page; use the `run-local` skill. The stripping logic is verified in Node against three real answers, but nobody has looked at the rendered page while logged in.
8. Phase 1e remainder: per-turn label splits, candidate sweep, hard negatives, grade differentiation. Blocks Phase 4, not Phase 3.

## Unfixed defects

Reported 2026-09-10 to 2026-09-22; the `events.ts` rows re-checked 2026-09-17.

| where | defect | severity |
|---|---|---|
| `src/prompt/systemPrompt.ts` + model behaviour | A citation marker was attached to a claim sourced from a **tool result**, with a quote that does not support it. The prompt already forbids this in as many words, so the fix is not another rule: the existing one was ignored. Seen 2026-09-22 on a live turbidity answer. Belongs to Task C. | medium |
| `frontend/js/citations.js:23` | `MARKER_PATTERN` accepts `}` as a marker closer, so the `"}】` variant renders a doubled `【5】】`. The quote text is stripped correctly and does **not** leak. Same shared pattern as the recorded `}]` defect, and the dashboard's `gilligan-citations.js` copies it. | low |
| `src/report/events.ts:221,263` | `Saltwater intrusion` (0.45) and `Industrial` (0.3) classify below `CONFIDENCE_FLOOR` (0.5), so they are always rewritten to `Inconclusive` and can never appear. | medium |
| `src/report/events.ts` | The sewage rule ignores water type: it scores highest when conductivity rises (v2's freshwater signature), while v2's marine signature has conductivity falling (v2 §6.2-6.3). | medium |
| `src/report/buildReportInput.ts` | No diel/tidal classifier: every live parameter is tagged `pattern: "unknown"`, which disables `detectAlgalBloom` on live data and the skip that stops normal daily swings opening event windows. Relatedly `events.ts` has no `Pattern` value for a slow multi-week trend, such as drought-driven salinity creep. | high |
| `src/report/reportOwnership.ts` | Report PDF access is bound to an exact bearer-token hash, not a verified identity; replaced by returned bytes in R1. | medium |
| `src/quota/InMemoryQuotaStore.ts` | Quotas live in process memory: reset on redeploy and multiplied per instance; replaced by a Firestore store in R1. | medium |
| `eval/fixtures-wave1/` | Slice-coverage overshoot: 88% of answerable turns sit outside the ◆G9 slice, so Phase 4 conclusions only hold for manual-heavy questions. | medium |
| `documents/README.md` | The per-document **chunk** column does not reproduce and does not sum to its own stated total (388 against 446). The char column is exact. Verify a restore on chars, not chunks. | low |
| `src/controllers/HealthController.ts:18` | `fireworksConfigured` and `firestoreProjectConfigured` are a plain `Boolean()` on the value, so any non-empty string passes. `/health` cannot tell a real credential from a placeholder. | low |
| `src/retrieval/adapters/DirectFeedAdapter.ts:16` | The direct-feed arm registers under the key `firestore-direct`, so `DEFAULT_RETRIEVAL=direct-feed` crashes the first request. | low |
| `../clean-earth-rovers-server` `WaterAnalyticsService.findPeriodWaterData` | Explicit device filters are not checked against membership (`migration/SECURITY_FINDINGS.md` §1); upstream fix, tracked in the architecture doc. | high |
| `../clean-earth-rovers-server` `GilliganService.askQuestionGemini` | Calls the retired `gemini-pro` model. **Live-confirmed 2026-09-21**: the deployed API returned `404 models/gemini-pro is not found`, so production Gilligan fails every question today and `GILLIGAN_BACKEND=gemini` is not a rollback (D9). | high |
| `../clean-earth-rovers-server` ESLint | The TypeScript parser is not configured, so `npm run lint` there reports "Parsing error" on every file. `tsc --noEmit` is the only working gate. | medium |
| `../clean-earth-rovers-server` `turbVoltToNTU.ts` | Returns 0 NTU for a missing voltage and for the offline sentinel, same as clear water. Belongs to Task A. | medium |
| `../clean-earth-rovers-server` `src/routes/userRoutes.ts` | `UserController` is constructed at module import, which constructs `EmailService`, whose constructor throws without the nodemailer credentials. The whole server fails to boot over credentials only the password-reset path needs; `PaymentService` does the same with `STRIPE_SECRET_KEY`. | medium |
| device registry | No sensor-model field, so quantitative and qualitative-only turbidity sensors cannot be told apart. Belongs to Task A. | low |

## Active traps

- **The two upstream CER repositories carry malware at HEAD on every branch.** It runs on `next dev`, `next build` and `npm test`. The local checkouts are on the clean `local` branch, but their own `main` / `develop` still carry the payload, so switching back reinfects the working tree. Check with `grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .` after any clone, fetch, pull or branch switch, and read upstream code with `git show origin/develop:<path>`. cer-demo is clean.
- **`SENSOR_TOOL` now matters in both directions.** Off, the assistant has no tools and refuses every reading question. On, every such question is a live production device read. Captures need it explicitly `false` on **both** server and runner - never rely on the default, and never on `.env`.
- **Both servers read their `.env` at boot only, and `ts-node-dev` watches source, not `.env`.** Restart after any env change, and compare process start time to the file's mtime before believing a symptom. An **empty** env var is not an unset one with a safe default - it silently takes `readString`'s fallback, and `DEFAULT_RETRIEVAL=` gives `stub`, whose three `[STUB CONTEXT]` chunks are not the corpus. `hybrid-slice-vector` also needs the git-ignored `data/embeddings/cache.json`, so a fresh clone or worktree fails every request until the paid `npm run embed:cache` runs.
- A fresh worktree has no `node_modules`, `.env` or `data/` caches; link them per the `run-local` skill's worktree reference. `EnterWorktree` cuts from `origin/main`, which is far behind `dev`, so reset the new branch onto `dev` first.
- `.ocr_cache/` is tesseract 4.1.1 output, not the original 5.3.4, and the original OCR text is unrecoverable. **Any re-ingest from a different tesseract build moves those 12 chunk ids again**, and re-chunking voids every label. `scripts/resolveRetrievalLabels.ts` does not delete stale label files, and any `-NN`-shaped token in fixture `notes` is read as a claim id.
- Anything dropped into `documents/` is ingested whether or not it is in `DOC_META`. Keep `water-quality-source-of-truth-v2.pdf` at the repo root; in `documents/` it would silently become a 15th corpus document carrying vetoed operator ranges.
- `.claude/settings.json` deny rules point at the old OneDrive paths and match nothing, so the upstream read-only guard is currently inert.
- Fireworks documents no free tier for `gpt-oss-120b`; budget and rate limits assume a paid account.
- Run jest suites one at a time with `--runInBand`; parallel runs on this filesystem get killed for memory. Use port 8010; never kill 8000. `:5001` and `:3000` are the upstream server and dashboard and were left running.
- The configured device token sees 5 pods (the August census saw 15); tokens are scoped to one organization, and the JWT carries **no `exp` claim**, so it never expires on its own.
- Nothing is deployed; all testing is local.

## Where things live

- **Gilligan**: [`migration/GILLIGAN_PRODUCT_DIRECTION.md`](migration/GILLIGAN_PRODUCT_DIRECTION.md) (decisions and research), [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md) (architecture, roadmap, decisions D1-D10), [`migration/GILLIGAN_R3_PORT.md`](migration/GILLIGAN_R3_PORT.md) (the relay and the rebuilt page), [`migration/GILLIGAN_TOOL_ACCESS.md`](migration/GILLIGAN_TOOL_ACCESS.md) (tool access and refusal quality).
- **Environment**: [`migration/WSL_SANDBOX.md`](migration/WSL_SANDBOX.md) (rebuild and what is missing), [`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md) (running dashboard and server locally), [`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md) (malware cleanup).
- **Behaviour and decisions**: [`SPECS.md`](SPECS.md) (how the built system works), [`timeline.md`](timeline.md) (phases, gates, decision log), [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md) (coding conventions).
- **Evaluation and corpus**: [`EVAL_REBUILD.md`](EVAL_REBUILD.md) (plan, phase state, chunk-id stability), [`CORPUS_SOURCING_BRIEF.md`](CORPUS_SOURCING_BRIEF.md) (expansion targets), [`RESPONSIBILITY.md`](RESPONSIBILITY.md) (advice reasoning, now the catalogue).
- **People and history**: [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md) (answers owed), [`ARCHIVED.md`](ARCHIVED.md) (archived docs and past handoffs), house rules in [`../CLAUDE.md`](../CLAUDE.md), [`../AGENTS.md`](../AGENTS.md) and `.claude/skills/`.
