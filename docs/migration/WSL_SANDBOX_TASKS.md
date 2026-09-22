# WSL2 sandbox task packets — dashboard integration

Written 2026-09-17. Each packet below is one session's work on the native WSL2 sandbox where the dashboard, the upstream server and this service run together (decision D1 in [`GILLIGAN_TARGET_ARCHITECTURE.md`](GILLIGAN_TARGET_ARCHITECTURE.md), roadmap step R3).
The setup checklist itself is [`WSL_SANDBOX.md`](WSL_SANDBOX.md); these packets are the work that follows it.

## How to use this file

**Take one packet per chat.** You are given a packet id (for example, "do W1 only"). Do that packet, stop at its "Done when" line, and do not start another. Work belonging to another packet goes under that packet's "Notes from other sessions" instead of being done.

The table's status column records what has been done; a session that finishes a packet updates that row and adds a **Status:** line under the packet's heading.

Path spellings, as elsewhere in these docs: `../user-dashboard` and `../clean-earth-rovers-server` are the upstream repositories, siblings of the cer-demo repository root. An unprefixed `src/`, `frontend/` or `docs/` path is inside cer-demo. Other `../` links are relative to this file, in `docs/migration/`.

**Who may edit what.** In the OneDrive checkout, `../user-dashboard` and `../clean-earth-rovers-server` are read-only: a session may read them to write a specification, and must never edit them. Upstream code is written by the user, in the sandbox, from the specification a packet produces (D1). A session that finds itself wanting to edit an upstream file has hit that boundary and should stop and say so.

The sandbox's own copy of `CLAUDE.md` still carries the read-only rule, so if you want Claude's help editing upstream code inside the sandbox, that copy needs its own exception first. That is a deliberate choice each time, not a default.

Standing house rules still apply and are not repeated per packet: read `../STATUS.md` first, run only the named Jest suites and with `--runInBand`, `npm run typecheck` and `npm run lint` are free, Git mutations need a `/git-plan` approved in chat, live device reads are announced, and paid runs need approval. Use port 8010 for this service and never kill 8000.

**Completion protocol, the same for every packet:** update the durable doc the packet names, then run `/handoff` so the outcome reaches `../STATUS.md`, then offer a Git plan if the user asks.

