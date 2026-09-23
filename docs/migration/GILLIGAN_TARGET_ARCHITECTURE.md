# Gilligan target architecture, gap analysis and roadmap

Draft, 2026-09-17, for the September 30, 2026 dashboard release.
Built on the decisions in [`GILLIGAN_PRODUCT_DIRECTION.md`](GILLIGAN_PRODUCT_DIRECTION.md); the integration background was `INTEGRATION_PLAN.md` (archived, tag `docs-archive-2026-09-23`).
This is a plan for review, not an approved implementation specification.
Built so far: R2's catalogue code (`docs/SPECS.md` §4b, flags off, supervisor approval pending), R3's relay and page (`GILLIGAN_R3_PORT.md`), the tool-access fix (`GILLIGAN_TOOL_ACCESS.md`) and R1's report half (`docs/SPECS.md` §10.7).

Code evidence was read at cer-demo `1a8c744`, `user-dashboard` `c55f65d` and `clean-earth-rovers-server` `origin/develop` `b221702`.
The local server checkout is behind its remote, so upstream claims come from `origin/develop` and may still be stale against the real remote.

## 1. Summary

The dashboard keeps its Gilligan routes, the upstream server keeps authentication and chat storage, and this service answers the questions.
The upstream server becomes a thin relay: it authenticates the user, passes a verified identity to this service, and saves the exchange.
This service owns everything that decides an answer: retrieval, sensor tools, reports, the approved catalogue and usage limits.
The dashboard's Gilligan page is rebuilt in React to the design already proven in `frontend/`.

## 2. Target architecture

```text
Browser (user-dashboard, Next.js)
  └─ /gilligan page (rebuilt)           axios, Bearer <user JWT>
        │
        ▼
clean-earth-rovers-server (cer-api, existing)
  ├─ authenticateToken                  verifies the JWT, sets req.user
  ├─ GilliganController (modified)      relay, behind GILLIGAN_BACKEND=rag|gemini
  │     ├─ loads chat history           chats/{id}.messages
  │     ├─ calls cer-rag                service-to-service auth + user identity + user JWT
  │     └─ saves the exchange           addQuestionAnswer (existing)
  └─ /water/*, /devices (existing)      telemetry, already org-scoped by the JWT
        ▲
        │ user JWT forwarded (existing tool path)
cer-rag (this service, new Cloud Run service in the upstream project)
  ├─ identity check                     accepts calls from cer-api only
  ├─ usage limits                       Firestore counters, per user / org / day / month
  ├─ ChatOrchestrator                   tool loop, whole answers at launch
  │     ├─ query_sensor_data, list_pods, get_pod_thresholds, get_turbidity_info, generate_report
  │     ├─ retrieval                    corpus in upstream Firestore (CORPUS_SOURCE=firestore)
  │     └─ catalogue                    supervisor-approved entries, versioned
  ├─ report renderer                    PDF bytes returned in the response, nothing on disk
  └─ Fireworks gpt-oss-120b             upstream-owned key; no data retention for open models
```

### 2a. Request flows

**Question.**
The dashboard calls `GET /gilligan/question?question=&chatId=&device=` as today, plus the selected pod.
The controller loads the chat, maps its `messages[]` to our `history[]` (only messages answered by this service; Gemini-era chats are ignored, D2), and calls `POST cer-rag /api/v1/gilligan/answer` with the user's JWT, the verified `userId` and `organizationId`, and the pod.
The response is `{ answer, provenance, citations, usage, audit }`; the controller saves the exchange, with `audit` stored on the saved message (D4), and returns `{ chatId, answer, provenance, citations }`.
`audit` holds the cited sources, the model, the catalogue version and a short list of the tool calls, so a disputed answer can be traced from the chat history alone.
The added fields are ignored by any client that does not read them.

**History.**
`GET /gilligan/chats` reads the upstream `chats` collection, filtered to conversations created by the new assistant (D2); Gemini-era chats are neither listed nor continued.
New chats carry a marker, for example `assistant: "cer-rag"`, so the filter needs no migration of old documents.
This service stays stateless about conversations.

