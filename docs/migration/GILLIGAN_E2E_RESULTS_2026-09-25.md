# Gilligan end-to-end results, 2026-09-25

Run of [`GILLIGAN_E2E_TEST_TICKET.md`](GILLIGAN_E2E_TEST_TICKET.md) against the Firestore mirror.
The preflight and phase 1 have run; phase 2 has not.
Phase 1 ran on a fresh seed with the bot in `scripts/e2e/`, in three passes that spent 47 of the 80 approved questions.

## Stack as run

| piece | checkout and commit | notes |
|---|---|---|
| Firestore emulator | server `.worktrees/mirror`, already running | Reseeded 2026-09-25 23:03 UTC: 9 organizations, 27 users, 15 devices, 52 chats, 8,640 readings over 30 days |
| Server :5101 | `clean-earth-rovers-server` branch `mirror/e2e-p3` at `37fec03` (preflight at `ba7376a`) | `mirror/firestore-emulator` (`7dc36e2`) plus P3 and P4 from `task/gilligan-release-p3-p4` (`78e2dfb`, `ccc759e`) and, for phase 1, the service key from `feat/service-key` (`9ef59b7`); the user approved all three |
| cer-demo :8010 | `feat/service-release` at `cc8a300` | Settings as the ticket lists, with `QUERY_QUOTA_STORE=firestore`, `QUERY_QUOTA_WINDOW=1d` and `FIRESTORE_DATABASE_ID=(default)` exported so they override `.env`; for phase 1 also `CER_RAG_SERVICE_KEY`, the same test key as the server's |
| Dashboard :3000 | `user-dashboard` branch `local` | `NEXT_PUBLIC_API_BASE_URL` and `API_PROXY_TARGET` set to `http://localhost:5101` in the shell, overriding `.env.local` |

`.env.mirror.local` was created in this session with the user's permission.
Beyond the README's list it sets `GILLIGAN_BACKEND=rag`, without which the server answers Gilligan with Gemini instead of cer-demo, plus `CER_RAG_BASE_URL=http://localhost:8010` and `FRONTEND_URL=http://localhost:3000`.
`DEV_CHAT_STORE` and `DEV_UNVERIFIED_AUTH` are left unset so chats persist in the emulator and tokens are verified.
For phase 1 it also holds `CER_RAG_SERVICE_KEY`, a random test key that the bot hands to cer-demo without printing it.
With the key set, cer-demo refuses a direct call with 401 ("accepts requests from the CER server only") and accepts the server's relayed calls.

## Preflight

| # | result | observed |
|---|---|---|
| P1 | pass | `GET /devices` with no token: 401 |
| P2 | **fail** | Superadmin and Harbor admin log in (200); a wrong password gives 401; the invited `user-harbor-cust-3` gives **500** (finding 1) |
| P3 | pass | Superadmin sees 5 pods: Harbor Pier Buoy, Lakeside Buoy 2026, Demo Public Dock Buoy, Seaview Marina, `dev:100000000000012`; Harbor admin sees only Harbor Pier Buoy |
| P4 | pass | Harbor admin reads `dev:100000000000001`: last reading at 23:03:37 UTC, two minutes before the check; `/water/period/7/day` returns 168 hourly readings |
| P5 | fail, known | `GET /water-data` gives 500: the schema wants a string `water_data.lat` and gets a number (known defect) |
| P6 | pass | The server's only outbound connection is `127.0.0.1:8080`; every `[DB Config]` line names `(default)` and the ADC fallback, which the emulator host overrides; no `run.app` traffic |
| P7 | pass, with a gap | `/health` is 200 but does not report the tools or the quota; the startup log shows `SENSOR_TOOL` on, `REPORT_TOOL` on and `QUERY_QUOTA` on with counters in Firestore, every dimension unlimited (finding 2) |
| extra | pass | P3 is live: Harbor admin gets 400 `Device not found` for Lakeside's `dev:100000000000003` on both `/water/period` and `/water/last`, while superadmin gets 200 on the same requests |

## Findings

1. **Login of an invited user returns 500.**
   Steps: `POST /api/v1/users/login` with `user-harbor-cust-3@mirror.example.invalid` and any password.
   Observed: 500 with a zod error, `password: Required`.
   Likely cause: invited users have no stored password, and the user record fails schema validation in `UserService.login` before the password is compared.
   The mirror copies this shape from production, so production login probably behaves the same; the expected result is a 4xx such as "finish registration first".
2. **Quota is on but unlimited unless limits are set.**
   `.env` sets no `QUERY_QUOTA_REQUESTS`, `QUERY_QUOTA_TOKENS` or `QUERY_QUOTA_REPORTS`, so nothing is ever refused.
   F5 and G1 set their own limits, so this is configuration rather than a defect, but A1's "quota line shows the allowance" will show unlimited until a limit is set.
