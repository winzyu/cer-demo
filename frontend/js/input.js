/**
 * WS-3 — Input & response controls.
 *
 * Owns everything inside #input-region except the composer markup itself:
 *
 *   - starter prompts   → #starter-prompts, from starter-prompts.json (.prompts[].text)
 *   - multi-line composer → the <input> is upgraded to a <textarea> at runtime
 *   - stop / copy / regenerate → #response-controls
 *
 * Two notes on how this file has to work, because it may not edit any other file:
 *
 * 1. The composer swap keeps the ORIGINAL <input> object alive. main.js captured it as
 *    `inputEl` at module scope before calling initInput, and reads `.value`, writes
 *    `.value = ""` and calls `.focus()` on it. The element is detached from the DOM and
 *    its `value` / `focus` are redefined to proxy the textarea, so main.js keeps working
 *    against the live field without knowing it moved.
 *
 * 2. main.js calls `postChat(msg, history)` with no options, so there is no seam to hand
 *    it an AbortSignal — see `installStopHook`. Rather than edit main.js, this module
 *    wraps `window.fetch` for POSTs to the chat path only, attaches its own
 *    AbortController, and re-wraps the response body so a user stop ends the SSE stream
 *    *cleanly* (`done: true`) instead of rejecting mid-read. That matters: an AbortError
 *    thrown into main.js's read loop would print "Network error: …" under the partial
 *    answer and drop that answer from `history`. Closing the stream instead leaves the
 *    partial text on screen and in history, which is what stopping should mean.
 *    The clean fix is a signature change; see the notes at the bottom of this file.
 *
 * No literal colours and no inline styles: every class name here already exists in
 * app.css (.chip / .chip--starter / .btn--ghost / .composer__hint), and the composer
 * autosizes by setting `rows`, not a height.
 */

import { API_PATH } from "./api.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const PROMPTS_URL = "starter-prompts.json";
const FALLBACK_MAX_ROWS = 8;
const FEEDBACK_MS = 1600;

const noop = () => {};

/* ============================= icons ============================= */

/**
 * Inline SVG in the same stroke idiom as the theme toggle in index.html:
 * 24×24, no fill, currentColor, 2px round strokes. `shapes` is [tag, attrs] pairs.
 */
function icon(shapes) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  shapes.forEach(([tag, attrs]) => {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach((k) => node.setAttribute(k, attrs[k]));
    svg.appendChild(node);
  });
  return svg;
}

const ICON_STOP = () => icon([["rect", { x: 6, y: 6, width: 12, height: 12, rx: 2 }]]);

const ICON_COPY = () => icon([
  ["rect", { x: 9, y: 9, width: 11, height: 11, rx: 2 }],
  ["path", { d: "M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" }],
]);

const ICON_REGENERATE = () => icon([
  ["path", { d: "M3.5 12a8.5 8.5 0 0 1 14.6-5.9" }],
  ["path", { d: "M19 2.6v4.2h-4.2" }],
  ["path", { d: "M20.5 12a8.5 8.5 0 0 1-14.6 5.9" }],
  ["path", { d: "M5 21.4v-4.2h4.2" }],
]);

/** A .btn--ghost with an icon and a label span the caller can re-label. */
function ghostButton(makeIcon, label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn--ghost";
  const text = document.createElement("span");
  text.textContent = label;
  btn.append(makeIcon(), text);
  btn.addEventListener("click", () => onClick(btn, text, label));
  return btn;
}

/** Temporarily swaps a button's label, then puts the original back. */
function flash(labelEl, message, original) {
  labelEl.textContent = message;
  window.setTimeout(() => { labelEl.textContent = original; }, FEEDBACK_MS);
}

/* ============================= starter prompts ============================= */

/**
 * Pulls the prompt strings out of a parsed starter-prompts.json.
 *
 * The generated shape (scripts/starterPrompts.ts) is
 *   { "prompts": [ { "id", "class", "text" }, … ] }
 * so the text lives at `.prompts[].text`. Phase 0's placeholder file was a flat array of
 * strings; that shape is deliberately NOT accepted, so a stale placeholder shows no chips
 * rather than half-working. Anything malformed degrades to [] and never throws.
 *
 * @param {unknown} data parsed JSON
 * @returns {string[]}
 */
export function readStarterPrompts(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.prompts)) return [];
  return data.prompts
    .filter((p) => p && typeof p === "object" && typeof p.text === "string")
    .map((p) => p.text.trim())
    .filter((t) => t.length > 0);
}

/** Fetches and parses the prompt file. A missing or broken file yields no chips. */
async function loadStarterPrompts(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return [];
    return readStarterPrompts(await r.json());
  } catch (e) {
    return []; // offline, 404, or invalid JSON — the composer still works without chips
  }
}

/* ============================= composer ============================= */