**Report.**
A new upstream route, `POST /gilligan/report`, relays to `POST cer-rag /api/v1/reports` and streams the PDF back with `Content-Disposition: attachment`.
The dashboard downloads it immediately.
Nothing is written to disk, which removed the token-hash ownership sidecars (the deleted `src/report/reportOwnership.ts`) and the lost-on-redeploy problem.
A report asked for in chat returns a report offer, which the page turns into the same download call, so chat never hands out a file URL.
*Built 2026-09-22:* the offer travels as a top-level `reports: [{ request: { time_range, device? }, siteName, status }]` on the relay's answer and is saved with the chat message, pending the `provenance` block (`SPECS.md` §10.7).

**Usage status.**
`GET /gilligan/check-quota` relays to `GET cer-rag /api/v1/usage`, which returns remaining questions and reports and the reset time, not a bare boolean.
The dashboard shows the remaining count and disables input at zero.
Enforcement stays in cer-rag, so the upstream quota predicate (`GilliganService.checkQuota`) is retired rather than fixed.

### 2b. Identity between the two services

cer-rag must only accept identity from cer-api.
Recommended: Cloud Run invoker IAM, with cer-api's service account as the only invoker and a Google-signed ID token on each call; no shared secret to rotate or leak.
cer-rag then trusts the `userId` and `organizationId` fields for quota keys only.
Data access still rests on the forwarded user JWT, which the device API checks on every call, so a forged identity field cannot widen data access.

### 2c. Usage limits

Fireworks documents no free tier for `gpt-oss-120b`, so the account needs a payment method; a third-party page says accounts without one are held to 10 requests per minute, which 50 users would exceed.
Fireworks' own limits are adaptive tokens-per-minute ceilings, reported in `X-Ratelimit-Limit-Tokens-*` headers.

The goal is that every user gets the same allowance, that no single user or organization can exhaust the month, and that a runaway tool loop is cut off.

| limit | starting value | why |
|---|---|---|
| Questions per user per UTC day | 20 | the visible, easy-to-explain allowance |
| Reports per user per UTC day | 3 | a report runs several device calls and a long render |
| Tokens per user per UTC day | 500,000 | catches runaway tool loops; roughly 10 heavy or 40 light questions |
| Tokens per organization per month | 10,000,000 | stops one large organization consuming the shared budget |
| Deployment spend per day | monthly budget ÷ 30 | a daily slice, so early heavy use cannot drain the month |
| Concurrent model calls | 8 | stays under the adaptive rate limit; extra requests wait up to 20 s, then get "busy, try again" |

Each value is an environment variable in the grammar `.env.example` already uses, so the numbers can change without code.
On a Fireworks 429 or 503, cer-rag retries once with backoff and then reports "busy", not an error.

Cost at these values, using the handoff's illustrative $0.003-$0.0123 per question (12,000 in / 2,000 out to 50,000 in / 8,000 out tokens):

| scenario | questions per month | model cost per month |
|---|---|---|
| 50 users, 3 questions on 20 days | 3,000 | $9-$37 |
| 300 users, 3 questions on 20 days | 18,000 | $54-$221 |
| 300 users, every daily cap used every day | 180,000 | $540-$2,214, stopped by the daily spend slice |

A monthly budget of about $300 covers several hundred ordinary users; the daily slice turns an abuse case into "limit reached for today" instead of a bill.
These are estimates, not measurements; the Phase 3 capture gives real per-question token counts to re-size them.

### 2d. Content: catalogue and referrals

One versioned catalogue, reviewed by the supervisor, feeds both chat and reports.
Each entry has an ID, approved text, when it applies, the evidence it needs, limitations, source references (v2 sections, corpus documents), an optional CER referral, and approval metadata.
The source of truth is one structured file in the repo; a plain-text rendering goes to the model to save tokens, and a readable review page is generated from the same file.
v2 supplies the material for a focused set of entries; v2 itself is not added to the search corpus, and its §0 rules addressed to the model are not copied into the prompt.

Referrals: algal bloom cleanup, fish kill cleanup, debris capture and oil spill response point to CER, with the contact details the supervisor confirms.
Everything else gets a neutral "contact a qualified water-quality professional" line, with no named third party.
A referral is only offered when the observed evidence matches the entry's applicability, never as a default footer.

## 3. Keep, modify, replace

### This service (cer-demo)

