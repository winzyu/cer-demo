# Status

Current state and next steps only.
Rewritten at the end of every session by `/handoff`; history is `git log -p docs/STATUS.md`.
Never cite this file from code or other docs: the reasoning lives in the docs under "Where things live".

Updated 2026-09-17 at commit `1a8c744` (Gilligan release planning; other workstream notes keep their original verification dates).

## Start here

- **Gilligan release (September 30)**: planning is done and no implementation has started. Read [`migration/GILLIGAN_PRODUCT_DIRECTION.md`](migration/GILLIGAN_PRODUCT_DIRECTION.md) (all interview decisions, the v2 review, research), then [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md) (architecture, keep/modify/replace, roadmap R0-R6, decisions D1-D6). Next: step R1, the service contract in this repo (`/gilligan/answer`, cer-api identity check, history mapping with Gemini-era chats ignored, report bytes, Firestore usage limits and status endpoint, `audit` field, concurrency limiter). Confirm with the user before starting implementation.
- **Eval (Phase 3 baseline)**: capture the generation baseline on gold context in its own session. Spend approved 2026-09-17; still blocked on the Phase 1d fixture freeze. First step: the Phase 3 row of [`EVAL_REBUILD.md`](EVAL_REBUILD.md). Launch bar (D3): aim for every check; caveat or refuse weak question classes rather than delay the release.
- **Catalogue (replaces the advice allowlist)**: a supervisor-approved, versioned catalogue built from source-of-truth v2 and the usable `docs/advice/` drafts, shared by chat and reports (architecture doc §2d). Waits on supervisor items 17-20.
- **Pod-scope/auth**: committed earlier; re-check code before continuing.

## Last session

- Product interview closed: integration shape, hosting, usage limits, pod scope, reports, streaming and mobile deferred, content, referrals, D1-D4. All recorded in the two migration docs above; timeline decision row added.
- Wrote the target architecture, gap analysis and roadmap, and the WSL sandbox guide ([`migration/WSL_SANDBOX.md`](migration/WSL_SANDBOX.md)).
- Stakeholder checklist: added supervisor items 17-20 (v2 questions, referral contacts) and item 21 (chat retention); closed 7, 8, 9, 12 and 13.
- Research only (Fireworks docs, CER website); no code changes, tests, live reads or paid runs.

## Working tree

- Branch `dev`, tracking `origin/dev`, not ahead or behind before this handoff.
- Gilligan planning (this session, uncommitted): `docs/STATUS.md`, `docs/STAKEHOLDER_QUESTIONS.md`, `docs/timeline.md`, `docs/migration/GILLIGAN_PRODUCT_DIRECTION.md`, `docs/migration/GILLIGAN_TARGET_ARCHITECTURE.md`, `docs/migration/WSL_SANDBOX.md`.
- User-provided, untracked, keep: `eval/fixtures-wave1/_EXIT_CRITERIA.md`, `water-quality-source-of-truth-v2.pdf` (repo root).

## Open work

### Stakeholders

Tracked in [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md).
Release-critical: supervisor items 17-20 (v2 fallback ranges, turbidity exemption, worked examples and customer-facing recommendations, CER referral contacts), needed by about September 25.
Also blocking: item 1, the operator's review of pod alert limits (they drive event detection); item 6, the "configured thresholds" wording.

### The user's

1. Send items 17-20 to the supervisor (roadmap R0, by September 18).
2. Set up the WSL sandbox and test the service against the upstream copies ([`migration/WSL_SANDBOX.md`](migration/WSL_SANDBOX.md)); Claude does not edit upstream code.
3. Confirm the Fireworks account has a payment method; a third-party source says accounts without one are held to 10 requests per minute.
4. Phase 1d fixture review on the 45 / 90 set; then update `_EXIT_CRITERIA.md` to 45 / 90 and 3 `precedence` fixtures. Blocks: Phase 3.
5. Approve `npm run seed:firestore` (writes Firestore; the collection still holds the removed document). Blocks: any `CORPUS_SOURCE=firestore` capture.
6. Decide the slice-coverage overshoot before wave 2 spends budget (defects below).
7. Choose the `ADVICE_TIER` test design, if the catalogue keeps tiers: append-only tier blocks (recommended) or a pinned prompt per tier.

