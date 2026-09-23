# Gilligan R3: the upstream relay and the rebuilt page

Built 2026-09-21, verified end to end locally the same day.
Roadmap step R3 in [`GILLIGAN_TARGET_ARCHITECTURE.md`](GILLIGAN_TARGET_ARCHITECTURE.md) §4; the local stack it runs on is [`LOCAL_STACK.md`](LOCAL_STACK.md).
Nothing is pushed and nothing is deployed.
This is the record of 2026-09-21; the report relay and download button were added on 2026-09-22 (Task B, `docs/SPECS.md` §10.7), and both upstream changes are now committed on `local`.

## The decision this step turned on

R3 could either wait for R1's `/gilligan/answer` contract or relay to the `POST /api/v1/chat` contract cer-demo ships today.
It relays to `/api/v1/chat`.

R1 is gated on the user confirming that implementation may start, and the September 30 date is itself still an open question, so building R1 inside R3 would have pre-empted two decisions that are not Claude's to make.
The relay is also the smaller reversible step: everything that differs between the two contracts is confined to `ANSWER_PATH` and the request body in `clean-earth-rovers-server/src/services/CerRagService.ts`, so R1 becomes an edit to that one file rather than a change reaching the controller, the routes or the page.
The verified `userId` and `organizationId` are already threaded into `CerRagService.ask` and deliberately unused, so R1 does not have to reach back up the call stack to find them.

## What now exists

### cer-demo

`GET /api/v1/usage` reports the caller's remaining allowance: `{ enabled, questions: { used, limit, remaining }, tokens: {...}, window, resetsAt }` (a `reports` dimension was added on 2026-09-22).
It is a read-only view over the quota store that already existed, added because R3's "the usage count works" cannot be shown with a service that can only refuse a request and never report standing.
`limit` and `remaining` are `null` for an unlimited dimension and while the quota is off, so a client distinguishes "no ceiling" from "nothing left" by type rather than by sentinel.
R1 replaces the store underneath it with the Firestore one without changing this contract.

`QuotaService.status` is the new read; `check`, `recordRequest` and `recordTokens` are untouched.
The endpoint never records, so a page polling it cannot spend the allowance it is displaying, and `test/unit/usageStatus.test.ts` asserts exactly that.

### clean-earth-rovers-server

`GILLIGAN_BACKEND` selects the backend and defaults to `gemini`, so the relay can be merged upstream ahead of the cutover without changing behaviour for anyone.
`GILLIGAN_BACKEND=rag` switches `GET /gilligan/question`, `/gilligan/chats` and `/gilligan/check-quota` onto cer-rag.

**The `gemini` default is not a working fallback, and the release plan should stop treating it as one.**
`GilliganService.askQuestionGemini` calls the retired `gemini-pro` model id, so every question on that path fails.
The default is therefore "no worse than today" rather than "safe", and it is only genuinely safe in the sense that today's Gilligan is already answering nothing.
R6 currently names `GILLIGAN_BACKEND=gemini` as the rollback for the September 30 release; that rollback does not restore a working assistant, it restores an assistant that fails every request.
Anything that depends on being able to fall back - the launch decision, the smoke test, the risk table - needs re-deciding on that basis.
The real options are to fix the model id as a separate piece of work, or to accept that the cutover is one-way and gate it on the R4 quality bar instead.

The relay authenticates here, answers there, and saves the exchange here.
It does not repeat the Gemini path's prefetch of every pod's last reading: cer-rag decides which pod and which window a question needs and fetches exactly that, so prefetching would be one device call per pod on every question, including the many questions that touch no pod at all.
The caller's own bearer token is forwarded verbatim, because the device API scopes every reading to the token holder's organization.

Chats created by the relay carry `assistant: "cer-rag"`.
That is decision D2 implemented as a stamp rather than a migration: the listing filter is an equality query that simply does not match documents written before the field existed, so there is no backfill and no window in which a half-migrated chat could be continued by the wrong backend.
A `chatId` naming a Gemini-era chat yields no history rather than an error, so an old link opens a fresh conversation instead of failing.

Each saved message carries `audit` with the model, the de-duplicated source list, the tool calls and the token count, which is decision D4.

### user-dashboard

`src/app/gilligan/page.js` is rebuilt, `src/app/components/gilligan-answer.js` replaced, and `src/app/services/gilligan.js` extended with the device parameter and the richer usage status.
`src/app/shared/gilligan-citations.js` is new and ports the marker parsing from `cer-demo/frontend/js/citations.js`; the regex is byte-identical to that file, which is covered by `test/unit/frontendCitations.test.ts`, and the two must be kept in step.

Three of the page's changes fix defects rather than expressing a preference.

- Messages are held as data rather than as rendered JSX pushed into state, which is what left citations and provenance nowhere to live and forced loading a stored chat through a second code path that had drifted from the first.
- `chatId` is tracked explicitly. The old page passed `selectedChat`, which is only set when a stored chat is clicked, so the second question of a new conversation silently started another new chat and every question after the first was asked with no history.
- A refusal is shown. The old page destructured `data.answer` directly, so a 429 or a failed request threw on `undefined` inside the submit handler and left the spinner running for ever with nothing on screen.

The typing animation is gone.
It revealed the answer over a fixed five seconds regardless of length, held the input disabled until it finished, and was never streaming: the whole answer was already in the browser.
Real streaming stays a later item.

## Running it locally

