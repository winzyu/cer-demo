# Integration plan — landing this service in the real product

How the working model in `cer-demo` reaches production: our answer engine behind the dashboard's
existing Gilligan page, and our service either beside or inside `clean-earth-rovers-server`.

Written 2026-09-04 against `user-dashboard` `c55f65d` (2026-08-26) and
`clean-earth-rovers-server` `origin/develop` `b221702` (2026-08-26). **Both reference repos were
read only.** Every claim below cites a file so it can be re-checked rather than trusted.

> **Background, superseded as a plan (2026-09-17).** The release plan and its decisions are
> [`GILLIGAN_TARGET_ARCHITECTURE.md`](GILLIGAN_TARGET_ARCHITECTURE.md). Shape C below was adopted and
> R3 built it on 2026-09-21, relaying to the existing `POST /api/v1/chat` rather than a new adapter
> route (D8). Since this was written: the `GILLIGAN_BACKEND=gemini` "rollback" restores an assistant
> that fails every question (D9); quota is enforced in this service and `checkQuota` is retired
> (§2a there); the upstream checkouts are writable on branch `local` (D1, revised); the provider
> stays Fireworks `gpt-oss-120b` on an upstream-owned key; and their `chats` collection stays
> authoritative with this service stateless (D2). The contract analysis, dependency table and
> inherited risks below remain accurate background.

Companions: [`DEVICE_API.md`](DEVICE_API.md) (the sensor contract), [`BACKEND_FIELDS.md`](BACKEND_FIELDS.md)
(what the registry carries), [`SECURITY_FINDINGS.md`](SECURITY_FINDINGS.md) (what we must not
inherit quietly), [`../SPECS.md`](../SPECS.md) (what is built here).

---

## 0. The one fact that shapes everything

**Gilligan already exists upstream, on both sides, and it is wired end to end.** This is not a
greenfield integration — it is a replacement of the middle of a working feature.

| piece | file | what it does today |
|---|---|---|
| Dashboard page | `user-dashboard/src/app/gilligan/page.js` | chat UI, chat history sidebar, quota banner, `?question=` deep link |
| Dashboard answer | `src/app/components/gilligan-answer.js` | renders one answer, `react-markdown`, fake typing animation |
| Dashboard transport | `src/app/services/gilligan.js` | `askGilligan` / `getChats` / `checkQuota` over axios |
| Server routes | `clean-earth-rovers-server/src/routes/gilliganRoutes.ts` | `GET /gilligan/question`, `/chats`, `/check-quota`, all behind `authenticateToken` |
| Server orchestration | `src/controllers/GilliganController.ts` | fans out over every org device, reads each one's last reading, calls the model |
| Server model call | `src/services/GilliganService.ts` | `askQuestionGemini` — `gemini-pro`, prompt is `` `${question}. My water data: ${JSON.stringify(waterData)}.` `` |

So the integration is: **keep their page, keep their routes, replace what happens between them.**
Nothing in this plan requires inventing a seam — it requires fitting ours to one that exists.

What their pipeline does *not* do, and ours does: retrieval over a document corpus, tool-calling
against `/water/period` for a real time range, merge-chain expansion, plausibility filtering,
provenance disclosure, PDF reports, streaming, and an evaluation apparatus that can tell whether
a change made answers better or worse. That list is the value of the swap, and it is also the
list of things their contract has no field for yet (§2b).

---

## 1. Three shapes, and which one to build

### Shape A — separate service, dashboard calls it directly
Dashboard's `gilligan.js` points at `cer-rag` (a second Cloud Run service) instead of `cer-api`.

- **For:** no server merge at all; we keep our deploy, our SDK versions, our eval loop.
- **Against:** a second base URL and a second CORS surface in the browser; the dashboard's JWT
  now travels to two services; their `chats` collection and ours drift apart.

### Shape B — merge into `clean-earth-rovers-server`
Our `src/` moves in; `GilliganService.askQuestionGemini` is deleted and the controller calls our
orchestrator in-process.

- **For:** one deployable, one auth path, one Firestore client, no cross-service token forwarding.
- **Against:** the largest diff, and it lands on a repo we cannot test end to end (no IAM on
  `conductive-fold-343604` — `BACKEND_FIELDS.md` §0). Forces a Firestore SDK major bump (§2c).