### Claude's

1. Roadmap R1 and R2 in this repo, once the user confirms implementation may start. Where: `migration/GILLIGAN_TARGET_ARCHITECTURE.md` §3-4.
2. Phase 3 capture in its own session, once the fixture freeze lands; then measure quote quality (`MIN_QUOTE_CHARS` weakness in `src/eval/gates/checks.ts`).
3. Turbidity vendor documentation is transcribed into `documents/*.md` and registered in `DOC_META`, but `npm run ingest` has not run, so it is not retrievable. Re-ingesting re-chunks the corpus and voids every retrieval label, so it waits for the user's call after the Phase 1d freeze; decide then whether either file joins `DIRECT_FEED_SLICE` (◆G9).
4. Re-measure contamination for the three new `precedence` fixtures (`_EXIT_CRITERIA.md` "Reproducing").
5. Add tool results to transcripts: `TranscriptTurn` has no field for them, so the judge never sees them.
5. Browser check of the citation chip (unit-tested only); use the `run-local` skill.
7. Phase 1e remainder: per-turn label splits, candidate sweep, hard negatives, grade differentiation. Blocks Phase 4, not Phase 3.

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
| `../clean-earth-rovers-server` `WaterAnalyticsService.findPeriodWaterData` | Explicit device filters are not checked against membership (`migration/SECURITY_FINDINGS.md` §1); upstream fix, tracked in the architecture doc. | high |
| `../clean-earth-rovers-server` `GilliganService.askQuestionGemini` | Calls the retired `gemini-pro` model at `origin/develop` `b221702`; current production Gilligan likely fails every question (not live-tested). | high |
| `../clean-earth-rovers-server` `turbVoltToNTU.ts` | Returns 0 NTU for a missing voltage and for the offline sentinel, same as clear water. | medium |
| device registry | No sensor-model field, so quantitative and qualitative-only turbidity sensors cannot be told apart. Not needed for the release (turbidity stays qualitative). | low |

## Active traps

- Fireworks documents no free tier for `gpt-oss-120b`; budget and rate limits assume a paid account.
- The OneDrive `../clean-earth-rovers-server` checkout is 87 commits behind its last-fetched `origin/develop` and has a local-only commit `a3cc25d`; read upstream code with `git show origin/develop:<path>`.
- Run jest suites one at a time with `--runInBand`; parallel runs on this filesystem get killed for memory.
- Captures need `SENSOR_TOOL=false` on both server and runner. Use port 8010; never kill 8000.
- Re-chunking voids every label. `scripts/resolveRetrievalLabels.ts` does not delete stale label files, and any `-NN`-shaped token in fixture `notes` is read as a claim id.
- `data/corpus/corpus.json` and 12 corpus PDFs are untracked: a fresh checkout needs them copied (see the WSL sandbox guide) before `npm run ingest`.
- The configured device token sees 5 pods (the August census saw 15); tokens are scoped to one organization.
- Nothing is deployed; all testing is local.

## Where things live

| what | where |
|---|---|
| Gilligan release decisions and research | [`migration/GILLIGAN_PRODUCT_DIRECTION.md`](migration/GILLIGAN_PRODUCT_DIRECTION.md) |
| Gilligan architecture and roadmap | [`migration/GILLIGAN_TARGET_ARCHITECTURE.md`](migration/GILLIGAN_TARGET_ARCHITECTURE.md) |
| How the built system works | [`SPECS.md`](SPECS.md) |
| Phases, gates, decision log | [`timeline.md`](timeline.md) |
| Eval plan and phase state | [`EVAL_REBUILD.md`](EVAL_REBUILD.md) |
| Advice allowlist reasoning (now the catalogue) | [`RESPONSIBILITY.md`](RESPONSIBILITY.md) |
| Answers owed by stakeholders | [`STAKEHOLDER_QUESTIONS.md`](STAKEHOLDER_QUESTIONS.md) |
| Coding conventions | [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md) |
| House rules for agents | [`../CLAUDE.md`](../CLAUDE.md), [`../AGENTS.md`](../AGENTS.md), `.claude/skills/` |
| Archived docs, including past handoffs | [`ARCHIVED.md`](ARCHIVED.md) |
