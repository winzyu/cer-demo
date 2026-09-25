# Upstream pull request bodies

Draft bodies for the two `feature/gilligan-rag-assistant` branches pushed on 2026-09-24; the pull requests are held back until the user opens them.
Open each as a draft with `gh pr create --draft -R <repo> --base <base> --head feature/gilligan-rag-assistant --title "<title>" --body-file <file>`, saving the section's body to the file.

## Clean-Earth-Rovers-Technology/user-dashboard, base `main`

Title: Gilligan page for the retrieval-backed assistant

### What changed

Rebuilds the Gilligan page for the retrieval-backed assistant (cer-rag), while keeping it working against the current Gemini backend.

- **Gilligan page rebuild** (`src/app/gilligan/page.js`, `components/gilligan-answer.js`, `services/gilligan.js`): pod picker, saved chat history, the question stays on screen while the answer loads, and answers render as GitHub-flavoured Markdown (tables) with citation links.
- **Report download button**: shown only when an answer offers a report; it posts to `/gilligan/report` and saves the PDF the server streams back. There is no report URL anywhere.
- **Browser-pass fixes**: widget input and Enter key, deep-link re-asks, late answers after switching chats, source links, allowance wording, a load-failure notice and the phone layout.
- **Provenance and citations** (`shared/gilligan-provenance.js`, `shared/gilligan-citations.js`): shows which data tools an answer used, T1 citation chips, and qualifications (for example "no readings in range" versus "reading of zero").
- **Dependency**: adds `remark-gfm@^4` for tables; the 18 new `yarn.lock` entries all resolve to `registry.yarnpkg.com`.

The quota call accepts both the Gemini backend's bare boolean and the cer-rag usage object, and Gemini answers carry no reports or provenance, so the page works on either backend.
It pairs with the server PR `feature/gilligan-rag-assistant` in `clean-earth-rovers-server`.

### How it was tested

- `node --test test/provenance.test.mjs`: 3 of 3 pass.
- Exercised in a browser against a local server and cer-rag during development (the "browser pass" commit lists what that pass fixed).
- Not run on this branch: `next build` and `next lint`. A known "Attempted import error" warning in `confirm-email` is being checked separately for production builds.

### Environment

No new dashboard environment variables.
The backend is chosen server-side by `GILLIGAN_BACKEND`, which **stays `gemini` until cutover**.

### Base and history

Branched from `main` at `c7ecede` (upstream's removal of the obfuscated `postcss.config.js` payload).
Our own identical fix is omitted; the branch tree was checked against a merge of our development branch into `main` and is identical.
The long-line payload scan (`grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .`) is clean on this branch.
Please do not merge before the supervisor demo; the author merges and deploys.

## Clean-Earth-Rovers-Technology/clean-earth-rovers-server, base `develop`

Title: Relay Gilligan to cer-rag behind GILLIGAN_BACKEND

### What changed

Adds a second Gilligan backend that relays to the retrieval-backed assistant (cer-rag), selected by `GILLIGAN_BACKEND`. With the default `gemini`, behaviour is unchanged: `/gilligan/report` returns 404 and the quota check uses the existing path.

- **cer-rag relay** (`services/CerRagService.ts`, `controllers/GilliganController.ts`): `/gilligan/question` forwards the question with the caller's own bearer token, so cer-rag's sensor tools see only the caller's organization. Answers, usage and tool provenance are saved to the chat history as today.
- **Report downloads**: new `POST /gilligan/report` streams the PDF cer-rag renders with the caller's token; `Retry-After` from cer-rag's rate limits is passed through (`middleware/errorHandler.ts`).
- **CORS**: exposes `Content-Disposition` and `Retry-After` so the dashboard can read the filename and the retry time.
- **Provenance**: relays cer-rag's tool provenance and citation audit to the Gilligan page.
- **Development-only switches**, all inert when `NODE_ENV=production` (the Dockerfile sets it):
  - `DEV_UNVERIFIED_AUTH=true` accepts a well-formed JWT without verifying its signature, for running one route locally against tokens minted by the deployed API; it warns on every request.
  - `DEV_CHAT_STORE=memory` keeps chats in memory instead of Firestore.
  - `DEV_UPSTREAM_BASE_URL` (with `DEV_LOCAL_PATHS`) mounts a passthrough on `/api/v1` and `/auth` that forwards every request not listed in `DEV_LOCAL_PATHS` to the deployed API with the caller's own `Authorization` header. It lets a developer run only the routes under work locally, without Firestore, Stripe, Gemini or mail credentials (`middleware/devUpstreamProxy.ts`).

### How it was tested

- `npx jest test/unit/services/CerRagService.test.ts test/unit/services/provenance.test.ts test/unit/middleware/errorHandler.test.ts`: 3 suites, 13 of 13 pass.
- `npx tsc --noEmit`: clean.
- Exercised end to end during development: dashboard, this server and cer-rag running locally.
- Not run: the full Jest suite and `npm run lint` (it runs `eslint --fix`).

### Environment

| variable | value | notes |
|---|---|---|
| `GILLIGAN_BACKEND` | `gemini` (default) or `rag` | **Stays `gemini` until cutover.** |
| `CER_RAG_BASE_URL` | cer-rag's URL | Required when `rag`; falls back to `http://localhost:8010` for local development. |
| `CER_RAG_TIMEOUT_MS` | milliseconds | Optional; default 120000. |
| `DEV_UNVERIFIED_AUTH`, `DEV_CHAT_STORE`, `DEV_UPSTREAM_BASE_URL`, `DEV_LOCAL_PATHS` | unset | Local development only; never set in a deployed environment. |

### Base and history

Branched from `develop` at `a5b745e` (upstream's removal of the obfuscated jest config payload).
Our own identical fix is omitted; the branch tree was checked against a merge of our development branch into `develop`.
The long-line payload scan (`grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .`) is clean on this branch.
Please do not merge before the supervisor demo; the author merges and deploys.
