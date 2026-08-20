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
  wrap.dataset.role = role;
  const r = document.createElement("div"); r.className = "role"; r.textContent = role;
  // textContent, never innerHTML: this is the only place a *user* turn is written, and a
  // user must not be able to inject markup into their own transcript (WS-1).
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
  return { wrap, role, body: b, slots: { body: b, provenance, chart } };
}

/** A user turn is always plain text — markdown is an assistant-only affordance (WS-1). */
function isUserTarget(target) {
  if (target.role) return target.role === "user";
  const wrap = target.wrap;
  return !!(wrap && wrap.classList && wrap.classList.contains("user"));
}

/**
 * Writes answer text into a message body.
 *
 * `markdownRenderer` is WS-1's seam: it receives the raw text and returns sanitized HTML,
 * or null/undefined to decline, in which case this falls back to the plain-text path that
 * has always run.
 *
 * The `body--md` class is the other half of the seam. app.css keeps `white-space: pre-wrap`
 * on a plain-text body so streamed newlines survive, and switches it to `normal` under
 * `.body--md` — without the class every block element the renderer emits would inherit
 * pre-wrap and the spacing would come out doubled.
 */
export function updateMessageBody(target, text, markdownRenderer) {
  // Never route a user turn through the markdown renderer, whatever the caller passes.
  const html = markdownRenderer && !isUserTarget(target) ? markdownRenderer(text) : null;
  if (html === null || html === undefined) {
    target.body.classList.remove("body--md");
    target.body.textContent = text;
    return;
  }
  target.body.classList.add("body--md");
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
  const label = document.createElement("span");
  label.textContent = "thinking…";
  // app.css has always carried `.thinking__dots` and its `thinking-pulse` keyframe, including a
  // `prefers-reduced-motion` override; nothing ever emitted the markup, so the animation was
  // dead CSS and the indicator was a bare word.
  const dots = document.createElement("span");
  dots.className = "thinking__dots";
  for (let i = 0; i < 3; i += 1) dots.appendChild(document.createElement("span"));
  t.append(label, dots);
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
