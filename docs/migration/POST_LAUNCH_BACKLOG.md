# Post-launch backlog, 2026-10-07

Gilligan went live on 2026-10-07 (L9, [`GILLIGAN_LANDING_2026-09-29.md`](GILLIGAN_LANDING_2026-09-29.md) §7 item 18).
From 2026-10-06 until launch the user parked everything outside the launch path; this file collects those items and the first production feedback.
Each item names its evidence; the order within a section is a suggestion, and the user sets priorities.

## 1. Stakeholder feedback: Gilligan over-flags sensor data

Michael, after using the live Gilligan on 2026-10-07:

> Thanks I'm using it now! it's awesome. It's mainly telling us we need to fix a bunmch of buoys lol
>
> One thing I've noticed is the bot is very scrupulous about the data collected from the buoys. It kind of throws the baby out with the bathwater if a single data point is an error, or is outside of the established guardrails and will caution against device errors and trustworthiness. It also mentions the turbidity error in almost every message
>
> I think it would be good to reassess it especially if there are not real maintenance items to be attended to. I can just see users spamming us with recalibration requests or maintenance requests if the bot is over flagging things
>
> I gues the gist is across the 6 metrics we are reporting roughly 288 data points per day and its ok if some of them are errors or not 100% perfect

The user's proposal:

> I think a good compromise would be to flag only if a certain proportion of the data points exhibits exceedance of the predetermined metric thresholds
> Like if 5% or 10% of the data points for this metric is out of range
> We would flag it
> Rather than the current design which throws exceedance errors after only a single sensor data point is out of range

Michael: "I think that 5%-10% is an acceptable range".

