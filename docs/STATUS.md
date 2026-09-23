# Status

Current state and next steps only.
Rewritten at the end of every session by `/handoff`; history is `git log -p docs/STATUS.md`.
Never cite this file from code or other docs: the reasoning lives in the docs under "Where things live".

Updated 2026-09-23 for the Task B (report integration) handoff at `dev` commit `703804d`; other workstream notes retain their verification dates.

## Start here

- **Gilligan release (September 30), 7 days left. R3, the tool-access fix and R1's report half are done; R2's code is built but its content is unapproved; the rest of R1 has not started.** Read [`migration/GILLIGAN_PRODUCT_DIRECTION.md`](migration/GILLIGAN_PRODUCT_DIRECTION.md) then [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md). The critical path is unchanged and still has not moved: supervisor catalogue approval by Sep 25 and upstream IAM by Sep 28. On the evidence the date is not reachable without descoping. **Two tasks are queued for their own sessions** - turbidity and chatbot next steps; see "Next conversations" below, each with its own starting prompt.
- **Reports (Task B) - done, merged and pushed 2026-09-22 (`dev` `f6e5266`).** `POST /api/v1/reports` returns the PDF, reports have their own quota, the upstream relay and the dashboard's download button are committed on `local`, and the release runs `REPORT_TOOL=true` (D10 revised). Parameters are tagged diel/tidal/trend, and the chat request's pod now reaches the model. Verified live end to end through the relay, except in a browser: the user's check is [`migration/REPORT_BROWSER_CHECK.md`](migration/REPORT_BROWSER_CHECK.md). Detail: `SPECS.md` §10.7, [`timeline.md`](timeline.md) decision log.
- **Gilligan tool access - fixed and verified live 2026-09-22.** The assistant had no tools at all (`SENSOR_TOOL=false`), so every question about a reading refused; R3 missed it by verifying with the flag off. Added `list_pods`, carved greetings out of the refusal rule, and settled D10. All three of the user's failing questions now answer. Detail: [`migration/GILLIGAN_TOOL_ACCESS.md`](migration/GILLIGAN_TOOL_ACCESS.md). `cer-demo/.env` now sets `SENSOR_TOOL=true` and `REPORT_TOOL=true`, so every local boot answers reading questions with live production reads.
- **Environment rebuild - done.** Corpus restored and byte-reproducible, secrets in, `/health` ok. `DEFAULT_RETRIEVAL=hybrid-slice-vector` with `CORPUS_SOURCE=artifact`, and `data/embeddings/cache.json` is built (7.1 MB, git-ignored). Per-item state: [`migration/WSL_SANDBOX.md`](migration/WSL_SANDBOX.md) §4.
- **Eval - corrections implemented, not human-approved:** `eval/wave1-corrections` holds 35 corrected fixtures, 45 regenerated labels and the refusal/context contract fixes; read its `eval/reviews/wave1-corrections-2026-09-22/HANDOFF.md`, then reconcile the prompt and tests with current `dev` before landing.
- **Eval (Phase 3 baseline)**: capture on gold context in its own session. Spend approved 2026-09-17; still blocked on the Phase 1d fixture freeze. **The 2026-09-22 prompt edit invalidates any capture made before it** - land prompt changes before a capture, never after.
- **Upstream repos - cleaned and running locally, nothing pushed.** Both on branch `local`, cut from `security/remove-payload`. **`origin` in both points at the live `Clean-Earth-Rovers-Technology` repositories**, so `git push -u origin local` would publish into the org's infected repository ([`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md)). Dashboard `:3000` and server `:5001` run credential-free via a dev-only passthrough ([`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md)); nothing was left running at the end of the Task B session.
- **Catalogue (R2) - built, recovered and merged 2026-09-22; approval pending.** Built on 2026-09-17, it was lost in the wipe because it was never pushed, then rebuilt from the transcripts (tag `old-machine-recovery-2026-09-19`, `ARCHIVED.md`). `src/catalogue/catalogue.json` is version `2026-09-19.1`: 38 entries and 5 referrals, all still drafts. It is wired into reports and, behind `CATALOGUE_PROMPT` (default off), into the chat prompt; `SPECS.md` §4b. Nothing reaches a customer until the supervisor approves entries: items 17-20, sent 2026-09-19 as `migration/SUPERVISOR_QUESTIONS_SEND.md` with `docs/catalogue/review.html`, and still unanswered. The two turbidity vendor transcriptions came back too, in `documents/_excluded/`, outside ingest until the Phase 1d freeze.

