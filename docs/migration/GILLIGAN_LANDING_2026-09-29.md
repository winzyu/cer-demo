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
| End-to-end on the mirror with server `122136d` | pending |

The server's Jest config sets `roots: ['<rootDir>/../']`, so from a worktree it also runs every sibling worktree's copy of a suite; pass the suite path first and `--roots "$PWD"` after it.
The integration suites were not run: they reach the real `qa-db`.

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
