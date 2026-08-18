/**
 * WS-1 — Markdown rendering + XSS hardening.
 *
 * Stub. `renderMarkdown` will take untrusted model output, render it to HTML (marked,
 * vendored into frontend/vendor/) and sanitize the result (DOMPurify) — sanitize AFTER
 * rendering, never before. User turns stay plain text and must never come through here.
 *
 * Contract: return a sanitized HTML string, or null to decline and let the caller fall
 * back to textContent. Declining is what keeps Phase 0 behavior-neutral.
 *
 * @param {string} text raw, untrusted markdown
 * @returns {string|null} sanitized HTML, or null to fall back to plain text
 */
export function renderMarkdown(text) { // eslint-disable-line no-unused-vars
  return null;
}