| packet | title | gate | who runs it | status |
|---|---|---|---|---|
| [W1](#w1--clone-and-first-run-of-the-dashboard) | Clone and first run of the dashboard | none | user, Claude verifies the checklist | partly done 2026-09-18 |
| [W2](#w2--record-the-fresh-clones-real-versions) | Record the fresh clones' real versions | W1 | user runs, Claude records | not started |
| [W3](#w3--baseline-what-todays-gilligan-page-does) | Baseline: what today's Gilligan page does | W1 | user runs, Claude analyses | not started |
| [W4](#w4--run-all-three-services-together) | Run all three services together | W1, R1 route shape fixed | user, Claude writes the wiring | not started |
| [W5](#w5--relay-specification-for-gilligancontroller) | Relay specification for GilliganController | R1 contract exists | Claude specifies, user implements | not started |
| [W6](#w6--gilligan-page-rebuild-specification) | Gilligan page rebuild specification | W3 | Claude specifies, user implements | not started |
| [W7](#w7--end-to-end-confirmation-run) | End-to-end confirmation run | W4, W5, W6 | user runs, Claude records | not started |
| [W8](#w8--sync-discipline-and-transfer-back) | Sync discipline and transfer back | none | Claude drafts, user confirms | done 2026-09-18 |
| [W9](#w9--gilligan-answer-quality-across-the-hybrid-relay) | Gilligan answer quality across the hybrid relay | none | user runs, Claude diagnoses | not started |
| [W10](#w10--test-architecture-for-the-local-stack) | Test architecture for the local stack | none | Claude proposes, user decides | not started |

---

## W1 — Clone and first run of the dashboard

**Status:** done 2026-09-18. `yarn dev` runs, `/gilligan` renders, and login works. Logging in needed parts of the local development server combined with parts of the live server; that exact configuration is not yet written into `WSL_SANDBOX.md`, so W9 step 1 records it. The dashboard section here also predates the hybrid relay path and still says to point the dashboard's only `NEXT_PUBLIC_API_BASE_URL` at `http://localhost:5001`, which stops the pod and device pages loading; W9 carries that correction too.

**Gate:** none, can start now.

**Owner:** the user runs it in WSL2; a session's job is to walk the checklist, diagnose failures and fold what was learned back into the guide.

**Why:** every other packet needs a dashboard that starts. `WSL_SANDBOX.md` §3 clones all three repositories and §6 verifies only this service; the dashboard's own first run has never been done, and its one-line mention there ("it needs its own `.env.local` from the dashboard owners") is the part most likely to block.

**Files:** `WSL_SANDBOX.md` (§3, §6, extend with a dashboard section). Read-only: `../user-dashboard/package.json`, `../user-dashboard/README.md`, `../user-dashboard/next.config.js`.

**Steps:**

1. Confirm the clone layout from `WSL_SANDBOX.md` §1: all three repositories as siblings, on a native WSL path, not under `/mnt/c`.
2. Install with **yarn**, not npm: the repository has `yarn.lock` and its scripts assume yarn (`yarn dev`, `yarn build`, `yarn start -p 8080`).
3. Obtain `.env.local` from the dashboard owners, or record precisely which variables are missing and what each one blocks. Do not invent values, and never paste secrets into a doc or a commit.
4. `yarn dev` (Next.js on port 3000). Record what renders without a backend, what needs a login, and any build error, with the fix that worked.
5. Write the dashboard section into `WSL_SANDBOX.md` §6: install command, port, env requirement, first-run expectations, and the failures actually hit.

**Verify:** `curl -sI localhost:3000 | head -1` returns an HTTP status, and the Gilligan route is reachable in a browser (`/gilligan`), even if it errors for want of a backend.

**Done when:** a new machine can bring the dashboard up from `WSL_SANDBOX.md` alone, and the env-variable gap is written down with an owner.

**On completion:** `WSL_SANDBOX.md`. Then `/handoff`.

### Notes from other sessions

---

## W2 — Record the fresh clones' real versions

**Gate:** W1 (the clones exist).

**Owner:** the user runs the commands; the session records the results.

**Why:** the dependency and platform facts in `INTEGRATION_PLAN.md` §2c were read from the OneDrive checkouts, and the server checkout is 87 commits behind its remote with a local-only commit. A fresh clone is the first accurate look at what upstream actually ships today, and three planning decisions rest on it: the Firestore client major version, the LLM SDK, and whether the page's dependencies still match §3b's token set.

**Files:** `INTEGRATION_PLAN.md` §2c (correct in place, marking what was re-checked and when). Read-only: the fresh clones' `package.json`, `yarn.lock`, `package-lock.json`.

**Steps:**

1. Record Node, npm and yarn versions in the sandbox, and any `engines` field in either upstream repository.
2. Record the upstream server's `@google-cloud/firestore`, `firebase-admin`, `express`, `helmet` and LLM SDK versions, against this service's.
3. Record the dashboard's Next.js, React, MUI and `react-markdown` versions, plus whether `globals.css` still carries the token set `INTEGRATION_PLAN.md` §3b lists.
4. Note what changed since the stale checkout: `git log --oneline c55f65d..HEAD` in the dashboard, and the equivalent in the server from `b221702`. Summarise anything that touches Gilligan, auth or water endpoints.
5. Correct §2c where it is now wrong, dating each corrected row.

**Verify:** every version in the updated §2c can be traced to a command output pasted in the session, not to memory.

**Done when:** §2c reflects the fresh clones and names the date it was re-checked.

**On completion:** `INTEGRATION_PLAN.md`. Then `/handoff`.

### Notes from other sessions

---

## W3 — Baseline: what today's Gilligan page does

**Gate:** W1.

**Owner:** the user drives the browser; the session analyses and records.

**Why:** "confirmation" needs a before state. Static reading says the production path calls the retired `gemini-pro` model, so the current page may fail every question, but that has never been observed live. Replacing a page whose current behaviour is unrecorded makes any later comparison an assertion.

**Files:** a new "Baseline" section in `WSL_SANDBOX.md`, or a short sibling note it links to. Read-only: `../user-dashboard/src/app/gilligan/page.js`, `../user-dashboard/src/app/services/gilligan.js`, `../user-dashboard/src/app/components/gilligan-widget.js`.

**Steps:**

1. With the dashboard pointed at whichever backend the owners provide, open `/gilligan` and record: what the page renders, which requests it makes (method, path, query parameters), and what each returns.
2. Ask one question and record the outcome verbatim, including any error. This is where the retired-model claim is either confirmed or refuted; say which, and do not soften an unclear result.
3. Record the chat-history list behaviour and the quota check the page performs before sending.
4. Record the page's states that the rebuild must reproduce or deliberately drop: loading, empty, error, the typing animation, any markdown rendering.
5. Write the baseline down with the date and the backend it was observed against.

**Verify:** the note distinguishes observed behaviour from inference, sentence by sentence.

**Done when:** a reader can say what the current page does, and W6's rebuild has something to be compared against.

**On completion:** `WSL_SANDBOX.md`, and `../STAKEHOLDER_QUESTIONS.md` if the run answers or raises an operator question. Then `/handoff`.

### Notes from other sessions

---

## W4 — Run all three services together

**Gate:** W1, and the R1 route shape fixed (`/api/v1/gilligan/answer` exists in this service, even if thin).

**Owner:** the user runs; the session writes the wiring and diagnoses.

**Why:** the relay only becomes testable once the dashboard, the upstream server and this service are up at once with a real user token flowing through all three. Ports, CORS and token plumbing are where local integration usually stalls.

**Files:** `WSL_SANDBOX.md` (a "Running the stack" section). Read-only: the server's app bootstrap and auth middleware.

**Steps:**

1. Fix the port map and write it down: dashboard 3000, upstream server on its configured port, this service on **8010** (never kill 8000). Note any collision with services already running in WSL.
2. Record how the dashboard obtains a user JWT in this setup, and how to get one for a test account in a second organisation, which W7 needs for isolation checks.
3. Record the environment variables each side needs to point at the next hop, including `GILLIGAN_BACKEND` and this service's base URL.
4. Work out CORS and identity locally: this service's identity check (D7) verifies a Google ID token in production and is off for local development, so record exactly which flag is off locally and what that means for what the local run proves.
5. Capture the smoke path: a question from the browser reaching this service's log and a response rendering in the page.

**Verify:** the service log shows a request whose origin is the dashboard, and the page renders its answer.

**Done when:** one documented sequence brings all three up and demonstrates a request crossing all of them.

**On completion:** `WSL_SANDBOX.md`. Then `/handoff`.

### Notes from other sessions

---

## W5 — Relay specification for GilliganController

**Gate:** the R1 contract exists in this service (request and response shapes settled).

**Owner:** Claude writes the specification in this repository; the user implements it in the sandbox. Do not edit upstream files from the OneDrive checkout.

**Why:** the upstream controller becomes a relay behind `GILLIGAN_BACKEND=rag|gemini` (architecture §2a). Writing it as a specification first keeps the rollback path, the history mapping and the audit field from being improvised at the keyboard.

**Files:** write `UPSTREAM_RELAY_SPEC.md` in this directory. Read-only: `../clean-earth-rovers-server/src/controllers/GilliganController.ts` and `../clean-earth-rovers-server/src/services/GilliganService.ts` (read from `origin/develop` with `git show`, since the local checkout is stale).

**Steps:**

1. Specify each route: question, chat list, report, usage status. For each, give the upstream signature, the call it makes into this service, and the response the dashboard receives.
2. Specify the history mapping, including D2: Gemini-era chats are neither listed nor continued, and new chats carry a marker so no migration of old documents is needed.
3. Specify where `audit` is stored on the saved message (D4) and what it contains, including the catalogue version and guidance ids the report tool already returns.
4. Specify the flag: `GILLIGAN_BACKEND=rag|gemini`, its default, and the exact rollback action.
5. Specify the failure mapping: what the dashboard shows when this service returns 429 (quota), 503 (busy), or times out.
6. List the tests the user should write upstream, by name and assertion, in their existing jest setup.

**Verify:** every claim about current upstream behaviour cites a path plus the `origin/develop` commit it was read at.

**Done when:** the specification is complete enough that implementing it needs no further decisions, and it never asks Claude to edit upstream code.

**On completion:** `UPSTREAM_RELAY_SPEC.md`, and the R3 row in `GILLIGAN_TARGET_ARCHITECTURE.md` §4. Then `/handoff`.

### Notes from other sessions

---

## W6 — Gilligan page rebuild specification

**Gate:** W3 (the baseline exists).

**Owner:** Claude specifies from the demo frontend and the integration plan; the user implements in the sandbox.

**Why:** `INTEGRATION_PLAN.md` §3a already decides what ports and what drops, and the demo frontend was repainted to upstream's tokens on 2026-09-14. What is missing is a component-level specification the user can build from.

**Files:** write `GILLIGAN_PAGE_SPEC.md` in this directory. Read: `frontend/js/{podbar,provenance,report,render,main}.js` in this repository, `INTEGRATION_PLAN.md` §3a-3d. Read-only: `../user-dashboard/src/app/gilligan/page.js`, `../user-dashboard/src/app/components/gilligan-answer.js`, `../user-dashboard/src/app/globals.css`.

**Steps:**

1. Component inventory: for each behaviour in the demo frontend, say whether it ports, drops or is replaced by something the dashboard already has, following §3a and giving the reason in one line.
2. Specify the page's states from W3's baseline: loading, empty, error, answered, and what replaces the fake typing animation (it is dropped).
3. Specify pod selection, citation chips, the provenance badges, the report download (`responseType: blob`), and the usage count with its disabled-at-zero behaviour.
4. Specify tokens and elevation from §3b: `--gold-txt` / `--sea-txt` for text on brand colours, shadow pairs rather than borders, no dark mode.
5. Note the known display defect to re-check in the browser: citation numbers rendering as exponents after the `c40c337` repaint (`../STATUS.md`).
6. State what is explicitly out of scope: streaming, phone and tablet layout (◆G5), multi-pod reports.

**Verify:** every ported behaviour names the demo file it comes from, and every dropped one names the reason.

**Done when:** the specification covers every state W3 observed plus the new capabilities, with nothing left as "match the demo".

**On completion:** `GILLIGAN_PAGE_SPEC.md`. Then `/handoff`.

### Notes from other sessions

---

## W7 — End-to-end confirmation run

**Gate:** W4, W5 and W6 are done, meaning the stack runs and both upstream pieces exist in the sandbox.

**Owner:** the user drives; the session writes the script beforehand and records results afterwards.

**Why:** this is the "works end to end locally" gate the roadmap sets for R3, and the evidence the supervisor demo rests on. Ad-hoc clicking will not show whether organisation isolation holds.

**Files:** write the script and its results into `WSL_SANDBOX.md` (a "Confirmation run" section), and record any defect in `../STATUS.md` via `/handoff`.

**Steps:**

1. Write the scenario list before running anything, each with its expected observable result: a question answered with citations and provenance; a report downloaded from chat and from the report action; the usage count decrementing and input disabling at zero; a pod switch changing which pod answers; a question about a pod outside the caller's organisation being refused; Gemini-era chats absent from the list; `GILLIGAN_BACKEND=gemini` restoring the old path.
2. Use two accounts in different organisations for the isolation scenarios; a single account cannot demonstrate scoping.
3. Record each result as observed, including partial passes. A scenario that could not be run is recorded as not run, never as passed.
4. For each failure, record the smallest reproduction and which side owns it: this service, the relay, or the page.
5. Summarise what the run does and does not establish, given that local runs use the identity check in its off state (see W4).

**Verify:** every scenario has a recorded outcome, and every failure has an owner and a reproduction.

**Done when:** the run is recorded and the R3 "done when" in `GILLIGAN_TARGET_ARCHITECTURE.md` §4 can be answered yes or no from it.

**On completion:** `WSL_SANDBOX.md` and the R3 row. Then `/handoff`.

### Notes from other sessions

---

## W8 — Sync discipline and transfer back

**Status:** done 2026-09-18. `WSL_SANDBOX.md` §7 carries the transfer process and the R5 row in `GILLIGAN_TARGET_ARCHITECTURE.md` §4 now names supervisor approval and the upstream owner's application step. The steps marked "Needs your confirmation" are still open.

**Gate:** none, but most useful once W5 or W6 has produced code in the sandbox.

**Owner:** Claude drafts; the user confirms the parts that describe their own workflow.

**Why:** `WSL_SANDBOX.md` §7 states the rule (service changes in the OneDrive checkout, upstream changes stay in the sandbox until the supervisor approves) but not the mechanics. The supervisor demo and the eventual transfer both need a way to produce a reviewable change set from a sandbox clone.

**Files:** `WSL_SANDBOX.md` §7, and the R5 row in `GILLIGAN_TARGET_ARCHITECTURE.md` §4.

**Steps:**

1. Specify how an upstream change leaves the sandbox for review: branch naming, `git format-patch` or a pushed branch on a fork, and what the supervisor is asked to approve.
2. Specify what travels with it: the specification it implements (W5 or W6), the confirmation run (W7), and the list of upstream files touched.
3. Specify the reverse direction: a service defect found in the sandbox is fixed in the OneDrive checkout, pushed, and pulled into the sandbox, never edited in both.
4. Note the carried patch already recorded in `WSL_SANDBOX.md` §2 (`a3cc25d`, local-only on the server checkout) and whether it is still needed.
5. Give the demo-day checklist: what must be running, which accounts, which scenarios from W7 to show.

**Verify:** the mechanics name real commands, and no step asks Claude to push to an upstream repository.

**Done when:** an upstream change can go from the sandbox to a supervisor review without anyone inventing a process on the day.

**On completion:** `WSL_SANDBOX.md`. Then `/handoff`.

### Notes from other sessions

---

## W9 — Gilligan answer quality across the hybrid relay

**Gate:** none. The hybrid path already runs: the dashboard and the local server on port 5001 in the sandbox, relaying to the configured OneDrive cer-demo on port 8000, which reads live sensor data.

**Owner:** the user runs the stack and drives the browser; the session reproduces each failure against the service directly and attributes it to a layer.

**Why:** the first real end-to-end test on 2026-09-18 produced answers well below the release bar, and the path now crosses two cer-demo copies, two offline shims and a relay written in the sandbox, so "the prompt is wrong" is a guess until each failure is placed in a layer. The observed failures were: a greeting refused rather than handled; "what pods do I have access to?" refused although the agent later listed devices; a cross-pod question ("what water quality looks bad on my pods") answered with a request for one device instead of a summary; a successful Algalita Pod report; the follow-up "algalita pod" losing context and being refused; and a combined turbidity question returning a day-by-day table of all zeros whose narrative called the same zeros both Clear and possibly missing.

**Files:** write `GILLIGAN_QUALITY_FINDINGS.md` in this directory. Read in this repository: `src/validators/chatValidators.ts`, `src/controllers/ChatController.ts`, `src/services/ChatOrchestrator.ts`, `src/prompt/systemPrompt.ts`, `src/tools/`, `src/report/referenceRanges.ts`. Read-only in the sandbox: `clean-earth-rovers-server/src/controllers/GilliganController.ts`, `src/services/OfflineGilliganStore.ts`, `src/config/offline.ts`, `user-dashboard/src/app/services/gilligan.js`. Change no upstream file and change no prompt, tool or mapping in this packet.

**Steps:**

1. Record which copy is actually answering. For each of the two cer-demo checkouts, record the path, branch, HEAD and `git status --short`, and confirm which one is serving port 8000. Two facts are already known and should be verified rather than assumed: the sandbox clone sits at `05ef730` and therefore lacks the uncommitted R2 catalogue work that only the OneDrive checkout has, and `LOCAL_OFFLINE_MODE` with its deterministic answer exists only in the sandbox clone, so it must read false on the copy in the path.
2. Reproduce each failure against `POST /api/v1/chat` directly with curl, bypassing the dashboard and the relay, using the same questions in the same order. Announce the live device reads before running them. Keep every request and response body.
3. Repeat the two context failures with `history` and with `device` populated. The relay currently posts `{ query }` only (`GilliganController.question`, offline branch), while the validator accepts `history` and `device` (`src/validators/chatValidators.ts`), so this separates a relay-payload defect from a prompt or orchestration defect. State which it is; do not report both as likely.
4. Attribute every remaining failure to one layer: relay payload, system-prompt scope rules, tool routing and device selection, or sensor result mapping. Quote the file and line that produces the behaviour.
5. For the all-zero turbidity table, capture the live device payload for the same pod and window once, and compare it field by field with the values in the answer. Decide from that evidence whether the zeros are real readings, a mapping defect, or missing data rendered as zero, and say which.
6. Write the findings as a list: each failure, its layer, its evidence, the smallest fix, and its owner. Split the fixes into changes to this repository and changes to the upstream relay, which belong in W5's specification rather than in this packet.

**Verify:** every claim in the findings cites a file and line or a captured request and response. No upstream file, prompt, tool or mapping has been changed.

**Done when:** each observed failure has a layer, its evidence, and a named owner, and behaviour is unchanged.

**On completion:** `GILLIGAN_QUALITY_FINDINGS.md`, and `WSL_SANDBOX.md` if the run corrects the hybrid setup it documents. Then `/handoff`.

### Notes from other sessions

---

## W10 — Test architecture for the local stack

**Gate:** none, though W9's findings sharpen it if that packet runs first.

**Owner:** Claude proposes; the user decides what to adopt.

**Why:** proving one Gilligan answer correct now takes three processes, two cer-demo copies, two separate offline shims and a manual browser pass, and nothing in that path is covered by an automated check. The pieces in place today are: this repository's Jest unit suites and supertest integration suites, run one at a time with `--runInBand` because the full suite is reserved for the user; a separate evaluation harness (`src/eval/*`, `npm run grade:packet`, `npm run retrieval:eval`); `npm run typecheck` and `npm run lint`; the upstream server's Jest setup and `npm run build`; a dashboard with `next lint` and `next build` and no tests; and the sandbox's own conventions, which are curl against `/health` and each route plus a browser pass. Two offline shims were added independently and mean different things: the server's `LOCAL_OFFLINE_MODE` bypasses auth, suppresses mail and keeps chat in memory, while cer-demo's `LOCAL_OFFLINE_MODE` returns a deterministic answer and never calls Fireworks, which is explicitly not part of the hybrid path. The device API is production with no QA mirror, so every realistic test either reads live data or needs a fixture that does not exist yet.

**Files:** write `TEST_ARCHITECTURE.md` in this directory. Read: `jest.config.js`, `test/setupEnv.ts`, `test/integration/`, `package.json` scripts, `../../.claude/skills/run-local/`, `WSL_SANDBOX.md`, and the upstream repositories' test setup read-only.

**Steps:**

1. Inventory what exists, per repository: which layer each check covers, what it costs to run, who runs it, and what it cannot catch. Include the sandbox's manual steps as a layer, since they are currently the only end-to-end coverage.
2. Name the gaps the hybrid path exposes. At minimum: no contract test binds the relay's `{ chatId, answer }` shape to this service's `/api/v1/chat` request and response schema, and no check would have caught a relay that drops `history` and `device`.
3. Propose the target layers and say which repository owns each: unit, contract at the relay boundary, integration inside this service, a scripted smoke run of the whole stack, and a deliberately manual browser pass. For each, state the trigger to run it and the signal it gives.
4. Decide the fate of the two offline shims: keep, merge behind one clearly named flag per repository, or delete one. A shim that is not on the path anyone tests is a liability, so say plainly which one that is.
5. Propose how to test the sensor path without a QA mirror: recorded live payloads as fixtures, where they live, how they are refreshed, and what stays a live read.
6. Propose the runner: one command that brings the stack up in the sandbox with the documented ports, and one smoke script that exercises login, a question, a follow-up with history, and a report download, with the expected observable result for each.
7. End with a migration list, ordered, each item small enough for one session, and mark which items are worth doing before the September 30 release and which are not.

**Verify:** every command named in the proposal exists or is explicitly marked as new, and the cost of each layer is stated in terms of live reads and paid runs.

**Done when:** one document states the layers, their owners, their commands and the migration order, and the two offline shims have a decided fate.

**On completion:** `TEST_ARCHITECTURE.md`. Then `/handoff`.

### Notes from other sessions
