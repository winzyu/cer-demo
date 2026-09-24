# Live test data and cleanup ledger

The supervisor allowed test users and organizations on the live backend on 2026-09-24, provided they are deleted before launch.
This file is the plan (release plan T1) and the ledger: every record created on the live backend is listed here before the next one is created, and ticked when it is deleted.
Each write batch is announced in chat and approved by the user first.

## What the tests must show

1. A member sees their own organization's pods and nothing else, in chat, in reports and on the direct `/water/period` endpoint.
2. A member of an organization with no pods sees no pods at all; today such an organization can read every pod's readings through `/water/period` (`SECURITY_FINDINGS.md` §1), and that must fail once Task E is deployed.
3. Naming another organization's pod, by name or by device id, gets a refusal and no data.
4. The daily limits count per user and refuse the 21st question and the 6th report.

## Test set

| record | how it is created | purpose |
|---|---|---|
| Organization "CER Gilligan Test A" with admin user A1 | `POST /users/create` (creates the organization and an admin in one call) | the member side of checks 1, 3 and 4 |
| Organization "CER Gilligan Test B" with admin user B1, and no devices | `POST /users/create` | check 2, the empty-organization case |
| Device record owned by Test A, with an id that matches no real hardware | `POST /devices` with the superadmin token | gives Test A a pod of its own; it has no readings, so it exercises the no-data path |
| Member user A2 in Test A | the team invitation flow | the limits are per user, so a second member checks they are not shared |

Test emails use plus-addresses on one mailbox the user controls, so verification and invitation mail arrive somewhere readable.

## What this set cannot show

No test organization can own a pod with real readings without reassigning a customer's pod or duplicating a real device id, and neither is done.
The positive path "a member reads their own pod's real readings" is therefore checked with the existing superadmin token and the offline `test/fixtures/pod-scope/` tests, not with a test member.
If the supervisor can lend a pod that is not deployed for a customer, assigning it to Test A would close this gap; ask before relying on it.

## Order

1. Create Test B and B1, then run check 2 against the current production server: it is expected to show the hole, which gives the before-and-after evidence for Task E.
2. Create Test A, A1, A2 and the device record; run checks 1, 3 and 4 through the local stack.
3. After Task E is deployed on the staged server, rerun check 2.
4. On September 30, before traffic moves (release plan L8, T3), delete everything below in reverse order and confirm each record is gone.

## Ledger

| # | created | collection or endpoint | id | purpose | deleted |
|---|---|---|---|---|---|
