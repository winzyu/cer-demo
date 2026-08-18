/**
 * WS-4 — Series chart.
 *
 * Draws a hand-rolled inline SVG for every tool result carrying `aggregation: "series"`:
 * the per-bucket `mean` as the line, `min`/`max` as a band behind it, units read off the
 * tool result. No charting library — the payload is a handful of buckets (the tool caps a
 * series at 60), so a dependency would have to be vendored to draw a polyline.
 *
 * **Every colour comes from a class in `frontend/app.css`** — `.chart__line`, `.chart__band`,
 * `.chart__grid`, `.chart__dot`, `.chart__dot--last` — which resolve to `--chart-*` tokens.
 * A literal `stroke="#2d77a6"` on an SVG element would not invert with the theme, so this
 * module never sets a presentation attribute.
 *
 * **The SVG is built with `document.createElementNS`, never `innerHTML`.** The numbers,
 * timestamps, device name and metric name all come off an API response, and an SVG subtree
 * is a perfectly good place to smuggle a `<script>` or an `onload=` through a string concat.
 *
 * **Empty buckets are omitted by the tool, never zero-filled** (`src/tools/aggregate.ts`
 * `bucketize`), and they are not re-filled here. A gap is drawn as a *gap*: x is positioned
 * by timestamp rather than by array index, and the line and band are cut into one segment
 * per run of adjacent buckets. Interpolating across a silent stretch would invent a
 * measurement, and a zero-filled DO gap reads as anoxic water.
 *
 * Bucket field names are `{ start, end, mean, min, max, n }` — `SeriesBucket` in
 * `src/tools/aggregate.ts`. The surrounding result is snake_case (`bucket_ms`, `n_samples`);
 * the buckets themselves are not.
 *
 * Contract: return true if a chart was drawn, false to leave the slot empty and let the
 * caller keep its current rendering. Fewer than three buckets draws nothing, so `app.css`'s
 * `.chart:empty` rule collapses the slot and the prose/table carries the answer.
 *
 * @param {HTMLElement} slot the message's empty `.chart` element
 * @param {object} payload the SSE `done` data for that message
 * @returns {boolean} whether a chart was rendered
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * viewBox units, not pixels. The SVG is `width: 100%` with `preserveAspectRatio`, so this
 * is only an aspect ratio and an internal coordinate space — it scales to phone width.
 */
const VIEW_W = 640;
const VIEW_H = 170;
const PAD_X = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 10;

/** Below this a chart is noise: three points is the fewest that can show a shape. */
const MIN_BUCKETS = 3;

/** Above this, per-bucket dots crowd into a smear; only the endpoints stay marked. */
const MAX_DOTS = 26;

const DOT_R = 3.2;
/** Half-width of the band drawn for a bucket with no neighbour, so min/max stays visible. */
const LONE_BAND_W = 2;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Display labels for the tool's wire metric names (`src/devices/metrics.ts`). */
const METRIC_LABELS = {
  dissolved_oxygen: "Dissolved oxygen",
  orp: "ORP",
  ph: "pH",
  conductivity: "Conductivity",
  temperature: "Temperature",
  turbidity: "Turbidity",
};

/** pH has no unit; the tool reports the string "unitless" rather than omitting the field. */
function cleanUnit(unit) {
  if (typeof unit !== "string") return "";
  const trimmed = unit.trim();
  return trimmed === "" || trimmed === "unitless" ? "" : trimmed;
}

