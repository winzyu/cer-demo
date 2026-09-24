# Status

Current state and next steps only.
Rewritten at the end of every session by `/handoff`; history is `git log -p docs/STATUS.md`.
Never cite this file from code or other docs: the reasoning lives in the docs under "Where things live".

Updated 2026-09-24 after Task C landed (`dev` `913ec33`, pushed) and a release-planning session with the user; the eval (R4) notes were last verified 2026-09-24 at `eval/wave1-corrections` `e36d3a2` and are older than that branch's head; other workstream notes retain their verification dates.

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
- **Deployment runbook - drafted, untracked, stale.** `docs/migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md` was drafted 2026-09-23 against `50adac0` and not touched since.
  It assumes the upstream owners deploy; rewrite its owner roles and §2 permissions for the user deploying, and let the user fill its §2 inputs table.
  Its §5 finding stands: Cloud Run strips the signature from the forwarded service token, so D12's in-app verification needs a separate header arrangement.
- **Task C, first slice - done, merged and pushed 2026-09-24.**
  cer-demo `fb75add` (merged into `dev` as `913ec33`), server `d12ad6d` and dashboard `fd103a0` on `local`, not pushed.
  Tool results and the round cap now reach the relay, the page, saved history, transcripts, the gate and the judge; tool results are citable as `【Tn】`, and citation markers are audited, corrected where unambiguous, and stripped only on display.
  Contract: `SPECS.md` §10.4a; checks: [`migration/TASK_C_VERIFICATION.md`](migration/TASK_C_VERIFICATION.md); after the `dev` merge the citation, audit, health and retrieval suites passed 81/81, with typecheck and lint clean.
  Tools-off transcripts carry no tool fields, so the judge prompt for R4's captures is unchanged.
- **Eval (R4) - in progress in its own session, on `eval/wave1-corrections` and `eval/judge-cost`, neither in `dev`.**
  Set frozen at 45 / 90, closed without human verification.
  Gold context: baseline 1.01, iteration 1 1.01 (0.98 on a second judge pass), iteration 2 0.92 and reverted; the branch carries iteration 1's prompt.
  Since the last verified note the branch re-parented `epa-oxygen-solubility-chart-01` to chunk 10 (`c85848a`) and raised `DEFAULT_TOP_K` to 20 for a depth capture (`9abc8a8`); a k=30 capture sits uncommitted in its worktree.
  `eval/judge-cost` (`104ba07`) reorders judge prompts for caching and re-judged iteration 1 under that layout.
  **Both branches now conflict with `dev`** in the judge prompts and runner, `systemPrompt.ts`, and the bakeoff, gate and judge tests; merge `dev` into them before more captures.
  Detail: `EVAL_REBUILD.md` and `eval/reviews/phase3-2026-09-23/HANDOFF.md` on that branch.
- **Catalogue (R2) - built, approval pending; the user is chasing the supervisor this week.**
  `src/catalogue/catalogue.json` is version `2026-09-19.1`: 38 draft entries and 5 referrals, behind `CATALOGUE_PROMPT` (default off) in chat and wired into reports; `SPECS.md` §4b.
  Supervisor items 17-20 were sent 2026-09-19 (`migration/SUPERVISOR_QUESTIONS_SEND.md`, `docs/catalogue/review.html`) and are unanswered; without approval by launch, `CATALOGUE_PROMPT` stays off.
- **Environment - rebuilt.** Corpus byte-reproducible, secrets in, `DEFAULT_RETRIEVAL=hybrid-slice-vector` with `CORPUS_SOURCE=artifact`, and the git-ignored `data/embeddings/cache.json` built; see [`migration/LOCAL_STACK.md`](migration/LOCAL_STACK.md).
  `cer-demo/.env` sets `SENSOR_TOOL=true` and `REPORT_TOOL=true`, so every local boot answers reading questions with live production reads.
- **Upstream repos - clean `local` branches, never pushed, now backed up.** `origin` in both points at the live `Clean-Earth-Rovers-Technology` repositories ([`migration/SECURITY_INCIDENT_2026-09-19.md`](migration/SECURITY_INCIDENT_2026-09-19.md)).
  Bundles of `local`, `task/c-provenance` and `security/remove-payload` are at `~/code/clean-earth-rovers/backups/*-local-2026-09-24.bundle`, verified; they are on this machine only, and `local`'s history still contains the pre-cleanup payload commits.

## Next conversations

Independent tasks for separate sessions; the user was given a starting prompt for each on 2026-09-24.

