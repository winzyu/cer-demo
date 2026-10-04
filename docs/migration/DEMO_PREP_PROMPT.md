You are the release demo chat for the Gilligan release (September 30, 2026). The supervisor demo for Michael is L7 on September 29, with no slack left.
Repository: /home/winsy/code/clean-earth-rovers/repo/cer-demo. Follow its CLAUDE.md and the git-plan, run-local and delegate skills if your tool has them.
Start at docs/STATUS.md; this prompt records what was verified on 2026-09-29, after STATUS was last written.

## Goal

One runbook, docs/migration/DEMO_RUNBOOK.html, reviewed locally and published only if I say so.
It demonstrates every Gilligan decision we and Michael made (catalogue, CER support and referrals, turbidity bands, merges and sites, limits and more), plus basic competency checks and questions that show off retrieval (RAG) quality.
Every step is a card with:
- the exact URL, login and pod picker setting
- the exact question to paste
- where to point on screen
- what Michael should see, and which decision it proves (date and source document)
- what to say if it goes wrong
- known failures, stated honestly

## Work in this order, and stop for my approval before anything paid

1. Decision list (free).
   List every decision that affects Gilligan's behaviour and map each to a manual-guide row (K, M or other), or mark it "no test".
   Sources: docs/timeline.md (decision table, rows dated 2026-09-13 to 2026-09-28), docs/STAKEHOLDER_QUESTIONS.md (Supervisor section), docs/migration/GILLIGAN_RELEASE_PLAN.md (§1, §2 and task rows), docs/migration/Q10_TASKS.md ("User decisions, 2026-09-28", eleven items).
   Row definitions: docs/migration/GILLIGAN_MANUAL_TEST_GUIDE.md sections A-I, K ("Decisions made visible", K1-K21, X1-X2), L (Michael's production-fix choice) and M (merge rules, M1-M14).
   The seed list below is a starting point, not a complete list.
2. Stack check (free).
   For each row, confirm with `git grep`/`git log` that its code is on the demo stack's commits (below).
   Anything missing is dropped or labelled "coming".
3. Running order, about 40 minutes:
   - Arrival and basics, 5 min: disclaimer, picker, pre-selected pod, question counter
   - Documents, 5 min: citations with titles, follow-up, standing caveat, swim refusal, turbidity
   - Pod data, 8 min: weekly summary, reading age, turbidity rules, "not assessed", the pH 3-12 band
   - Merges and sites, 8 min: CWA Old rule (K8-K10, M1-M3), current site only, a pod with no GPS
   - Isolation and referrals, 5 min
   - Report PDF and saved chats, 5 min
   - Wrap-up, 4 min: known defects and open questions
   Add a short RAG showcase inside Documents: a cross-document question (K12's warm-week oxygen question), a follow-up that doesn't name its subject (it needs the query rewrite), and a question answered from the Keyestudio or source-of-truth v2 documents.
   Section L (Michael's server choice) is a separate segment on the launch-issues stacks; see "Section L" below.
4. Dry run.
   I approve the budget first: about 30 questions, roughly $0.30-0.50 (questions about $0.02 each, reports $0.05-0.07).
   Run every card on the mirror and capture the real wording and screenshots, so nothing in the runbook is guessed.
   Give me a numbered plan with costs before starting any stack.
5. Rehearsal: I run it from the runbook with you alongside; you rewrite any step I found unclear.

## What is frozen (release candidate rc2)

- cer-demo: branch `release/rc2`, commit `ddd6292` (final `dev` `5f00487`, code identical to `303280d`, plus checksums and docs/migration/RELEASE_CANDIDATE.md). Worktree: `.claude/worktrees/rc2`, which already holds the packaged data files.
- Dashboard: `release/gilligan-2026-09-30-rc2` `fc13d16`, pushed; it contains U7 (`CITATION_CAVEAT` in `src/app/shared/gilligan-provenance.js:72`).
- Server: `release/gilligan-2026-09-30-rc2` `8463545`, pending Michael's choice at the demo between `8463545`, `008dad6` and `122136d` (manual guide section L).
- Nothing in these commits changes. Anything you find goes into a findings list, not into code, unless I approve a fix.
- Release config: runbook §4.1 (docs/migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md), copied to `~/release/cer-gilligan.env.yaml`.

## The demo stack: the mirror is stale, so decide this first

The running mirror (docs/migration/MIRROR_RUNBOOK.md, ports 3000, 5101, 8010, 8080) predates rc2:
- Gilligan `77cd4c9` (`test/e2e-rc`) lacks Q9, Q10, K21b, the aggregate-window fix and more.
- The dashboard `9e18555` lacks U7 and the `task/gilligan-ux` work.
- The server `8594338` (`mirror/release-rc1`) is release `122136d` plus the fixture seed (silent, low-pH and dissolved-oxygen pods; 22 devices with `--fixtures`), not `8463545`.
- On 2026-09-29, 3000, 8010 and 8080 were listening and 5101 was not; ask before touching them, because another chat may own them.

For the dry run, stand up an rc2 mirror on the release chat's ports 8081 (emulator), 5102 (server), 8011 (Gilligan) and 3001 (dashboard):
- Gilligan: the `.claude/worktrees/rc2` worktree. Its `.env` holds the §4.1 values, except:
  - `DEVICE_API_BASE_URL=http://localhost:5102/api/v1`;
  - `FIRESTORE_EMULATOR_HOST=127.0.0.1:8081`;
  - the mirror's `demo-` project id;
  - a test service key;
  - `CATALOGUE_PROMPT=true` (the main checkout's `.env` has no such line, which means off).
- Dashboard: a new worktree of `fc13d16`.
- Server: a mirror server needs the `demo-` project guard and the fixture seed.
  No mirror branch exists on `8463545`, so present me the choice:
  - (a) Run `8594338` and label rows that depend on the server fix "shown on the rc2 server only".
  - (b) Cut a local branch from `8463545` with the mirror and fixture commits from `8594338`. Local only: never push or merge in the upstream repos.
- Upstream repositories: never check out `main` or `develop`. Run `grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .` after any clone, fetch or switch.

Personas: password `mirror-dev-password`, listed in manual guide "Logins and visible pods". Merged predecessors are history, not picker entries.
Which fixture pod shows which rule: docs/migration/LAUNCH_ISSUES_EXPLAINED.html and MIRROR_RUNBOOK.md.

## Section L (Michael's server choice)

Show it on the launch-issues stacks, which use fabricated data on emulator :8180:
- "before" is `122136d` on :5301;
- "after" is `8463545` on :5302;
- both start only with `emulator-original/guard.env`, because that emulator uses the production project id.

Steps: docs/migration/LAUNCH_ISSUES_WALKTHROUGH.html. It still needs three corrections, listed in the reset brief's "Release demo" section (docs/migration/GILLIGAN_RESET_2026-09-28.md).
Those stacks listen on every interface, so stop them when idle.

## Seed decision list, with landing status checked on 2026-09-29

On the rc2 commits:
- Disclaimer "Content is AI generated, be sure to double check answers, turbidity is qualitative." (U1, K1).
- Question stays visible, tables render, citations show titles (U2, U4, U5, K13).
- "Almost out" warning (U3, K14); one pod pre-selected (K17); `/confirm-email` removed (P5, K18); notes name their pod (K19); plain reader notes (X1, X2).
- Standing caveat under answers that cite documents (E4 2026-09-27, U7, K20, K12); the out-of-scope refusal stays verbatim (GLM prompt rules, 2026-09-27).
- Turbidity is qualitative: 345/795 bands kept, NTU dropped, all-zero periods flagged (timeline 2026-09-24, K2). A flat 0 or 1005 run for 24 hours or more is a likely failed sensor (Q4, K3).
- Limits wider than the sensor range read "not assessed" (Q5, K4). Rejected-limit notes (Q10 decision 8).
- Reading age and today's date in data answers, and in the PDF (Q1, K5).
- Current site only, and a moved pod's answer and PDF dated from the current site (Q3, finding 6, Q10 decision 4, K6, M4).
- A pod with no GPS is treated as never having moved, noted "Location not recorded" (2026-09-27, finding 7, K7).
- CWA Old rule: a null, missing or dangling organization predecessor merges into its successor for that organization only (2026-09-24/25/27, K8, K10, M1-M3). Superadmins don't get merged history (K9).
- A predecessor with another registered water type is withheld with a note (finding 10, Q10 decisions 2-3, M13).
- pH 3-12 plausibility band with the note "may be sensor faults and were left out" (Q10 decision 7).
- Silent pods listed and not called "online" (C1). Action Required needs two readings beyond the bound (`2d3b059`). Sustained diel or tidal excursion event (K21b).
- Catalogue approved 2026-09-24; entries appear only when a reading supports them (K21: `fault-first`, `professional-review`).
- Referrals to sales@cleanearthrovers.com or the usual CER contact (O1, K11). Finding 8 ("my pod is broken" declined): check whether widening `check-power-connection` landed; otherwise it is a known failure.
- Earlier answers' citation markers stripped (Q10 decision 11).
- Limits of 20 messages, 5 reports and 1,000,000 tokens per day (G rows; don't exhaust personas in the demo).
- Isolation (D1, D2, M2); saved chats readable only by their author (E6); Gemini-era chats hidden (E1).
- Retrieval: `local-vector` k=20 with both query rewrites (2026-09-27/28).
- Model: `glm-5p3-flash` at reasoning low. The corpus includes the Keyestudio document and source-of-truth v2 (2026-09-27).

Coming, or pending someone:
- Source-of-truth v2 §3 fallback ranges (Q10 decision 9, T7 blocked; conductivity waits on Michael). No code found in `src/`.
- `CER_DESCRIPTION` ("what does Clean Earth Rovers do"): wired, but Michael supplies the text; it is empty in every `.env` and absent from §4.1.
- Restoring Old Woman Creek's two `salt-water` pods if Michael confirms the registry is stale (Q10 decision 3); T11 (was CWA ever in salt water).
- `PREDECESSOR_PERIOD_HANDOFF` is false at launch, while K8 lists it as true: check what M1 shows with it off, and say so honestly.

Known defects to state honestly: read the "Unfixed defects" table in STATUS at `5f00487` and drop the rows that the landings above fixed.
- Refusal wording varies between runs.
- Cross-document answers score 0.83.
- The judge's ungrounded dimension is indicative only.
- Chart timestamps run 7 hours past their labels.
- Production Gilligan's `gemini-pro` is retired, so rollback means Gilligan is off.

Real wording to reuse, then re-capture on rc2:
- docs/migration/e2e-mirror-2026-09-29/*.json (K21a-c, C1, D1, F7, F8, cond-*) and screenshots (H1, H2, I2);
- docs/migration/E2E_CHECKLIST.md;
- docs/migration/GILLIGAN_E2E_RESULTS_2026-09-27.md.
These came from the older mirror stack.

## Rules

- `.env` sets `SENSOR_TOOL` and `REPORT_TOOL` true, which means live production reads. The demo stack must point at the mirror server, never production.
- No production reads or writes. Paid work only after I approve the amount.
- The coordinator alone writes `dev`, STATUS, the plan and the manual guide. Work on a branch such as `docs/demo-runbook` in its own worktree, commit there, push to cer-demo's `origin` only, and report commit IDs.
- Don't read archived docs without permission; never read `~/.config/gcloud/` or `serviceAccountKey.json`.
- Run Jest suites singly with `--runInBand`, never the full suite; never kill the service on port 8000.
- My preferences:
  - Lead with results and keep replies concise.
  - Use plain hyphens, never em dashes.
  - Give a numbered plan with costs before multi-step work.
  - Explain with an analogy, then steps, then pass/fail.
  - I'm not a cloud specialist: one concept at a time, with short read-only commands.