### Shape C — their route, our service behind it ✅ **recommended first**
`GilliganController` keeps its three routes and its response shapes, and calls our service over
HTTP with the caller's own JWT forwarded. Dashboard code changes **not at all** on day one.

- **For:** the cutover is one controller file upstream. Rollback is one env var. The dashboard,
  the auth model, the chat history and the quota banner all keep working while the brain is
  swapped. Every later capability (streaming, citations, reports) is then an additive change to a
  contract that is already carrying real traffic.
- **Against:** one extra network hop, and two services to deploy.

**Recommendation: C now, B when someone wants one deployable.** C is strictly a subset of the
work B needs — the contract mapping in §2b is required either way — so C is not a detour, it is
B's first half with a working system in the middle. A is only right if upstream refuses to touch
their repo at all.

---

## 2. Backend integration

### 2a. The contract as it stands

```
GET /api/v1/gilligan/question?question=<text>&chatId=<id>     Bearer <jwt>
  200 { chatId: string, answer: string }
  400 { error: string }                    // every failure, including auth-shaped ones

GET /api/v1/gilligan/chats                                    Bearer <jwt>
  200 [ { id, user, messages: [ { question: { text, waterData, date },
                                 answer:   { text, date } } ],
          lastInteraction, creationDate } ]

GET /api/v1/gilligan/check-quota                              Bearer <jwt>
  200 true | false
```

`req.user` is whatever `AuthService.verifyToken` decoded (`src/middleware/auth.ts`); the JWT
carries role and organization since `8e34299`. Tokens are minted with **no expiry**
(`SECURITY_FINDINGS.md`, `DEVICE_API.md` §4) — that is now our problem too, see §2e.

### 2b. Contract gaps, and what each costs

| gap | theirs | ours | resolution |
|---|---|---|---|
| **Verb** | `GET` with query params | `POST` with a JSON body | Keep `GET` on the public edge; the controller POSTs to us. A question in a query string is also a question in an access log — worth raising, not worth blocking on. |
| **Streaming** | none; `gilligan-answer.js` fakes a 5-second typing animation over an answer it already has | SSE via `{ stream: true }` | Phase 2. Their axios instance cannot read a stream; needs `fetch` for that one call (§3d). Deleting the fake typewriter in favour of real tokens is the single most visible win. |
| **Device scope** | every org device's last reading, dumped into the prompt (`GilliganController.question`) | one pod, chosen by the caller or named by the model, over a real time range | Our `device` field. Their page has no pod selector — port ours (§3c). |
| **History** | server-side, `chats/{id}.messages` | client-supplied `history[]`, trimmed to `MAX_HISTORY_MESSAGES` | Controller maps `messages[]` → `history[]` before calling us, then appends via `addQuestionAnswer`. Their storage stays authoritative; we stay stateless. |
| **Citations / provenance** | no field | badges + source list (`frontend/js/provenance.js`) | Additive: a `provenance` key on the response, ignored by the old page until §3 lands. |
| **Reports** | no route | `POST /api/v1/reports`, PDF bytes in the response (was `GET /api/v1/reports/:filename`, replaced 2026-09-22) | Built 2026-09-22: upstream `POST /gilligan/report` relays to it (`GILLIGAN_TARGET_ARCHITECTURE.md` §2a). |
| **Errors** | `400 {error}` for everything | coded errors (`caller_token_required`, `device_timeout`, …) + `429` | Pass our `code` through in the body. The dashboard already surfaces `error.response?.data.error`; adding `code` breaks nothing. |
| **Quota** | `checkQuota` returns a bare boolean | `quotaGuard` → `429` with a JSON body | Two systems that must not both be authoritative. Pick theirs for entitlement (it knows about Stripe), keep ours for abuse/cost. See the bug below. |

> **Their quota predicate is almost certainly wrong.** `GilliganService.checkQuota` returns
> `messagesLastWeek < 2 || messagesThisMonth < 10 || Boolean(subscription) || role === "superadmin"`.
> Because the two counters are OR'd, a user who has spent their weekly allowance still passes on
> the org's monthly one, and vice versa — the gate is open unless *both* are exhausted. If the
> intent is "2 free per user per week **and** 10 per org per month, else you need a subscription",
> the operator should be told. **Not ours to fix** (`CLAUDE.md`: reference repos are read-only) —
> raise it, do not patch it.

