/**
 * WS-4 — Series chart.
 *
 * Stub. `renderChart` will draw hand-rolled inline SVG for a tool result carrying
 * `aggregation: "series"`: `mean` as the line, `min`/`max` as a band, units labelled from
 * the tool result. Empty buckets are omitted, never zero-filled — a zero-filled gap reads
 * as a real reading of 0, which for DO is anoxic water. Fewer than 3 buckets degrades to
 * the existing table.
 *
 * Contract: return true if a chart was drawn, false to leave the slot empty and let the
 * caller keep its current rendering.
 *
 * @param {HTMLElement} slot the message's empty `.chart` element
 * @param {object} payload the SSE `done` data for that message
 * @returns {boolean} whether a chart was rendered
 */
export function renderChart(slot, payload) { // eslint-disable-line no-unused-vars
  return false;
}