| area | files | verdict | what changes |
|---|---|---|---|
| Tool loop | `src/services/ChatOrchestrator.ts` | keep | add the concurrency limiter and 429/503 retry |
| Sensor tools | `src/tools/{querySensorData,listPods,timeRange,aggregate,getPodThresholds,getTurbidityInfo}.ts`, `src/devices/*` | keep | none; they already resolve pods against the caller's registry and merge chains stay strict |
| LLM client | `src/services/LlmService.ts` | keep | model and key from config, as now |
| Retrieval | `src/retrieval/*` | keep | production runs `hybrid-slice-vector` (D7): the authoritative tier direct, dense retrieval over the long manuals. Deploying it needs `data/embeddings/` shipped or a Firestore vector index; the other adapters stay for evaluation only |
| Prompt and citations | `src/prompt/*` | modify | add the catalogue and referral blocks; resolve the v2 conflicts before any v2 wording enters |
| Chat route | `src/routes/chatRoutes.ts`, `src/controllers/ChatController.ts` | modify | add the internal `/gilligan/answer` contract and the cer-api identity check; keep `/chat` for the demo and evaluation |
| Usage limits | `src/quota/*`, `src/middleware/quotaGuard.ts` | modify | Firestore store, several windows at once, report counter, identity keys, status endpoint |
| Reports | `src/tools/generateReport.ts`, `src/report/{renderPdf,produceReport}.ts`, `src/routes/reportRoutes.ts` | modify | **done 2026-09-22**: `POST /api/v1/reports` returns bytes; disk storage and ownership sidecars deleted |
| Report prose | `src/report/narrative.ts` | modify | causes and actions only from approved catalogue entries |
| Event rules | `src/report/events.ts`, `src/report/types.ts` | modify | minimum for launch: make the sewage rule depend on water type (v2 §6.2 vs §6.3); otherwise report threshold crossings without naming a cause |
| Audit log | `src/services/auditLog.ts` | keep off | superseded at launch by the `audit` field saved with each chat message (D4) |
| Advice drafts | `docs/advice/` (archived, tag `advice-archive-2026-09-17`) | replace | becomes the structured catalogue; drafts that rely on removed evidence or missing detectors are dropped |
| Demo frontend | `frontend/` | keep as a dev harness | not shipped; pasted-token accounts stay demo-only |
| Evaluation | `src/eval/*`, `eval/` | keep | Phase 3 runs separately |

### Upstream (for the supervisor-approved merge)

| area | files | verdict | what changes |
|---|---|---|---|
| Gilligan page | `user-dashboard/src/app/gilligan/page.js`, `components/gilligan-answer.js` | replace | React rebuild: device picker, history list, markdown answers with citation chips and provenance, report download, usage count; no fake typing animation |
| Gilligan transport | `user-dashboard/src/app/services/gilligan.js` | modify | pass the device, add the report download (`responseType: blob`) and the richer usage status |
| Ask box | `user-dashboard/src/app/components/gilligan-widget.js` | modify | encode the question (STAKEHOLDER_QUESTIONS item 13) |
| Controller | `clean-earth-rovers-server/src/controllers/GilliganController.ts` | modify | relay to cer-rag behind `GILLIGAN_BACKEND`, map history, add the report route (relay and report route committed on `local`, `d3867ab` and `d87d7f7`, not pushed) |
| Model call and quota | `src/services/GilliganService.ts` | replace | `askQuestionGemini` (a retired `gemini-pro` id) and `checkQuota` retire; chat storage methods stay |
| Period query authorization | `src/services/WaterAnalyticsService.ts` | modify | membership check on explicit device filters (`SECURITY_FINDINGS.md` §1); cer-rag already validates pods, but the endpoint is reachable directly |

## 4. Roadmap to September 30

Working days are counted from Thursday, September 17.
"Upstream" work needs a place to develop it before the supervisor approves the merge (open decision D1).