### 2c. Dependency and platform reconciliation

| | cer-demo | server | note |
|---|---|---|---|
| `@google-cloud/firestore` | `^7.11.0` | `^6.4.0` | **Blocking for Shape B.** Vector search (`FieldValue.vector`, `findNearest`) is v7 only, and it is how retrieval works here. Merging means bumping their client one major version, across `FirestoreService` and all three repositories. |
| `firebase-admin` | — | `^11.1.0` | Pins its own Firestore transitively. Check for a duplicate client after any bump. |
| `express` | `^4.21.2` | `^4.18.1` | Compatible. |
| `helmet` | `^7.2.0` | `^5.1.1` | Ours sets `crossOriginResourcePolicy: cross-origin` for the static frontend; inside their server that is unnecessary and should be dropped, not carried. |
| LLM SDK | `openai@^7` against Fireworks | `@google/generative-ai` | See §2d. |
| PDF | `pdfkit` | — | New dependency upstream if reports land there. |
| Tests | jest + supertest | jest | Same runner. Our `test/fixtures/device-api/` recordings port as-is. |

**Firestore data.** Our corpus, chunks and embeddings live in collections we seed
(`npm run seed:firestore`, `seed:firestore-chunks`, `embed:cache`). In Shape B they land in
`conductive-fold-343604` beside `devices`, `water-data`, `users` and `chats`. That needs a
namespace decision and a seeding runbook owned by whoever holds IAM — which is not us today.

### 2d. The model question, which is a decision and not a task

They call `gemini-pro`. We call an OpenAI-compatible endpoint on Fireworks, at
`temperature: 0`, with a system prompt and a retrieval strategy that the whole `eval/` apparatus
was built to measure (`SPECS.md`, `RETRIEVAL_BAKEOFF.md`, `GRADING_GUIDE.md`).

Swapping the provider invalidates every gate result we hold. So: **keep our provider through
cutover**, and treat "move to Gemini" as a separate, evaluated change with a bake-off arm — not
as part of the integration. If cost or an existing GCP commitment forces Gemini, that is fine and
answerable, but it must be answered with the harness, not asserted. `gemini-pro` itself is a
retired model id and would need replacing regardless.

### 2e. What we inherit the moment we sit inside their auth

Ours today forwards the caller's JWT to the device API and lets the backend scope. In Shape B we
*are* the backend, and these become ours:

1. **`/water/period` does not authorize its `device` parameter** (`SECURITY_FINDINGS.md` §1) — the
   org filter is an `else`, not an `AND`. Our tool path reaches that endpoint. In-process, the
   right fix is the one that repo's own siblings already use: call `deviceLabelsFor` and AND the
   org check.
2. **`expandLabel` has no organization filter at all** (§7) — merge expansion crosses orgs
   upstream. Our `resolveChain` is deliberately stricter (`src/devices/mergeChains.ts`). Merging
   must not silently adopt the looser one; the strictness is a documented choice
   (`POD_AUTHORIZATION.md` §11 Q1).
3. **Unauthenticated water routes** and **non-expiring tokens** (§2, §5) — unchanged, and they
   bound the blast radius of anything we add.
4. **`getDevices` now hides `mergedInto` and `archived` devices** (`62993fe`). `resolveChain`
   intersects predecessors against the caller's `/devices` response, so when that reaches
   production every chain silently collapses to survivor-only. Prod was still serving them on
   2026-08-21. **Add the assertion before cutover, not after.**

### 2f. Backend steps, in order

1. **Pin the contract.** Write `GilliganController`'s three shapes as fixtures here, and a
   translation layer (`chats.messages[]` ⇄ `history[]`, `{chatId, answer}` ⇄ our response).
   Verifiable with a unit test, no network.
2. **Add the adapter route** in this repo: `POST /api/v1/gilligan/question`, accepting their
   parameter names and returning their body shape, delegating to `ChatController`'s pipeline.
   Ours stays the native contract; this is the compatibility face.
3. **Deploy as `cer-rag`** (Cloud Run, same project as `cer-api`), env from
   `cloud-run.env.example.yaml` plus our own keys.
