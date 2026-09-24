# Status

Current state and next steps only.
Rewritten at the end of every session by `/handoff`; history is `git log -p docs/STATUS.md`.
Never cite this file from code or other docs: the reasoning lives in the docs under "Where things live".

Updated 2026-09-24 in an orchestration session that reconciled five overnight sessions (Task A, Task C follow-up, R4 depth captures, judge cost, a conversation quality check); `dev` and `eval/wave1-corrections` were verified that day.

## Start here

- **Gilligan release (September 30), 6 days left, holds with reduced scope; the user deploys (decided 2026-09-24, `timeline.md`).**
  Read [`migration/GILLIGAN_PRODUCT_DIRECTION.md`](migration/GILLIGAN_PRODUCT_DIRECTION.md) then [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md).
  The user holds owner/editor access to the production Google Cloud project, so upstream IAM is no longer someone else's step.
  The upstream organization's owners already know about the malware incident.
  Done: R3, the tool-access fix, Task B (R1's report half) and Task C's provenance slice.
  Open on the release path: the R1 remainder and image packaging, the runbook, R4's final capture, and the supervisor's catalogue approval.
- **R1 remainder - not started; its release scope is the next user decision.**
  Three of R1's parts are done (report bytes, history mapping in R3's relay, the usage endpoint).
  Open: the `/gilligan/answer` contract (optional under D8), the service identity check (D12), a persistent usage store, and a model-call limiter with 429/503 retry.
  **Image packaging blocks any deployment** and belongs to no roadmap row: `.dockerignore` excludes `data/`, so the image carries neither the corpus nor the embedding cache.
  Packaging and the cer-demo side of the identity check touch no Task C file and can start now; the rest is cut from the post-Task C heads.
  The recommended minimum is packaging, a shared-secret service check, `max-instances=1` and a Fireworks spending cap, with identity tokens, Firestore quotas, `/gilligan/answer` and the limiter after launch; the user has not chosen yet.
  This machine has no Docker, `gcloud`, Java or Firestore emulator, so neither the image nor a Firestore usage store can be tested end to end locally yet.
- **Deployment runbook - drafted, committed unrevised, stale.** [`migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md`](migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md) was drafted 2026-09-23 against `50adac0`.
  It assumes the upstream owners deploy; rewrite its owner roles and §2 permissions for the user deploying, and let the user fill its §2 inputs table.
  Its §5 finding stands: Cloud Run strips the signature from the forwarded service token, so D12's in-app verification needs a separate header arrangement.
- **Task C, first slice - done, merged and pushed 2026-09-24.**
  cer-demo `fb75add` (merged into `dev` as `913ec33`), server `d12ad6d` and dashboard `fd103a0` on `local`, not pushed.
  Tool results and the round cap now reach the relay, the page, saved history, transcripts, the gate and the judge; tool results are citable as `【Tn】`, and citation markers are audited, corrected where unambiguous, and stripped only on display.
  Contract: `SPECS.md` §10.4a; checks: [`migration/TASK_C_VERIFICATION.md`](migration/TASK_C_VERIFICATION.md); after the `dev` merge the citation, audit, health and retrieval suites passed 81/81, with typecheck and lint clean.
  Tools-off transcripts carry no tool fields, so the judge prompt for R4's captures is unchanged.
- **Eval (R4) - depth settled at k=20; calibration and the final capture remain.** All on `eval/wave1-corrections` (`3062d3d`, pushed), not in `dev`.
  `dev` (Task A and Task C) and `eval/judge-cost` are merged in; exploratory judge passes now run with reasoning off and reported passes with `--final`.
  `hybrid-slice-vector` correctness: 0.51 at k=10, 0.60 at k=20, 0.52 at k=30, where the model refuses answerable questions; gold context 1.01.
  Spend about $7.44 of the $20 ceiling the user set 2026-09-24, approved through September 28.
  Next: calibration tooling and a 32-row packet the user grades on correctness and ungrounded, then the final two-arm capture about September 27.
  Detail: `EVAL_REBUILD.md` "Retrieval depth captures" and `eval/reviews/phase3-2026-09-23/HANDOFF.md`, both on that branch.
