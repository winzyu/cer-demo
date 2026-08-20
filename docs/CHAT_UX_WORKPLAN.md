# Chat UX work plan — delegatable workstreams

The startable subset of [`timeline.md`](timeline.md) N5, cut into parallel units with **disjoint file
ownership** so several agents can work at once without colliding.

Each workstream below is written to be handed to one agent as its whole brief. Ownership is the
contract: an agent edits the files it owns and nothing else. Where two streams need the same file,
Phase 0 creates the seam first.

---

## Guardrails — apply to every workstream, without exception

1. **Never edit `src/prompt/systemPrompt.ts`.** The system prompt is a pinned control for the N2
   bake-off while ◆G7 is open. A stray newline changes its SHA-256, voids all three captured arms,
   and throws away 168 transcripts. `test/unit/prompt.test.ts` pins it — if that test fails, the
   change is wrong, not the test.
2. **Never change the defaults** of `SENSOR_TOOL` (`false`), `DEFAULT_RETRIEVAL` (`stub`), or
   `DEBUG_RETRIEVAL` (`false`) in `src/config/index.ts`. A fresh checkout must stay credential-free.
3. **All 491 tests stay green.** No test may touch the network, need an API key, or cost money. New
   tests follow that rule too — mock `LlmService`, serve recorded bodies through a stubbed `fetch`.
4. **The response shape is a contract.** `tool_calls` and `tool_round_cap_reached` are *omitted* when
   no tool ran; the error body is `{ error, message }` with **no `status` field**. Adding fields is
   fine; changing or removing these is not.
5. **No CDN, no remote assets in the frontend.** There is no build step and no bundler. Third-party
   code is vendored into `frontend/vendor/` with its license header intact.
6. **The demo UI is served, not double-clicked** (decided 2026-08-17, during Phase 0). ES module
   scripts are fetched with CORS and a `file://` page has an opaque origin, so every browser blocks
   `<script type="module">` there — and `fetch("starter-prompts.json")` fails for the same reason.
   An earlier draft of this plan asked for both ES modules *and* `file://`, which cannot both hold.
   Run it as:

   ```bash
   cd frontend && python3 -m http.server 5173
   # then http://localhost:5173?backend=http://localhost:8000
   ```

   N7's Next.js page is served anyway, so this is the direction of travel rather than a detour.
7. **Do not touch** `eval/transcripts/**` (captured evidence), `eval/grading/**` (a live blind packet
   — `KEY.json` un-blinds it and must not be read), or `test/fixtures/device-api/**` (frozen
   recordings; the trap-preserving duplicates and mixed temperature units are deliberate).
8. **Write only inside this repo.** `../user-dashboard` and `../backend` are read-only references —
   and the real brand assets and tokens live there: `public/cer-light-transparent.png`,
   `public/gilligan-icon.png`, `src/app/globals.css` (`#12182b`, Work Sans 300 / Poppins 600),
   `#2D77A6` bubble, `#a89748` gold, `#f5cd19` nav active. Match them; do not invent new ones.
9. **Run no git commands.** The user drives all commits. Leave work in the working tree and report
   what you changed.

**Verification every stream runs before reporting done:**

> **In a fresh worktree, link the corpus artifact first** — `data/` is git-ignored, so
> `data/corpus/corpus.json` is not checked out and `test/unit/directFeed.test.ts` fails on an
> environmental miss that looks like a regression:
> `ln -s <main-checkout>/data/corpus data/corpus`.

```bash
npm test                      # 491 passing, 24 suites
npm run typecheck             # tsc --noEmit, silent
npx eslint src --ext .ts      # NOT `npm run lint` — that runs --fix and writes files
```

Frontend streams additionally: start `npm run dev`, open `frontend/index.html`, send one real
question, and confirm the behavior by eye. State plainly what you checked.

---

## Phase 0 — the seam `⟵ must land alone, before Wave 1`

**One agent. Everything in Wave 1 depends on this and nothing may start until it lands.**

