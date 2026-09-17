/**
 * WS-3 — Input & response controls.
 *
 * Owns everything inside #input-region except the composer markup itself:
 *
 *   - multi-line composer → the <input> is upgraded to a <textarea> at runtime
 *   - stop / copy / regenerate → #response-controls
 *
 * Two notes on how this file works, because it may not edit any other file:
 *
 * 1. The composer swap keeps the ORIGINAL <input> object alive. main.js captured it as
 *    `inputEl` at module scope before calling initInput, and reads `.value`, writes
 *    `.value = ""` and calls `.focus()` on it. The element is detached from the DOM and
 *    its `value` / `focus` are redefined to proxy the textarea, so main.js keeps working
 *    against the live field without knowing it moved.
 *
 * 2. Stop and Regenerate run through the ctx, not through the transport. main.js owns an
 *    AbortController per request and hands this module `abort()` and `dropLastExchange()`;
 *    an earlier revision of this file had to monkey-patch `window.fetch` to get at the
 *    request, and that wrapper is gone. main.js also treats an AbortError as a stop rather
 *    than a failure — it keeps the partial answer on screen and pushes it to history — so
 *    nothing here needs to fake a clean end-of-stream any more.
 *
 * No literal colours and no inline styles: every class name here already exists in
 * app.css (.btn--ghost / .composer__hint), and the composer
 * autosizes by setting `rows`, not a height.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const FALLBACK_MAX_ROWS = 8;
const FEEDBACK_MS = 1600;

/* ============================= icons ============================= */

/**
 * Inline SVG in the one stroke idiom used across the page:
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

/* ============================= response controls ============================= */

/** The body slot of the newest assistant message, or null. render.js owns the markup. */
function lastAnswerEl() {
  const bodies = document.querySelectorAll('.msg.assistant:not([data-greeting]) [data-slot="body"]');
  return bodies.length ? bodies[bodies.length - 1] : null;
}

/**
 * True when the newest message on screen is an assistant answer.
 *
 * Regenerate is gated on this, not merely on "an answer exists somewhere". main.js's
 * `dropLastExchange()` removes the last two message elements as a pair, so if a turn was
 * stopped before the assistant bubble appeared, the newest message is the *user* turn and
 * dropping two would also take the previous answer off screen while `history` kept it.
 * Offering Regenerate only when a real pair is there keeps the two in step.
 */
function lastMessageIsAnswer() {
  const msgs = document.querySelectorAll(".msg");
  const last = msgs.length ? msgs[msgs.length - 1] : null;
  return Boolean(last && last.classList && last.classList.contains("assistant"));
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
 *   {
 *     form, input, sendButton, controlsEl,
 *     submit(text),          // run one turn, exactly as the composer would
 *     getLastUserTurn(),     // {role, content} | string | null
 *     abort(),               // abort the request in flight; a no-op when idle
 *     dropLastExchange(),    // drop the previous user+assistant pair, transcript + history
 *   }
 * @returns {void}
 */
export function initInput(ctx) {
  const {
    form, input, sendButton, controlsEl,
    submit, getLastUserTurn, abort, dropLastExchange,
  } = ctx || {};

  upgradeComposer(form, input);
  let busy = false;

  function renderControls() {
    if (!controlsEl) return;
    controlsEl.textContent = ""; // :empty collapses the row

    if (busy) {
      // No abort() in the ctx means nothing here can actually stop the request, and a Stop
      // button that does nothing is worse than none.
      if (typeof abort !== "function") return;
      controlsEl.appendChild(ghostButton(ICON_STOP, "Stop", (btn) => {
        btn.disabled = true;
        // main.js aborts its own AbortController and keeps the partial answer, so there is
        // nothing to clean up on this side.
        abort();
      }));
      return;
    }

    if (!lastAnswerEl()) return;
    controlsEl.appendChild(ghostButton(ICON_COPY, "Copy answer", (btn, labelEl, original) => {
      copyAnswer(labelEl, original);
    }));
    if (typeof submit === "function" && typeof getLastUserTurn === "function"
        && lastMessageIsAnswer()) {
      controlsEl.appendChild(ghostButton(ICON_REGENERATE, "Regenerate", () => {
        const last = getLastUserTurn();
        const text = typeof last === "string" ? last : last && last.content;
        if (!text) return;
        // Read the turn BEFORE dropping it — dropLastExchange pops it off `history`.
        // Regenerate replaces the last answer; without this the question is asked twice,
        // once in the transcript and once again in the history payload.
        if (typeof dropLastExchange === "function") dropLastExchange();
        submit(text);
      }));
    }
  }

  function setBusy(next) {
    if (busy === next) return;
    busy = next;
    renderControls();
  }

  // In-flight state: main.js disables #send for exactly the life of a turn and re-enables
  // it in a `finally`, so its disabled attribute is the one signal that covers every exit
  // path (stream done, validation error, network failure, stop).
  if (sendButton && typeof MutationObserver === "function") {
    const observer = new MutationObserver(() => setBusy(Boolean(sendButton.disabled)));
    observer.observe(sendButton, { attributes: true, attributeFilter: ["disabled"] });
  }

  if (form) {
    form.addEventListener("submit", () => {
      // main.js registered its submit handler first and has already flipped #send by now,
      // so this shows Stop on the same tick instead of waiting for the observer — and is
      // the only path to it where MutationObserver does not exist.
      if (sendButton) setBusy(Boolean(sendButton.disabled));
    });
  }

}