- **Task A, turbidity - done, provisional, pushed 2026-09-24 (`dev` `e7a986b`).** Bands stay at 345/795 (the operator's 2.2 V and 0.7 V thresholds), an all-zero period is flagged as a possible missing sensor, turbidity is a unitless index (never NTU), every pod is treated as qualitative, and item 18 is treated as granted.
  Record: `timeline.md` 2026-09-24, `STAKEHOLDER_QUESTIONS.md` items 3, 10, 14 and 18, [`migration/TURBIDITY_EXPLORATION.md`](migration/TURBIDITY_EXPLORATION.md).
  Upstream follow-ups remain: the dashboard dial to 345/795, and `turbVoltToNTU.ts` returning null for a missing voltage.
- **Conversation quality check - 2026-09-24, 26 live turns through the full local stack.** Plumbing, tool choice and refusals are sound; answer content is not.
  High: the model is never given today's date and `list_pods` gives no reading age, so stale pods read as online; `generate_report` gives a status without the parameter that caused it, so a summary contradicted its own report.
  Record and suggested fixes: [`migration/CONVERSATION_QA_2026-09-24.md`](migration/CONVERSATION_QA_2026-09-24.md).
- **Catalogue (R2) - built, approval pending; the user is chasing the supervisor this week.**
  `src/catalogue/catalogue.json` is version `2026-09-19.1`: 38 draft entries and 5 referrals, behind `CATALOGUE_PROMPT` (default off) in chat and wired into reports; `SPECS.md` §4b.
  Supervisor items 17-20 were sent 2026-09-19 (`migration/SUPERVISOR_QUESTIONS_SEND.md`, `docs/catalogue/review.html`) and are unanswered; without approval by launch, `CATALOGUE_PROMPT` stays off.
- **Environment - rebuilt.** Corpus byte-reproducible, secrets in, `DEFAULT_RETRIEVAL=hybrid-slice-vector` with `CORPUS_SOURCE=artifact`, and the git-ignored `data/embeddings/cache.json` built; see [`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md).
  `cer-demo/.env` sets `SENSOR_TOOL=true` and `REPORT_TOOL=true`, so every local boot answers reading questions with live production reads.
- **Upstream repos - clean `local` branches, not yet pushed; the user has authorization to push (2026-09-24).** Push only by a named command approved in chat, never to `main` or `develop`. `origin` in both points at the live `Clean-Earth-Rovers-Technology` repositories ([`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md)).
  Bundles of `local`, `task/c-provenance` and `security/remove-payload` are at `~/code/clean-earth-rovers/backups/*-local-2026-09-24.bundle`, verified; they are on this machine only, and `local`'s history still contains the pre-cleanup payload commits.

## Next conversations

Independent tasks for separate sessions; the user was given a starting prompt for each on 2026-09-24.

- **R4 calibration and final capture**, continuing on `eval/wave1-corrections` in its existing worktree.
- **Gilligan answer quality**: the high and medium findings in `migration/CONVERSATION_QA_2026-09-24.md`, confined to tools-on prompt blocks and tool results so R4's tools-off captures are unaffected; must reach `eval/wave1-corrections` before the final capture if it touches the general prompt.
- **Upstream publish**: audit the `local` commits in both upstream repositories, then push them to new branches on `origin` and open pull requests, never to `main` or `develop`.
- **Task E, upstream hardening, plus Task A's upstream follow-ups**, on `../clean-earth-rovers-server` and `../user-dashboard` in worktrees cut from `local`; it must not touch `CerRagService.ts`, `GilliganController.ts` or `GilliganService.ts`.
  Task E: (1) the device-membership hole in `WaterAnalyticsService.findPeriodWaterData` (`migration/SECURITY_FINDINGS.md` §1) with organization-isolation tests from `test/fixtures/pod-scope/`; (2) construct `EmailService` and `PaymentService` on first use; (3) configure the TypeScript ESLint parser if small, else report.
