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

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const healthEl = document.getElementById("health");
const formEl = document.getElementById("composer");
const promptsEl = document.getElementById("starter-prompts");
const controlsEl = document.getElementById("response-controls");

const history = []; // [{role, content}]

initRender(messagesEl);

async function send(msg) {
  renderMessage("user", msg);
  history.push({ role: "user", content: msg });
  inputEl.value = "";
  sendBtn.disabled = true;
  renderThinking();

  let target = null;
  let answer = "";
  try {
    // history excludes the turn just pushed — that one is sent as `query`.
    const r = await postChat(msg, history.slice(0, -1));

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
        renderProvenance(target.slots.provenance, data);
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
    renderMessage("assistant", "Network error: " + e.message);
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
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
});

refreshHealth(healthEl);
