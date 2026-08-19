/**
 * WS-2 — Provenance surfacing, re-sorted for Wave 2.
 *
 * Everything rendered here already exists in the response body and is invisible today.
 * `main.js` calls this twice per assistant message: once on the SSE `meta` event (which
 * carries only `{ mode, citations }` — never `tool_calls`) and once on `done`, which carries
 * `{ model, usage, tool_calls?, tool_round_cap_reached? }`. `tool_calls` is *omitted* when no
 * tool ran (`SENSOR_TOOL=false`, the default), so the meta call and every flag-off answer must
 * leave the slot untouched and empty — `.provenance:empty` in app.css keeps it collapsed.
 *
 * WHAT CHANGED IN WAVE 2 (docs/CHAT_UX_WORKPLAN.md, "Wave 2 — where things belong"):
 * live testing found one routine answer carrying a tool chip, a freshness badge, a water-type
 * warning and a chart nobody asked for. Individually defensible, collectively unreadable. The
 * rule that sorts them: **a message carries what qualifies THAT answer; the chrome carries what
 * is true of the session.** So:
 *
 *   - The audit trail — tool chips, arguments, sample counts, the resolved window, and the
 *     citation list — collapses into ONE `<details class="details">`, closed by default.
 *   - Only qualifications that change how you read *this* number stay loose in the slot:
 *     an empty window, `complete: false`, provisional turbidity when turbidity is in the
 *     answer, a window anchored to a stale pod, and a recoverable tool error.
 *   - Gone from the message entirely, because `podbar.js` now owns them in the context bar:
 *     the healthy-pod freshness badge ("Reporting — 8 min ago") and the water-type mismatch.
 *     The mismatch is a config fact about the deployment, not a finding about a reading.
 *
 * The asymmetry is deliberate: "silent since Aug 7" STAYS when it explains an empty result,
 * because there it is the answer. What left is the routine status line on a healthy pod.
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

/** Newer than this and the pod counts as reporting; older and its window is anchored to the past. */
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
 * Nothing outside those two classes gets an icon: a bare inline SVG with no CSS rule sizing
 * it falls back to 300×150, and `.details > summary` has no such rule.
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