4. **Upstream change #1 (theirs to merge, ours to hand over):** `GilliganController.question`
   calls `cer-rag` with `req.headers.authorization` forwarded, behind `GILLIGAN_BACKEND=rag|gemini`
   so rollback is an env var. `addQuestionAnswer` still writes their `chats` doc.
5. **Verify against the recorded fleet** — the pod-scope fixtures and the device-api recordings,
   then one live smoke on a pod we already have evidence for.
6. **Phase 2:** streaming (`text/event-stream` through the same route), `code` on errors,
   `provenance` on the body.
7. **Phase 3:** reports, then the Shape B merge if it is still wanted.

---

## 3. Frontend integration

### 3a. What actually moves

Our frontend is vanilla ES modules; theirs is Next 13 + MUI + Tailwind. **Nothing ports as a
file.** What ports is behaviour, and it is worth being blunt about which parts are demo scaffolding:

| ours | fate in the dashboard |
|---|---|
| `js/api.js` (SSE reader, `?backend=` override) | SSE reader ports; the `backend` override is demo-only, **drop it** |
| `js/auth.js`, `js/accountbar.js` | **Drop.** They exist because this page has no login; the dashboard has a real one (`axios.config.js` reads `localStorage.token`). Multi-account switching was a way to see org scoping without impersonation, not a product feature. |
| `js/podbar.js` | **Port.** Pod selection is the difference between "one pod, a real window" and their current "every device's last reading". Becomes a MUI select or their new `device-pill` (§3c). |
| `js/provenance.js` | **Port.** The badges (stale pod, provisional turbidity, water-type mismatch, `complete:false`) are the honesty layer; without them a merged-chain or partial-window answer reads as complete. |
| `js/report.js` | Port with the report route (Phase 3). |
| `js/chart.js` | Evaluate — the dashboard already has ApexCharts and gauges. Prefer theirs. |
| `js/markdown.js` (`marked` + `dompurify`) | **Drop.** They already render with `react-markdown` in `gilligan-answer.js`. |
| `theme.css` | Already mirrors their `globals.css` tokens (repainted 2026-09-14); keep the token discipline (§3b). `js/theme.js` and dark mode are gone. |
| `starter-prompts.json` | **Gone.** Removed 2026-09-15 (`timeline.md`). |

### 3b. The repaint — upstream went light on 2026-08-26

`1f81f87` converted the dashboard from the `#12182b` dark field our `theme.css` was lifted from
to a **light neumorphic** surface. `#12182b` is now ink, not background. Current tokens
(`src/app/globals.css`):

```
--surf #e9edf3   --surf-2 #f2f5f9   --hi #ffffff   --lo #c5ccd9
--line #d5dbe6   --ink/--midnight #12182b   --mut #4e596e
--gold #a89748   --sea #2d77a6   --gold-txt #766a33   --sea-txt #2b719e
--nm / --nm-sm / --nm-in / --nm-in-sm      (raised + recessed elevation pairs)
```

Two things to take rather than re-derive:

- **`--gold-txt` / `--sea-txt` exist because brand gold fails AA as text on a light surface** —
  their own comment says so. Our Direction A must use the same pair anywhere gold or sea carries
  text. This is an accessibility fix already made upstream; do not re-make it worse.
- **Elevation is a token, not a border.** Their surfaces separate by `box-shadow` pairs, not
  `1px solid`. Our `app.css` separates with `--border`. Inside the dashboard, a bordered panel
  will read as foreign.

**Done in the demo, 2026-09-14.** `frontend/` now uses these tokens verbatim, separates surfaces by
shadow, and follows their Gilligan page's two-column layout. Dark mode was dropped: upstream has
none, and the shadow pairs depend on a light ground.

### 3c. The new component that overlaps ours

`src/app/components/device-pill.js` (new in `1f81f87`): collapsed pill shows a status dot and the
name; the dot toggles map visibility; expanding presses the pill inward and reveals battery,
water score and days-to-calibration in a recessed well. That is our pod bar's job in their design
language. **Use it rather than porting our `<select>`** — and note `podbar.js` is mid-edit here
for account switching, so this port waits for that work to settle.