A CER colleague who joined the conversation (the board's error flags are theirs):

> Hey Winson, nice to meet you as well! Yeah I agree with that idea. I've also embedded into the data error flags for each metric when the issue is due to the board not communicating/responding, so to me that would be an instant flag if it happens maybe 2 or 3 times in a row

Agreed direction, not yet designed or built:

1. Out-of-range readings flag a metric only when a set share of that metric's readings in the period, between 5% and 10%, exceeds its thresholds; a single reading no longer does.
2. A board-not-responding error flag is the exception: two or three in a row flag at once.
   Which field carries that flag, and its values, must come from the colleague before design.
3. Fewer caveats: the turbidity caveat appears in almost every answer; say it once where turbidity matters.
4. Recommendations of maintenance or recalibration follow only from flags under rules 1 and 2, so users are not prompted into needless support requests.

Where it lives today: `src/devices/plausibility.ts` (per-reading plausibility), the tool notes and site notes that tell the model about exceedances, and the prompt's caveat rules; the exact threshold, its period and the share are behaviour changes for [`SPECS.md`](../SPECS.md) once decided.
Open questions: 5% or 10% (or per metric); whether the share counts only plausible readings; how the report PDF states it.

## 2. Security

| Item | Evidence | Note |
|---|---|---|
| Any logged-in user can change any user's role, organization and email (`POST /api/v1/users/account/:id`); admins can edit, promote, delete or create users in other organizations | Landing doc §7 item 14 | High; live in production, in CER's code and `122136d`; most urgent |
| CSV export returns any pod's readings to any logged-in user (finding 11) | [`SECURITY_FINDINGS.md`](SECURITY_FINDINGS.md); fixed on server `8463545`, not shipped | High |
| A non-superadmin with an empty organization sees every pod (A6) | Fixed on `8463545`, not shipped | Medium |
| A previous account's pod list survives logout and login in the same tab | Landing doc §7 item 19; `user-dashboard` `src/app/services/device-data.js:341`, `src/app/components/header.js` | Medium; shows a superadmin's pods to the next account on a shared computer |
| Revoke the old Gemini API key and the old Gmail app password | Landing doc §7 item 10 | Michael |
| `DEVICE_API_TOKEN` is superadmin with no expiry | [`MICHAEL_DEPLOY_BLOCKERS.md`](MICHAEL_DEPLOY_BLOCKERS.md) §8 | The user chose not to raise it before launch |
| Legacy unauthenticated `/water-data`, `/device`, `/duration/*` routes | Server `src/schemas/waterData.schema.ts` | Low; remove or authenticate |

## 3. Gilligan behaviour

| Item | Evidence |
|---|---|
| Over-flagging and repeated turbidity caveat | §1 |
| Michael cannot ask for a report without its turbidity disclaimers, or with sections left out, to share a clean PDF | §6 |
| "How is the water this week?" answers with readings, actions and next steps and offers a report, instead of a plain weekly summary | Landing doc §7 item 17 (L8 C1) |
| After a reload, a repeated summary request returns nearly the same answer | Landing doc §7 item 17 |
| Asking about another organization's pod by name answers about the caller's own pod without saying the named pod is unavailable | Landing doc §7 item 17 (L8 D1) |
| "My pod is broken" is declined instead of referred to sales@cleanearthrovers.com (finding 8); possibly an artifact of the catalogue being off, so recheck on production first | [`GILLIGAN_RESET_2026-09-28.md`](GILLIGAN_RESET_2026-09-28.md), "Gilligan behaviour" |
| Tools-on answers drop the withheld-history note, misparaphrase the water-type note, do not flag high dissolved oxygen (Q8), and called a pod silent for 30 hours active "in the last 24 hours" | Earlier mirror runs; recheck on production |

Already live in the release (`ddd6292`), not backlog: Q9 (silent pods, pH 2.07, reading age, empty series), Q10 findings 6, 7 and 10, K21b, U7 and the stripping of earlier answers' citation markers.

## 4. Release follow-through

1. Watch cer-gilligan and cer-api logs and Fireworks spend for the first days; Fireworks' dashboard can lag a day.
2. Raise cer-gilligan's maximum instances to 2 once the usage store has counted correctly across a revision restart ([`LIVE_TEST_LIST.md`](LIVE_TEST_LIST.md) L8); note that any `services update` creates a revision that gets no traffic while traffic is pinned, so route it.
3. Remove tags on revisions that no longer serve: cer-gilligan `rc1` (`00002-zoc`, the cer-demo Fireworks key), cer-api `rc1` (`00080-huy`, the revoked mail password), and the old `archive-v1` and `neumorphic` tags if Michael agrees.
4. Decide whether to disable the cer-demo Fireworks key; development and evaluation runs still use it.
5. The `main` merges of server and dashboard ([`GILLIGAN_LANDING_2026-09-29.md`](GILLIGAN_LANDING_2026-09-29.md) §5; the server's conflicts are in `WaterAnalyticsService.ts`, take the release side), Michael tests first, pushes on consent; tell Michael `62993fe` ships with server `main`.
6. Delete the customer test user `winsyu475+certest@gmail.com` (Algalita); stop the local test dashboard container `cer-ui-l8-local` (port 3000).
7. Done in the handoff: runbook §3.4 now says the dashboard reads `API_PROXY_TARGET` at run time.
8. Access the user may want from Michael: Cloud Build source-bucket write (skips local builds), and `roles/datastore.user` limited to the `gilligan` database to reset a user's daily usage (`gilligan_usage/<userId>_<UTC day>`; limits also reset at 00:00 UTC).
9. Recover `~/release/` (deploy settings `cer-gilligan.env.yaml`, deploy scripts, mirror env files), lost in the 2026-10-04 WSL move; the next cer-gilligan redeploy needs the settings file.
   Copies are in `release/` on `reflection` (`263edf3`); check `cer-gilligan.env.yaml` against the live revision `00004-r5q` before reusing it.
10. Land the user's uncommitted WSL path fixes on `reflection` (`.claude/settings.json`, `release/start-rc2-emulator.sh`) and the 28 worktrees' stale `.claude/settings.json` deny paths.

## 5. Other pushes and branches waiting on the user

Dashboard `task/gilligan-ux`; server `task/gilligan-citation-title`, `fix/invited-login`, the Q11 branch and optionally `test/launch-issues`; the Q11 and A6 server branches and mirror testing were suggested chats.

## 6. Stakeholder request: editable reports

Michael, 2026-10-07, after using the live Gilligan:

> I asked it to exclude the turbidity disclaimers from the report so that I could share a clean PDF copy of it online and it wouldn't do it
>
> can it omit areas of the report?
>
> I've seen it give me different report alterations so I thought it would maybe be able to do so

The user offered two directions: the model writes the whole report as HTML, converted to PDF (estimated 3-15 cents a report, not measured), or the model edits a fixed HTML template with named sections, such as a warning section it can remove on request.
Michael: "I would say the HTML is the better idea".
**Status 2026-10-09:** idea 1 (report options on the tool) is built on cer-demo `task/report-omit` and server `task/gilligan-report-omit`, awaiting a Mirror test ([`REPORT_OMIT_MIRROR_TEST.md`](REPORT_OMIT_MIRROR_TEST.md)) and Michael's approval of sample PDFs; the decision is in [`timeline.md`](../timeline.md).
Research items 2, 3, 6 and 7 were settled by the user: removal is allowed on explicit request, notes are kept by default, a copy says what it omits, the zero-AI-calls decision stands, and omitted copies count against the quota as before.

How the report works today:

- The report is deterministic: `src/report/narrative.ts` makes no model call, by the team's zero-AI-calls decision confirmed with Michael, and `src/report/renderPdf.ts` draws a fixed layout with `pdfkit`.
- The model's only inputs are `generate_report`'s `time_range` and `device` (`src/tools/generateReport.ts`); it cannot omit, reword or add anything.
- The variation Michael saw comes from the data, through the templates in `narrative.ts`, not from the model; the user told Michael the model edits certain areas, which should be corrected with him.
- The turbidity wording comes from fixed text, for example `TURBIDITY_NO_BASELINE_TEXT` and the clarity-band note (`renderPdf.ts:547`, `renderPdf.ts:571`).

Ideas worth considering:

1. Report options on the tool: `generate_report` takes a list of optional sections or notes to leave out, and the deterministic renderer honours it; no new rendering engine and no extra model cost.
2. An HTML template with named, optional sections, rendered to PDF (Michael's preference); the model chooses which optional sections to keep and may fill marked text slots.
3. The model writes the whole report as HTML; most flexible, but gives up the deterministic report, costs more per report and can misstate numbers.
4. Editing outside the chat: the dashboard shows the report with toggles or editable text before download, with no model involved.
5. Two outputs: a full internal report and a shareable public summary with a fixed, reviewed set of sections.

Research still to do:

1. Get the PDF or screenshot Michael was looking at and list exactly which text he calls the turbidity disclaimers.
2. Decide which sections may be left out: removing the caveat while keeping turbidity values tells a public reader an uncalibrated index is a measurement, so some notes may only be removable together with the values they qualify.
3. Whether a shared or edited report should say so (for example "edited by the operator" or "summary version"), since it carries CER's name.
4. HTML-to-PDF engines that fit cer-gilligan's Node image on Cloud Run: headless Chromium's image size, memory and cold start against lighter libraries.
5. Measure the cost of options 2 and 3 on real reports instead of the 3-15 cent estimate.
6. Whether the zero-AI-calls decision still holds; options 2 and 3 reverse it and need Michael's agreement.
7. Both entry points: the chat tool and `POST /api/v1/reports`; whether an edited regeneration counts against the 5-reports-a-day guard.
8. How the over-flagging rules (§1) change the report first, so the report is not redesigned twice.
9. Tests: the report's existing suites, and how to check an edited report keeps its numbers.
