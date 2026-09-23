/**
 * generate_report download - mounts into a message's `.report` slot.
 *
 * `generate_report` (REPORT_TOOL, defaults off) renders no file. Its result, on
 * `tool_calls[].result` in the `done` SSE payload (`ToolInvocation`, `src/types/tool.types.ts`),
 * carries a summary plus `report_request: { time_range, device? }` - the arguments to send to
 * `POST /api/v1/reports`, which renders the PDF and returns its bytes (`ReportController.ts`).
 * With REPORT_TOOL off, `tool_calls` is omitted entirely, this returns false having done
 * nothing, and `.report:empty` in app.css keeps the slot collapsed — same contract as
 * `renderChart`.
 *
 * **The control is a button, not a link.** There is no URL to navigate to: the route is a POST
 * that needs the `Authorization` header, so the click is a `fetch` into a blob that is saved as
 * a download. The token stays out of every URL.
 *
 * `report_request` is re-validated here before it is sent back - strings of bounded length and
 * nothing else - the same rule WS-1 applies to markdown output and provenance.js applies to
 * device names: nothing off an API response is trusted unchecked. The server validates again.
 */

import { BACKEND } from "./api.js";
import { authHeaders } from "./auth.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Mirrors `ReportController.ts`'s bounds on the two fields. */
const MAX_TIME_RANGE_CHARS = 100;
const MAX_DEVICE_CHARS = 200;

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
 * One `generate_report` invocation worth showing a download for, or null.
 *
 * Skips deduped calls (a repeat served from the per-request cache - a second identical button
 * would be noise, matching chart.js's rule for series charts) and any call whose result carries
 * `error` instead of a `report_request`.
 */
function reportFromCall(call) {
  if (!call || typeof call !== "object" || call.deduped) return null;
  if (call.name !== "generate_report") return null;
  const result = asObject(call.result);
  if (typeof result.error === "string") return null;
  const req = asObject(result.report_request);
  const timeRange = req.time_range;
  if (typeof timeRange !== "string" || !timeRange || timeRange.length > MAX_TIME_RANGE_CHARS) {
    return null;
  }
  const device = req.device;
  if (device !== undefined && (typeof device !== "string" || device.length > MAX_DEVICE_CHARS)) {
    return null;
  }
  return {
    body: device ? { time_range: timeRange, device } : { time_range: timeRange },
    siteName: typeof result.site_name === "string" ? result.site_name : null,
  };
}

/** The server's `attachment; filename="…"`, or a generic name. */
function filenameFrom(response) {
  const header = response.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/.exec(header);
  return match ? match[1] : "cer-report.pdf";
}

function clearSlot(slot) {
  while (slot.firstChild) slot.removeChild(slot.firstChild);
}

/**
 * Fills an assistant message's report slot with one "Download report" button per
 * generate_report call in this turn. Contract matches `renderChart`: idempotent (safe to call
 * again on a re-render), returns whether it filled the slot.
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

  reports.forEach(({ body, siteName }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn--ghost btn--report";
    button.appendChild(iconDoc());
    const original = siteName ? `Download report - ${siteName} (PDF)` : "Download report (PDF)";
    const label = el("span", null, original);
    button.appendChild(label);

    button.onclick = async () => {
      button.disabled = true;
      label.textContent = "Preparing report…";
      try {
        const response = await fetch(`${BACKEND}/api/v1/reports`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const problem = await response.json().catch(() => ({}));
          label.textContent = response.status === 401
            ? "Sign in to download this report"
            : response.status === 429
              ? "Report limit reached - try again later"
              : (typeof problem.error === "string" && problem.error) || "Report unavailable";
          return;
        }
        const blobUrl = URL.createObjectURL(await response.blob());
        const save = document.createElement("a");
        save.href = blobUrl;
        save.download = filenameFrom(response);
        document.body.appendChild(save);
        save.click();
        save.remove();
        // Revoked on a timer rather than immediately: some browsers start the save
        // asynchronously and need the URL to still resolve.
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        label.textContent = original;
      } catch (e) {
        label.textContent = "Could not reach the report service";
      } finally {
        button.disabled = false;
      }
    };

    slot.appendChild(button);
  });

  return true;
}