3. **Quota could not be keyed per user on the preflight stack.**
   `CER_RAG_SERVICE_KEY` was unset in cer-demo, and the mirror server did not send a service key (that change is on the server's `feat/service-key` branch), so quota keyed on the bearer token.
   Resolved for phase 1 by cherry-picking `9ef59b7` and setting one test key on both services; G2 then showed the count survives a fresh login.

## Phase 1

46 scenarios: 43 pass and 3 fail, and each failure is a product finding.
Run outputs are in `data/e2e/` (git-ignored): `phase1-2026-09-25` (A1 to H5), `phase1-2026-09-25-tail` (H6, I1) and `phase1-2026-09-25-rerun` (E4, H3, I2).
The reruns replaced results caused by bot defects, fixed before rerunning: a hang when a second tab took focus (H6), CORS preflight requests counted as questions (H3, I1), a check that read the history list as part of the open chat (E4), and typing into the login form before it settled at phone width (I2).
I1 was not rerun: its network log shows one preflight and one `GET`, so the question was asked once.
I2's rerun flagged Harbor admin's own D1 and D2 questions in their history list as leaks; the bot no longer scans chat titles, since they are always the user's own words and E6 covers other users' chats, and every layout check in I2 passed.

| group | result | notes |
|---|---|---|
| A arrival | A1 **fail**, A2 pass, A3 **fail** | Seven of eight personas see exactly their pods; the orphan sees all five (finding 4). No Gemini-era chat is listed for anyone, as decision D2 intends, so the ticket's "history lists their legacy chats" is out of date. The quota line is blank while every limit is unlimited. A3 is finding 1: 500, and the form shows no message at all |
| B no pod | 6 pass | Citations present; the follow-up stays in its chat; the Spanish question is answered in Spanish |
| C pod data | 10 pass | Mechanical checks only; answer quality is for the review sheet |
| D isolation | D1-D3 pass, D4 **fail**, D5 pass | No other organization's pod was named to Harbor admin, by name, by label or around the Old Anchorage merge; direct `/water` calls for `dev:100000000000006` get 400; a crafted relay call with `device=dev:100000000000006` answers that it cannot find the pod and names only Harbor Pier Buoy. D4 is finding 4 |
| E history | 6 pass | Gemini-era chats are neither listed nor continued: a question naming one starts a new chat and leaves it unchanged; history survives a restart of both services; an answer that arrives after switching chats lands in its own chat |
| F reports | 5 pass | PDFs named `cer-report-harbor-pier-buoy-<start>-to-<end>.pdf`, three pages, no leaked names; the 60-day Lakeside report has nothing from Lakeside Legacy Pod; a report allowance of 3 refuses the fourth download with 429 and `Retry-After`, the page says "Report limit reached", and chat still works |
| G quota | 3 pass | With 5 questions allowed the page shows "5 questions left, resets 09/26 17:00", then "Message limit reached", a disabled input, the reset time and "See plans"; the count survives a cer-demo restart and a fresh login; another user in the same organization keeps their own allowance |
| H resilience | 6 pass | cer-demo down, or the server stopped mid-answer, gives a readable error and the page recovers; one question per double-click or repeated Enter; a 2,000-character question is answered; logging out in another tab sends the page to login. H5 passes its checks but is finding 5 |
| I entry and layout | 2 pass | The dashboard widget asks once and clears the address bar; at 390 px there is no horizontal scroll and the report button fits |

No uncaught exception, console error, 5xx outside the scenarios that cause one, token in a URL, raw citation marker, `undefined`, `NaN` or `[object Object]` was seen, and no answer took longer than 60 s.

### Findings from phase 1

Numbered after the preflight findings above.

4. **A user whose organization is empty sees every pod, in the picker and through Gilligan.**
   Steps: log in as `user-orphan-1@mirror.example.invalid` and open Gilligan; ask "List my pods".
   Observed: the pod picker lists all five visible pods, and the answer names all five with their labels.
   Likely cause: the known upstream behaviour that an empty organization means unfiltered; the device API applies it to the caller's token, so Gilligan inherits it.
   Not tried: asking the orphan for another organization's readings, which the same path would likely serve.
   Before launch, either fix the filter or confirm that no production user has an empty organization.
5. **A long chat stops working with a raw error once its history passes about 100 KB.**
   Steps (H5): pad a chat to just under Firestore's 1 MiB limit in the emulator, open it and ask a question.
   Observed: the page shows "request entity too large"; no answer is produced and nothing is lost.
   Cause: the server sends the chat's whole history with each question, and cer-demo's `express.json()` uses Express's default 100 KB body limit, so cer-demo answers 413 long before the Firestore limit is reached.
   The history needs a cap (send only recent turns) or a larger limit, and the page should say the chat is too long and offer a new one.

## Review sheet

`data/e2e/phase1-2026-09-25-review.html` holds the 40 questions asked through the page, each with its persona, pod, expectation, answer and screenshot, for the user to mark.
The two direct API probes (D2, E2) are in the notes above.

## Not run yet

Phase 2 (persona exploration, up to 100 questions) waits on the user's decision.
