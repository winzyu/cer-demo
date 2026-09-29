# Launch issues checklist

Manual testing of the Gilligan launch issues for the release coordinator.
Release Sep 30, freeze Sep 28.
Step-by-step instructions for every item are in [`LAUNCH_ISSUES_WALKTHROUGH.html`](LAUNCH_ISSUES_WALKTHROUGH.html); this file records state and results.
All testing uses fabricated data; nothing here reads production except the one safety check under "Safety record".

## Stacks

| stack | dashboard | server | code | data | state (2026-09-27) |
|---|---|---|---|---|---|
| Current (CER's code) | :3100, `5dff5fd` | :5201, `693fc96` | the malware-cleanup commits, none of our changes | emulator :8180 | running, proof passed |
| Release (our fixes) | :3300, `9e18555` | :5301, `122136d` | `release/gilligan-2026-09-30` on both | emulator :8180 | running, proof passed |
| Mirror (Gilligan) | :3000, `9e18555` | :5101 `1ef21a7`, Gilligan :8010 `77cd4c9` | owned by the mirror end-to-end chat | emulator :8080, with fixtures | :8080 and :3000 up; :5101 and :8010 down |

- **Worktrees:** all under `~/code/clean-earth-rovers/worktrees/`, detached.
  - `server-original`, `dashboard-original`, `server-release-demo` and `dashboard-release-demo` hold the two stacks.
  - `server-original-seed` (`7dc36e2`) was used only to seed.
  - Each has `node_modules` linked to the main checkouts; dependency locks were compared first.
  - Malware scan: 0 hits in each after checkout.
- **Why the cleanup commits:** `693fc96` and `5dff5fd` are CER's code plus the malware removal.
  - `local` (`d12ad6d`, `fd103a0`) adds our relay and Gilligan UI commits.
  - Those commits touch no water, user, device or organization code, so either would do for the A items; the user chose "none of our changes" on 2026-09-27.
- **Emulator :8180:** runs from `~/code/clean-earth-rovers/emulator-original/` as project `demo-cer-original`, with single-project mode off.
  - Seeded with the pre-guard mirror seed `7dc36e2` under the label `conductive-fold-343604`, because CER's server hard-codes that id.
  - It holds 9 organizations, 27 users, 15 devices, 52 chats and 8,640 readings, and no fixtures.
  - The emulator keeps nothing on disk: restarting it needs a reseed.
- **Guard (`emulator-original/guard.env`):** sourced by the seed, both servers and both dashboards.
  - It sets the emulator host `127.0.0.1:8180` and a dead proxy for anything not local.
  - It also hides every credential: `GOOGLE_APPLICATION_CREDENTIALS` points at a missing file and `CLOUDSDK_CONFIG` at an empty folder.
- **Server settings:** both servers run built (`node dist/index.js`) with `NODE_ENV=production`, a random `ACCESS_TOKEN_SECRET` each, and placeholder mail and Stripe values.
  - `FRONTEND_URL` and `PROD_BASE_URL` point at their own dashboard and port.
  - The release server leaves `FIRESTORE_PROJECT_ID` unset, so it reads the same data.
  - Neither has Gilligan configured.
- **Dashboard builds:** both were built with `next build`, with `NEXT_PUBLIC_API_BASE_URL` baked to their own server, and run with `next start`.
  - The user approved `next build` on `9e18555`, which does not descend from the rewritten `local`; its source scan was clean.
- **Proof** (2026-09-27): on both servers, `user-super-1@mirror.example.invalid` logs in with 200, and the only outbound connection is to `127.0.0.1:8180`.

## Safety record

- 2026-09-27, after seeding: the user ran five status-only production lookups for fabricated document ids.
  - The ids were `organizations/org-harbor-000000001`, `users/user-harbor-admin-01`, `users/user-orphan-000001`, `devices/doc-harbor-pier-a` and `chats/chat-mirror-0001`.
  - All five returned 404, so the seed wrote nothing to production.
  - The response bodies were discarded.
- A production-export script (`firestore-copy.sh`, session scratchpad only) was written and never run.
  - The user chose fabricated data instead.

## Spend and quota

| date | questions | reports | spend | running total of the $10 mirror budget |
|---|---:|---:|---:|---:|
| 2026-09-27 | 0 | 0 | $0.00 | about $2.56 spent before this chat; $2.56 |

Allowance used per persona (20 questions and 5 reports per UTC day, Mirror only): none so far.

## Commits under test

Checked with `git merge-base --is-ancestor`, and with `git cherry` where a fix was cherry-picked.

| fix | commit | in release `122136d` | in mirror `1ef21a7` |
|---|---|---|---|
| A2 user routes | `f9607bd` | yes | no |
| A3 period scope | `78e2dfb`, `ccc759e` | yes | as cherry-picks `42ea5da`, `ba7376a` |
| A4 CWA Old | `510cf00` | as `9751f8f` | as cherry-pick `3e7c3fb` |
| A5 invited login | `f7dec3c` | yes | no |
| Firestore project from env | `0003170` | yes | no |
| A1 CSV scope (Q11) | not written | no | no |
| A6 no-organization filter | not written | no | no |
| B items (Q10 fix round, U7, `task/q9-land`) | no branches yet | n/a | n/a |

## Items

Finding numbers come from the end-to-end results: 1-5 from 2026-09-25, 6-11 from 2026-09-27.
"Guide" is the matching check ID in `GILLIGAN_MANUAL_TEST_GUIDE.md`.
States: **original** is CER's code (the Current stack), **before** is our stack without the fix, and **after** is the branch with the fix.
Every result below is **not run** unless stated.
The 2026-09-29 run (about 00:25-00:45 UTC) sent the dashboard's own requests straight to :5201 and :5301 as each persona, $0, after checking :8180 still held the seed's counts (9, 27, 15, 52 and 8,640).

### A1. CSV export returns any pod's readings

- **Tag:** Michael demo. High. Finding 11. Guide D6.
- **Preconditions:** Current and Release stacks; Harbor admin, with Superadmin as a control; Lakeside `dev:100000000000003` and Demo `dev:100000000000006`.
- **Steps:** send `POST /api/v1/water/export/csv/<label>` with a 7-day `startDate` and `endDate` in ISO format, as the Export dialog sends it (walkthrough A1).
- **Actual (reported):** 200 with 167 rows for pods Harbor doesn't own.
- **Expected:** refused like `/water/period` (400 `Device not found`); Harbor's own pod and a superadmin still get 200.
- **Why wrong:** any customer can download another organization's data, and pod labels aren't secret.
- **Who, production:** every logged-in customer; likely live. `WaterAnalyticsService` on CER's `main` differs from `693fc96` in label handling, so still compare `findDeviceWaterDataExportCSV` there with `git show` before the demo.
- **Cause:** `WaterAnalyticsController.exportCsv` never passes the caller; `findByLabel(device, null)` applies no organization filter.
- **Fix:** plan Q11, not written.
- **Result (2026-09-29):** original confirmed; release (still unfixed) confirmed.
- **Evidence:** a 7-day export as Harbor admin returns 200 with 165 rows for `...001`, `...003` and `...006` on both stacks, and the DEVICE column names Lakeside Buoy 2026 and Demo Public Dock Buoy; Superadmin gets the same.
  - The orphan also exports `...003` (200, 165 rows) on both stacks.

### A2. User lookups need no login

- **Tag:** Michael demo. High. `SECURITY_FINDINGS.md` §8. Guide K16.
- **Preconditions:** servers :5201 and :5301; no token; then Harbor admin and Superadmin on :3300.
- **Steps:** `GET /api/v1/users/all`, `GET /api/v1/users/user-lake-cust-0001` and `GET /api/v1/test-db`, with no token (walkthrough A2).
- **Actual (from code):** full user records and project and database details, with no token.
- **Expected:** `/users/all` 401 without a token and refused for non-superadmins; `/users/:id` only for the user, a same-organization admin or a superadmin, 404 otherwise; `/test-db` gone.
- **Why wrong:** anyone on the internet can pull the customer contact list.
- **Who, production:** never confirmed against production; keep it that way.
- **Fix:** `fix/user-route-auth` `f9607bd`, pushed; in release `122136d`, not in mirror `1ef21a7`.
- **Result (2026-09-29):** original confirmed; after passes, with the notes below.
- **Evidence:** Current, no token: `/users/all` 200 with all 27 users, `/users/user-lake-cust-0001` 200, `/test-db` 200 naming project `conductive-fold-343604`.
  - Release, no token: 401, 401 and 404; `/users/all` 403 for Harbor admin and 200 (27) for Superadmin; `/users/user-harbor-cust-01` 200 for Harbor admin, the user and Superadmin.
  - The leaked records hold id, name, user name, email and pods, not role or organization as the card said.
  - Another organization's user gets 404 when a Harbor admin asks but 403 when the Lakeside customer asks, so a customer can tell that an id exists (low).

### A3. The period query trusts the caller's pod label

- **Tag:** Michael demo. High. Plan P3. Guide P4b, D2b.
- **Preconditions:** Current and Release; Harbor admin; Superadmin as a control.
- **Steps:** `GET /api/v1/water/period/7/day?device=dev:100000000000003` and `GET /api/v1/water/last/dev:100000000000003` (walkthrough A3).
- **Actual (original, expected):** 200 with Lakeside's readings.
- **Expected:** 400 `Device not found`; superadmin 200.
- **Why wrong:** the same leak as A1, through the dashboard's data path.
- **Fix:** `task/gilligan-release-p3-p4` `78e2dfb`, `ccc759e`; in release; in mirror as cherry-picks.
- **Also record:** on the Mirror, a relay call with `device=dev:100000000000006` answers that it cannot find the pod (one question).
- **Result (2026-09-29):** original confirmed for `/water/period` only; after passes.
- **Evidence:** Current, Harbor admin: `/water/period/7/day?device=dev:100000000000003` 200 with 165 rows, every one `dev:100000000000003`; Release 400 `Device not found`; Superadmin 200 (165) on both.
  - `/water/last/dev:100000000000003` is already 400 for Harbor on Current: CER's `getLastDataByDevice` checks the caller's organization's pods, so the card's "also `/water/last`" leak does not exist.

### A4. CWA Old merge with a missing or empty organization

- **Tag:** internal. Plan Q6. Guide K8, K10, M1, M2.
- **Preconditions:** Mirror, fixtures `dev:100000000000018` (no organization field) and `dev:100000000000019` (`organization: ""`); Lakeside customer; Lakeside Buoy 2026.
- **Steps:** ask for 30 days of history with `PREDECESSOR_PERIOD_HANDOFF=true`, then `false`; period calls for `...018` as Lakeside and Harbor; repeat as Superadmin.
- **Expected:** `true` merges the Spare Pods' history; `false` withholds it with a note; another organization's predecessor always withheld; superadmin gets merged history withheld.
- **Fix:** server `510cf00` (mirror `3e7c3fb`, release `9751f8f`) and cer-demo `dev`.
- **Result:** not run (needs the Mirror's Gilligan).

### A5. Invited user with no password gets a 500 at login

- **Tag:** Michael demo if time allows. Medium. Finding 1. Guide P2c, A3.
- **Preconditions:** Current and Release; `user-harbor-cust-3@mirror.example.invalid`, any password.
- **Steps:** log in on `/login` with Network open.
- **Actual (reported):** 500, and the form shows no message.
- **Expected (from `f7dec3c`):** 401 with "Finish setting up your account before logging in", shown as "Login failed: ..." on the page.
- **Why wrong:** a real invited customer can't get in and sees nothing explaining why.
- **Fix:** `fix/invited-login` `f7dec3c`, committed, not pushed; in release.
- **Result (2026-09-29, API only):** original confirmed; after passes.
- **Evidence:** the stored user has no `password` field; Current returns 500 with a raw schema error (`invalid_type`, `password`, `Required`) as its message, Release 401 "Error: Finish setting up your account before logging in, please try again."
  - Both login pages show `Login failed: ` plus the server's message, so Current most likely shows that raw schema text rather than no message; confirm in a browser.

### A6. A user with no organization sees every pod

- **Tag:** Michael demo. Medium. Finding 4. Guide A1h, D4.
- **Preconditions:** Current and Release; `user-orphan-1@mirror.example.invalid`.
- **Steps:** count pods on `/home` and in Export CSV's menu; on the Mirror also ask Gilligan "List my pods".
- **Actual (reported):** every pod.
- **Expected:** no pods, and a message that the account has no organization.
- **Why wrong:** it fails open.
- **Who, production:** no production user is in this state (checked 2026-09-26).
- **Fix:** not written.
- **Result (2026-09-29, API only):** original confirmed; release (unfixed) confirmed, partly.
- **Evidence:** `GET /devices`, which feeds `/home` and Export CSV's menu, returns the same 5 pods to the orphan as to Superadmin on both stacks.
  - Data access differs: on Current the orphan gets `...003`'s period (200, 165) but 400 on `/water/last`, so `/home` lists pods without latest readings; on Release period and last are both 400, but CSV export still returns 200 (A1).
  - The chart endpoint returns no datasets for the orphan on either stack.

### A7. The cer-ui build trigger deploys from the dashboard's infected main

- **Tag:** Michael demo. High. Not testable locally.
- **Check:** Michael disables trigger `8ad67b17-5439-4507-9718-5b2b5eb4abe9`; the user confirms it shows disabled in the console. Nobody queries it from here.
- **Result:** open.

### A8. Low-severity server items

- **Tag:** internal. Deferred. Guide P5, M14.
- `/water-data` gives 500 on a numeric `lat`: record "before" on Current.
- The period query caps an organization's pods at 10: no seeded organization has more than 10 pods, so record from code reading.
- **Result:** not run.

### B1. A pod that moved claims the whole period

- **Tag:** internal. Must. Finding 6. Guide K6, M4.
- **Preconditions:** Mirror; `user-lake-cust-1`; Lakeside Mobile Buoy `dev:100000000000016`.
- **Steps:** "Summarize the last 60 days", then a 60-day report, each in a new chat.
- **Actual (reported):** current-site values, but the answer, PDF title and Summary state the full period; only Data Quality mentions 432 excluded readings, beside 1,728 "readings" in another unit.
- **Expected:** the covered dates and the exclusion stated everywhere; one unit for counts; no earlier-site value (1,300-1,700 uS/cm, pH 6.7-7.3).
- **Fix:** plan Q10, fix round (no branch yet).
- **Result:** before not run; after not run.

### B2. A fresh-water pod is judged against a salt-water predecessor

- **Tag:** Michael demo for the rule. Must. Finding 10. Guide M13.
- **Preconditions:** Mirror; `user-lake-cust-1`; Lakeside Buoy 2026.
- **Steps:** 60 days of history, then a 60-day report, each in a new chat.
- **Actual (reported):** conductivity 350 to 49,992 uS/cm flagged Exceedance; Action Required, from salt-water Lakeside Testbed.
- **Expected:** no fresh-water exceedance from the predecessor; check the fix branch's `SPECS.md` for the rule.
- **Fix:** plan Q10, fix round.
- **Result:** before not run.

### B3. "My pod is broken" gets declined

- **Tag:** Michael demo. Should. Finding 8. Guide K11.
- **Preconditions:** Mirror; `user-harbor-cust-1`; Harbor Pier Buoy.
- **Steps:** "My pod seems broken, who should I contact?" in a new chat.
- **Actual (reported):** "Outside supported scope ... I'm missing any contact or support details."
- **Expected:** sales@cleanearthrovers.com or the usual CER contact (O1); nothing invented.
- **Fix:** plan Q10, fix round.
- **Result:** before not run.

### B4. No location note, and one glitch reading sets Action Required

- **Tag:** internal. Should. Finding 7. Guide K7, C5.
- **Preconditions:** Mirror with cer-demo `dev` `5922109` or later and dashboard `9e18555` or `817a7c2`; `user-river-cust-1`; River Watch Float `dev:100000000000017`.
- **Steps:** "How is the water this week?" twice, in two new chats.
- **Actual (reported, on a cer-demo that sent no notes):** no location note; Action Required from one 0.00 mg/L oxygen reading.
- **Expected:** a "location not recorded" note, never "Current site not assessed"; one implausible 0.00 does not set the status alone.
- **Result:** recheck not run (the mirror still runs `77cd4c9`, which predates `5922109`).

### B5. A superadmin gets a report on a retired pod

- **Tag:** internal, record only. Finding 9. Guide K9.
- **Steps:** as `user-super-1` on Lakeside Buoy 2026, "Summarize the last 60 days, including the history of Lakeside Legacy Pod".
- **Actual (reported):** a 60-day report for Lakeside Legacy Pod itself.
- **Expected:** undecided; the coordinator recommends accepting it. The user decides.
- **Result:** not run.

### B6. Q9 fixes

- **Tag:** should; the pH band is a Michael demo item. Guide C11, C12, K5, M6.
- **After on:** cer-demo `task/q9-land` (from `cloud/q9-logic` `bc097e1` and `cloud/q9-c1-d1` `ad7eec9`); the branch does not exist yet.
- **C1:** superadmin asks "Which of my pods are online right now?". Silent pods are dropped today; they should be listed as silent with their last-reading age.
- **D1:** pH 2.07 passes plausibility today; it should be flagged implausible outside 3-12 and excluded. Blocked on the mirror: no low-pH fixture (the E2E checklist step used a real production pod, so it is not reused).
- **#3:** the PDF never states its reading age; it should.
- **#4:** a 1-day report on thin data shows an empty series; it should show the readings that exist. Blocked: no 30-minute fixture.
- **Also:** listed `excluded_implausible_min/max` must match the values actually excluded.
- **Result:** not run.

### B7. Standing caveat under answers that cite documents (U7)

- **Tag:** internal. Must. Guide K20.
- **Steps:** one education question ("What does conductivity measure?") and one data question, each in a new chat.
- **Expected:** the approved caveat under the document answer only. Draft: "Answers draw on document excerpts and may not cover every step; check the cited sections before acting."
- **Result:** not run (no U7 dashboard branch yet).

## Basic user testing

Everyday flows from the walkthrough's part 2; a failure is a regression.

| ID | flow | stacks | result |
|---|---|---|---|
| U1 | log in, wrong password, log out | Current, Release | pass (API, 2026-09-29): 200 and 401 "Password incorrect" on both; log out only clears the browser's token, which has no expiry (`SECURITY_FINDINGS.md` item 5) |
| U2 | each persona sees only their own pods | Current, Release | pass (API): Superadmin 5, Harbor admin and customer Harbor Pier Buoy only, Lakeside customer Lakeside Buoy 2026 only, on both |
| U3 | own pod's pages and period data load | Current, Release | pass (API): the six pages answer 200; Harbor's last, chart (pH, 1 and 7 days, all points valued), dial and map averages, and 7-day period (165) all 200 on both; rendering not checked in a browser |
| U4 | export own pod's CSV | Current, Release | pass (API): Harbor admin and customer get 200 with 165 rows for `...001` on both |
| U5 | document question with sources | Mirror | not run |
| U6 | pod data question with reading age | Mirror | not run |
| U7 | report offer and PDF | Mirror | not run |
| U8 | chats saved and reopened | Mirror | not run |
| U9 | allowance line counts down | Mirror | not run |
| U10 | phone layout | Mirror | not run |

## Next

1. Run A1, A2, A3, A5 and A6 on Current, then on Release ($0), and U1-U4 on both.
2. Before the Michael demo, compare the A1 and A3 functions on CER's `main` with `git show`, without checking it out.
3. Ask the mirror chat before using :3000, :5101 or :8010; the B items and U5-U10 need its Gilligan.
