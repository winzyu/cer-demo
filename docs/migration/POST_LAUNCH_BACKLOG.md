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
10. Land the user's uncommitted WSL path fixes on `reflection` (`.claude/settings.json`, `release/start-rc2-emulator.sh`) and the 28 worktrees' stale `.claude/settings.json` deny paths.

## 5. Other pushes and branches waiting on the user

Dashboard `task/gilligan-ux`; server `task/gilligan-citation-title`, `fix/invited-login`, the Q11 branch and optionally `test/launch-issues`; the Q11 and A6 server branches and mirror testing were suggested chats.
