/**
 * Wiring: grabs the DOM, hands the Wave 1 stubs their mount points, and owns the
 * composer submit handler. Lifted from the inline <script> in index.html unchanged.
 */

import { postChat, readSse, refreshHealth } from "./api.js";
import {
  initRender,
  renderMessage,
  renderCitations,
  renderThinking,
  removeThinking,
  updateMessageBody,
  scrollMessagesToBottom,
} from "./render.js";

import { renderMarkdown } from "./markdown.js";       // WS-1 · markdown + XSS hardening
import { renderProvenance } from "./provenance.js";   // WS-2 · provenance surfacing
import { initInput } from "./input.js";               // WS-3 · input & response controls
import { renderChart } from "./chart.js";             // WS-4 · series chart
import { initTheme } from "./theme.js";               // light / dark toggle
import { initPodBar, selectedDevice } from "./podbar.js"; // Wave 2 · pod selector + status

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const healthEl = document.getElementById("health");
const formEl = document.getElementById("composer");
const promptsEl = document.getElementById("starter-prompts");
const controlsEl = document.getElementById("response-controls");

const history = []; // [{role, content}]
let inflight = null;  // AbortController for the request in flight, or null

initRender(messagesEl);
initTheme(document.getElementById("theme-toggle"));
initPodBar({
  select: document.getElementById("pod-select"),
  status: document.getElementById("pod-status"),
});

async function send(msg) {
  // One turn at a time. Disabling #send is not enough on its own: the composer's Enter handler
  // calls `form.requestSubmit()` with no submitter, which submits from the *form* and so never
  // consults the button's disabled state. Without this guard a second Enter mid-stream starts a
  // parallel turn that appends a duplicate `#thinking-indicator`, interleaves two assistant
  // bubbles, and — because `inflight` is a single slot — orphans the first controller so Stop
  // can no longer reach it.
  if (inflight) return;

  renderMessage("user", msg);
  history.push({ role: "user", content: msg });
  inputEl.value = "";
  sendBtn.disabled = true;
  renderThinking();

  const controller = new AbortController();
  inflight = controller;

  let target = null;
  let answer = "";
  try {
    // history excludes the turn just pushed — that one is sent as `query`.
    const r = await postChat(msg, history.slice(0, -1), {
      signal: controller.signal,
      device: selectedDevice(),
    });

    if (!r.ok) {
      // Validation failures arrive as JSON before the stream opens.
      removeThinking();
      const err = await r.json().catch(() => ({ error: r.statusText }));
      renderMessage("assistant", "Error: " + (err.error || r.statusText));
      return;
    }

    for await (const { event, data } of readSse(r)) {
      if (event === "meta") {
        removeThinking();
        target = renderMessage("assistant", "");
        renderCitations(target.wrap, data.citations);
        // No `renderProvenance` here: the server's `meta` payload is `{ mode, citations }` and
        // `tool_calls` only ever rides on `done`, so the call returned immediately every time.
      } else if (event === "token") {
        if (!target) { removeThinking(); target = renderMessage("assistant", ""); }
        answer += data.text;
        updateMessageBody(target, answer, renderMarkdown);
        scrollMessagesToBottom();
      } else if (event === "done") {
        // `tool_calls` / `tool_round_cap_reached` are omitted when no tool ran.
        if (target) {
          renderProvenance(target.slots.provenance, data);
          renderChart(target.slots.chart, data);
        }
      } else if (event === "error") {
        if (!target) { removeThinking(); target = renderMessage("assistant", ""); }
        updateMessageBody(target, answer + "\n[stream error: " + data.error + "]", renderMarkdown);
      }
    }

    if (answer) history.push({ role: "assistant", content: answer });
  } catch (e) {
    removeThinking();
    // A user-initiated stop is not an error: keep whatever text already arrived.
    if (e.name !== "AbortError") renderMessage("assistant", "Network error: " + e.message);
    if (e.name === "AbortError" && answer) history.push({ role: "assistant", content: answer });
  } finally {
    // Only the turn that still owns the slot may release it, so a late-finishing request can
    // never re-enable the composer on behalf of one that is still streaming.
    if (inflight === controller) {
      inflight = null;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }
}

formEl.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const msg = inputEl.value.trim();
  if (!msg) return;
  await send(msg);
});

initInput({
  form: formEl,
  input: inputEl,
  sendButton: sendBtn,
  promptsEl,
  controlsEl,
  submit: send,
  getLastUserTurn: () => [...history].reverse().find((m) => m.role === "user") || null,
  // Wave 2 seam: input.js no longer needs to wrap window.fetch to stop a request.
  abort: () => { if (inflight) inflight.abort(); },
  // Regenerate drops the previous user+assistant pair instead of appending a second copy.
  dropLastExchange: () => {
    const msgs = messagesEl.querySelectorAll(".msg");
    for (let i = msgs.length - 1, removed = 0; i >= 0 && removed < 2; i -= 1, removed += 1) {
      msgs[i].remove();
    }
    while (history.length && history[history.length - 1].role === "assistant") history.pop();
    if (history.length && history[history.length - 1].role === "user") history.pop();
  },
});

refreshHealth(healthEl);
