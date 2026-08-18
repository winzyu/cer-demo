/**
 * WS-2 — Provenance surfacing.
 *
 * Everything rendered here already exists in the response body and is invisible today.
 * `main.js` calls this twice per assistant message: once on the SSE `meta` event (which
 * carries only `{ mode, citations }` — never `tool_calls`) and once on `done`, which carries
 * `{ model, usage, tool_calls?, tool_round_cap_reached? }`. `tool_calls` is *omitted* when no
 * tool ran (`SENSOR_TOOL=false`, the default), so the meta call and every flag-off answer must
 * leave the slot untouched and empty — `.provenance:empty` in app.css keeps it collapsed.
 *
 * Shapes read here, all confirmed in source rather than guessed:
 *   - `tool_calls[]` is `ToolInvocation` (src/types/tool.types.ts:47):
 *     `{ round, name, arguments, result, deduped? }`, `arguments` already parsed to an object
 *     (src/services/ChatOrchestrator.ts:239).
 *   - `result` is `query_sensor_data`'s output (src/tools/querySensorData.ts:434-576):
 *     `device.{name,label,operating_environment}`, `metric`, `unit`, `aggregation`,
 *     `time_range_requested`, `time_range_resolved.{start,end,label}`,
 *     `window_actually_searched.{start,end,complete,reason?}`, `device_last_reported`,
 *     `value`, `n_samples`, `excluded_faulted`, optional `metrics{}` for `metric: "all"`,
 *     and a single joined `note` string carrying every caveat.
 *
 * Two rules this file exists to keep:
 *   - **Never print a bare `0` for an empty window.** `value: null` / `n_samples: 0` means the
 *     pod was silent, and a fabricated zero is anoxic water — the eval's automatic
 *     disqualification. The empty case renders "silent since <date>" and no sample count.
 *   - **Never build markup from a string.** Device names and API messages come off someone
 *     else's production API; everything below is `createElement` + `textContent`.
 *
 * No literal colours: every class here is defined in app.css against theme.css tokens.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** Newer than this and the pod counts as reporting; older and it gets the stale badge. */
const RECENT_MS = 24 * 60 * 60 * 1000;

/* ------------------------------- tiny DOM helpers ------------------------------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Inline SVG only, no emoji — same stroke style as the theme toggle in index.html.
 * Size comes from `.chip svg` / `.badge svg` in app.css, colour from `currentColor`.
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
    const shape = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach((name) => shape.setAttribute(name, attrs[name]));
    svg.appendChild(shape);
  });
  return svg;
}

/** A queried datastore. */
const iconQuery = () => icon([
  ["ellipse", { cx: "12", cy: "5.6", rx: "7.4", ry: "2.9" }],
  ["path", { d: "M4.6 5.6v12.8c0 1.6 3.3 2.9 7.4 2.9s7.4-1.3 7.4-2.9V5.6" }],
  ["path", { d: "M4.6 12c0 1.6 3.3 2.9 7.4 2.9s7.4-1.3 7.4-2.9" }],
]);

/** A repeat served from the per-request cache. */
const iconRepeat = () => icon([
  ["path", { d: "M20.5 11a8.5 8.5 0 0 0-14.6-5.4L3.5 8" }],
  ["path", { d: "M3.5 3.5V8H8" }],
  ["path", { d: "M3.5 13a8.5 8.5 0 0 0 14.6 5.4L20.5 16" }],
  ["path", { d: "M20.5 20.5V16H16" }],
]);

/** Attention, not failure — used by every `.badge--warn`. */
const iconWarn = () => icon([
  ["path", { d: "M10.3 3.9 2.6 17.1A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0z" }],
  ["path", { d: "M12 9.2v4.1" }],
  ["path", { d: "M12 16.8h.01" }],
]);

/* ------------------------------- formatting ------------------------------- */

/** Wire names the deployment writes differently everywhere else. */
const METRIC_LABELS = { all: "all metrics", ph: "pH", orp: "ORP" };

/** `dissolved_oxygen` → `dissolved oxygen`; `ph` → `pH`; `all` → `all metrics`. */
function metricLabel(metric) {
  if (typeof metric !== "string" || metric === "") return null;
  return METRIC_LABELS[metric] || metric.replace(/_/g, " ");
}

/**
 * The date part of an ISO instant. Deliberately not localised: the tool emits UTC, and a
 * locale/timezone round-trip can move "silent since 2026-08-07" to the 6th.
 */
function isoDate(value) {
  return typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : null;
}