function metricLabel(name) {
  if (typeof name !== "string" || name === "") return "Reading";
  if (METRIC_LABELS[name]) return METRIC_LABELS[name];
  const spaced = name.replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Decimals from magnitude: conductivity runs to thousands, DO to one digit. */
function fmt(value) {
  const size = Math.abs(value);
  if (!Number.isFinite(value)) return "?";
  if (size >= 100) return value.toFixed(0);
  if (size >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function timeLabel(ms, spanMs) {
  const when = new Date(ms);
  if (spanMs <= 2 * DAY_MS) {
    return when.toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  }
  return when.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svg(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs).forEach((name) => node.setAttribute(name, String(attrs[name])));
  return node;
}

/**
 * Normalizes one `series` array into plottable buckets.
 *
 * Anything unparseable is dropped rather than coerced: a bucket whose `mean` is null is a
 * bucket with no answer, and `Number(null)` is 0 — the exact fabrication this feature is
 * supposed to avoid. `n <= 0` is dropped for the same reason.
 */
function readBuckets(series) {
  if (!Array.isArray(series)) return [];
  const out = [];
  series.forEach((raw) => {
    if (!raw || typeof raw !== "object") return;
    const mean = Number(raw.mean);
    const low = Number(raw.min);
    const high = Number(raw.max);
    const startMs = Date.parse(raw.start);
    if (!Number.isFinite(mean) || !Number.isFinite(low) || !Number.isFinite(high)) return;
    if (!Number.isFinite(startMs)) return;
    const n = Number(raw.n);
    if (Number.isFinite(n) && n <= 0) return;
    const endMs = Date.parse(raw.end);
    const hasEnd = Number.isFinite(endMs) && endMs > startMs;
    out.push({
      startMs,
      endMs: hasEnd ? endMs : startMs,
      hasEnd,
      // Buckets are epoch-aligned spans, so the midpoint is where the summary belongs.
      midMs: hasEnd ? (startMs + endMs) / 2 : startMs,
      mean,
      // Clamped so a malformed bucket cannot draw a band that excludes its own line.
      min: Math.min(low, high, mean),
      max: Math.max(low, high, mean),
      n: Number.isFinite(n) ? n : null,
    });
  });
  return out.sort((a, b) => a.midMs - b.midMs);
}

/**
 * Collects every series in a tool result.
 *
 * Two shapes reach here (`src/tools/querySensorData.ts`): a single-metric read is flat
 * (`{ metric, unit, series, bucket_ms }`), and `metric: "all"` nests one entry per metric
 * under `metrics`. Each metric gets its own frame — six metrics on one axis would put
 * conductivity in µS/cm and pH on the same scale.
 */
function seriesInResult(result) {
  if (!result || typeof result !== "object") return [];
  if (result.aggregation !== "series") return [];

  const device = result.device && typeof result.device === "object" ? result.device : null;
  const deviceName = device && typeof device.name === "string" ? device.name : "";
  const found = [];

  const add = (name, unit, series, bucketMs) => {
    const buckets = readBuckets(series);
    if (buckets.length < MIN_BUCKETS) return;
    found.push({
      metric: metricLabel(name),
      unit: cleanUnit(unit),
      deviceName,
      bucketMs: Number.isFinite(Number(bucketMs)) && Number(bucketMs) > 0 ? Number(bucketMs) : 0,
      buckets,
    });
  };

  if (Array.isArray(result.series)) {
    add(result.metric, result.unit, result.series, result.bucket_ms);
  }

  const { metrics } = result;
  if (metrics && typeof metrics === "object" && !Array.isArray(metrics)) {
    Object.keys(metrics).forEach((name) => {
      const entry = metrics[name];
      if (!entry || typeof entry !== "object") return;
      add(name, entry.unit, entry.series, entry.bucket_ms);
    });
  }

  return found;
}

/** Median consecutive spacing, used to spot a gap when a bucket carries no usable `end`. */
function typicalStepMs(buckets) {
  const steps = [];
  for (let i = 1; i < buckets.length; i += 1) {
    steps.push(buckets[i].midMs - buckets[i - 1].midMs);
  }
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)] || 0;
}

/**
 * Splits buckets into runs of adjacent ones.
 *
 * A missing bucket shows up as clear air between one bucket's `end` and the next one's
 * `start` — the tool omits it rather than emitting a zero. Each run is drawn as its own
 * line and band so nothing is interpolated across the silence.
 */
function segmentize(buckets, bucketMs) {
  const step = bucketMs || typicalStepMs(buckets);
  const segments = [[buckets[0]]];
  for (let i = 1; i < buckets.length; i += 1) {
    const prev = buckets[i - 1];
    const next = buckets[i];
    const gap = prev.hasEnd
      ? next.startMs - prev.endMs > 0
      : step > 0 && next.midMs - prev.midMs > step * 1.5;
    if (gap) {
      segments.push([next]);
    } else {
      segments[segments.length - 1].push(next);
    }
  }
  return segments;
}

/** Words, because a screen reader gets nothing at all from a polyline. */
function describe(chart, stats) {
  const { metric, unit, deviceName, buckets } = chart;
  const suffix = unit ? ` ${unit}` : "";
  const where = deviceName ? ` at ${deviceName}` : "";
  const first = buckets[0];
  const last = buckets[buckets.length - 1];

  const parts = [
    `Line chart of ${metric.toLowerCase()}${where}: `
    + `${buckets.length} time buckets from ${timeLabel(first.midMs, stats.spanMs)} `
    + `to ${timeLabel(last.midMs, stats.spanMs)}.`,
  ];

  const change = last.mean - first.mean;
  const spread = stats.hi - stats.lo;
  if (spread > 0 && Math.abs(change) >= spread * 0.1) {
    const verb = change > 0 ? "rises" : "falls";
    parts.push(`Mean ${verb} from ${fmt(first.mean)} to ${fmt(last.mean)}${suffix}.`);
  } else {
    parts.push(`Mean stays near ${fmt(last.mean)}${suffix}.`);
  }

  parts.push(`Shaded band is the per-bucket minimum to maximum, `
    + `${fmt(stats.lo)} to ${fmt(stats.hi)}${suffix} overall.`);

  if (stats.gaps === 1) {
    parts.push("The line breaks once where the device reported nothing; "
      + "that stretch is not estimated.");
  } else if (stats.gaps > 1) {
    parts.push(`The line breaks ${stats.gaps} times where the device reported nothing; `
      + "those stretches are not estimated.");
  }

  return parts.join(" ");
}

/** One `.chart__frame`: head, SVG, x-axis labels. */
function buildFrame(chart) {
  const { buckets, unit, metric } = chart;
  const segments = segmentize(buckets, chart.bucketMs);

  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  const t0 = first.midMs;
  const t1 = last.midMs;
  const timeSpan = t1 - t0;

  let lo = buckets[0].min;
  let hi = buckets[0].max;
  buckets.forEach((b) => {
    if (b.min < lo) lo = b.min;
    if (b.max > hi) hi = b.max;
  });
  // A flat series still needs a domain with width, or every y collapses onto one row.
  const headroom = hi > lo ? (hi - lo) * 0.08 : Math.max(Math.abs(hi) * 0.05, 0.5);
  const yLo = lo - headroom;
  const yHi = hi + headroom;

  const plotL = PAD_X;
  const plotR = VIEW_W - PAD_X;
  const plotT = PAD_TOP;
  const plotB = VIEW_H - PAD_BOTTOM;

  // x by timestamp, not by index — that is what makes an omitted bucket read as a gap.
  const x = (ms) => (timeSpan > 0 ? plotL + ((ms - t0) / timeSpan) * (plotR - plotL) : (plotL + plotR) / 2);
  const y = (value) => plotB - ((value - yLo) / (yHi - yLo)) * (plotB - plotT);

  const frame = el("div", "chart__frame");

  const head = el("div", "chart__head");
  const scale = unit ? `${fmt(lo)}–${fmt(hi)} ${unit}` : `${fmt(lo)}–${fmt(hi)}`;
  head.append(
    el("span", null, `${metric} · ${scale}`),
    el("span", null, `${timeLabel(t0, timeSpan)} – ${timeLabel(t1, timeSpan)}`),
  );
  frame.appendChild(head);

  const canvas = svg("svg", {
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": describe(chart, {
      lo, hi, spanMs: timeSpan, gaps: segments.length - 1,
    }),
  });
  // Inline layout only — no colour is ever set here; every paint comes from a class.
  canvas.style.width = "100%";
  canvas.style.height = "auto";
  canvas.style.display = "block";

  [plotT, (plotT + plotB) / 2, plotB].forEach((gy) => {
    canvas.appendChild(svg("line", {
      class: "chart__grid", x1: plotL, y1: gy, x2: plotR, y2: gy,
    }));
  });

  // Bands first, so the mean line sits on top of its own min/max envelope.
  segments.forEach((run) => {
    let points;
    if (run.length === 1) {
      const cx = x(run[0].midMs);
      points = [
        `${(cx - LONE_BAND_W).toFixed(2)},${y(run[0].max).toFixed(2)}`,
        `${(cx + LONE_BAND_W).toFixed(2)},${y(run[0].max).toFixed(2)}`,
        `${(cx + LONE_BAND_W).toFixed(2)},${y(run[0].min).toFixed(2)}`,
        `${(cx - LONE_BAND_W).toFixed(2)},${y(run[0].min).toFixed(2)}`,
      ];
    } else {
      const top = run.map((b) => `${x(b.midMs).toFixed(2)},${y(b.max).toFixed(2)}`);
      const bottom = run.slice().reverse().map((b) => `${x(b.midMs).toFixed(2)},${y(b.min).toFixed(2)}`);
      points = top.concat(bottom);
    }
    canvas.appendChild(svg("polygon", { class: "chart__band", points: points.join(" ") }));
  });

  segments.forEach((run) => {
    if (run.length < 2) return;
    canvas.appendChild(svg("polyline", {
      class: "chart__line",
      points: run.map((b) => `${x(b.midMs).toFixed(2)},${y(b.mean).toFixed(2)}`).join(" "),
    }));
  });

  // Dots: all of them while they still read as points; past that only the ones carrying
  // information a line cannot — an isolated bucket, and the newest reading.
  const dense = buckets.length > MAX_DOTS;
  segments.forEach((run) => {
    run.forEach((b) => {
      const isLast = b === last;
      if (dense && !isLast && run.length > 1) return;
      canvas.appendChild(svg("circle", {
        class: isLast ? "chart__dot chart__dot--last" : "chart__dot",
        cx: x(b.midMs).toFixed(2),
        cy: y(b.mean).toFixed(2),
        r: isLast ? DOT_R + 1 : DOT_R,
      }));
    });
  });

  frame.appendChild(canvas);

  const axis = el("div", "chart__axis");
  const labels = buckets.length >= 5
    ? [first, buckets[Math.floor((buckets.length - 1) / 2)], last]
    : [first, last];
  labels.forEach((b) => axis.appendChild(el("span", null, timeLabel(b.midMs, timeSpan))));
  frame.appendChild(axis);

  return frame;
}

export function renderChart(slot, payload) {
  if (!slot || typeof slot.appendChild !== "function") return false;

  // Idempotent: `done` can follow an earlier render of the same message.
  while (slot.firstChild) slot.removeChild(slot.firstChild);

  // The default build runs with SENSOR_TOOL=false, so `tool_calls` is omitted entirely and
  // this is the path almost every message takes. It must cost nothing and leave the slot
  // empty, or `.chart:empty { display: none }` stops collapsing it.
  const calls = payload && Array.isArray(payload.tool_calls) ? payload.tool_calls : [];
  if (calls.length === 0) return false;

  const charts = [];
  calls.forEach((call) => {
    // A deduped invocation is the loop replaying an earlier identical call; charting it
    // again would show the same week twice.
    if (!call || typeof call !== "object" || call.deduped) return;
    seriesInResult(call.result).forEach((chart) => charts.push(chart));
  });

  if (charts.length === 0) return false;

  charts.forEach((chart) => slot.appendChild(buildFrame(chart)));
  return true;
}