`frontend/index.html` is 198 lines with inline `<style>` and one inline `<script>`. Four agents
editing that single file will conflict on every change, so split it first — and pre-create the empty
modules and DOM mount points Wave 1 will fill, so no Wave 1 agent ever needs to touch shared files.

**Owns:** `frontend/index.html`, and creates `frontend/app.css`, `frontend/js/*.js`,
`frontend/vendor/.gitkeep`, `frontend/starter-prompts.json`.

**Deliver:**

- `frontend/index.html` — markup only. Named, empty containers for each Wave 1 stream to mount into:
  a message body slot, a provenance slot per assistant message, an input/controls region, a chart
  slot.
- `frontend/app.css` — the existing `<style>` moved verbatim.
- `frontend/js/api.js` — the fetch + SSE transport, the `?backend=` override, `refreshHealth`.
- `frontend/js/render.js` — message rendering as it works today.
- `frontend/js/main.js` — wiring and the composer submit handler.
- **Stub modules, each exporting a no-op with the signature Wave 1 will implement:**
  `markdown.js`, `provenance.js`, `input.js`, `chart.js`. Import them from `main.js` so the wiring
  exists before the features do.
- `frontend/starter-prompts.json` — three hand-written placeholder questions, so WS-3 is not blocked
  waiting on WS-7.

**Acceptance:** the page looks and behaves exactly as before. This is a pure move — if the diff
contains a behavior change, it is out of scope. Use ES modules (`<script type="module">`) and confirm
the page loads from a served directory (guardrail 6), not `file://`.

**Status: complete** on `feat/frontend-modules`. `index.html` went 198 → 54 lines; the seam is
`data-slot="body"` on every message plus `.provenance` and `.chart` slots on assistant messages, and
static `#input-region` / `#starter-prompts` / `#response-controls` regions. `#response-controls` is a
sibling of the form, not a flex child of it, so it cannot steal width from the input.

---

## Wave 1 — parallel, disjoint ownership

### WS-1 · Markdown rendering + XSS hardening

**Owns:** `frontend/js/markdown.js`, `frontend/js/render.js`, `frontend/vendor/`

Render assistant answers as markdown: **tables, bold, italic, lists, inline code, fenced code,
headings, links**. Model output is untrusted input being turned into HTML, so **sanitization is part
of this feature, not a follow-up.**

- Vendor `marked` + `DOMPurify` into `frontend/vendor/` (download once, commit the files, keep
  license headers). Do not add npm frontend dependencies — there is no build step.
- Sanitize **after** rendering, never before. Strip `<script>`, event handlers, `javascript:` URLs.
- Render user messages as **plain text**, never markdown — a user must not be able to inject markup
  into their own transcript.
- Tables get `overflow-x: auto` so a six-metric table cannot blow out the layout.

**Acceptance:** ask a question that returns a table (a six-metric `all` read with `SENSOR_TOOL=true`);
it renders as a table. Paste `<img src=x onerror=alert(1)>` into the composer and confirm it is inert.

### WS-2 · Provenance surfacing

**Owns:** `frontend/js/provenance.js`

Everything here is already in the response body and invisible today. Render, per assistant message:

- **Tool calls** — one compact line each: `queried Algalita Pod · last 24h · mean DO`. Read from
  `tool_calls`. When `deduped: true`, say so rather than showing a duplicate.
- **Freshness badge** — from the tool result's `device_last_reported`. Ranges anchor to the device's
  newest reading, not the wall clock, so "last day" on a stale pod means *its* last day. Old Woman
  Creek has been silent since 2026-08-07 and nothing on screen says so today.
- **Caveat badges** — the tool already emits these: turbidity provisional/uncalibrated, and the
  `WATER_TYPE`-vs-`operatingEnvironment` mismatch. Surface them; do not invent new ones.
- **`complete: false`** — when `window_actually_searched` is narrower than `time_range_resolved`, say
  the search did not reach that far back. This exists because a model misread the resolved start as a
  pod's first reading.
- **Citations** — keep the existing behavior, but label direct-feed honestly: it is the whole slice on
  every request, not a per-query match.
