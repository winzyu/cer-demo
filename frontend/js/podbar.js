/**
 * Wave 2 · pod selector + pod status (context bar).
 *
 * Session-level facts live in the chrome, not in the transcript: which pod is selected,
 * whether it is reporting, and whether its water type disagrees with the deployment's.
 * All three are identical on every answer, so rendering them per message is the noise that
 * made the chat unreadable (docs/CHAT_UX_WORKPLAN.md, "Wave 2 — where things belong").
 *
 * Contract main.js depends on:
 *   initPodBar({ select, status })  wire the <select id="pod-select"> and the #pod-status slot
 *   selectedDevice()                the chosen pod's identifier, or null for "no selection"
 *
 * `selectedDevice()` returning null must keep today's behaviour: the request omits `device`
 * entirely and the server asks rather than guessing between pods on opposite coasts. Null is
 * therefore the *only* correct state before someone chooses, and after any failure. There is
 * no default pod, and "the first one in the list" would be a guess wearing a UI.
 *
 * Endpoint shape (GET /api/v1/devices):
 *   { devices: [{ label, name, operating_environment, last_reported }], water_type }
 *
 * Two rules this file exists to keep:
 *   - **Never print a fabricated `0` or a stand-in timestamp.** `last_reported: null` means
 *     the pod has no readings on record; a zero or an epoch date invents a measurement.
 *   - **A failure must never look like "no pods exist".** 401 / timeout / 503 each say what
 *     went wrong and leave the select disabled; the chat keeps working with no `device`.
 *
 * Device names come off someone else's production API, so every node below is
 * `createElement` + `textContent` — never `innerHTML`. No literal colours: every class is
 * defined in app.css against theme.css tokens, so it inverts with the theme.
 */

import { getDevices } from "./api.js";

/** One pod for a whole session, so the choice outlives a reload. */
const STORAGE_KEY = "gilligan.pod";

/** Newer than this and the pod counts as reporting; older and it gets the stale badge. */
const RECENT_MS = 24 * 60 * 60 * 1000;

/**
 * The device API has its own server-side timeout, but a hung socket between here and the
 * backend would leave "Loading pods…" on screen forever. Bound it in the UI too.
 */
const LOAD_TIMEOUT_MS = 10000;

const SVG_NS = "http://www.w3.org/2000/svg";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* --------------------------------- module state --------------------------------- */

let statusEl = null;
let selectEl = null;
/** The selected pod's `dev:` label, or null. Null is load-bearing — see the header. */
let current = null;
/** Devices exactly as the server ordered them; never re-sorted here. */
let devices = [];
let waterType = null;

/* ------------------------------- tiny DOM helpers ------------------------------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Inline SVG only, no emoji — same stroke style as the theme toggle in index.html.
 * Size comes from `.badge svg` in app.css, colour from `currentColor`.
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

/** Attention, not failure — every `.badge--warn` carries it. */
const iconWarn = () => icon([
  ["path", { d: "M10.3 3.9 2.6 17.1A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0z" }],
  ["path", { d: "M12 9.2v4.1" }],
  ["path", { d: "M12 16.8h.01" }],
]);

/** Nothing to report — used by the muted badges (no readings, and every failure state). */
const iconInfo = () => icon([
  ["circle", { cx: "12", cy: "12", r: "9" }],
  ["path", { d: "M12 11.2v5" }],
  ["path", { d: "M12 7.8h.01" }],
]);

/**
 * `.badge--ok` gets the live dot, the other two get an icon. `.dot` is only styled inside
 * `.badge--ok`, so it is never used on the other variants.
 */
function badge(variant, text) {
  const node = el("span", `badge badge--${variant}`);
  if (variant === "ok") node.appendChild(el("span", "dot"));
  else if (variant === "warn") node.appendChild(iconWarn());
  else node.appendChild(iconInfo());
  node.appendChild(el("span", null, text));
  return node;
}

/* --------------------------------- formatting --------------------------------- */

/**
 * "2026-08-07T…" → "Aug 7", read straight off the ISO string.
 *
 * Deliberately not localised and never routed through `Date` for display: the API emits UTC,
 * and a locale/timezone round-trip can move "silent since Aug 7" back to the 6th.
 */
function shortDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return null;
  return `${month} ${Number(match[3])}`;
}

function ageLabel(ms) {
  if (!Number.isFinite(ms) || ms < 60000) return "just now";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(ms / 3600000)} h ago`;
}

/** Mirrors the server's rule (`querySensorData.ts`): anything containing "salt" is saltwater. */
function normalizeWaterType(value) {
  if (typeof value !== "string" || value === "") return null;
  return value.toLowerCase().includes("salt") ? "saltwater" : "freshwater";
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/* ------------------------------- status rendering ------------------------------- */

function findDevice(label) {
  return devices.find((device) => device && device.label === label) || null;
}

/**
 * The freshness badge for one pod.
 *
 * Three states and no fourth: reporting, silent since a real date, or no readings at all.
 * An unparseable timestamp falls into "unknown" rather than being coerced into a date, for
 * the same reason `last_reported: null` never becomes an epoch.
 */
function statusBadge(device) {
  const reported = device.last_reported;
  if (reported === null || reported === undefined || reported === "") {
    return badge("muted", "No readings on record");
  }

  const at = Date.parse(reported);
  if (!Number.isFinite(at)) return badge("muted", "Last reading time unavailable");

  const age = Date.now() - at;
  if (age < RECENT_MS) return badge("ok", `Reporting · ${ageLabel(age)}`);

  const since = shortDate(reported);
  return badge("warn", since ? `Silent since ${since}` : "Silent for over a day");
}

/**
 * A config fact, not a finding about a reading: this pod's water differs from the water type
 * the deployment's thresholds are written for. Constant per pod, so it belongs here once
 * rather than on every answer that mentions a number.
 */
function mismatchBadge(device) {
  const environment = device.operating_environment;
  const pod = normalizeWaterType(environment);
  const deployment = normalizeWaterType(waterType);
  if (!pod || !deployment || pod === deployment) return null;
  return badge("warn", `${capitalize(String(environment))} pod · thresholds are ${waterType}`);
}

function clearStatus() {
  if (!statusEl) return;
  while (statusEl.firstChild) statusEl.removeChild(statusEl.firstChild);
}

function appendBadge(node) {
  // Badges are inline-flex, so a text node is what separates them; `.contextbar` handles the
  // rest of the spacing and no inline style is needed.
  if (statusEl.firstChild) statusEl.appendChild(document.createTextNode(" "));
  statusEl.appendChild(node);
}

/**
 * Nothing selected renders nothing: the select already says so, and a badge repeating it
 * would be the per-message noise this bar exists to remove.
 */
function renderStatus() {
  clearStatus();
  if (!statusEl || current === null) return;
  const device = findDevice(current);
  if (!device) return;
  appendBadge(statusBadge(device));
  const mismatch = mismatchBadge(device);
  if (mismatch) appendBadge(mismatch);
}

/* ------------------------------- persistence ------------------------------- */

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return typeof value === "string" && value !== "" ? value : null;
  } catch {
    return null; // private mode / storage disabled — the session simply starts unselected
  }
}

function writeStored(value) {
  try {
    if (value === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Not fatal: the choice still holds for this page view.
  }
}

/**
 * A stored pod is a claim about a list that may have changed since — a pod can be removed
 * from the deployment or renamed to a new label. Validate against what the server just sent
 * and fall back to no selection rather than sending a `device` the API will reject.
 */
function restoreSelection() {
  const stored = readStored();
  if (stored !== null && findDevice(stored)) {
    current = stored;
    return;
  }
  current = null;
  if (stored !== null) writeStored(null);
}

/* ------------------------------- select rendering ------------------------------- */

function clearOptions() {
  while (selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);
}

function placeholder(text) {
  const option = el("option", null, text);
  option.value = "";
  return option;
}

function populate() {
  clearOptions();
  // The empty-value option is how a user gets *back* to no selection, which is a real
  // choice: it asks the server rather than pinning the question to one pod.
  selectEl.appendChild(placeholder("No pod selected"));
  devices.forEach((device) => {
    if (!device || typeof device.label !== "string" || device.label === "") return;
    const option = el("option", null, typeof device.name === "string" && device.name !== ""
      ? device.name
      : device.label);
    option.value = device.label;
    selectEl.appendChild(option);
  });
  selectEl.value = current === null ? "" : current;
  selectEl.disabled = false;
}

/** One honest dead end: the select stays disabled and says why beside it. */
function renderUnavailable(optionText, badgeText) {
  clearOptions();
  selectEl.appendChild(placeholder(optionText));
  selectEl.value = "";
  selectEl.disabled = true;
  clearStatus();
  if (statusEl) appendBadge(badge("muted", badgeText));
}

/* ------------------------------- failure classification ------------------------------- */

/**
 * WS-6's taxonomy, as far as it survives the transport.
 *
 * `getDevices()` throws `Error("devices <status>")` and discards the response body, so the
 * `code` field never reaches this module today; the status parse below is what actually
 * fires. The `err.code` / `err.body.code` branches are here so that the moment api.js
 * attaches the parsed body, the mapping is already exact rather than inferred from a status
 * that two codes share.
 */
const FAILURE_TEXT = {
  device_auth_expired: {
    option: "Pods unavailable",
    badge: "Pod list unavailable · the device session expired",
  },
  device_timeout: {
    option: "Pods unavailable",
    badge: "Pod list unavailable · the device API did not answer in time",
  },
  device_unavailable: {
    option: "Pods unavailable",
    badge: "Pod list unavailable · the device service is unreachable or not configured",
  },
};

const UNKNOWN_FAILURE = {
  option: "Pods unavailable",
  badge: "Pod list unavailable · could not reach the backend",
};

function classifyFailure(err) {
  const code = err && (err.code || (err.body && err.body.code));
  if (typeof code === "string" && FAILURE_TEXT[code]) return FAILURE_TEXT[code];

  if (err && (err.name === "AbortError" || err.name === "TimeoutError")) {
    return FAILURE_TEXT.device_timeout;
  }

  const status = Number((/(\d{3})/.exec(String(err && err.message)) || [])[1]);
  if (status === 401 || status === 403) return FAILURE_TEXT.device_auth_expired;
  if (status === 504 || status === 408) return FAILURE_TEXT.device_timeout;
  if (status >= 500) return FAILURE_TEXT.device_unavailable;
  return UNKNOWN_FAILURE;
}

function withTimeout(promise) {
  let timer = null;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const err = new Error("devices request timed out");
      err.name = "TimeoutError";
      reject(err);
    }, LOAD_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

/* ------------------------------- public API ------------------------------- */

/** The chosen pod's identifier, or null when nothing is selected. Never a default. */
export function selectedDevice() {
  return current;
}

/**
 * Fills the select from `GET /api/v1/devices`, restores the session's pod, and renders its
 * status. Resolves once the list has loaded or failed — main.js ignores the promise; the
 * scratch harness awaits it.
 *
 * `ctx.fetchDevices` is a test seam only; production passes `{ select, status }` and gets
 * `getDevices` from api.js.
 */
export async function initPodBar(ctx) {
  const context = ctx || {};
  selectEl = context.select || null;
  statusEl = context.status || null;
  current = null;
  devices = [];
  waterType = null;

  if (!selectEl) return;
  clearStatus();
  if (statusEl) statusEl.setAttribute("aria-live", "polite");

  selectEl.addEventListener("change", () => {
    const value = selectEl.value;
    current = value === "" || !findDevice(value) ? null : value;
    writeStored(current);
    renderStatus();
  });

  const load = context.fetchDevices || getDevices;
  let payload;
  try {
    payload = await withTimeout(Promise.resolve().then(() => load()));
  } catch (err) {
    const text = classifyFailure(err);
    renderUnavailable(text.option, text.badge);
    return;
  }

  // Sorted as the server sends them: the order is the server's call, not the UI's.
  devices = Array.isArray(payload && payload.devices) ? payload.devices : [];
  waterType = payload && typeof payload.water_type === "string" ? payload.water_type : null;

  if (devices.length === 0) {
    // Genuinely empty, which is a different statement from "the list would not load".
    renderUnavailable("No pods available", "No pods in this deployment");
    return;
  }

  restoreSelection();
  populate();
  renderStatus();
}