/** Fires the form's submit event, so main.js's existing handler stays the one send path. */
function submitForm(form) {
  if (!form) return;
  if (typeof form.requestSubmit === "function") form.requestSubmit();
  else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

/**
 * Grows the textarea with its content by setting `rows` — an attribute, not a style, so
 * app.css keeps sole control of the box. The row ceiling is derived from the `max-height`
 * app.css already sets on #composer #input; past it the textarea scrolls itself.
 */
function autosize(ta) {
  const cs = window.getComputedStyle(ta);
  const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 20;
  const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const maxH = parseFloat(cs.maxHeight);
  const maxRows = Number.isFinite(maxH)
    ? Math.max(1, Math.floor((maxH - pad) / line))
    : FALLBACK_MAX_ROWS;

  ta.rows = 1;
  const needed = Math.round((ta.scrollHeight - pad) / line);
  ta.rows = Math.min(maxRows, Math.max(1, needed || 1));
}

/**
 * Replaces the shipped <input type="text"> with a textarea and keeps the old element
 * usable as a proxy, because main.js holds a reference to it (see the header note).
 * Returns the field that is actually on screen.
 */
function upgradeComposer(form, legacy) {
  if (!legacy || legacy.tagName === "TEXTAREA") return legacy;

  const ta = document.createElement("textarea");
  ta.rows = 1;
  ta.placeholder = legacy.placeholder || "";
  ta.setAttribute("autocomplete", "off");
  ta.setAttribute("aria-label", legacy.getAttribute("aria-label") || ta.placeholder);

  const parent = legacy.parentNode || form;
  parent.insertBefore(ta, legacy);
  legacy.remove();          // detach BEFORE reusing its id, so the id is never duplicated
  legacy.removeAttribute("id");
  ta.id = "input";          // app.css styles `#composer #input`; the textarea inherits it

  // main.js's `inputEl` now points at a detached node. Proxy the two members it uses.
  Object.defineProperty(legacy, "value", {
    configurable: true,
    get() { return ta.value; },
    set(v) {
      ta.value = v === null || v === undefined ? "" : String(v);
      autosize(ta);
    },
  });
  legacy.focus = () => ta.focus();
  legacy.select = () => ta.select();

  ta.addEventListener("input", () => autosize(ta));
  ta.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    if (ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) return; // shift+enter = newline
    if (ev.isComposing || ev.keyCode === 229) return;                 // mid-IME composition
    ev.preventDefault();
    submitForm(form);
  });

  if (legacy.hasAttribute("autofocus")) ta.focus();
  return ta;
}

/* ============================= stop generation ============================= */

/**
 * Wraps a streaming Response so that a user stop closes the stream instead of rejecting
 * the pending read. main.js consumes the body with `for await (… of readSse(r))`; a
 * rejection there lands in its catch and prints a network error over the partial answer.
 */
function gracefulStream(res, handle) {
  if (!res.body) return res;
  const reader = res.body.getReader();

  const stream = new ReadableStream({
    async pull(controller) {
      if (handle.stopped) {
        reader.cancel().catch(noop);
        controller.close();
        return;
      }
      let chunk;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (handle.stopped) controller.close(); // the abort we asked for, not a failure
        else controller.error(err);
        return;
      }
      if (chunk.done || handle.stopped) {
        controller.close();
        return;
      }
      controller.enqueue(chunk.value);
    },
    cancel(reason) { reader.cancel(reason).catch(noop); },
  });

  try {
    return new Response(stream, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } catch (e) {
    return res; // never break sending just because the wrapper could not be built
  }
}

/** An immediately-finished SSE response, for a stop that lands before the headers do. */
function emptyStream() {
  return new Response(
    new ReadableStream({ start(controller) { controller.close(); } }),
    { status: 200, statusText: "OK", headers: { "Content-Type": "text/event-stream" } },
  );
}

/**
 * Installs the fetch wrapper. Only POSTs to the chat path are touched; the health poll
 * and the starter-prompts GET pass straight through.
 *
 * @param {(handle: object) => void} onStart called when a chat request goes out
 * @returns {{ stop: () => void, isStopped: () => boolean }}
 */
function installStopHook(onStart) {
  const native = window.fetch.bind(window);
  let current = null;

  window.fetch = function patchedFetch(input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (method !== "POST" || url.indexOf(API_PATH) === -1) return native(input, init);

    const controller = new AbortController();
    const options = { ...(init || {}) };
    // postChat already supports a caller-supplied signal; never clobber one.
    if (!options.signal) options.signal = controller.signal;

    const handle = { controller, stopped: false, owned: options.signal === controller.signal };
    current = handle;
    onStart(handle);

    return native(input, options).then(
      (res) => gracefulStream(res, handle),
      (err) => {
        // Stopped before the response headers arrived: hand back an empty stream so the
        // read loop finishes normally rather than surfacing an AbortError.
        if (handle.stopped) return emptyStream();
        throw err;
      },
    );
  };

  return {
    stop() {
      const handle = current;
      if (!handle || handle.stopped) return;
      handle.stopped = true;
      if (handle.owned) {
        try { handle.controller.abort(); } catch (e) { /* already settled */ }
      }
    },
    isStopped() { return Boolean(current && current.stopped); },
  };
}