- **Refusals styled as intentional.** A refusal is pinned behavior, not an error; if it renders like a
  crash it will be reported as a bug.

**Acceptance:** with `SENSOR_TOOL=true`, ask about Old Woman Creek and confirm the staleness is
visible without opening DevTools.

### WS-3 · Input & response controls

**Owns:** `frontend/js/input.js`

- Multi-line composer: **shift+enter** newline, **enter** sends, autosizing textarea.
- **Starter prompts** loaded from `frontend/starter-prompts.json` (WS-7 generates the real file).
- **Stop generation.** The server already aborts the upstream call on client disconnect via
  `AbortController` — wire the button to abort the fetch; the server side is done.
- **Copy answer** and **copy table**.
- **Regenerate** — re-send the last user turn with the same history.

**Acceptance:** send a long question, hit stop mid-stream, confirm the partial answer stays and no
further tokens arrive.

### WS-4 · Series chart

**Owns:** `frontend/js/chart.js`

When a tool result carries `aggregation: "series"`, render its buckets as a small inline chart. The
data is already there — epoch-aligned buckets with `mean`/`min`/`max`/`n` — and is currently unused.

- **Hand-rolled inline SVG.** No charting library; the payload is a handful of buckets.
- Plot `mean` as the line, `min`/`max` as a band. Label units from the tool result.
- **Empty buckets are omitted, never zero-filled** — the tool deliberately omits them, and a
  zero-filled gap reads as a real reading of 0, which for DO is anoxic water.
- Degrade to the existing table when there are fewer than 3 buckets.

**Acceptance:** `"chart temperature at the Algalita Pod over the last week"` renders a chart whose
endpoints match the numbers in the tool result.

### WS-5 · Strip `【commentary…】` markers *(server)*

**Owns:** `src/utils/answerFormat.ts` *(new)*, `test/unit/answerFormat.test.ts` *(new)*, and the
single call site in `src/services/ChatOrchestrator.ts`

`gpt-oss-20b` emits `【commentary…】` markers into visible output. Strip them from the answer text.

- **Post-processing only.** Do not add a prompt instruction — guardrail 1.
- Strip only the marker, never the surrounding prose. An answer that is *entirely* markers must come
  out as an empty string and hit the existing empty-answer guard, not be silently swallowed.
- Apply to the final answer on both the JSON and SSE paths, and to the round-cap fallback text.

**Acceptance:** unit tests over recorded marker shapes, including the marker-only case and a marker
mid-sentence.

**Status: complete** on `feat/strip-commentary`, with two findings that outlast the task:

- **The brackets are load-bearing for grading.** There are *zero* recorded `commentary` markers in
  the repo, but the same `【】` brackets carry ~160 **citations** across the captured transcripts
  (`【1】` alone 62×), which `GRADING_GUIDE.md` scores as `invalid_citations`. A naive strip-anything
  -in-brackets would have silently deleted graded evidence in 168 transcripts. The matcher is
  anchored to the channel name; everything else passes through byte-for-byte.
- **Follow-up (Wave 2):** the non-tool SSE branch at `ChatController.ts:125` — the default path with
  `SENSOR_TOOL=false` — bypasses the orchestrator and emits raw provider deltas, so it is **not**
  stripped. Fixing it needs stream buffering, because a marker can straddle chunk boundaries.

### WS-6 · Error taxonomy *(server)*

**Owns:** `src/utils/errors.ts`, `src/middleware/errorHandler.ts`, `src/devices/DeviceApiClient.ts`,
`test/unit/deviceApi.test.ts`

Today a caller cannot tell these apart. Give each a stable machine-readable `code` **added
alongside** the existing `{ error, message }` body — additive only, and `status` still must not
appear in the body.

| condition | code |
|---|---|
| no `FIREWORKS_API_KEY` (503) | `llm_not_configured` |
| device API 401 | `device_auth_expired` |
| device API timeout | `device_timeout` |
| device API 5xx / unreachable | `device_unavailable` |
| empty window (a *result*, not an error) | leave as-is: `value: null`, `n_samples: 0` |