| step | dates | owner | work | done when |
|---|---|---|---|---|
| R0 Setup | Sep 17-18 | user, Claude | user sets up the WSL sandbox ([`WSL_SANDBOX.md`](WSL_SANDBOX.md)); send the three v2 questions and the referral contacts to the supervisor; confirm a Fireworks payment method and read the rate-limit headers | the demo runs in the sandbox; supervisor has items 17-20 |
| R1 Service contract | Sep 18-22 | Claude | `/gilligan/answer`, identity check, history mapping, report bytes, usage store and status endpoint, concurrency limiter; unit and supertest coverage | contract tests green; the demo still works. **Report half done 2026-09-22** (report bytes, report counter); the rest has not started |
| R2 Catalogue | Sep 18-24 | Claude, then supervisor | structured catalogue from v2 and the advice drafts, generated review page, prompt and narrative wiring, sewage rule fix | supervisor has approved an entry set; reports and chat cite only approved entries. **Code done 2026-09-17** (recovered 2026-09-22, `SPECS.md` §4b); approval pending |
| R3 Upstream relay and page | Sep 21-25 | Claude, in the `local` checkouts | controller relay and report route; React page; local run of dashboard + server + cer-rag together | **done 2026-09-21; report route added 2026-09-22** (D8). A question, history and the usage count work end to end locally: [`GILLIGAN_R3_PORT.md`](GILLIGAN_R3_PORT.md) |
| R4 Quality | Sep 23-28 | separate session, Claude | Phase 3 capture (approved spend); fix what it finds; where a class of question stays weak, add a caveat or a refusal (D3); organization-isolation tests with the pod-scope fixtures | every weak class is either fixed, caveated or refused; isolation tests pass |
| R5 Demo and merge | Sep 28-29 | user, supervisor | supervisor demo; merge approval; upstream owners create the Fireworks key; corpus seeded into their Firestore; cer-rag deployed | cer-rag healthy in their project; relay switched on with `GILLIGAN_BACKEND=rag` |
| R6 Release | Sep 30 | user, upstream owners | production smoke on one pod per test organization. **There is no working rollback**: `GILLIGAN_BACKEND=gemini` restores a backend that fails every question (D9), so the cutover is one-way and the gate is R4's quality bar | release |

Critical path: supervisor catalogue approval by Sep 25 (`STAKEHOLDER_QUESTIONS.md` items 17-20) and upstream IAM for deploy and Firestore seeding by Sep 28.
Upstream changes are written in the two `local` checkouts (D1, revised 2026-09-21), from R3 on.
Earlier estimates excluded integration and supervisor turnaround, so R3 and R5 carry the schedule risk.

## 5. Later items

- Streaming answers (needs `fetch` in place of axios for one call, and incremental tool-call assembly).
- Phone and tablet layout (◆G5).
- Multi-pod reports and stored PDFs.
- v2 site baselines, derived metrics and QC framework. (Daily and tidal pattern classification landed in reports on 2026-09-22, `SPECS.md` §10.7.)
- Subscription tiers on top of the usage limits.
- Moving cer-rag into the upstream server as one deployable.
- Quantitative turbidity for pods with capable hardware (needs a sensor-model field).

## 6. Risks

| risk | effect | mitigation |
|---|---|---|
| Supervisor review takes longer than a few days | reports and chat launch with no causes or actions | launch with threshold crossings and limitations only; add entries after approval |
| No IAM in the upstream project for us | deploy and seeding slip to whoever holds it | hand over a runbook and seed script by Sep 25 |
| Fireworks account without a payment method | 10 requests per minute (third-party figure) | confirm before R3 |
| Phase 3 shows a quality gap | launch on known-weak answers | caveat or refuse the weak classes (D3) |
| Upstream remote moved past `b221702` | relay written against stale code | fetch and re-read before R3 |
| No rollback (D9) | a bad cutover cannot be reverted to a working assistant | fix the `gemini-pro` model id as separate work, or accept a one-way cutover gated on R4 |
| `hybrid-slice-vector` needs an embedding cache (D7) | cer-rag cannot answer in the upstream project until embeddings are shipped or a Firestore vector index exists | add it to the R5 handover runbook alongside the corpus seed |

## 7. Open decisions

Settled 2026-09-17:

- **D1. Where upstream code is written before the merge:** a native WSL2 sandbox the user creates, holding copies of both upstream repositories with this service's implementation moved in to test compatibility. The user works there; Claude keeps working in this repository (evaluation and the service itself), and the upstream repositories stay read-only to Claude. The user demos the result and the supervisor approves the transfer.
  *Revised 2026-09-21.* The WSL sandbox was lost with the machine rebuild and is not coming back. Upstream code is now written directly in the two checkouts on branch `local`, cut from the cleanup branch that removed the malware, and Claude may write there; see [`LOCAL_STACK.md`](LOCAL_STACK.md) and [`SECURITY_INCIDENT_2026-09-19.md`](SECURITY_INCIDENT_2026-09-19.md). Nothing is pushed: the branches have no upstream and the merge still needs supervisor approval.
- **D2. Gemini-era conversations:** ignored entirely.
- **D3. Launch quality bar:** aim for all Phase 3 checks; on best effort, caveat or refuse weak question classes rather than delay.

