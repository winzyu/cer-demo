/**
 * Message rendering, exactly as it worked inline in index.html.
 *
 * Phase 0 addition: every message carries named, empty slots so Wave 1 streams can mount
 * into a message without editing this file's callers. Empty slots render nothing.
 */

let messagesEl = null;

/** Called once by main.js with the #messages container. */
export function initRender(container) {
  messagesEl = container;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function makeSlot(name) {
  const el = document.createElement("div");
  el.className = name;
  el.dataset.slot = name;
  return el;
}

/**
 * Appends a message and returns its handles:
 *   { wrap, body, slots: { body, provenance, chart } }
 * `provenance` and `chart` are null on user messages. `body` is returned at the top level
 * too, because streamed tokens are appended to it as they arrive.
 */
export function renderMessage(role, body) {
  const wrap = document.createElement("div");
  wrap.className = "msg " + role;
  const r = document.createElement("div"); r.className = "role"; r.textContent = role;
  const b = makeSlot("body"); b.textContent = body || "";
  wrap.append(r, b);

  // WS-2 / WS-4 mount points. Assistant messages only — a user turn has no provenance.
  let provenance = null;
  let chart = null;
  if (role === "assistant") {
    provenance = makeSlot("provenance");
    chart = makeSlot("chart");
    wrap.append(provenance, chart);
  }

  messagesEl.appendChild(wrap);
  scrollToBottom();
  return { wrap, body: b, slots: { body: b, provenance, chart } };
}

/**
 * Writes answer text into a message body.
 *
 * `markdownRenderer` is WS-1's seam: it receives the raw text and returns sanitized HTML,
 * or null/undefined to decline. Today's stub declines, so this is the plain-text path that
 * has always run.
 */
export function updateMessageBody(target, text, markdownRenderer) {
  const html = markdownRenderer ? markdownRenderer(text) : null;
  if (html === null || html === undefined) {
    target.body.textContent = text;
    return;
  }
  target.body.innerHTML = html;
}

// Chunk shape is { id, text, source, score? } — see docs/SPECS.md §9.
export function renderCitations(wrap, citations) {
  if (!citations || !citations.length) return;
  const seen = new Set();
  const ul = document.createElement("ul"); ul.className = "citations";
  for (const c of citations) {
    if (seen.has(c.source)) continue;
    seen.add(c.source);
    const li = document.createElement("li");
    const f = document.createElement("span"); f.className = "file"; f.textContent = c.source;
    li.append(f);
    ul.appendChild(li);
  }
  wrap.appendChild(ul);
}

export function renderThinking() {
  const t = document.createElement("div");
  t.className = "thinking"; t.id = "thinking-indicator";
  t.textContent = "thinking…";
  messagesEl.appendChild(t);
  scrollToBottom();
}

export function removeThinking() {
  const t = document.getElementById("thinking-indicator");
  if (t) t.remove();
}

/** Keeps the transcript pinned to the newest line while tokens stream in. */
export function scrollMessagesToBottom() {
  scrollToBottom();
}