function ageLabel(ms) {
  if (!Number.isFinite(ms) || ms < 60000) return "just now";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(ms / 3600000);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(ms / 86400000)} days ago`;
}

/**
 * How many readings the window actually held.
 *
 * A `metric: "all"` read has no top-level `n_samples` — every metric comes off the same rows,
 * so the row count is the largest per-metric count, not their sum (a sum would multiply one
 * window by six). Returns null when the result carries no count at all.
 */
function sampleCount(result) {
  if (typeof result.n_samples === "number") return result.n_samples;
  const { metrics } = result;
  if (!metrics || typeof metrics !== "object") return null;
  let highest = null;
  Object.keys(metrics).forEach((name) => {
    const entry = metrics[name];
    if (entry && typeof entry.n_samples === "number") {
      highest = highest === null ? entry.n_samples : Math.max(highest, entry.n_samples);
    }
  });
  return highest;
}

/* ------------------------------- one tool call ------------------------------- */

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** What the model asked for, preferring the tool's echo of it over the raw arguments. */
function describeCall(invocation) {
  const result = asObject(invocation.result);
  const args = asObject(invocation.arguments);
  const device = asObject(result.device);

  const name = typeof device.name === "string" ? device.name
    : (typeof args.device === "string" ? args.device : null);

  const parts = [
    metricLabel(result.metric !== undefined ? result.metric : args.metric),
    typeof result.time_range_requested === "string" ? result.time_range_requested
      : (typeof args.time_range === "string" ? args.time_range : null),
    typeof result.aggregation === "string" ? result.aggregation
      : (typeof args.aggregation === "string" ? args.aggregation : null),
  ].filter((part) => typeof part === "string" && part !== "");

  return { name, parts, result };
}

/**
 * Appends `lead`, a bold device name, then ` · a · b · c` — as text nodes, never as markup.
 */
function appendCallText(chip, lead, name, parts) {
  const line = el("span");
  line.appendChild(document.createTextNode(name ? `${lead} ` : lead));
  if (name) line.appendChild(el("b", null, name));
  if (parts.length > 0) line.appendChild(document.createTextNode(` · ${parts.join(" · ")}`));
  chip.appendChild(line);
}

function toolChip(invocation) {
  const { name, parts, result } = describeCall(invocation);
  const chip = el("span", "chip chip--tool");
  chip.appendChild(iconQuery());

  const count = sampleCount(result);
  // An empty window says "silent since …" in its own badge. Printing "0 samples" here would
  // put a zero next to a reading that does not exist, which is the one thing this must not do.
  const withCount = count !== null && count > 0
    ? parts.concat(`${count} ${count === 1 ? "sample" : "samples"}`)
    : parts;

  appendCallText(chip, "Queried", name, withCount);
  return chip;
}

function dedupedChip(invocation, repeats) {
  const { name, parts } = describeCall(invocation);
  const chip = el("span", "chip chip--deduped");
  chip.appendChild(iconRepeat());
  const lead = repeats > 1 ? `Repeated ×${repeats}` : "Repeated";
  appendCallText(chip, lead, name, parts.concat("served from cache"));
  chip.setAttribute(
    "title",
    "The model re-issued a call it had already made; the loop returned the stored result "
    + "instead of hitting the device API again.",
  );
  return chip;
}

/* ------------------------------- badges ------------------------------- */

function badge(variant, text, title) {
  const node = el("span", `badge badge--${variant}`);
  if (variant === "ok") {
    node.appendChild(el("span", "dot"));
  } else {
    node.appendChild(iconWarn());
  }
  node.appendChild(el("span", null, text));
  if (title) node.setAttribute("title", title);
  return node;
}

/**
 * Every caveat the tool emits arrives joined into one `note` string
 * (src/tools/querySensorData.ts:647-681), so they are recovered by matching the sentences it
 * writes. Nothing is inferred beyond what that string already states.
 */
function caveatBadges(note) {
  const found = [];
  if (typeof note !== "string" || note === "") return found;

  if (note.indexOf("provisional, uncalibrated") !== -1) {
    found.push(badge(
      "warn",
      "Turbidity provisional — a relative index, not a calibrated measurement",
      note,
    ));
  }

  const mismatch = /operates in ([^,]+), but the deployment's configured water type is ([^.]+)\./
    .exec(note);
  if (mismatch) {
    found.push(badge(
      "warn",
      `Water type mismatch — pod is ${mismatch[1]}, thresholds are ${mismatch[2]}`,
      note,
    ));
  }

  return found;
}

/** Badges for one tool result, in the order a reader needs them. */
function resultBadges(result, now) {
  const found = [];

  if (typeof result.error === "string") {
    found.push(badge("warn", `Sensor query failed — ${result.error}`, result.error));
    return found;
  }

  // Freshness. Ranges anchor to the device's newest reading rather than the wall clock, so a
  // stale pod's "last day" is *its* last day and every number reads as current. This badge is
  // the only thing on screen that says how long ago that was.
  const reported = typeof result.device_last_reported === "string"
    ? Date.parse(result.device_last_reported) : NaN;
  const known = Number.isFinite(reported);
  const age = known ? now - reported : null;
  const stale = known && age > RECENT_MS;
  const note = typeof result.note === "string" ? result.note : undefined;

  if (sampleCount(result) === 0) {
    // An empty window is a *result*, not an error, and it must never read as a zero reading.
    // It also carries the freshness fact itself, so it replaces the badge above rather than
    // stacking a second date on top of it.
    let text;
    if (!known) text = "No readings in this window, and no last reading on record for this pod";
    else if (stale) text = `No readings in this window — pod silent since ${isoDate(result.device_last_reported)}`;
    else text = `No readings in this window — pod last reported ${ageLabel(age)}`;
    found.push(badge("warn", text, note));
  } else if (known && !stale) {
    found.push(badge("ok", `Reporting — last reading ${ageLabel(age)}`));
  } else if (known) {
    found.push(badge(
      "warn",
      `Pod stale — last reading ${isoDate(result.device_last_reported)}, ${ageLabel(age)}`,
      `This device last reported at ${result.device_last_reported}.`,
    ));
  }

  // `complete: false` — the API's unit ladder tops out at one year, so the resolved range can
  // reach further back than the search ever did. A model once read the resolved start as the
  // pod's first reading.
  const window = asObject(result.window_actually_searched);
  if (window.complete === false) {
    const searched = isoDate(window.start);
    const asked = isoDate(asObject(result.time_range_resolved).start);
    found.push(badge(
      "warn",
      asked
        ? `Search did not reach that far back — covered ${searched} onward, not ${asked}`
        : `Search did not reach that far back — covered ${searched} onward`,
      typeof window.reason === "string" ? window.reason : undefined,
    ));
  }

  caveatBadges(note).forEach((node) => found.push(node));
  return found;
}

/* ------------------------------- entry point ------------------------------- */

/**
 * Fills an assistant message's provenance slot from the SSE payload.
 *
 * @param {HTMLElement} slot the message's `.provenance` element
 * @param {object} payload the SSE `meta` / `done` data for that message
 * @param {number} [now] reference instant for freshness; defaults to the wall clock
 * @returns {void}
 */
export function renderProvenance(slot, payload, now) {
  if (!slot) return;

  const calls = payload && Array.isArray(payload.tool_calls) ? payload.tool_calls : [];
  // No tool ran: the `meta` event, and every answer with SENSOR_TOOL off. Leave the slot
  // untouched so app.css's `:empty` rule keeps it collapsed.
  if (calls.length === 0) return;

  const at = typeof now === "number" ? now : Date.now();
  const fragment = document.createDocumentFragment();

  // A repeat is served from the per-request cache, so it gets one compact chip rather than a
  // second copy of the row. Identical repeats collapse into one chip with a count.
  const repeats = new Map();
  calls.forEach((call) => {
    if (!call || !call.deduped) return;
    const key = `${call.name}|${JSON.stringify(asObject(call.arguments), Object.keys(asObject(call.arguments)).sort())}`;
    const seen = repeats.get(key);
    if (seen) seen.count += 1;
    else repeats.set(key, { call, count: 1 });
  });

  calls.forEach((call) => {
    if (!call || call.deduped) return;
    fragment.appendChild(toolChip(call));
  });
  repeats.forEach((entry) => fragment.appendChild(dedupedChip(entry.call, entry.count)));

  // Badges come off the executed calls only — a deduped call carries a copy of an earlier
  // result, so reading it again would double every badge it produced.
  const shown = new Set();
  calls.forEach((call) => {
    if (!call || call.deduped) return;
    resultBadges(asObject(call.result), at).forEach((node) => {
      const key = `${node.className}|${node.textContent}`;
      if (shown.has(key)) return;
      shown.add(key);
      fragment.appendChild(node);
    });
  });

  slot.textContent = "";           // idempotent: `meta` then `done` must not stack
  slot.appendChild(fragment);
}
