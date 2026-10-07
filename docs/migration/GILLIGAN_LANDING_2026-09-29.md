# Landing Gilligan in CER's develop and main, 2026-09-29

How the approved release reaches `develop` and then `main` of `user-dashboard` and `clean-earth-rovers-server`, and what was checked.
Decision: `timeline.md`, 2026-09-29 (server `122136d`; security fixes follow launch).

## 1. Release commits

| service | repository | release commit |
|---|---|---|
| cer-api | clean-earth-rovers-server | `122136d` (`release/gilligan-2026-09-30`) |
| cer-ui | user-dashboard | `fc13d16` (`release/gilligan-2026-09-30-rc2`) |
| cer-gilligan | cer-demo | `ddd6292` (`release/rc2`); deployed as its own service, not merged upstream |

`RELEASE_CANDIDATE.md` on `release/rc2` still names `8463545` as pending; this record and the timeline row supersede that cell, and `release/rc2` stays frozen.

## 2. Method

The merges are built without checking out `develop` or `main`: `git merge-tree --write-tree` computes the merged tree, `git commit-tree` records a merge commit with the upstream tip and the release commit as parents, and a local branch `land/gilligan-develop` holds it.
A merge whose tree equals the release commit (`git diff` prints nothing) carries exactly what was tested, so the checks in section 4 apply to it unchanged.
Each push is a plain fast-forward of the upstream branch to the merge commit, made only with the user's consent in chat.

## 3. Upstream state before landing

Fetched 2026-09-29; the tips have not moved since 2026-09-24.

| repository | `develop` | `main` |
|---|---|---|
| clean-earth-rovers-server | `a5b745e` | `3ed15ff` |
| user-dashboard | `d3b4a3f` | `c7ecede` |

- The long-line payload scan is empty on all four tips and both release commits (`git grep`, no checkout).
- Server `develop` is an ancestor of `122136d`.
- Dashboard `develop` is 12 commits behind `main` and has one commit of its own, a postcss payload removal byte-identical to `main`'s `c7ecede`; the release is based on `main`, so landing it brings those 12 commits into `develop`.
- Server `main` has cherry-picked copies of two `develop` commits (`675386d`, `3ed15ff`), and `develop` has Michael's device-merge work (`62993fe`) that `main` lacks; Gilligan's merge chains depend on it, so the `main` landing ships it.

## 4. Checks

| check | result |
|---|---|
| Server develop merge `5f04064` vs `122136d` | trees identical |
| Dashboard develop merge `5ae4993` vs `fc13d16` | trees identical |
| Server `122136d`: `npx tsc --noEmit` | clean |
| Server `122136d`: the 10 unit suites, singly, with `FIRESTORE_EMULATOR_HOST=127.0.0.1:1` | 10/10 pass, 76 tests; `AuthService` needs `ACCESS_TOKEN_SECRET` set to any test value |
| Dashboard `fc13d16`: `yarn install --frozen-lockfile`, then the payload scan | clean |
| Dashboard `fc13d16`: `node --test test/provenance.test.mjs` | 7/7 pass |
| Dashboard `fc13d16`: `yarn build` | passes; lint warnings only, all in CER's existing code; no `confirm-email` import error (P5) |
| End-to-end, free checks (section 4.1) | pass, except A6 as expected at `122136d` |
| End-to-end, paid delta test (G1, G3, B1, C1, F2 rechecks, cap $0.15), run `rc2-delta-2026-09-30` on 2026-09-30 | B1, C1, F1 and F2 pass (PDF `cer-report-harbor-pier-buoy-2026-09-24-to-2026-10-01.pdf`, 3 pages, no other organization); G1 blocked by the cap after 7 questions (at most $0.17, all tokens priced at the output rate) and G3 not reached; the full G1 needs about 20 questions, so the $0.15 estimate was too low |
| cer-gilligan image `ddd6292` built locally (`linux/amd64`, image `1d2c0bc1c5f4`), run with `~/release/cer-gilligan.env.yaml` against the emulator and the release server, 2026-10-01 | `/health` ok in production mode; 401 without or with a wrong service key; 400 without a user id; limits 20/5/1,000,000 per day; Harbor admin sees 1 pod, Lakeside customer 3; one paid question answered with USGS citation titles, counted 1 question and 25,042 tokens, stored in `gilligan` and not `(default)`; no errors logged |