## Next conversations

Two independent tasks, written to be handed to separate sessions. Neither blocks the other.

- **Task A - Turbidity information. Needs an interview with the user first.** Everything the system says about turbidity flows from one place, and nobody has confirmed it is right: `TURBIDITY_BAND_EDGES` and the voltage conversion in `src/report/referenceRanges.ts` feed `get_turbidity_info`, the report's clarity bands and the prompt's "provisional, uncalibrated index" framing. Open questions the agent must put to the user before editing anything: which bands are current, whether the v2 turbidity exemption (supervisor item 18) changes them, what a 0 index should be reported as given `turbVoltToNTU.ts` returns 0 for a missing voltage and for the offline sentinel alike, and whether any pod has quantitative hardware (there is no sensor-model field to tell). Also settle stakeholder item 14: the dashboard's dial page uses 350/800 as band edges, the report uses 345/795, so a 347 reading is Clear on the dial and Moderate in a report. The two vendor datasheets are in `documents/_excluded/`, not ingested. A live read on 2026-09-22 returned 14 days of all-zero turbidity on a reporting pod, which is exactly the ambiguity this task has to resolve. Start with: `Read docs/STATUS.md, then work Task A, turbidity information - interview me before changing anything.`
- **Task C - Chatbot next steps.** The assistant answers now, so the next gains are provenance and quality. In value order: widen `CerRagService.ts` to pass `tool_calls[].result` and `tool_round_cap_reached` through (everything else is blocked on it, because the relay keeps only tool-call *names*), then WS-2 provenance detail, WS-4 series chart, WS-3 input controls, the Wave 2 pod-status bar, WS-6 error codes. The citation-placement defect below belongs to this task: the model cited a tool-derived claim with a non-supporting quote, and the prompt already forbids exactly that, so the question is why the rule was ignored. Two more live forms of it, `【】` and `【?】` on report answers, are recorded with preferred fixes under Wave 2 in `CHAT_UX_WORKPLAN.md`; do not simply hide them. Inventory: [`CHAT_UX_WORKPLAN.md`](CHAT_UX_WORKPLAN.md); what landed: [`migration/GILLIGAN_R3_PORT.md`](migration/GILLIGAN_R3_PORT.md), [`migration/GILLIGAN_TOOL_ACCESS.md`](migration/GILLIGAN_TOOL_ACCESS.md). Start with: `Read docs/STATUS.md, then work Task C, chatbot next steps.`

## Last session

- Task B landed: reports render into the response (`POST /api/v1/reports`, upstream `POST /gilligan/report`, dashboard button), with a separate report quota and `Retry-After` relayed.
- Fixed the report model: diel/tidal/trend tags from an hourly series, and the two sub-floor classifications shown as hedged catalogue explanations; saltwater is named only on a marine trend.
- Added the selected-pod message and a deterministic `report_period`; a live re-run answered without asking which pod and with the right year.
- Checks: 17 cer-demo suites (415 tests), typecheck and lint; upstream 11 tests and `tsc`; dashboard ESLint. Spend: three chat questions and about ten read-only live report builds.
- Pushed `dev` to `origin` (`c41ffb5..703804d`); the eval-correction handoff edits were committed with the 2026-09-23 doc audit.

## Working tree

