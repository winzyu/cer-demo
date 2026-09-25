# Gilligan end-to-end results, 2026-09-25

Run of [`GILLIGAN_E2E_TEST_TICKET.md`](GILLIGAN_E2E_TEST_TICKET.md) against the Firestore mirror.
So far only the preflight has run; phase 1 waits for the model budget approval.

## Stack as run

| piece | checkout and commit | notes |
|---|---|---|
| Firestore emulator | server `.worktrees/mirror`, already running | Reseeded 2026-09-25 23:03 UTC: 9 organizations, 27 users, 15 devices, 52 chats, 8,640 readings over 30 days |
| Server :5101 | `clean-earth-rovers-server` branch `mirror/e2e-p3` at `ba7376a` | `mirror/firestore-emulator` (`7dc36e2`) plus P3 and P4 cherry-picked from `task/gilligan-release-p3-p4` (`78e2dfb`, `ccc759e`); the user chose to include them |
| cer-demo :8010 | `feat/service-release` at `cc8a300` | Settings as the ticket lists, with `QUERY_QUOTA_STORE=firestore`, `QUERY_QUOTA_WINDOW=1d` and `FIRESTORE_DATABASE_ID=(default)` exported so they override `.env` |
| Dashboard | not started | Not needed for the preflight |

`.env.mirror.local` was created in this session with the user's permission.
Beyond the README's list it sets `GILLIGAN_BACKEND=rag`, without which the server answers Gilligan with Gemini instead of cer-demo, plus `CER_RAG_BASE_URL=http://localhost:8010` and `FRONTEND_URL=http://localhost:3000`.
`DEV_CHAT_STORE` and `DEV_UNVERIFIED_AUTH` are left unset so chats persist in the emulator and tokens are verified.

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
3. **Quota cannot be keyed per user on this stack.**
   `CER_RAG_SERVICE_KEY` is unset in cer-demo, and the mirror server does not send a service key at all (that change is on the server's `feat/service-key` branch).
   Quota therefore keys on the bearer token, so a fresh login starts a fresh allowance; G3 cannot test the release policy until that branch is in the stack.

## Not run yet

Phase 1, phase 2 and the dashboard.
The bot under `scripts/e2e/` is not written yet.
