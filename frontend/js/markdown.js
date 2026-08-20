/**
 * WS-1 — Markdown rendering + XSS hardening.
 *
 * Model output is untrusted input being turned into HTML, so the order here is the whole
 * point: **render first with marked, sanitize the result with DOMPurify second**. Sanitizing
 * the markdown source instead would be worthless — `[x](javascript:alert(1))` contains no
 * markup until marked turns it into an anchor.
 *
 * Both libraries are vendored under frontend/vendor/ (no build step, no CDN — see
 * docs/CHAT_UX_WORKPLAN.md guardrail 5):
 *   - marked 18.0.10       (MIT)
 *   - DOMPurify 3.4.13     (Apache-2.0 OR MPL-2.0)
 *
 * Contract with render.js: return a sanitized HTML string, or null to decline and let the
 * caller fall back to `textContent`. Declining is always safe; returning unsanitized HTML
 * never is, so every failure path below returns null.
 *
 * User turns must never come through here — render.js enforces that on its side too.
 */

import { marked } from "../vendor/marked.esm.js";
import DOMPurify from "../vendor/purify.es.mjs";

/**
 * The tag allowlist is exactly what marked can emit for the features WS-1 promises
 * (tables, bold, italic, lists, inline code, fenced code, headings, blockquotes, links)
 * plus the inline bits GFM adds (`del`, `hr`, `br`). Everything else — `script`, `style`,
 * `iframe`, `img`, `svg`, `form`, `object` — is absent, so it is dropped.
 */
const ALLOWED_TAGS = [
  "p", "br", "hr",
  "strong", "em", "del", "code", "pre",
  "blockquote",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "a",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
];

/**
 * Attributes. Deliberately tiny: no `class`, no `id`, no `style`, and therefore no
 * `on*` handler can survive either (DOMPurify drops anything not on this list).
 * `align` is GFM's table-alignment attribute; `colspan`/`rowspan` are harmless table shape.
 * `.table-wrap` is added by us *after* sanitization, which is why `class` need not be allowed.
 */
const ALLOWED_ATTR = ["href", "title", "align", "colspan", "rowspan", "target", "rel"];

/**
 * Tighter than DOMPurify's default URI allowlist, which also permits `tel:`, `sms:`,
 * `callto:`, `cid:` and `xmpp:`. This assistant cites documents and web pages; nothing
 * else has a reason to appear. Relative and fragment links pass through.
 */
const SAFE_URI = /^(?:https?:|mailto:|[#/.?]|[^a-z+.\-:]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

const purify = DOMPurify;
let hooksInstalled = false;

/**
 * Anchors get `rel="noopener noreferrer"` unconditionally (a vendored `target=_blank`
 * without it hands the opener window to the linked page), and any href that is not
 * plainly safe is removed rather than rewritten. DOMPurify's own URI check already
 * rejects `javascript:`; this is the second lock on the same door, and it also catches
 * the `target` attribute if a future config ever allows raw HTML through.
 */
function installHooks() {
  if (hooksInstalled || typeof purify.addHook !== "function") return;
  purify.addHook("afterSanitizeAttributes", (node) => {
    if (!node.tagName || node.tagName.toLowerCase() !== "a") return;
    const href = node.getAttribute("href");
    if (href === null) return;
    // Strip control characters and whitespace before testing: a browser reads
    // "java\tscript:alert(1)" as a live URL, but a naive prefix test does not.
    const probe = href.replace(/[\u0000-\u0020\u007f-\u00a0]/g, "");
    if (!SAFE_URI.test(probe)) {
      node.removeAttribute("href");
      node.removeAttribute("target");
      node.removeAttribute("rel");
      return;
    }
    node.setAttribute("rel", "noopener noreferrer");
    node.setAttribute("target", "_blank");
  });
  hooksInstalled = true;
}

/**
 * A six-metric `all` read is the common case, and an unwrapped table pushes the whole
 * transcript sideways. `.table-wrap` carries `overflow-x: auto` in app.css so the table
 * scrolls itself. Done on the sanitized fragment, so the class we add is ours, not the
 * model's.
 */
function wrapTables(fragment, doc) {
  const tables = fragment.querySelectorAll ? fragment.querySelectorAll("table") : [];
  for (const table of tables) {
    const parent = table.parentNode;
    if (!parent) continue;
    if (parent.nodeType === 1 && parent.classList && parent.classList.contains("table-wrap")) continue;
    const wrap = doc.createElement("div");
    wrap.className = "table-wrap";
    parent.insertBefore(wrap, table);
    wrap.appendChild(table);
  }
}

/**
 * @param {string} text raw, untrusted markdown (a model answer, never a user turn)
 * @returns {string|null} sanitized HTML, or null to fall back to plain text
 */
export function renderMarkdown(text) {
  if (typeof text !== "string" || text.trim() === "") return null;

  // No DOM (or a DOMPurify that cannot run here) means no sanitizer. Decline rather than
  // emit HTML nobody checked.
  if (!purify || purify.isSupported !== true) return null;

  let rawHtml;
  try {
    rawHtml = marked.parse(text, {
      gfm: true,      // tables, strikethrough, autolinks
      breaks: true,   // a single newline is a line break: chat answers are written that way
      async: false,
    });
  } catch {
    return null;
  }
  if (typeof rawHtml !== "string") return null;

  installHooks();

  let fragment;
  try {
    fragment = purify.sanitize(rawHtml, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOWED_URI_REGEXP: SAFE_URI,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      RETURN_DOM_FRAGMENT: true,
    });
  } catch {
    return null;
  }
  if (!fragment) return null;

  const doc = fragment.ownerDocument;
  if (!doc) return null;

  wrapTables(fragment, doc);

  const host = doc.createElement("div");
  host.appendChild(fragment);
  return host.innerHTML;
}
