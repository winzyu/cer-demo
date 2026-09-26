# Things to test live

What must be checked against live data after it passes on the local Firestore mirror.
The mirror comes first for everything (user decision 2026-09-25); an item lands here when the mirror cannot prove it, because it depends on production data, production configuration or access the mirror does not have.
Live writes follow [`LIVE_TEST_DATA.md`](LIVE_TEST_DATA.md): each batch is announced and approved, and every created record goes in its ledger.
Live reads are announced first.

Add an item when a decision, fix or mirror run leaves something only live data can show.
Mark it done with the date and where the evidence is.

## 1. The mirror scenarios, repeated with live test users

The mirror ticket (`GILLIGAN_E2E_TEST_TICKET.md`, on branch `docs/gcp-test-env`) defines nine scenario groups.
Phase 1 ran on the mirror on 2026-09-25: 41 questions, 36 pass, 5 fail.
On live, run them as the T1 test users (release plan T2), with the release limits of 20 questions and 5 reports rather than the mirror's 5 and 3.

| group | what it checks | mirror 2026-09-25 | live |
|---|---|---|---|
| A arrival | each persona's pod list, history and quota line; the pod-less customer | fail: the orphan's picker lists every pod (A1); an invited user's login returns 500 (A3) | open |
| B no pod | definitions, a follow-up, "which pod?", a safety refusal, prompt injection, Spanish | pass | open |
| C pod data | salt vs fresh water, placeholder thresholds, dead sensors, 60-day history, all-pod comparisons | pass | open |
| D isolation | other organizations' pods by name, label and crafted URL; the orphan; the no-pod customer | fail: the orphan sees every pod in answers (D4) | open |
| E history | legacy chats, persistence across reloads and restarts, an answer landing in the right chat | fail: an answer that arrives after switching chats does not land in its chat (E4) | open |
| F reports | offer, download, re-download, 60-day chain, report limit | pass | open |
| G quota | the allowance in the page, across restarts, per user | pass | open |
| H failures | services down, double-send, a 2,000-character question, a nearly-full chat document | fail: a double-click sends two questions (H3) | open |
| I layout | the dashboard widget, phone width | not run | open |

## 2. Release decisions that depend on production data

| # | check | why the mirror is not enough | owner | status |
|---|---|---|---|---|
| L1 | **CWA Old merges into Old Woman Creek 2026** (decided 2026-09-25, release plan Q6). A Cleveland Water Alliance member sees CWA Old's readings as part of OWC 2026's history, within the current site; a member of any other organization gets nothing for CWA Old by name, label or a crafted `/water/period` call. | CWA Old's organization id `T0Cl83CJ…` is a real dangling reference that the API cannot show; the mirror only fakes one. Needs a test user in CWA (a live write) or a CWA member's account. | Claude, user approves | open |
| L2 | **Current site only** (decided 2026-09-25, release plan Q3). For Old Woman Creek 2026 and Marina Park, chat answers, comparisons and a report cover only the latest site (Huron OH for OWC 2026), and never quote readings recorded in North Carolina, Utah or elsewhere. | Relocation lives in production coordinates (`best_lat`, `best_lon`, `best_location`); Q3 must first confirm every pod's rows carry them. | Claude | open |
| L3 | **Production-shaped readings.** The server reads real rows without schema errors. | The mirror ticket's known defect: `WaterDataRepository` wants string `lat`, `lon` and `bat`, while production stores numbers and has no `bat`. | Claude | open |

## 3. Fixes to re-check live once deployed

| # | check | source | status |
|---|---|---|---|
| L4 | A member of an organization with no pods sees no pods, in the picker, in answers and on `/water/period`. | Mirror A1 and D4; `SECURITY_FINDINGS.md` §1 | open |
| L5 | `/users/all`, `/users/:id` and `/test-db` refuse unauthenticated calls. | `fix/user-route-auth`, `SECURITY_FINDINGS.md` §8 | open |
| L6 | An invited user with no password gets a readable 4xx, not 500. | Mirror A3; server `UserService.login` | open |

## 4. After the demo is approved

| # | check | source | status |
|---|---|---|---|
| L7 | Gilligan answers with CER's own Fireworks key from Secret Manager, and the old cer-demo key is rejected once rotated. | Release plan S5 | open |
| L8 | The usage store runs in the dedicated Gilligan database: counts survive a revision restart, `expireAt` retention removes only past days, and the service account reaches only that database. | Release plan F2, S3; `GILLIGAN_FIRESTORE_FRAMEWORK.md` "Corrections" | open, waiting on Firestore access |
