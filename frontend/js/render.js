/**
 * Message rendering, exactly as it worked inline in index.html.
 *
 * Phase 0 addition: every message carries named, empty slots so Wave 1 streams can mount
 * into a message without editing this file's callers. Empty slots render nothing.
 */

import { collapseCitationQuotes, stripOpenMarker, splitCitations } from "./citations.js";

let messagesEl = null;

/**
 * Citations for a message, keyed by its `wrap` element rather than a property on the DOM node —
 * a WeakMap lets the entry go away with the message instead of leaking for the life of the page.
 * `updateMessageBody` reads this to resolve a `【n†"quote"】` marker's source name; the quote text
 * itself is never stored here or anywhere else in memory the DOM can reach.
 */
const citationsByWrap = new WeakMap();

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
 *   { wrap, body, slots: { body, provenance, chart, report } }
 * `provenance`, `chart`, and `report` are null on user messages. `body` is returned at the
 * top level too, because streamed tokens are appended to it as they arrive.
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

  // WS-2 / WS-4 / report mount points. Assistant messages only — a user turn has none of these.
  let provenance = null;
  let chart = null;
  let report = null;
  if (role === "assistant") {
    provenance = makeSlot("provenance");
    chart = makeSlot("chart");
    report = makeSlot("report");
    wrap.append(provenance, chart, report);
  }

  messagesEl.appendChild(wrap);
  scrollToBottom();
  return { wrap, role, body: b, slots: { body: b, provenance, chart, report } };
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
/**
 * The model's refusal, reproduced verbatim from `src/prompt/systemPrompt.ts`.
 *
 * Duplicated rather than fetched because the frontend has no build step and no import path into
 * `src/`. Safe to duplicate precisely because the sentence cannot drift silently: the system
 * prompt is a pinned control for the N2 bake-off and `test/unit/prompt.test.ts` pins its SHA-256,
 * so any edit to it fails that test first.
 */
const REFUSAL_SENTENCE = "I can only answer questions grounded in this sensor's readings or the loaded water-quality documents, and I don't have enough information to answer that.";

/** A refusal is a legitimate answer, but it is not a finding — app.css styles it apart. */
const isRefusal = (text) => typeof text === "string" && text.trim().startsWith(REFUSAL_SENTENCE);

/** The source name for marker index `n` (1-based), or null when it can't be resolved. */
function citationSource(citations, index) {
  if (!citations || index < 1 || index > citations.length) return null;
  return citations[index - 1].source;
}

/**
 * Replaces every `【n†"quote"】`-style marker found in one text node with a `<sup class="cite">`,
 * built with `createElement`/`textContent` — never string-built HTML. The quote itself is
 * discarded by `splitCitations` before it ever reaches here, so it cannot appear in the DOM.
 */
function replaceMarkersInTextNode(node, citations) {
  const segments = splitCitations(node.nodeValue);
  if (segments.length === 1 && segments[0].type === "text") return; // no marker in this node
  const frag = document.createDocumentFragment();
  for (const seg of segments) {
    if (seg.type === "text") {
      if (seg.value) frag.appendChild(document.createTextNode(seg.value));
      continue;
    }
    const sup = document.createElement("sup");
    sup.className = "cite";
    const source = citationSource(citations, seg.index);
    sup.textContent = String(seg.index);
    sup.title = source || "Source not available";
    sup.setAttribute("aria-label", source ? `Source ${seg.index}: ${source}` : "Source not available");
    frag.appendChild(sup);
  }
  node.parentNode.replaceChild(frag, node);
}

/**
 * Walks `root`'s text nodes and turns citation markers into `<sup>` elements, skipping anything
 * inside `<code>`/`<pre>` (a quoted marker in a code sample is literal text, not a citation).
 *
 * This runs *after* `target.body.innerHTML` is set, on the sanitized DOM — never by building an
 * HTML string and re-parsing it. That's what keeps it XSS-safe: DOMPurify has already run (or the
 * plain-text path never produced HTML at all), so every text node visited here is trusted content,
 * and the only elements this function itself introduces are made with `createElement`/`textContent`.
 */
function insertCitationMarkers(root, citations) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node = walker.nextNode();
  while (node) {
    let el = node.parentElement;
    let inCode = false;
    while (el && el !== root) {
      if (el.tagName === "CODE" || el.tagName === "PRE") { inCode = true; break; }
      el = el.parentElement;
    }
    if (!inCode) nodes.push(node);
    node = walker.nextNode();
  }
  // Collect first, mutate after: replacing nodes mid-walk would disturb the TreeWalker's traversal.
  nodes.forEach((n) => replaceMarkersInTextNode(n, citations));
}

export function updateMessageBody(target, text, markdownRenderer) {
  // Cut a marker that is still streaming in before it ever reaches the renderer or the DOM.
  // Hide a marker still streaming in, then drop every quote from the raw text before markdown can
  // split it across nodes (see collapseCitationQuotes).
  const safeText = collapseCitationQuotes(stripOpenMarker(text));
  // Never route a user turn through the markdown renderer, whatever the caller passes.
  const html = markdownRenderer && !isUserTarget(target) ? markdownRenderer(safeText) : null;
  target.body.classList.toggle("body--refusal", !isUserTarget(target) && isRefusal(safeText));
  if (html === null || html === undefined) {
    target.body.classList.remove("body--md");
    target.body.textContent = safeText;
  } else {
    target.body.classList.add("body--md");
    target.body.innerHTML = html;
  }
  // A user turn is never cited — WS-1's markdown affordance is assistant-only for the same reason.
  if (!isUserTarget(target)) {
    insertCitationMarkers(target.body, citationsByWrap.get(target.wrap) || null);
  }
}

// Chunk shape is { id, text, source, score? } — see docs/SPECS.md §9.
export function renderCitations(wrap, citations) {
  // Remembered even when empty/absent, so a later `updateMessageBody` for this message can tell
  // "no citations for this turn" apart from "meta hasn't arrived yet" — both currently render the
  // same "Source not available" sup, but the distinction is what a richer hover will need later.
  citationsByWrap.set(wrap, citations || null);
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

/**
 * A failure, rendered as a failure.
 *
 * Errors used to go out as ordinary assistant bubbles reading "Error: …", which is visually
 * indistinguishable from an answer — the one thing a grounded assistant must never blur. The
 * `.notice` component in app.css was written for this and had no producer until now.
 *
 * `code` is the backend's machine-readable taxonomy value (`llm_not_configured`,
 * `device_auth_expired`, `device_timeout`, `device_unavailable`). It is shown, in small mono
 * type, because it is the string worth quoting when reporting the problem.
 */
export function renderNotice(text, code, title = "Something went wrong") {
  const wrap = document.createElement("div");
  wrap.className = "notice notice--error";
  wrap.setAttribute("role", "alert");

  const body = document.createElement("div");
  body.className = "notice__body";

  const h = document.createElement("div");
  h.className = "notice__title";
  h.textContent = title;
  body.appendChild(h);

  const p = document.createElement("div");
  p.className = "notice__text";
  p.textContent = text;
  body.appendChild(p);

  if (code) {
    const c = document.createElement("div");
    c.className = "notice__code";
    c.textContent = code;
    body.appendChild(c);
  }

  wrap.appendChild(body);
  messagesEl.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

export function removeThinking() {
  const t = document.getElementById("thinking-indicator");
  if (t) t.remove();
}

/** Keeps the transcript pinned to the newest line while tokens stream in. */
export function scrollMessagesToBottom() {
  scrollToBottom();
}