The server's Jest config sets `roots: ['<rootDir>/../']`, so from a worktree it also runs every sibling worktree's copy of a suite; pass the suite path first and `--roots "$PWD"` after it.
The integration suites were not run: they reach the real `qa-db`.

### 4.1 End-to-end stack

Server `mirror/release-rc1` `8594338` (`122136d` plus only the mirror guard and fixture seed: `firebase.json`, `package.json`, `scripts/mirror/`, `src/config/database.ts`), dashboard `fc13d16` as a production build, cer-gilligan `release/rc2` `ddd6292` compiled (`dist/index.js`, packaged data checksums verified).
Ports 8082 (emulator, project `demo-cer-mirror`), 5103, 8012 and 3002, beside the other rc2 mirror on 8081, 5102, 8011 and 3001, which runs server `8463545`.
Seeded 2026-09-30T05:47Z with `--fixtures`: 22 devices, 13,680 readings.
The Fireworks key was replaced with a dummy value, so no check could reach the model.

| check | result |
|---|---|
| Pods per persona (`/devices`) | Superadmin 10; Harbor admin and customer 1 (Harbor Pier); Lakeside customer 3 (Lakeside 2026, moved and dissolved-oxygen fixtures); River Watch customer 1 (no-GPS fixture) |
| Orphan (no organization) | sees all 10 pods: A6, fixed only on `8463545`, shipping as a known defect by Michael's choice |
| `/users/all`, `/users/:id`, `/test-db` without a token | 401, 401, 404 |
| Wrong password; invited user without a password | 401; 401 "Finish setting up your account before logging in" |
| `/gilligan/check-quota` through the server to cer-gilligan's Firestore store | 20 questions, 5 reports, 1,000,000 tokens, window 1d |
| Dashboard pages `/`, `/login`, `/home`, `/gilligan`; `/confirm-email` | 200; 404 (P5) |
| Dashboard build carries the disclaimer (U1) and the standing caveat (U7) | yes |
| Login, pods and quota through the dashboard's own `/api/v1` proxy | pass; Lakeside customer sees its 3 pods |

Not covered without a model call: answer rendering (question stays visible, tables, citation titles, caveat placement), reports and saved chats; the paid delta test covers them.
Building the dashboard with `NODE_ENV=development` exported fails at page export; build it with `NODE_ENV` unset, as the runbook's clean build does.

## 5. Main

`git merge-tree` of server `origin/main` with the develop merge conflicts in `src/services/WaterAnalyticsService.ts` (`main`'s cherry-picked NOAA commit against `develop`'s device-merge changes); the resolution is the release side, and the resulting tree must equal `122136d`.
The dashboard `main` merge is clean, and its tree equals `fc13d16`.

Gates before either `main` push:

- The `cer-ui` Cloud Build trigger `8ad67b17`, which builds and deploys on every push to dashboard `main` with all traffic, is disabled (`MICHAEL_DEPLOY_BLOCKERS.md` #7).
- No other trigger watches server or dashboard `main` or `develop` (`gcloud builds triggers list`).
- Michael knows the server `main` landing ships `62993fe`.
- Recommended: the L8 staged smoke has passed.

## 6. Landing log

| step | repository | commit | when |
|---|---|---|---|
| develop | clean-earth-rovers-server | `5f04064`, pushed as a fast-forward from `a5b745e` | 2026-09-30 |
| develop | user-dashboard | `5ae4993`, pushed as a fast-forward from `d3b4a3f` | 2026-09-30 |
| main | clean-earth-rovers-server | | |
| main | user-dashboard | | |

Each push waits for the user's consent in chat: `git push origin 5f04064:refs/heads/develop` in the server and `git push origin 5ae4993:refs/heads/develop` in the dashboard, both plain fast-forwards.
Before pushing, fetch and confirm `origin/develop` is still `a5b745e` and `d3b4a3f`; if either moved, rebuild the merge and repeat section 4's tree check.

## 7. Findings

1. A test script's unquoted `curl --noproxy *` let the shell expand `*` into cer-demo's root file names, and curl requested three of them that resolve as `.md` domains (`AGENTS.md`, `CLAUDE.md`, `README.md`) over plain HTTP on 2026-09-30.
   The login requests sent the fabricated mirror password and `.invalid` persona emails; no real credential or token left the machine, because every login failed before a token existed.
   Quote the argument (`--noproxy '*'`) and add `--proto =http` to local checks.
2. `~/release/rc2-mirror.env.sh`, which the other rc2 mirror sources, sets `FIRESTORE_PROJECT_ID=conductive-fold-343604`, the production project; only `FIRESTORE_EMULATOR_HOST` keeps its cer-gilligan on the emulator.
   The land-check stack overrode it with `demo-cer-mirror` and pointed `GOOGLE_APPLICATION_CREDENTIALS` at the no-credentials file.
3. The land-check stack was stopped on 2026-09-30 when its background processes reached their time limit; the emulator kept nothing, so the paid delta test needs a restart and a reseed.
   To rebuild it, source `~/release/rc2-mirror.env.sh`, then export `FIRESTORE_EMULATOR_HOST=127.0.0.1:8082`, `FIRESTORE_PROJECT_ID=demo-cer-mirror`, `MIRROR_PROJECT_ID=demo-cer-mirror`, `GOOGLE_APPLICATION_CREDENTIALS=/home/winsy/release/no-production-credentials.json`, `DEVICE_API_BASE_URL=http://localhost:5103/api/v1`, `CER_RAG_BASE_URL=http://localhost:8012`, `NEXT_PUBLIC_API_BASE_URL` and `API_PROXY_TARGET` as `http://localhost:5103`, and `FRONTEND_URL=http://localhost:3002`; for free checks also set `FIREWORKS_API_KEY` to a dummy value.
   Start the emulator from a copy of `~/release/firebase-rc2.json` with ports 8082, 9152, 4002, 4402 and 4502; seed with `npm run mirror:seed -- --fixtures` in `worktrees/server-release-mirror`; start the server there with `PORT=5103 npm run dev:mirror`, cer-gilligan in `.claude/worktrees/rc2` with `PORT=8012 node dist/index.js`, and the dashboard in `worktrees/dashboard-land` with `NODE_ENV` unset, `yarn build` and `yarn start -p 3002 -H 127.0.0.1`.
   Give each background process a time limit longer than the session needs.
4. `gcloud builds submit` fails for the user (2026-10-01): no access to the `conductive-fold-343604_cloudbuild` source bucket (`testIamPermissions` shows no `storage.objects.create`).
   `gcr.io` redirects to Artifact Registry and the user holds `artifactregistry.repositories.uploadArtifacts`, so a locally built image can be pushed instead, or Michael grants object write on that bucket.
5. Michael's cer-api revisions of 2026-09-30 (`cer-api-prep-0930-1825`, `cer-api-stripe-live-0930-1825`) run the 2026-08-19 image `c0d9c6d0fe05`; only configuration changed: `STRIPE_SECRET_KEY` now reads `stripe-secret-live:1`, so the L6 cer-api update must keep it (`--update-*` flags only).
   That change also moved three of cer-api's credentials out of Secret Manager into plain revision settings; reported to Michael on 2026-10-01 with a request to move them back and issue new values.
   L6 waits for that fix, because a cer-api update copies the current settings into the new revision.
6. L5, 2026-10-01: the user pushed the locally built image and deployed `cer-gilligan` (revision `cer-gilligan-00002-zoc`, tag `rc1`, `https://cer-gilligan-98242557946.us-central1.run.app`) with `~/release/deploy-cer-gilligan-rc1.sh`.
   The first attempt (`00001`) failed only because a pasted multi-line command split after `--image`; the container refused to start without `CER_RAG_SERVICE_KEY`, as designed.
   Checks: runs as `cer-gilligan-runtime`, image `sha256:1d2c0bc1c5f4`, Fireworks `:2` and service key `:1` from Secret Manager, 1 CPU, 1 GiB, concurrency 8, 0-1 instances; anonymous 403 before B1; `/health` 200 with the user's identity token; `/api/v1/chat` 401 `service_key_invalid` without the key; startup log clean on database `gilligan`.
   The deploy's "Setting IAM policy failed" warning is expected: `--no-allow-unauthenticated` tries to remove an `allUsers` binding the user cannot edit, and none existed.
7. B1 check, 2026-10-01 (read-only): `cer-gilligan`'s IAM policy has no bindings, and anonymous `/health` and `/api/v1/chat` both get Cloud Run's 403, so B1 is not done yet.
8. L6 images, 2026-10-01, built locally with `docker build --no-cache --pull` from clean detached worktrees (`worktrees/build-cer-api-122136d`, `worktrees/build-cer-ui-fc13d16`; scan and `git status` empty):
   - cer-api `122136d`: image `gcr.io/conductive-fold-343604/cer-api:122136d`, local id `sha256:393ff60d0e73`, not pushed.
     It boots with dummy settings on the emulator project `demo-cer-mirror` and no credentials; `/` returns 200 and an unauthenticated `/api/v1/users/all` returns 401.
   - cer-ui `fc13d16`: a rehearsal image `cer-ui-rehearsal:fc13d16` with empty browser keys builds (CER's existing lint warnings only) and serves `/login` and `/gilligan` with 200; it must not be pushed.
     The release image is rebuilt with Michael's live Stripe publishable key and two map keys as `gcr.io/conductive-fold-343604/cer-ui:fc13d16`.
9. B1 confirmed, 2026-10-02 (read-only), after Michael's grant: `cer-gilligan`'s policy binds `allUsers` to `roles/run.invoker`; anonymous `/health` returns 200 (`status: ok`, Fireworks and Firestore configured) and `/api/v1/chat` without the key returns 401 `service_key_invalid`.
10. Michael, 2026-10-05: B2 added CER's Fireworks key as `cer-gilligan-fireworks-api-key:3`, and he deployed `cer-gilligan-00003-slr` (same image and settings as `00002-zoc`, key `:3`) with all traffic, ahead of the demo; `rc1` still tags `00002-zoc` on the cer-demo key.
    His `cer-api-secrets-1005-1653` (same 2026-08-19 image) reads `ACCESS_TOKEN_SECRET`, `GEMINI_API_KEY` and `NODEMAILER_APP_PASSWORD` from Secret Manager again (`jwt-secret:2`, `gemini-key:2`, `nodemailer-password:2`) and keeps `stripe-secret-live:1`, so item 5 is resolved; the old Gemini key and mail app password still need revoking at Google.
    `/health` on v3 is ok; no question has yet confirmed the new key, because the user's account cannot read the service key (A7 grants it to the two services only).
11. L6 images rebuilt 2026-10-05, after the WSL move emptied the local Docker store and left a corrupt build cache (cleared with `docker builder prune`):
    - cer-api `122136d`: local id `sha256:ef043bbebdaa`; same smoke as item 8 (`/` 200, unauthenticated `/api/v1/users/all` 401).
    - cer-ui `fc13d16`: `gcr.io/conductive-fold-343604/cer-ui:fc13d16`, local id `sha256:bb5aa228ddfa`, built with `API_PROXY_TARGET` the canonical cer-api URL and the live cer-ui service's Stripe publishable (`pk_live_`) and Google Maps keys; HERE is empty as on the live service and unused by the code.
      Both keys appear in `.next/static` and no `localhost:50` address does; `/login` and `/gilligan` return 200.
    Neither image is pushed yet.
12. L6 staged, 2026-10-05: the user pushed both images and deployed `cer-api-00080-huy` and `cer-ui-00070-dax` with `--no-traffic --tag=rc1` (`https://rc1---cer-api-tftuze6jba-uc.a.run.app`, `https://rc1---cer-ui-tftuze6jba-uc.a.run.app`); customers stay on `cer-api-secrets-1005-1653` and `cer-ui-00067-jid`.
    The pushed tags are OCI indexes; Cloud Run records their linux/amd64 manifests, `cer-api@sha256:d44bad154367` inside `ef043bbebdaa` and `cer-ui@sha256:f1fc2cf637cc` inside `bb5aa228ddfa`.
    The staged cer-api keeps Michael's four secret references and adds `GILLIGAN_BACKEND=rag`, `CER_RAG_BASE_URL` (cer-gilligan's canonical URL), `CER_RAG_TIMEOUT_MS=120000` and `CER_RAG_SERVICE_KEY` from `cer-gilligan-service-key:1`; anonymous `/` returns 200 and `/api/v1/users/all`, `/api/v1/users/<id>` and `/api/v1/users/test-db` return 401; the staged cer-ui serves `/login` and `/gilligan`.
    The dashboard's `src/lib/apiProxy.ts` reads `API_PROXY_TARGET` at run time, so the build argument has no effect: the staged cer-ui takes the live service's runtime `API_PROXY_TARGET`, the canonical cer-api URL, as intended, and a local test dashboard must set it with `docker run -e`.
    A local dashboard started without it fell back to the live cer-api, whose `/api/v1/users/all` answered an anonymous request with 200 JSON (body discarded unread): the open user routes are still live in production until L9.
13. L6 chain test, 2026-10-05: the user, on a local dashboard (`cer-ui-l6-local:fc13d16`, `API_PROXY_TARGET` the staged cer-api's `rc1` URL), asked a greeting, a document question, a one-pod week question and a week report; `cer-gilligan-00003-slr` logged three `/api/v1/chat` 200s (11-16 s), one `/api/v1/reports` 200 (3 s) and `/api/v1/usage` 200s, with no warnings or errors there or on `cer-api-00080-huy`, which confirms CER's Fireworks key (`:3`).
14. Finding, 2026-10-06 (code read, not exercised live): `POST /api/v1/users/account/:id` requires only a login (`authenticateToken`, no `requireRoles`), and `TeamUserService.updateAccount` writes the body's `role` and `organization` (and `email`) to any user id.
    Any logged-in customer can therefore make themselves `superadmin`, move into any organization, or change another user's email and take the account over through a password reset.
    `POST /api/v1/users/:id` and `DELETE /api/v1/users/:id` (admin or superadmin) check no organization, so an organization admin can edit, promote or delete users of other organizations, and `POST /api/v1/users` lets an admin create users in any organization.
    Present on CER's production code (`693fc96`) and on the release `122136d`; not in `SECURITY_FINDINGS.md`.
    The user's own account has only `datastore.entities.get` on the project, so a test user must be created and moved through the app as a superadmin.
15. Parked until after launch (user, 2026-10-06: the launch comes first; nothing else is worked on until L9 is done):
    - The unguarded user routes of item 14 (live in production now; tell Michael).
    - Launch blockers 6 and 10 (Q10), and the other open Gilligan behaviour items.
    - Revoking the old Gemini key and mail app password (Michael), the `rc1` tag on `cer-gilligan-00002-zoc`, the cer-demo Fireworks key, and runbook §3.4's build-time `API_PROXY_TARGET` claim.
    - Recovering `~/release/`, lost in the 2026-10-04 WSL move.
    - The L8 behaviour items in item 17, and deleting the customer test user after launch.
16. Email, 2026-10-06/07: inviting a test user failed with Gmail `535 BadCredentials`; cer-api logs show the same rejection on every serving revision back to at least 2026-09-27 (`00061-xeq`), so production email was already down before Michael's 10-05 revision, as he says (`nodemailer-password:2` is a revoked value).
    Michael deployed `cer-api-00081-qon` (same image as `rc1`, tag `rc2`, 0% traffic) with `nodemailer-password:3`, the app password from the September cleanup, and reports a working Gmail login; its other references match `rc1`.
    The live `cer-api-secrets-1005-1653` still reads `:2`, so production email stays down until L9 routes to `rc2`.
    Free checks on `rc2`: `/` 200; `/api/v1/devices`, `/api/v1/users/all` and `/api/v1/users/test-db` 401 without a login; the local test dashboard (`cer-ui-l8-local`) now proxies to `rc2`.
    The test user created on `rc1` was saved before its invitation failed (`TeamUserService.create` writes the user first), so it exists without an invitation.
17. L8 staged smoke passed, 2026-10-07, on the local dashboard against `rc2` (`cer-api-00081-qon`) and `cer-gilligan-00003-slr`: the user's superadmin account and a customer test user (`winsyu475+certest@gmail.com`, organization Algalita) passed K1, the usage line, B1 with a citation that opens the PDF, K13, F2, chat kept after a reload, the invitation email (proving `nodemailer-password:3`), P3 (one pod for the test user) and D1; logs show 21 Gilligan calls, all 200, and no 5xx.
    Behaviour to address after launch, not launch blockers (the user's decision):
    - C1 "How is the water this week?" on a pod answered with the readings, an action-required section and next steps, and offered a report, instead of a plain weekly summary; an explicit request for last week's summary or readings gave the means.
    - After a reload, asking for a summary of the sensor data returned almost the same answer as the earlier turn; check whether reloading changes the context sent with the next question, or whether the answer is simply deterministic.
    - D1: as Algalita, asking "what has the water been" at Old Woman Creek 2026 (another organization's pod) returned an Algalita report without saying the named pod is unavailable; no other organization's data appeared, but the answer should say it cannot discuss that pod.