**Token expiry must be surfaced, never blindly retried** — the dashboard's own interceptor clears the
token and redirects, and this service has no refresh path. The empty-window row is the trap: it is a
legitimate result and must not be reclassified as an error.

**Acceptance:** existing device-API tests still pass; new tests assert each code; `health.test.ts`
still confirms no `status` field in the body.

**Status: complete** on `feat/error-taxonomy`. `code` is **omitted** outside the taxonomy, so every
existing body is byte-identical apart from the four coded conditions. Three calls worth knowing:

- **Upstream 4xx other than 401 stays uncoded** — a 403/404 is a specific answer to a specific
  request, and coding it `device_unavailable` would invite a retry guaranteed to fail identically.
- **The "not configured" 503s** map to `device_unavailable`, not `device_auth_expired`: no token was
  ever issued, so there is no session to renew and a login prompt would not help.
- **`llm_not_configured` is inferred**, matching status 503 *plus* the key name, because it is raised
  in `LlmService.ts:102` / `EmbeddingService.ts:39` — outside this stream's ownership.
  **Follow-up:** swap those two `createError(503, …)` calls for `codedError(…, "llm_not_configured")`
  and delete the inference branch.

`resolveErrorCode` filters through `isErrorCode` so Node's own `code` (`ECONNREFUSED`, `ENOTFOUND`)
can never leak into a public body — `http-errors` has an index signature, so an unfiltered
pass-through would have published errnos.

### WS-7 · Starter prompts from the eval set *(server/tooling)*

**Owns:** `scripts/starterPrompts.ts` *(new)*, `test/unit/starterPrompts.test.ts` *(new)*, the
`starter:prompts` entry in `package.json`, and regenerating `frontend/starter-prompts.json`

Generate the starter prompts from `eval/fixtures/` rather than hand-writing them — the question set is
already curated, and generated prompts stay in sync for free.

- Emit the **first user turn** of a spread of fixtures across classes.
- **Exclude the `refusal` class** — a starter prompt the bot is designed to decline is a bad first
  impression, and excluding it is a UX call, not a claim the refusals are wrong.
- **Exclude `requires: sensor-tool` fixtures** unless a `--sensor` flag is passed, since those
  questions fail outright with the flag off, which is the default.
- Deterministic output — same fixtures in, same file out, so a regeneration diff is reviewable.

**Acceptance:** `npm run starter:prompts` regenerates the file; the test asserts determinism and the
two exclusions.

**Status: complete** on `feat/starter-prompts`, then cut to **3** in Wave 2 (`DEFAULT_LIMIT`).
The three rotate *families* of question rather than classes — slicing class order gave three ways of
asking the reference to look a fact up, which is the "three flavours of the same question" failure
this was meant to avoid. **The output shape is an object wrapper, and it
wins over Phase 0's placeholder** at merge:

```json
{ "prompts": [ { "id": "definitional-conductivity", "class": "definitional", "text": "…" } ] }
```

Phase 0 wrote `{ "prompts": [string] }`, so WS-3's loader must read `.prompts[].text`, not
`.prompts[]`. A test in this branch fails loudly if the placeholder file survives the merge.

---

## Wave 2 — after Wave 1 lands

- **Error UX in the UI** — consumes WS-6's codes. "Pod silent since Aug 7", never "no data", and never
  `0`. Needs WS-6 first.