Both upstream checkouts must be on branch `local`.
cer-demo runs from wherever the work lives; the values below are the ones the verification used.

```bash
# cer-demo, :8010
PORT=8010 DEFAULT_RETRIEVAL=firestore-direct CORPUS_SOURCE=artifact \
  SENSOR_TOOL=false REPORT_TOOL=false \
  QUERY_QUOTA=true QUERY_QUOTA_REQUESTS=20 QUERY_QUOTA_WINDOW=1d npm run dev

# clean-earth-rovers-server, :5001
DEV_LOCAL_PATHS=/api/v1/gilligan GILLIGAN_BACKEND=rag \
  DEV_UNVERIFIED_AUTH=true DEV_CHAT_STORE=memory \
  CER_RAG_BASE_URL=http://localhost:8010 npm run dev

# user-dashboard, :3000
yarn dev -p 3000
```

`SENSOR_TOOL=true` makes pod questions work and turns every such question into a live production device read.
**Running it `false`, as this verification did, is why a stack exercised end to end still refused every question about a reading**: see [`GILLIGAN_TOOL_ACCESS.md`](GILLIGAN_TOOL_ACCESS.md), and D10, which settles the value the release runs with.

### The two local-only gates

`DEV_UNVERIFIED_AUTH=true` accepts a token's claims without verifying its signature.
Tokens are minted by the deployed API with a secret this machine does not hold, so a route moved into `DEV_LOCAL_PATHS` otherwise rejects every request, which is the authentication catch [`LOCAL_STACK.md`](LOCAL_STACK.md) describes.
It is gated on the flag being the literal `true`, on `NODE_ENV` not being `production`, and on the token still parsing as a JWT, and it warns on every request it serves.
It must never be set in a deployed environment; R1's real answer is service-to-service identity.

`DEV_CHAT_STORE=memory` serves the Firestore collections Gilligan writes from process memory.
Chat storage is the one part of the relay that needs Firestore, and without this every question succeeds at the assistant and then fails at the save.
State lives in the one process, so history resets when the server restarts.

## What was verified, 2026-09-21

All three services running together, questions asked through the dashboard's own rewrite at `:3000` as well as directly at `:5001`.

- A document question returned HTTP 200 in 4.2 s with the answer, four citations and a new `chatId`, through dashboard to server to cer-demo.
- A follow-up in the same chat answered "What units is it measured in?" as dissolved oxygen and stayed in the same chat, so history mapping and chat continuation both work.
- The stored chat carries `assistant: "cer-rag"` and an `audit` of `{ model, sources, toolCalls, totalTokens, answeredAt }`.
- The allowance moved from 20 to 19 to 18 across the two questions, and repeated status reads did not move it.
- An unauthenticated request is 401, an empty question is 400, and a cer-demo failure reaches the client with its status and message intact rather than flattened to a 400.
- Both real answers were run through the ported citation module: no marker characters and no quote fragments survive into the rendered text, and the chips resolve to the right source.
- cer-demo typecheck, lint, and 34 quota and usage tests pass; the server typechecks; the changed dashboard files lint clean and `/gilligan` compiles and serves 200.

Two questions were spent against Fireworks, 17,249 tokens in total.
No live device reads were made: `SENSOR_TOOL` was off throughout.
That is also the gap in this verification: with the flag off the model is offered no tools at all, so nothing here exercised a sensor question.

## Not done in R3

**Report download.** R3's done-when includes it, and it is deliberately left out.
Reports today are written to disk and guarded by a bearer-token hash sidecar, which R1 replaces with bytes returned in the response; two of the recorded defects are about that sidecar.
Building a relay against a design already scheduled for replacement would be throwaway work, and the honest sequence is R1 first.
*Done 2026-09-22:* R1's report half landed and the relay gained `POST /gilligan/report`.

**A browser pass over the rebuilt page.** The page compiles and serves, and the citation logic is verified against real answers in Node, which is the stronger check for the quote-leak risk.
Seeing it rendered still needs a logged-in browser session; that check is now [`REPORT_BROWSER_CHECK.md`](REPORT_BROWSER_CHECK.md) step 10.

**Anything upstream is uncommitted.** Both upstream repositories hold these changes in their working trees on branch `local`, matching how the dev passthrough was left.
*Since committed on `local`* (server `d3867ab`, dashboard `3badce7`), and not pushed.

## Defects observed while doing this

- `DEFAULT_RETRIEVAL=direct-feed` is not a registered mode and crashes the first request with "not registered". The direct-feed arm registers under the key `firestore-direct` (`src/retrieval/adapters/DirectFeedAdapter.ts:16`), and with `CORPUS_SOURCE=artifact` it reads the local corpus artifact rather than Firestore despite the name. This matters directly to the open decision on setting `DEFAULT_RETRIEVAL`: the arm's name and the config value are different strings.
- `clean-earth-rovers-server` ESLint cannot parse any TypeScript file, including untouched ones: `npx eslint src/services/FirestoreService.ts` reports "Parsing error: Unexpected token db". The TypeScript parser is not configured, so `npm run lint` there checks nothing. `tsc --noEmit` is the only working gate.
- A citation marker that closes with `}]` instead of `】`, which gpt-oss-120b does emit, leaves a stray `]` in the rendered text. The quote is still stripped, so this is cosmetic, and it is shared with `cer-demo/frontend/js/citations.js` because both use the same pattern. Fixing it belongs in that shared pattern, not in one of the two copies.