function plural(count, noun) {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
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

  const metric = metricLabel(result.metric !== undefined ? result.metric : args.metric);
  const range = typeof result.time_range_requested === "string" ? result.time_range_requested
    : (typeof args.time_range === "string" ? args.time_range
      : (typeof asObject(result.time_range_resolved).label === "string"
        ? asObject(result.time_range_resolved).label : null));
  const aggregation = typeof result.aggregation === "string" ? result.aggregation
    : (typeof args.aggregation === "string" ? args.aggregation : null);

  const parts = [metric, range, aggregation]
    .filter((part) => typeof part === "string" && part !== "");

  return {
    name, parts, metric, range, result,
  };
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
  // An empty window says "no readings in this window" in its own badge, outside the
  // disclosure. Printing "0 samples" here would put a zero next to a reading that does not
  // exist, which is the one thing this must not do.
  const withCount = count !== null && count > 0
    ? parts.concat(plural(count, "sample"))
    : parts;

  appendCallText(chip, "Queried", name, withCount);

  // The window the search really covered, when the tool narrowed it. The loose badge says
  // *that* it was narrowed; the exact dates are audit detail and belong in here.
  const window = asObject(result.window_actually_searched);
  const searchedFrom = isoDate(window.start);
  const searchedTo = isoDate(window.end);
  if (window.complete === false && searchedFrom) {
    const span = searchedTo ? `${searchedFrom} → ${searchedTo}` : `${searchedFrom} onward`;
    chip.appendChild(el("span", null, ` · searched ${span}`));
  }
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
 * Did turbidity actually appear in this answer?
 *
 * The tool only writes the provisional note when turbidity is among the metrics it read
 * (`querySensorData.ts:663`), but matching the sentence alone would put the caveat on a
 * dissolved-oxygen answer the moment that string travels — a joined `note`, a cached result,
 * a future metric that borrows the wording. So the badge is gated on the *result*: turbidity
 * is in this answer or the caveat is not this answer's problem.
 */
function coversTurbidity(invocation) {
  const result = asObject(invocation.result);
  const args = asObject(invocation.arguments);
  if (result.metric === "turbidity" || args.metric === "turbidity") return true;
  const metrics = asObject(result.metrics);
  if (Object.prototype.hasOwnProperty.call(metrics, "turbidity")) return true;
  // A `metric: "all"` read that failed before it could enumerate `metrics{}` still covered it.
  return (result.metric === "all" || args.metric === "all") && Object.keys(metrics).length === 0;
}

/**
 * The loose badges: qualifications that change how you read THIS answer.
 *
 * Deliberately absent, because `podbar.js` renders them once in the context bar instead of
 * once per message: the healthy-pod freshness badge, and the `WATER_TYPE`-vs-
 * `operatingEnvironment` mismatch. Both are properties of the deployment, identical on every
 * answer, and repeating them trains the reader to skip the line where a caveat finally matters.
 */
function resultNotices(invocation, now) {
  const result = asObject(invocation.result);
  const found = [];

  // Recoverable: the orchestrator hands the model `{ error }` and lets it answer around the
  // failure, so this is a qualification on the answer, not a crashed request.
  if (typeof result.error === "string") {
    found.push(badge("warn", `Sensor query failed — ${result.error}`, result.error));
    return found;
  }

  const reported = typeof result.device_last_reported === "string"
    ? Date.parse(result.device_last_reported) : NaN;
  const known = Number.isFinite(reported);
  const age = known ? now - reported : null;
  const stale = known && age > RECENT_MS;
  const note = typeof result.note === "string" ? result.note : undefined;
  const count = sampleCount(result);

  if (count === 0) {
    // An empty window is a *result*, not an error, and it must never read as a zero reading.
    // This is the one place freshness stays in the message: "silent since Aug 7" is not a
    // status line here, it is the answer to the question that was asked.
    let text;
    if (!known) text = "No readings in this window · no last reading on record for this pod";
    else if (stale) text = `No readings in this window · pod silent since ${isoDate(result.device_last_reported)}`;
    else text = `No readings in this window · pod last reported ${ageLabel(age)}`;
    found.push(badge("warn", text, note));
  } else if (stale) {
    // Not a status line — an anchoring warning. Ranges resolve against the device's newest
    // reading, so on a silent pod "last 24 h" is *its* last 24 h and every number here reads
    // as current unless something says otherwise. The context bar reports that the pod is
    // stale; only this message can say the numbers in it are from then.
    found.push(badge(
      "warn",
      `Window anchored to the pod's last reading, ${isoDate(result.device_last_reported)} — not to today`,
      `This device last reported at ${result.device_last_reported}, ${ageLabel(age)}.`,
    ));
  }

  // `complete: false` — the API's unit ladder tops out at one year, so the resolved range can
  // reach further back than the search ever did. A model once read the resolved start as the
  // pod's first reading. The dates live in the chip inside the disclosure; this says only that
  // the answer does not cover what the question asked for.
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

  if (typeof note === "string"
    && note.indexOf("provisional, uncalibrated") !== -1
    && coversTurbidity(invocation)) {
    found.push(badge(
      "warn",
      "Turbidity provisional — a relative index, not a calibrated measurement",
      note,
    ));
  }

  return found;
}

/* ------------------------------- the disclosure ------------------------------- */

/**
 * The one line a reader sees while the audit trail stays closed, e.g.
 * `Algalita Pod · dissolved oxygen · last 24 h · 47 samples`.
 *
 * No sample count when the window was empty: the loose badge already says there were no
 * readings, and "0 samples" in a summary is the bare zero this file exists to prevent.
 */
function summaryLine(executed, calls) {
  const shown = executed.length > 0 ? executed : calls;

  if (shown.length === 1) {
    const { name, metric, range, result } = describeCall(shown[0]);
    const count = sampleCount(result);
    const parts = [name, metric, range].filter((part) => typeof part === "string" && part !== "");
    if (count !== null && count > 0) parts.push(plural(count, "sample"));
    return parts.length > 0 ? parts.join(" · ") : "Sensor query";
  }

  const names = [];
  shown.forEach((call) => {
    const { name } = describeCall(call);
    if (name && names.indexOf(name) === -1) names.push(name);
  });
  // Always plural here: the single-call case returned above, and `calls` is never empty.
  const lead = `${shown.length} ${executed.length > 0 ? "sensor queries" : "repeated queries"}`;
  return names.length > 0 ? `${lead} · ${names.join(", ")}` : lead;
}

/**
 * The citation list, wherever `main.js` last put it.
 *
 * `renderCitations` appends `<ul class="citations">` to the message wrapper — a sibling of
 * this slot — and it runs on `meta`, before this ever sees a tool call. Rather than ask
 * `main.js` to change (it is another stream's file), the list is adopted into the disclosure
 * body. Taking it from inside the slot first is what keeps a second `renderProvenance` call
 * idempotent: the `meta` → `done` pair must not stack, and clearing the slot with a citation
 * list still parented to it would delete the citations outright.
 */
function takeCitations(slot) {
  // Inside the slot, at any depth: on a re-render the list is already nested in the
  // disclosure body from the previous pass. Outside, only among the wrapper's own children,
  // so nothing is ever lifted out of the answer text or a neighbouring message.
  const found = citationList(slot, true) || citationList(slot.parentNode, false);
  if (found && found.parentNode) found.parentNode.removeChild(found);
  return found;
}

function citationList(parent, deep) {
  if (!parent || !parent.childNodes) return null;
  for (let i = 0; i < parent.childNodes.length; i += 1) {
    const node = parent.childNodes[i];
    if (!node || node.nodeType !== 1) continue;
    if (node.nodeName === "UL" && typeof node.className === "string"
      && node.className.split(" ").indexOf("citations") !== -1) {
      return node;
    }
    if (deep) {
      const nested = citationList(node, true);
      if (nested) return nested;
    }
  }
  return null;
}

/* ------------------------------- entry point ------------------------------- */

/**
 * Fills an assistant message's provenance slot from the SSE payload.
 *
 * Emits at most: some loose `.badge--warn`s that qualify this answer, then one closed
 * `<details class="details">` holding the audit trail. A routine answer is the disclosure
 * alone — one grey line the reader can ignore.
 *
 * @param {HTMLElement} slot the message's `.provenance` element
 * @param {object} payload the SSE `meta` / `done` data for that message
 * @param {number} [now] reference instant for freshness; defaults to the wall clock
 * @returns {void}
 */
export function renderProvenance(slot, payload, now) {
  if (!slot) return;

  const calls = payload && Array.isArray(payload.tool_calls)
    ? payload.tool_calls.filter((call) => call && typeof call === "object") : [];
  // No tool ran: the `meta` event, and every answer with SENSOR_TOOL off. Leave the slot
  // untouched so app.css's `:empty` rule keeps it collapsed.
  if (calls.length === 0) return;

  const at = typeof now === "number" ? now : Date.now();
  const executed = calls.filter((call) => !call.deduped);

  // A repeat is served from the per-request cache, so it gets one compact chip rather than a
  // second copy of the row. Identical repeats collapse into one chip with a count.
  const repeats = new Map();
  calls.forEach((call) => {
    if (!call.deduped) return;
    const args = asObject(call.arguments);
    const key = `${call.name}|${JSON.stringify(args, Object.keys(args).sort())}`;
    const seen = repeats.get(key);
    if (seen) seen.count += 1;
    else repeats.set(key, { call, count: 1 });
  });

  // Loose badges come off the executed calls only — a deduped call carries a copy of an
  // earlier result, so reading it again would double every badge it produced.
  const notices = [];
  const shown = new Set();
  executed.forEach((call) => {
    resultNotices(call, at).forEach((node) => {
      const key = `${node.className}|${node.textContent}`;
      if (shown.has(key)) return;
      shown.add(key);
      notices.push(node);
    });
  });

  const details = el("details", "details");
  details.appendChild(el("summary", null, summaryLine(executed, calls)));
  const body = el("div", "details__body");
  executed.forEach((call) => body.appendChild(toolChip(call)));
  repeats.forEach((entry) => body.appendChild(dedupedChip(entry.call, entry.count)));
  // Must happen before the slot is cleared: the list may still be parented to it.
  const citations = takeCitations(slot);
  if (citations) body.appendChild(citations);
  details.appendChild(body);

  const fragment = document.createDocumentFragment();
  // Caveats first, disclosure last: what qualifies the answer should be read before the
  // audit trail offering to explain it.
  notices.forEach((node) => fragment.appendChild(node));
  fragment.appendChild(details);

  slot.textContent = "";           // idempotent: `meta` then `done` must not stack
  slot.appendChild(fragment);
}
