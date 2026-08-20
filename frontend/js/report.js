/**
 * generate_report link — mounts into a message's `.report` slot.
 *
 * `generate_report` (REPORT_TOOL, defaults off) does not stream a file; it returns a summary
 * plus a path to a PDF already written to disk, on `tool_calls[].result.report_url`
 * (`src/tools/generateReport.ts:131-141`) — the exact same `done` SSE payload shape
 * `provenance.js` and `chart.js` already read (`ToolInvocation`, `src/types/tool.types.ts:47`).
 * With REPORT_TOOL off, `tool_calls` is omitted entirely, this returns false having done
 * nothing, and `.report:empty` in app.css keeps the slot collapsed — same contract as
 * `renderChart`.
 *
 * The model's own answer text may already say "The report is ready: /api/v1/reports/….pdf" —
 * this does not replace that sentence, it makes it clickable instead of a reader having to
 * copy a path out of prose.
 *
 * `report_url` is a *server-relative path*, not a full URL, and it is not necessarily on the
 * same origin as this page: the frontend is a static file server (`frontend/`, no build step)
 * while the API is `BACKEND` (see `api.js`), which can be a different host/port entirely in
 * dev. So it is resolved against `BACKEND`, never `location.origin`.
 *
 * Re-validated here against the exact filename grammar `ReportController.ts`'s `SAFE_FILENAME`
 * accepts (`/api/v1/reports/<safe-chars>.pdf`) before it becomes an `href` — a malformed or
 * unexpected string is dropped rather than trusted, same rule WS-1 applies to markdown output
 * and provenance.js applies to device names: nothing off an API response becomes markup or a
 * navigation target unchecked.
 */

import { BACKEND } from "./api.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Mirrors `ReportController.ts`'s SAFE_FILENAME, applied to the full path the tool returns. */
const SAFE_REPORT_PATH = /^\/api\/v1\/reports\/[a-zA-Z0-9_-]+\.pdf$/;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A page-with-folded-corner glyph, styled identically to chart.js's icons (currentColor only). */
function iconDoc() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  [
    ["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }],
    ["path", { d: "M14 2v6h6" }],
  ].forEach(([tag, attrs]) => {
    const shape = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach((name) => shape.setAttribute(name, attrs[name]));
    svg.appendChild(shape);
  });
  return svg;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/**
 * One `generate_report` invocation worth showing a link for, or null.
 *
 * Skips deduped calls (a repeat served from the per-request cache — the same URL a sibling
 * call already surfaced, so a second identical button would be noise, matching chart.js's rule
 * for series charts) and any call whose result carries `error` instead of a `report_url`.
 */
function reportFromCall(call) {
  if (!call || typeof call !== "object" || call.deduped) return null;
  if (call.name !== "generate_report") return null;
  const result = asObject(call.result);
  if (typeof result.error === "string") return null;
  const url = result.report_url;
  if (typeof url !== "string" || !SAFE_REPORT_PATH.test(url)) return null;
  return { url, siteName: typeof result.site_name === "string" ? result.site_name : null };
}

function clearSlot(slot) {
  while (slot.firstChild) slot.removeChild(slot.firstChild);
}

/**
 * Fills an assistant message's report slot with one "View report" link per generate_report
 * call in this turn. Contract matches `renderChart`: idempotent (safe to call again on a
 * re-render), returns whether it filled the slot.
 *
 * @param {HTMLElement} slot the message's `.report` element
 * @param {object} payload the SSE `done` data for that message
 * @returns {boolean} whether the slot was filled
 */
export function renderReport(slot, payload) {
  if (!slot || typeof slot.appendChild !== "function") return false;

  clearSlot(slot);

  const calls = payload && Array.isArray(payload.tool_calls) ? payload.tool_calls : [];
  const reports = calls.map(reportFromCall).filter(Boolean);
  if (reports.length === 0) return false;

  reports.forEach(({ url, siteName }) => {
    const link = document.createElement("a");
    link.className = "btn--ghost btn--report";
    link.href = BACKEND + url;
    // New tab: this is a PDF, not a navigation away from the conversation.
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.appendChild(iconDoc());
    link.appendChild(el("span", null, siteName ? `View report — ${siteName} (PDF)` : "View report (PDF)"));
    slot.appendChild(link);
  });

  return true;
}