- The Task B handoff edits and a 2026-09-23 doc audit against the code are committed on `dev` (`9b331a8`), followed by the tier-1 doc archive (tags `docs-archive-2026-09-23` and `advice-archive-2026-09-17`, `docs/ARCHIVED.md`).
- `docs/EVAL_REBUILD.md` still carries one uncommitted 23-line block (the 2026-09-21 claim re-resolve note), deliberately left out because that work lives on `worktree-eval-claims-reresolve`.
- Eval corrections are uncommitted in `.claude/worktrees/wave1-corrections` on `eval/wave1-corrections`; main-checkout handoff edits touch `docs/STATUS.md` and append to `docs/EVAL_REBUILD.md`, whose pre-existing 23-line edit is excluded from staging by the prepared patch; `_EXIT_CRITERIA.md`, `eval/grading/` and the root v2 PDF remain untracked and excluded.
- **Upstream repos: R3 and Task B are committed on `local`** (server `d3867ab` then `d87d7f7`, dashboard `3badce7` then `1138c6f`) and not pushed. Task B added the report relay, `Retry-After` in `src/middleware/errorHandler.ts`, and tests under `test/unit/`. The files are: `clean-earth-rovers-server`: new `src/services/CerRagService.ts`, `src/services/DevChatStore.ts`, `src/middleware/devUpstreamProxy.ts`; modified `src/controllers/GilliganController.ts`, `src/services/GilliganService.ts`, `src/middleware/auth.ts`, `src/app.ts`. `user-dashboard`: new `src/app/shared/gilligan-citations.js`; modified `src/app/gilligan/page.js`, `src/app/components/gilligan-answer.js`, `src/app/components/gilligan-widget.js`, `src/app/services/gilligan.js`. Both hold git-ignored `.env` files carrying the R3 variables.
- Restored and untracked or git-ignored, so invisible to `git status`: `node_modules/`, `.env`, the 8 downloaded corpus PDFs, `documents/_excluded/water-quality-metrics-source-of-truth.pdf`, `.ocr_cache/`, `data/corpus/`, `data/embeddings/cache.json` (7.1 MB). Still missing: `data/retrieval-eval/`, `data/device-fields/`, `data/backend-surface/`, `serviceAccountKey.json` ([`migration/WSL_SANDBOX.md`](migration/WSL_SANDBOX.md) §4).
- `*.swp` and `.env.bak*` are **not git-ignored** and either can hold the secrets verbatim. Add both patterns to `.gitignore`.

## Open work

### Stakeholders

Tracked in [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md). Release-critical: supervisor items 17-20 (v2 fallback ranges, turbidity exemption, worked examples and customer-facing recommendations, CER referral contacts), needed by about September 25.
Also blocking: item 1, the operator's review of pod alert limits (they drive event detection); item 6, the "configured thresholds" wording.

### The user's

1. Run the report browser check, [`migration/REPORT_BROWSER_CHECK.md`](migration/REPORT_BROWSER_CHECK.md); its step 10 also covers the citation-chip check.
2. Done: the R3 and Task B work is committed on `local` in both upstream checkouts. It still exists only on this machine, and pushing anywhere needs a destination outside the org's infected repositories.
3. Chase the supervisor: the 38-question email (`migration/SUPERVISOR_QUESTIONS_SEND.md`, which includes items 17-20) was sent 2026-09-19 with a September 21 deadline and has had no reply.
4. `dev` is pushed, including the eval-correction handoff edits; the correction branch still needs its push plan. Then complete prompt integration and Phase 1d human verification before freezing the 45 / 90 set and refreshing the restored exit sheet.
5. Decide whether the September 30 date still holds. Only R1's report half is done, R2's content cannot be approved until the supervisor replies, and there is no rollback (D9).
6. Decide `epa-oxygen-solubility-chart-01` (chunk index 9): the +86-char re-OCR moved its quoted chart header row into chunk index 10, whose `locator` already describes that chart block. Re-parent to chunk 10 (recommended) or re-quote from what chunk 9 still holds. It is the only claim failing the verbatim-quote invariant.
7. Confirm the Fireworks account has a payment method; a third-party source says accounts without one are held to 10 requests per minute.
8. Approve `npm run seed:firestore` (writes Firestore; the collection still holds the removed document). Blocks: any `CORPUS_SOURCE=firestore` capture.
9. Decide the slice-coverage overshoot before wave 2 spends budget (defects below).
10. Choose the `ADVICE_TIER` test design, if the catalogue keeps tiers: append-only tier blocks (recommended) or a pinned prompt per tier.
11. Check whether the malware ever ran on a build machine (Cloud Build, App Engine); a `next build` there would trigger it.