- **R1 packaging and service check.** In a new worktree cut from `dev`: ship the corpus and embedding cache in the image with a boot check that fails loudly when either is missing, and the cer-demo side of the service identity check. Blocked on the user's R1 scope choice for the check's form.
- **Task A - Turbidity information. Interview the user first.** `TURBIDITY_BAND_EDGES` and the voltage conversion in `src/report/referenceRanges.ts` feed `get_turbidity_info`, the report's clarity bands and the prompt's "provisional, uncalibrated index" framing, and nobody has confirmed them.
  Open questions: which bands are current; whether the v2 turbidity exemption (supervisor item 18) changes them; how to report a 0 index, since `turbVoltToNTU.ts` returns 0 for a missing voltage and for the offline sentinel alike; whether any pod has quantitative hardware; and stakeholder item 14, the dial's 350/800 against the report's 345/795.
  Exploration notes: [`migration/TURBIDITY_EXPLORATION.md`](migration/TURBIDITY_EXPLORATION.md). The vendor datasheets are in `documents/_excluded/`, not ingested.
  Start with: `Read docs/STATUS.md, then work Task A, turbidity information - interview me before changing anything.`
- **Task E - Upstream hardening**, on `../clean-earth-rovers-server` in its own worktree cut from `local`: (1) the device-membership hole in `WaterAnalyticsService.findPeriodWaterData` (`migration/SECURITY_FINDINGS.md` §1) with organization-isolation tests from `test/fixtures/pod-scope/`; (2) construct `EmailService` and `PaymentService` on first use; (3) configure the TypeScript ESLint parser if small, else report; (4) propose the `.claude/settings.json` deny-path fix without editing that file.
  It must not touch `CerRagService.ts`, `GilliganController.ts` or `GilliganService.ts`, which R1 edits next.
  Start with: `Read docs/STATUS.md, then work Task E, upstream hardening.`
- **Task C, later slices**, after the release unless descoped in: series chart (`chart.js`), input controls (`input.js`), the pod-status bar (`podbar.js`, `SPECS.md` §15a), error codes and error UX (`SPECS.md` §7), time-range chips (Live / Week / Month / Year / 5 Years), and a feedback loop blocked on where feedback is stored.
  Citations still carry only `source`, so a document shows as its address until a title field runs end to end.

## Last session

- Task C landed: committed in its three worktrees, `dev` merged in with Task C's citation pattern kept (it subsumes `dev`'s `}】` fix), `dev` and both upstream `local` branches fast-forwarded, `dev` pushed to `origin`. Checks: 4 suites 81/81, typecheck, lint; malware scans clean. No spend, no live reads.
- Upstream `local` branches bundled to `~/code/clean-earth-rovers/backups/`.
- Release planning with the user: date held with reduced scope, user deploys, R1 explained part by part with its scope left to the user; decisions in `timeline.md`.

## Working tree

- `dev` is `913ec33`, level with `origin/dev` apart from this handoff.
  `docs/EVAL_REBUILD.md` carries one uncommitted 23-line block (the 2026-09-21 claim re-resolve note), left out on purpose: that work lives on `worktree-eval-claims-reresolve` (`5d269a3`).
  `_EXIT_CRITERIA.md`, `eval/grading/`, the runbook and the root v2 PDF stay untracked.
- Worktrees: `task-c-provenance` in all three repositories (merged; removable); `wave1-corrections` and `judge-cost` (R4, active); `eval-claims-reresolve`; `agent-a30d6628796794046` on `cloud/explore-turbidity` (its note is on `dev` as `TURBIDITY_EXPLORATION.md`).
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
5. Eval: approve the remaining depth captures and the final two-arm capture judged twice; agree to skip judge calibration (2c) before launch; approve a landing plan for `eval/wave1-corrections` and `eval/judge-cost`.
6. Confirm the Fireworks account has a payment method and set a spending cap; a third-party source says accounts without one are held to 10 requests per minute.
7. Approve re-seeding Firestore (`npm run seed:firestore -- --prune` and the paid `seed:firestore-chunks -- --prune`): the collections predate the 2026-09-21 re-OCR. Blocks any `CORPUS_SOURCE=firestore` capture and a Firestore-backed deployment.
8. Decide the slice-coverage overshoot before wave 2 spends budget (defects below).
9. Choose the `ADVICE_TIER` test design, if the catalogue keeps tiers: append-only tier blocks (recommended) or a pinned prompt per tier.
10. Check whether the malware ever ran on a build machine (Cloud Build, App Engine); a `next build` there would trigger it.

### Claude's

1. R1 packaging and the service check once scoped; then the rest of the chosen R1 on the post-Task C heads.
2. Rewrite the runbook for the user deploying, then commit it.
3. Eval R4 in its session: merge `dev`, finish the depth captures, the final two-arm capture judged twice, a tools-on live smoke check (approval needed), D3 caveats for classes under 1.00, and the R4 report; carry top-k into `SPECS.md` and the decisions into `timeline.md`.
4. Tasks A and E, each in its own session.
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
| `../clean-earth-rovers-server` `turbVoltToNTU.ts` | Returns 0 NTU for a missing voltage and for the offline sentinel, same as clear water. Task A. | medium |
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