Battery, if we ever surface it: `ec2b283` replaced a linear 2.5–4.2 V map with a PKCELL 10Ah
Li-ion discharge curve on `home/page.js`. `NCvoltage` is in every `water_data` document
(`BACKEND_FIELDS.md` §2). Take their table; a linear scale overreads a half-empty pack badly.

### 3d. Transport details that will bite

- **axios cannot read an SSE body.** The streaming call has to be `fetch` with the same
  `Authorization` header their interceptor adds. Whatever you write, keep their **401 handler** —
  clear `localStorage.token`, redirect to `/login` (`axios.config.js`) — or an expired session
  hangs on a dead stream instead of bouncing to login.
- **No proxy exists.** `axios.config.js` says "Next.js rewrites proxy to cer-api server-side", but
  `next.config.js` has **no `rewrites` block** — production works only because
  `NEXT_PUBLIC_API_BASE_URL` is set. If `cer-rag` is a second origin, its CORS and that variable
  both need a decision. One more reason Shape C (same origin as `cer-api`) is the cheap path.
- **Delete the typing animation when streaming lands.** `gilligan-answer.js` spreads a finished
  answer over 5 seconds. Real tokens arriving over a real stream and a fake typewriter over a
  completed one look identical for the first second and then diverge badly — the fake one cannot
  be interrupted and cannot report an error mid-answer.

---

## 4. Phasing and gates

| phase | lands | gate before moving on |
|---|---|---|
| **0. Contract pinned** | translation layer + fixtures here | unit tests green; no upstream change yet |
| **1. Adapter route + `cer-rag` deployed** | their body shape from our engine | live smoke on a pod with recorded evidence; answers no worse than the current arm on the eval set |
| **2. Cutover behind `GILLIGAN_BACKEND`** | dashboard unchanged, brain swapped | rollback proven by flipping the env var back |
| **3. Streaming + provenance + pod selector** | the visible upgrade | AA contrast checked on the light palette; 401 path still bounces to login |
| **4. Reports** | PDF from the dashboard | org check enforced on the report route |
| **5. Shape B merge (optional)** | one deployable | Firestore 6→7 bump done and their suite green |

Phases 1 and 2 are where the value is. Everything after is additive and independently shippable.

---

## 5. Open questions — for the operator, not for us to assume

1. **Who owns `cer-rag`'s deploy and its keys?** We have no IAM on `conductive-fold-343604`
   (`BACKEND_FIELDS.md` §0). Every phase past 0 needs someone who does.
2. **Provider:** stay on Fireworks (evaluated) or move to Gemini (their existing key)? Answer
   with a bake-off arm, not a preference.
3. **Quota:** whose gate is authoritative, and is the `||` in `checkQuota` intended (§2b)?
4. **Cross-org merge chains:** upstream expands across organizations; we refuse to. Whose rule
   wins in the merged product? (`POD_AUTHORIZATION.md` §11 Q1 — still unanswered.)
5. **Chat history ownership:** their `chats` collection stays authoritative and we stay stateless?
   That is the assumption in §2b and it should be confirmed, because it decides whether our
   history trimming or their full transcript is what the model sees.
6. ~~**Does the dashboard want a dark mode at all?**~~ Settled 2026-09-14: no; ours was removed.

---

## 6. Risks

| risk | why it bites | mitigation |
|---|---|---|
| `getDevices` filtering merged/archived devices reaches prod mid-integration | every merge chain silently collapses to survivor-only; answers get shorter and stay confident | assert on the census in `explore:fields` **before** phase 1 |
| Firestore 6→7 bump breaks their three repositories | vector search needs 7; their code was written for 6 | Shape C defers it entirely; do it only if Shape B is chosen |
| Provider swap and integration land together | no way to tell which one moved answer quality | freeze the provider through phase 3 |
| Our tighter org scoping reads as a regression | upstream shows cross-org history today; we withhold it | disclose withheld labels in the UI (`provenance.js` already does) so it reads as a choice, not a gap |
| Question text in a `GET` query string | lands in access logs and browser history | raise it; move to `POST` on the edge if they agree |
| Their alert emails predate `62993fe` on any older deployment | displaced metric codes (`DEVICE_API.md` §7) | confirm the deployed revision before trusting an alert as ground truth |
