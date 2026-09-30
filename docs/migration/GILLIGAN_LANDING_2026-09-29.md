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
| End-to-end, paid delta test (G1, G3, B1, C1, F2 rechecks, cap $0.15) | not run; needs the user's approval |

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
| develop | clean-earth-rovers-server | | |
| develop | user-dashboard | | |
| main | clean-earth-rovers-server | | |
| main | user-dashboard | | |