- **R1 packaging and service check**, in a worktree cut from `dev`; blocked on the user's R1 scope choice.
- **Task C, later slices**, after the release unless descoped in: series chart (`chart.js`), input controls (`input.js`), the pod-status bar (`podbar.js`, `SPECS.md` §15a), error codes and error UX (`SPECS.md` §7), time-range chips (Live / Week / Month / Year / 5 Years), and a feedback loop blocked on where feedback is stored.
  Citations still carry only `source`, so a document shows as its address until a title field runs end to end.

## Last session

- Orchestration: reconciled five overnight sessions and cleaned up their worktrees.
- `dev`: `c55f7cb` removes the two blank lines Task C left in every tools-off correctness judge prompt (regression test added); `c65ea28` commits the conversation quality check and the runbook draft.
- `eval/wave1-corrections`: finished the abandoned `dev` merge (`7223c36`), completing `p3-k30-2026-09-24` at 180 of 180 verdicts; set `DEFAULT_TOP_K` to 20 and recorded both depth captures (`707e865`); merged `eval/judge-cost` (`3062d3d`). All pushed.
- Checks: typecheck and lint on both branches; judge, prompt, gateCheck, bakeoffRunner, gradePacket, retrieval and eight more suites run singly, all passing. No spend, no live reads.

## Working tree