- **Pod picker + time-range chips** — *Status: the blocker is cleared; the picker has landed.*
  `GET /api/v1/devices` (read-only, forwarding the caller's token) is live in
  `src/routes/deviceRoutes.ts`, and the picker itself is `frontend/js/podbar.js`. Time-range chips
  are still open. `SENSOR_DEVICE_LABEL` stays deliberately unset because guessing between two pods
  on opposite coasts is unsafe, and the picker removes the guess rather than defaulting it.
- **Feedback loop** (thumbs up/down → new eval fixture) — needs a decision on where feedback is
  stored, which is the same persistence question as chat history.

---

## Not startable, and why

| item | blocked on |
|---|---|
| System-prompt personality | **◆G7.** The prompt is pinned until the bake-off is graded. |
| Persisted chat history, per-user quota | **Authentication**, which does not exist in this service. Lands with N7, where the dashboard's JWT arrives. |
| Next.js chatbot page | **◆G5** (responsive scope) and **◆G6** (redesign vs. match dashboard style). Both are decisions, not work — resolving them is the cheapest unblock available. |
| Token streaming with tools on | Not blocked, but needs incremental `delta.tool_calls` assembly. Sized for N7. |

**Done 2026-08-19 — archiving the pgvector arm.** Taken off this list by decision rather than by
◆G7, which is still open. The coupled set was indeed wider than the docs listed, and the split fell
along the evidence/runtime line: **archived** to `archive/pgvector-rag/` — the adapter,
`src/retrieval/rrf.ts`, the seeder, `db/bakeoff/schema.sql`, `docker-compose.bakeoff.yml`,
`src/config/pgvector.ts`, plus the `pg` dependency, the `seed:pgvector` script and `PGVECTOR_URL`;
**kept live** — `scripts/gradePacket.ts`'s `ARMS` and the `pgvector-rag` entry in
`src/eval/costScenarios.ts`, because both operate on captured evidence, not on the arm. One item the
original note missed: `test/unit/pgvectorRag.test.ts` also tested `EmbeddingService`, which the
`firestore-vector` arm still uses, so it was **split** rather than moved —
`test/unit/embeddingService.test.ts` is the live half. Detail in `SPECS.md` §14.

---

## Suggested delegation

| wave | agents | streams |
|---|---|---|
| Phase 0 | 1 | the seam — must land alone |
| Wave 1 | up to 7 in parallel | WS-1 … WS-7 |
| Wave 2 | 2–3 | error UX, devices endpoint + pod picker, feedback loop |

WS-5, WS-6 and WS-7 touch no frontend files at all, so they can run **during Phase 0** if you want to
start immediately.

---

## Wave 2 — where things belong (decided 2026-08-18, from live testing)

Wave 1 put every piece of provenance into the message. Reading a real conversation showed
the cost: a routine question returned a tool chip, a freshness badge, a water-type warning,
an auto-drawn chart and fifteen starter prompts. Each was individually defensible and the
whole was unreadable.

The rule that sorts them: **a message carries what qualifies THAT answer; the chrome carries
what is true of the session.** Anything constant across answers is chrome — repeating it per
message is noise that trains the reader to skip the line where it finally matters.

| surface | what lives there | why |
|---|---|---|
| **Context bar** (persistent) | pod selector, pod status + last reading, water-type mismatch | Properties of the *deployment*, identical on every answer. The mismatch is a config fact, not a finding about a reading. |
| **Message** (always) | the answer; qualifications specific to it — empty window ("silent since Aug 7"), `complete:false`, turbidity-provisional *when turbidity is in the answer* | These change how you read this particular number. Dropping them would be dishonest. |
| **Message** (collapsed) | which tool ran, its arguments, sample counts, citations | Auditable on demand. Present for anyone checking the work, silent for everyone else. Closed by default. |
| **On request** | the series chart | A chart is an answer to "show me the trend", not a decoration on every series result. |

Three consequences that are not obvious:

- **The pod selector replaces the bot asking.** `SENSOR_DEVICE_LABEL` is deliberately unset
  because guessing between pods on opposite coasts is unsafe, so today the model asks and
  lists every device. A picker is both better UX and closer to the real workflow: a user has
  a few pods, not seventeen, and would have to choose anyway. It needed two things that have
  since landed — `GET /api/v1/devices` (`src/routes/deviceRoutes.ts`) and an optional `device` on
  the chat request (`src/validators/chatValidators.ts`).
- **Freshness moves but does not disappear.** "Silent since Aug 7" stays *in* the message when
  it explains an empty result, because there it is the answer. What moves is the routine
  "reporting, 8 minutes ago" on a healthy pod.
- **Starter prompts: 3, not 10.** They exist to show what the thing can do, not to enumerate
  the eval set. One line, then they get out of the way.