- **D4. Audit trail:** the relay stores an `audit` field on each saved chat message; `AUDIT_LOG` stays off. The chat history's retention and access rules therefore govern audit data (`STAKEHOLDER_QUESTIONS.md` item 21).

Settled 2026-09-21:

- **D7. Production retrieval is `hybrid-slice-vector`,** not `firestore-direct`: the authoritative tier is served direct and always present, and dense retrieval covers the long manuals. Measured on a dissolved-oxygen question it returns the 4 direct documents plus 5 scored USGS chunks, where the direct arm alone can only reach its own 4-document, 26,096-char slice. The cost is an embedding cache: `data/embeddings/` is 7.1 MB, git-ignored, and rebuilding it is a paid run (446 chunks, ~245,671 tokens).
- **D8. R3 relays to the existing `POST /api/v1/chat`** rather than waiting for R1's `/gilligan/answer`. R1 was gated on approval to start implementing and the release date is itself undecided, so R3 could not depend on it. Every contract difference is confined to `ANSWER_PATH` and the request body in `CerRagService.ts`, and the verified identity fields are already threaded through unused, so R1 is an edit to that one file. The report route is the part of R3 this defers, because returning report bytes is R1 work and the disk-and-sidecar design it would otherwise relay to is already scheduled for replacement.
- **D9. The Gemini backend is not a fallback.** `askQuestionGemini` calls the retired `gemini-pro` id; live-confirmed 2026-09-21 against the deployed API, which answered `404 models/gemini-pro is not found for API version v1beta`. Production Gilligan therefore fails every question today, and `GILLIGAN_BACKEND=gemini` restores that, not a working assistant. The default stays `gemini` so the relay is inert when merged upstream, which is a merge-safety property and not a safety net.

- **D10. Gilligan runs with `SENSOR_TOOL=true`; `REPORT_TOOL` stays off until R1** (revised 2026-09-22: on, see below). Both flags
  default off, which is right for the eval harness and wrong for the product, and nothing had
  said which value the release runs with. With them off the model is handed no tools at all, so
  every question about a reading falls through to `REFUSAL_SENTENCE` — a real session refused
  "can you tell me what my past 2 weeks of turbidity look like" and "do you have data on any of
  my pods?" for that reason alone, and R3's verification never caught it because it was
  conducted with `SENSOR_TOOL=false` throughout. `SENSOR_TOOL=true` is therefore a release
  requirement, not a tuning knob: it is what makes Gilligan a sensor assistant rather than a
  document search. It turns every reading question into a live production device read, scoped to
  the asking user's own token (`2b`). `REPORT_TOOL` stays off because `generate_report` returns
  a disk path guarded by the bearer-token-hash sidecar that R1 replaces with returned bytes;
  turning it on before R1 would ship the defect, not the feature.

  *Revised 2026-09-22.* R1's report half has landed: `generate_report` returns a `report_request`,
  `POST /api/v1/reports` renders the PDF into the response, and the sidecar is gone
  (`SPECS.md` §10.7). The reason above for keeping `REPORT_TOOL` off no longer holds, and the
  user decided on 2026-09-22 that **the release runs `REPORT_TOOL=true`**; the local `.env` now
  sets it. The flag also opens `POST /api/v1/reports`, so the R5 runbook must carry it beside
  `SENSOR_TOOL`, and must set `QUERY_QUOTA=true` with a finite `QUERY_QUOTA_REPORTS`, or reports
  are unlimited. Eval captures still set both flags `false` explicitly.

  Consequences to hold together, since the flag moves three things at once (the prompt block, the
  `tools` array, the registry): every eval capture must set `SENSOR_TOOL=false` explicitly on both
  server and runner rather than relying on the default, and the deployment runbook for R5 has to
  carry the flag or cer-rag will come up in production answering nothing.

- **D11. R2 before R1** (2026-09-17): the catalogue was built first because supervisor approval is on the critical path.
  Its commits were lost with the old machine and recovered on 2026-09-22 at tag `old-machine-recovery-2026-09-19`.
- **D12. Identity check inside cer-rag** (2026-09-17): cer-rag verifies the Google-signed ID token itself (audience and cer-api's service-account email) with `google-auth-library`, in addition to Cloud Run invoker IAM, so a deployment accidentally left public still refuses forged identity.
  The check sits behind a flag that is off for local development and the demo.

Open:

- **D5, D6. Supervisor answers** on referral contacts and the three v2 questions: `STAKEHOLDER_QUESTIONS.md` items 17-20.