- `dev` is level with `origin/dev` after this handoff; `_EXIT_CRITERIA.md`, `eval/grading/` and the root v2 PDF stay untracked on purpose (`migration/LOCAL_STACK.md`).
- Worktrees: `wave1-corrections` (R4, active); `eval/judge-cost` is merged and deleted locally, its remote branch kept.
- `.agents/skills/git-plan/SKILL.md` is an older copy that still requires chat approval before git mutations, and differs from `.claude/skills/git-plan/SKILL.md`; reconcile or remove it.
- Upstream: server `local` is `d12ad6d`, dashboard `local` is `fd103a0`, both with git-ignored `.env` files carrying the R3 variables.
- Restored and untracked or git-ignored, so invisible to `git status`: `node_modules/`, `.env`, the 8 downloaded corpus PDFs, `documents/_excluded/water-quality-metrics-source-of-truth.pdf`, `.ocr_cache/`, `data/corpus/`, `data/embeddings/cache.json` (7.1 MB). Still missing: `data/retrieval-eval/`, `data/device-fields/`, `data/backend-surface/`, `serviceAccountKey.json` ([`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md)).

## Open work

### Stakeholders

Tracked in [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md). Release-critical: supervisor items 17-20 (v2 fallback ranges, turbidity exemption, worked examples and customer-facing recommendations, CER referral contacts).
Also blocking: item 1, the operator's review of pod alert limits (they drive event detection); item 6, the "configured thresholds" wording.

### The user's

1. Choose R1's release scope: which of packaging, the service check (shared secret or identity tokens), persistent quotas, and `/gilligan/answer` with the limiter must ship on September 30.
2. Install Docker Desktop with WSL integration if the image is to be tested locally; the Firestore emulator (Java and `firebase-tools`) likewise for a persistent usage store.
3. Fill the runbook's §2 inputs: project and region, Firestore database, registry, service names and accounts, the Fireworks secret and budget, capacity, and test identities in two organizations.
4. Chase the supervisor on items 17-20 (sent 2026-09-19, no reply).
5. Eval: grade the 32-row calibration packet once built; approve the final two-arm capture judged twice with `--final`; approve a landing plan for `eval/wave1-corrections`.
6. Confirm the Fireworks account has a payment method and set a spending cap; a third-party source says accounts without one are held to 10 requests per minute.
7. Approve re-seeding Firestore (`npm run seed:firestore -- --prune` and the paid `seed:firestore-chunks -- --prune`): the collections predate the 2026-09-21 re-OCR. Blocks any `CORPUS_SOURCE=firestore` capture and a Firestore-backed deployment.
8. Decide the slice-coverage overshoot before wave 2 spends budget (defects below).
9. Choose the `ADVICE_TIER` test design, if the catalogue keeps tiers: append-only tier blocks (recommended) or a pinned prompt per tier.
10. Check whether the malware ever ran on a build machine (Cloud Build, App Engine); a `next build` there would trigger it.

### Claude's

1. R1 packaging and the service check once scoped; then the rest of the chosen R1 on the post-Task C heads.
2. Rewrite the runbook for the user deploying, then commit it.
3. Eval R4 in its session: calibration tooling and packet, the final two-arm capture judged twice, a tools-on live smoke check (approval needed), D3 caveats for classes under 1.00, and the R4 report; carry top-k 20 into `SPECS.md` and the decisions into `timeline.md`.
4. Gilligan answer quality, upstream publish, and Task E with Task A's upstream follow-ups, each in its own session.
5. Phase 1e remainder: per-turn label splits, candidate sweep, hard negatives, grade differentiation. Blocks Phase 4, not Phase 3.

## Unfixed defects

Reported 2026-09-10 to 2026-09-24.

| where | defect | severity |
|---|---|---|
| `Dockerfile` + `.dockerignore` | The image excludes `data/`, so it ships without the corpus and the embedding cache and cannot answer anything on `hybrid-slice-vector`. Blocks deployment. | high |
| `src/quota/InMemoryQuotaStore.ts` | Quotas live in process memory, keyed by a token hash: reset on every restart, multiplied per instance, and a fresh login gets a fresh allowance. Replaced by a Firestore store in R1. | medium |
| `eval/fixtures-wave1/` | Slice-coverage overshoot: the corrected set has 84/90 turns with explanatory sources entirely outside the ◆G9 slice, including partial refusals, so Phase 4 conclusions remain manual-heavy. | medium |
| `../clean-earth-rovers-server` `WaterAnalyticsService.findPeriodWaterData` | Explicit device filters are not checked against membership (`migration/SECURITY_FINDINGS.md` §1). Task E. | high |
| `../clean-earth-rovers-server` `GilliganService.askQuestionGemini` | Calls the retired `gemini-pro` model; live-confirmed 2026-09-21, so production Gilligan fails every question today and `GILLIGAN_BACKEND=gemini` is not a rollback (D9). | high |
| `../clean-earth-rovers-server` ESLint | The TypeScript parser is not configured, so `npm run lint` reports 119 parsing errors. `tsc --noEmit` is the only working gate. Task E. | medium |
| `../clean-earth-rovers-server` `turbVoltToNTU.ts` | Returns 0 for a missing voltage and for the offline sentinel, same as clear water; cer-demo now flags all-zero periods, but the source should return null. Task A follow-up. | medium |
| `../user-dashboard` turbidity dial | Uses 350/800 as band edges against the report's 345/795, so a 347 reading is Clear on the dial and Moderate in a report. Task A follow-up. | low |
| `src/prompt/systemPrompt.ts`, `list_pods`, `query_sensor_data` | No current date in the prompt and no reading age in tool results, so stale pods read as online and old readings as current (`migration/CONVERSATION_QA_2026-09-24.md`). | high |
| `generate_report` tool result | Carries the status but not the parameter that set it, so the model contradicts its own report. | high |
| `test/unit/deviceApi.test.ts` | Its list of error codes lacks `quota_reports_exceeded`, so the suite fails. | low |
| `../clean-earth-rovers-server` `src/routes/userRoutes.ts` | `UserController` is constructed at import, which constructs `EmailService`, whose constructor throws without nodemailer credentials, so the server fails to boot; `PaymentService` does the same with `STRIPE_SECRET_KEY`. Task E. | medium |
| `../user-dashboard` `src/app/confirm-email` | Imports `confirmEmail`, which `src/app/services/auth` does not export; `next build` reports "Attempted import error". Runtime effect unchecked. | medium |
| `../user-dashboard` `src/app/gilligan/page.js` | `useSearchParams` outside a Suspense boundary deopts the whole page to client-side rendering. | low |
| citation contract (cer-demo to relay to page) | Citations carry only `source`, so a document shows as its address; a title needs a field end to end. | low |
| device registry | No sensor-model field, so quantitative and qualitative-only turbidity sensors cannot be told apart. Task A. | low |

## Active traps

- **The two upstream CER repositories carry malware at HEAD on `main` and `develop`.** It runs on `next dev`, `next build` and `npm test`. The local checkouts are on the clean `local` branch; switching to `main` or `develop` reinfects the working tree. Check with `grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .` after any clone, fetch, pull or branch switch, and read upstream code with `git show origin/develop:<path>`. cer-demo is clean.
- **`SENSOR_TOOL` matters in both directions.** Off, the assistant has no tools and refuses every reading question. On, every such question is a live production device read. Captures need it and `REPORT_TOOL` explicitly `false` on **both** server and runner; never rely on the default, and never on `.env`, which sets both `true`.
- **Both servers read their `.env` at boot only**, and `ts-node-dev` watches source, not `.env`. Restart after any env change. An **empty** env var silently takes `readString`'s fallback; `DEFAULT_RETRIEVAL` is now validated at boot. `hybrid-slice-vector` needs the git-ignored `data/embeddings/cache.json`, so a fresh clone, worktree or image fails every request until the paid `npm run embed:cache` runs or the cache is copied in.
- A fresh worktree has no `node_modules`, `.env` or `data/` caches; link them per the `run-local` skill's worktree reference. `EnterWorktree` cuts from `origin/main`, which is far behind `dev`, so reset the new branch onto `dev` first.
- `.ocr_cache/` is tesseract 4.1.1 output, not the original 5.3.4. **Any re-ingest from a different tesseract build moves 12 chunk ids again**, and re-chunking voids every label. `scripts/resolveRetrievalLabels.ts` does not delete stale label files, and any `-NN`-shaped token in fixture `notes` is read as a claim id.
- Anything dropped into `documents/` is ingested whether or not it is in `DOC_META`. Keep `water-quality-source-of-truth-v2.pdf` at the repo root.
- `.claude/settings.json` deny rules point at the old OneDrive paths and match nothing, so the upstream read-only guard is inert.
- Fireworks documents no free tier for `gpt-oss-120b`; budget and rate limits assume a paid account.
- Run jest suites one at a time with `--runInBand`; parallel runs get killed for memory. Use port 8010; never kill 8000. `:5001` and `:3000` are the upstream server and dashboard.
- The configured device token is **superadmin** and sees 5 pods; its JWT carries **no `exp` claim**.
- Eval captures must use `--run=<id>` on `bakeoff`, `gate:check` and `judge`: the judge ledger has no answer hash, so judging a re-capture into an existing ledger silently reuses old verdicts.
- Nothing is deployed; all testing is local.

## Where things live

- **Gilligan**: [`migration/GILLIGAN_PRODUCT_DIRECTION.md`](migration/GILLIGAN_PRODUCT_DIRECTION.md) (decisions and research), [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md) (architecture, roadmap, decisions D1-D12), [`migration/GILLIGAN_R3_PORT.md`](migration/GILLIGAN_R3_PORT.md) (the relay and the rebuilt page), [`migration/GILLIGAN_TOOL_ACCESS.md`](migration/GILLIGAN_TOOL_ACCESS.md) (tool access and refusal quality), [`migration/TASK_C_HANDOFF.md`](migration/TASK_C_HANDOFF.md) (provenance and citations).
- **Environment**: [`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md), [`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md).
- **Behaviour and decisions**: [`SPECS.md`](SPECS.md), [`timeline.md`](timeline.md), [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md).
- **Evaluation and corpus**: [`EVAL_REBUILD.md`](EVAL_REBUILD.md), [`CORPUS_SOURCING_BRIEF.md`](CORPUS_SOURCING_BRIEF.md), [`RESPONSIBILITY.md`](RESPONSIBILITY.md).
- **People and history**: [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md), [`ARCHIVED.md`](ARCHIVED.md), house rules in [`../CLAUDE.md`](../CLAUDE.md), [`../AGENTS.md`](../AGENTS.md) and `.claude/skills/`.