/* ============================= response controls ============================= */

/** The body slot of the newest assistant message, or null. render.js owns the markup. */
function lastAnswerEl() {
  const bodies = document.querySelectorAll('.msg.assistant [data-slot="body"]');
  return bodies.length ? bodies[bodies.length - 1] : null;
}

/** Selects the answer so the reader can copy by hand when the clipboard API is barred. */
function selectNode(el) {
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * navigator.clipboard is undefined on insecure origins (and writeText can reject when the
 * document is not focused), so failure is the expected path, not an edge case: fall back
 * to selecting the text and saying so on the button.
 */
async function copyAnswer(labelEl, original) {
  const el = lastAnswerEl();
  if (!el) return;
  const text = el.innerText || el.textContent || "";
  if (!text.trim()) return;

  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("no clipboard api");
    await navigator.clipboard.writeText(text);
    flash(labelEl, "Copied", original);
  } catch (e) {
    flash(labelEl, selectNode(el) ? "Selected — press Ctrl + C" : "Copy unavailable", original);
  }
}

/* ============================= entry point ============================= */

/**
 * @param {object} ctx wiring handed in by main.js:
 *   { form, input, sendButton, promptsEl, controlsEl, submit(text), getLastUserTurn() }
 * @returns {void}
 */
export function initInput(ctx) {
  const {
    form, input, sendButton, promptsEl, controlsEl, submit, getLastUserTurn,
  } = ctx || {};

  const field = upgradeComposer(form, input);
  let busy = false;

  const hooks = installStopHook(() => setBusy(true));

  function clearStarters() {
    // app.css collapses #starter-prompts:empty, so emptying it removes the row.
    if (promptsEl) promptsEl.textContent = "";
  }

  function renderControls() {
    if (!controlsEl) return;
    controlsEl.textContent = ""; // :empty collapses the row

    if (busy) {
      controlsEl.appendChild(ghostButton(ICON_STOP, "Stop", (btn) => {
        btn.disabled = true;
        hooks.stop();
      }));
      return;
    }

    if (!lastAnswerEl()) return;
    controlsEl.appendChild(ghostButton(ICON_COPY, "Copy answer", (btn, labelEl, original) => {
      copyAnswer(labelEl, original);
    }));
    if (typeof submit === "function" && typeof getLastUserTurn === "function") {
      controlsEl.appendChild(ghostButton(ICON_REGENERATE, "Regenerate", () => {
        const last = getLastUserTurn();
        const text = typeof last === "string" ? last : last && last.content;
        if (text) submit(text);
      }));
    }
  }

  function setBusy(next) {
    if (busy === next) return;
    busy = next;
    if (busy) clearStarters();
    else if (hooks.isStopped()) {
      // A stop before the first SSE event leaves main.js's "thinking…" row behind,
      // because nothing in its read loop ever reached removeThinking().
      const t = document.getElementById("thinking-indicator");
      if (t) t.remove();
    }
    renderControls();
  }

  // In-flight state: main.js disables #send for exactly the life of a turn and re-enables
  // it in a `finally`, so its disabled attribute is the one signal that covers every exit
  // path (stream done, validation error, network failure, stop).
  if (sendButton && typeof MutationObserver === "function") {
    const observer = new MutationObserver(() => setBusy(Boolean(sendButton.disabled)));
    observer.observe(sendButton, { attributes: true, attributeFilter: ["disabled"] });
  }

  if (form) form.addEventListener("submit", clearStarters);

  if (promptsEl) {
    loadStarterPrompts(PROMPTS_URL).then((prompts) => {
      if (!prompts.length || busy || document.querySelector(".msg")) return;
      prompts.forEach((text) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip chip--starter";
        chip.textContent = text;
        chip.addEventListener("click", () => {
          if (field) field.value = text;
          if (field) autosize(field);
          submitForm(form); // main.js's submit handler reads the field and clears it
        });
        promptsEl.appendChild(chip);
      });
    });
  }
}

/*
 * What a signature change in main.js would buy, if WS-3 is ever allowed to touch it:
 *
 *   1. `postChat(msg, history, { signal })` + an `onAbortController(c)` (or a `controls`
 *      object) in the initInput ctx — then the fetch wrapper above disappears entirely.
 *      main.js would also need `catch (e) { if (e.name === "AbortError") …keep answer… }`
 *      and to push the partial answer into history itself.
 *   2. `history` (the array itself) or a `dropLastTurn()` in the ctx — then Regenerate can
 *      drop the previous user+assistant pair before re-sending, instead of appending a
 *      second copy of the question to both the transcript and the history payload.
 */