### Claude's

1. Land the reviewed correction branch after reconciling `src/prompt/systemPrompt.ts` and `test/unit/prompt.test.ts` with Gilligan/catalogue changes; regenerated labels already validate there, and historical transcripts/results must remain verbatim.
2. Tasks A and C above, each in its own session.
3. Propose the `.claude/settings.json` deny-path fix separately; the upstream read-only guard points at dead OneDrive paths and currently protects nothing.
4. Done: `scripts/security/hidden_payload.py` (with `scan --fix` and `host`) was recovered from the transcripts on 2026-09-22.
5. Phase 3 capture needs fresh authorization after the fixture freeze; contamination including the three precedence fixtures is remeasured in the correction record, while quote quality and judge calibration remain unmeasured.
6. Add tool results to transcripts: `TranscriptTurn` has no field for them, so the judge never sees them.
7. Moved to the user's item 1: the citation-chip browser check is step 10 of the report browser check.
8. Phase 1e remainder: per-turn label splits, candidate sweep, hard negatives, grade differentiation. Blocks Phase 4, not Phase 3.
9. Doc consolidation tier 2, in its own session: move `CHAT_UX_WORKPLAN.md`'s open Wave 2 items (the `【】`/`【?】` citation-marker defect and its preferred fixes, time-range chips, feedback loop) into Task C's brief and archive the file (five code comments cite it; repoint them); trim `migration/POD_AUTHORIZATION.md` to the merge-chain and cross-organization policy (§5-§7) that `src/devices/mergeChains.ts` and `test/fixtures/pod-scope/README.md` cite; fold `migration/WSL_SANDBOX.md` into `migration/LOCAL_STACK.md`; and check whether `GILLIGAN_PRODUCT_DIRECTION.md` still earns a place beside the target architecture. Start from the archive practice in `ARCHIVED.md` and the verdicts in `git show old-machine-recovery-2026-09-19:docs/migration/DOC_CLEANUP.md`; archiving needs a Git plan.

## Unfixed defects

Reported 2026-09-10 to 2026-09-22.

