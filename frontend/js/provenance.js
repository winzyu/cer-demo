/**
 * WS-2 — Provenance surfacing.
 *
 * Stub. `renderProvenance` will fill an assistant message's provenance slot from the
 * response body: tool-call lines, the freshness badge from `device_last_reported`, the
 * caveat badges the tool already emits, `complete: false` when `window_actually_searched`
 * is narrower than `time_range_resolved`, and honestly-labelled citations. Refusals are
 * pinned behavior and must be styled as intentional, not as an error.
 *
 * @param {HTMLElement} slot the message's empty `.provenance` element
 * @param {object} payload the SSE `meta`/`done` data for that message
 * @returns {void}
 */
export function renderProvenance(slot, payload) { // eslint-disable-line no-unused-vars
  // no-op until WS-2
}
