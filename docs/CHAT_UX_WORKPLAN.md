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
3. **All 429 tests stay green.** No test may touch the network, need an API key, or cost money. New
   tests follow that rule too — mock `LlmService`, serve recorded bodies through a stubbed `fetch`.
4. **The response shape is a contract.** `tool_calls` and `tool_round_cap_reached` are *omitted* when
   no tool ran; the error body is `{ error, message }` with **no `status` field**. Adding fields is
   fine; changing or removing these is not.
5. **No CDN, no remote assets in the frontend.** It is opened over `file://` with no build step and
   no bundler. Third-party code is vendored into `frontend/vendor/` with its license header intact.
6. **Do not touch** `eval/transcripts/**` (captured evidence), `eval/grading/**` (a live blind packet
   — `KEY.json` un-blinds it and must not be read), or `test/fixtures/device-api/**` (frozen
   recordings; the trap-preserving duplicates and mixed temperature units are deliberate).
7. **Write only inside this repo.** `../user-dashboard` and `../backend` are read-only references.
8. **Run no git commands.** The user drives all commits. Leave work in the working tree and report
   what you changed.

**Verification every stream runs before reporting done:**

```bash
npm test                      # 429 passing, 21 suites
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
contains a behavior change, it is out of scope. Use ES modules (`<script type="module">`); confirm it
still loads over `file://`, which is how the runbook tells people to open it.

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

---

## Wave 2 — after Wave 1 lands

- **Error UX in the UI** — consumes WS-6's codes. "Pod silent since Aug 7", never "no data", and never
  `0`. Needs WS-6 first.
- **Pod picker + time-range chips** — **blocked on a new endpoint.** `DeviceApiClient` exists
  server-side but no HTTP route exposes the device list; this needs `GET /api/v1/devices`
  (read-only, forwarding the caller's token) before the UI work can start. Worth doing:
  `SENSOR_DEVICE_LABEL` is deliberately unset because guessing between two pods on opposite coasts is
  unsafe, and a picker removes the guess rather than defaulting it.
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
| Deleting/archiving the pgvector arm | **◆G7.** See `timeline.md`; the deletion set is wider than the docs list — `src/retrieval/rrf.ts`, `scripts/gradePacket.ts`'s `ARMS`, and the `pgvector-rag` entry in `src/eval/costScenarios.ts` are all coupled to it. |

---

## Suggested delegation

| wave | agents | streams |
|---|---|---|
| Phase 0 | 1 | the seam — must land alone |
| Wave 1 | up to 7 in parallel | WS-1 … WS-7 |
| Wave 2 | 2–3 | error UX, devices endpoint + pod picker, feedback loop |

WS-5, WS-6 and WS-7 touch no frontend files at all, so they can run **during Phase 0** if you want to
start immediately.