| where | defect | severity |
|---|---|---|
| `src/prompt/systemPrompt.ts` + model behaviour | A citation marker was attached to a claim sourced from a **tool result**, with a quote that does not support it. The prompt already forbids this in as many words, so the fix is not another rule: the existing one was ignored. Seen 2026-09-22 on a live turbidity answer. Belongs to Task C. | medium |
| `frontend/js/citations.js:23` | `MARKER_PATTERN` accepts `}` as a marker closer, so the `"}】` variant renders a doubled `【5】】`. The quote text is stripped correctly and does **not** leak. Same shared pattern as the recorded `}]` defect, and the dashboard's `gilligan-citations.js` copies it. | low |
| `src/quota/InMemoryQuotaStore.ts` | Quotas, now including reports, live in process memory: reset on every restart and multiplied per instance; all dimensions share one window. Replaced by a Firestore store in R1. | medium |
| `src/tools/generateReport.ts` + model behaviour | Asked to copy `report_period` verbatim, the model typed its hyphens as U+2011. Digits and year were right. | low |
| `eval/fixtures-wave1/` | Slice-coverage overshoot remains: the corrected set has 84/90 turns with explanatory sources entirely outside the ◆G9 slice, including partial refusals, so Phase 4 conclusions remain manual-heavy. | medium |
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
- **`SENSOR_TOOL` now matters in both directions.** Off, the assistant has no tools and refuses every reading question. On, every such question is a live production device read. Captures need it and `REPORT_TOOL` explicitly `false` on **both** server and runner - never rely on the default, and never on `.env`, which now sets both `true`.
- **Both servers read their `.env` at boot only, and `ts-node-dev` watches source, not `.env`.** Restart after any env change, and compare process start time to the file's mtime before believing a symptom. An **empty** env var is not an unset one with a safe default - it silently takes `readString`'s fallback, and `DEFAULT_RETRIEVAL=` gives `stub`, whose three `[STUB CONTEXT]` chunks are not the corpus. `hybrid-slice-vector` also needs the git-ignored `data/embeddings/cache.json`, so a fresh clone or worktree fails every request until the paid `npm run embed:cache` runs.
- A fresh worktree has no `node_modules`, `.env` or `data/` caches; link them per the `run-local` skill's worktree reference. `EnterWorktree` cuts from `origin/main`, which is far behind `dev`, so reset the new branch onto `dev` first.
- `.ocr_cache/` is tesseract 4.1.1 output, not the original 5.3.4, and the original OCR text is unrecoverable. **Any re-ingest from a different tesseract build moves those 12 chunk ids again**, and re-chunking voids every label. `scripts/resolveRetrievalLabels.ts` does not delete stale label files, and any `-NN`-shaped token in fixture `notes` is read as a claim id.
- Anything dropped into `documents/` is ingested whether or not it is in `DOC_META`. Keep `water-quality-source-of-truth-v2.pdf` at the repo root; in `documents/` it would silently become a 15th corpus document carrying vetoed operator ranges.
- `.claude/settings.json` deny rules point at the old OneDrive paths and match nothing, so the upstream read-only guard is currently inert.
- Fireworks documents no free tier for `gpt-oss-120b`; budget and rate limits assume a paid account.
- Run jest suites one at a time with `--runInBand`; parallel runs on this filesystem get killed for memory. Use port 8010; never kill 8000. `:5001` and `:3000` are the upstream server and dashboard; none of the three was left running.
- The configured device token sees 5 pods (the August census saw 15); tokens are scoped to one organization, and the JWT carries **no `exp` claim**, so it never expires on its own.
- Nothing is deployed; all testing is local.

## Where things live

- **Gilligan**: [`migration/GILLIGAN_PRODUCT_DIRECTION.md`](migration/GILLIGAN_PRODUCT_DIRECTION.md) (decisions and research), [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md) (architecture, roadmap, decisions D1-D12), [`migration/GILLIGAN_R3_PORT.md`](migration/GILLIGAN_R3_PORT.md) (the relay and the rebuilt page), [`migration/GILLIGAN_TOOL_ACCESS.md`](migration/GILLIGAN_TOOL_ACCESS.md) (tool access and refusal quality).
- **Environment**: [`migration/WSL_SANDBOX.md`](migration/WSL_SANDBOX.md) (rebuild and what is missing), [`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md) (running dashboard and server locally), [`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md) (malware cleanup).
- **Behaviour and decisions**: [`SPECS.md`](SPECS.md) (how the built system works), [`timeline.md`](timeline.md) (phases, gates, decision log), [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md) (coding conventions).
- **Evaluation and corpus**: [`EVAL_REBUILD.md`](EVAL_REBUILD.md) (plan, phase state, chunk-id stability), [`CORPUS_SOURCING_BRIEF.md`](CORPUS_SOURCING_BRIEF.md) (expansion targets), [`RESPONSIBILITY.md`](RESPONSIBILITY.md) (advice reasoning, now the catalogue).
- **People and history**: [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md) (answers owed), [`ARCHIVED.md`](ARCHIVED.md) (archived docs and past handoffs), house rules in [`../CLAUDE.md`](../CLAUDE.md), [`../AGENTS.md`](../AGENTS.md) and `.claude/skills/`.
