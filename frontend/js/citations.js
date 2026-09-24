/**
 * Citation marker parsing — pure, DOM-free so it can run in Jest's `node` environment the same
 * way `test/unit/frontendAuth.test.ts` evaluates `auth.js` without jsdom.
 *
 * The server's system prompt asks the model to cite retrieved context as `【n†"verbatim quote"】`
 * (see `src/eval/gates/checks.ts`, `QUOTE_CITATION_PATTERN`) so an offline eval can check the quote
 * by substring match. The quote is for that eval only — a user must never see it. `render.js` uses
 * `splitCitations` to turn the marker into a bare numbered `<sup>` and `stripOpenMarker` to hide a
 * marker that is still streaming in, so the quote text never reaches the DOM even for a frame.
 */

/**
 * Matches every marker form the server's checker accepts, plus the plain and legacy forms:
 * bare `【3】`, a legacy line span `【3†L1-L4】`, and a quoted span with any separator the eval's
 * `QUOTE_CITATION_PATTERN` tolerates (`†‡:|,;–—-` or just a space) and either straight or
 * typographic double quotes. Digits are matched first, right after `【`, so this never matches
 * `【commentary …】` — that's prose, not a citation, and must render as plain text.
 */
// Two shapes. A quoted marker may close with 】 or — a real gpt-oss-120b habit seen in the
// 2026-09-13 smoke capture — with } or ] straight after the closing quote: `【1†"90% in 1s"}`.
// A real 】 may still follow that } or ]; it is consumed too, so it never renders doubled.
// The quoted span excludes 【, 】 and newlines, so a malformed marker can never reach forward to
// a later marker's 】 and swallow the ordinary answer text in between into one citation.
export const MARKER_PATTERN = /【\s*(T[1-9]\d*|\d+)\s*(?:[†‡:|,;–—-]\s*)?(?:["“”„‟″][^【】\n]*?["“”„‟″]\s*(?:[}\]]*\s*】|[}\]]+)|(?:L\d+(?:-L?\d+)?)?\s*】)/g;

/**
 * While streaming, an answer can end mid-marker — e.g. `…warms 【3†"solubility of oxy`. If the
 * text's last `【` has no closing `】` after it, and what follows looks like the start of a marker
 * (optional spaces then a digit), cut the text there so the half-written quote never flashes on
 * screen. Anything else — a closed marker, or a `【` that isn't starting a citation at all
 * (`【commentary`) — is left untouched.
 */
/** Longer than a 20-word quote plus its marker; a longer unclosed tail is not a marker in progress. */
const OPEN_MARKER_MAX_CHARS = 300;

/**
 * A marker still being written: digits, an optional separator, and an optional quote that is open
 * (or has only just closed) — all running straight to the end of the text.
 */
const OPEN_MARKER_TAIL = /^\s*\d+\s*(?:[†‡:|,;–—-]\s*)?(?:["“”„‟″][^"“”„‟″【】\n]*["“”„‟″]?)?\s*$/;

export function stripOpenMarker(text) {
  const lastOpen = text.lastIndexOf("【");
  if (lastOpen === -1) return text;
  const rest = text.slice(lastOpen + 1);
  // Only a marker whose tail runs to the very end of the text is hidden. Anything after its closing
  // quote — a malformed "} or "), or a sentence the model wrote after never closing the bracket —
  // is finished text, and nothing re-renders after the stream ends, so cutting there would hide
  // the end of the answer for good.
  if (rest.length > OPEN_MARKER_MAX_CHARS) return text;
  return OPEN_MARKER_TAIL.test(rest) ? text.slice(0, lastOpen) : text;
}

/**
 * Rewrites every marker to its bare `【n】` form in the raw text, **before** markdown runs.
 *
 * Quotes are copied from PDFs and datasheets, so they can contain `*`, `~`, backticks or a URL.
 * Rendered first, markdown would split such a quote across several DOM nodes, no single text node
 * would hold the whole marker, and the quote would show. Removing the quote from the text first
 * leaves markdown nothing to split, and the DOM pass only ever has to find `【n】`.
 */
export function collapseCitationQuotes(text) {
  return text.replace(MARKER_PATTERN, (_marker, index) => `【${index}】`)
    .replace(/【(?!\s*(?:T[1-9]\d*|\d+)\s*】|commentary\b)[^【】\n]*】/g, "");
}

/**
 * Splits `text` into an ordered list of `{ type: "text", value }` and `{ type: "cite", index }`
 * segments (1-based index into the `citations` array `meta` carried). No segment ever carries the
 * quote text — that's the whole point of parsing the marker out here instead of leaving it in the
 * rendered text.
 */
export function splitCitations(text) {
  text = collapseCitationQuotes(text);
  const segments = [];
  let lastIndex = 0;
  for (const match of text.matchAll(MARKER_PATTERN)) {
    const idx = match.index;
    if (idx > lastIndex) segments.push({ type: "text", value: text.slice(lastIndex, idx) });
    segments.push(match[1].startsWith("T")
      ? { type: "tool", handle: match[1] }
      : { type: "cite", index: Number(match[1]) });
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ type: "text", value: text.slice(lastIndex) });
  return segments;
}
