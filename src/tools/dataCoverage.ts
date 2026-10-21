import type { ToolInvocation } from "../types/tool.types";

/**
 * Which readings an answer drew on, said by the server rather than the model (`SPECS.md` §10.8).
 *
 * Michael (2026-10-11): "if you ask it for a summary or overview, it doesn't specify what window
 * the summary or overview is in." The model chooses `time_range` itself, and its answers named
 * the window unevenly: follow-ups that reused an earlier answer's data often named none, and the
 * dashboard shows a window only when a search was incomplete. The server knows exactly which
 * windows `query_sensor_data` resolved, so it writes that line, the way `report/delivery.ts`
 * writes the "New PDF in this reply" line. A report's period is already in that line.
 */

export const SENSOR_TOOL_NAME = "query_sensor_data";

const COVERAGE_PREFIX = "Data covered in this reply:";

export const NO_NEW_READINGS_LINE = "No new readings were read for this reply; "
  + "any figures come from data covered earlier in this chat.";

interface Coverage {
  pod: string;
  /** The window as the reader sees it, e.g. "2026-10-05 08:24 to 2026-10-12 08:24 UTC". */
  window: string;
  readings?: number;
  currentSiteOnly: boolean;
}

/** "2026-10-05T08:24:26.000Z" as "2026-10-05 08:24"; anything unparseable as given. */
const minuteUtc = (iso: string): string => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : new Date(ms).toISOString().slice(0, 16).replace("T", " ");
};

const coverageOf = (call: ToolInvocation): Coverage | undefined => {
  if (call.name !== SENSOR_TOOL_NAME) {
    return undefined;
  }
  const result = (call.result ?? {}) as Record<string, unknown>;
  if (typeof result.error === "string") {
    return undefined;
  }
  const device = result.device as { name?: unknown; label?: unknown } | undefined;
  const pod = [device?.name, device?.label].find((value): value is string => typeof value === "string");
  if (!pod) {
    return undefined;
  }
  const resolved = result.time_range_resolved as
    { start?: unknown; end?: unknown; label?: unknown } | null | undefined;
  const counts = result.reading_counts as { used?: unknown } | undefined;
  const searched = result.window_actually_searched as { complete?: unknown } | undefined;
  const readings = typeof counts?.used === "number" ? counts.used : undefined;
  if (!resolved || typeof resolved.start !== "string" || typeof resolved.end !== "string") {
    const requested = typeof result.time_range_requested === "string" ? ` (${result.time_range_requested})` : "";
    return { pod, window: `no readings in the requested range${requested}`, currentSiteOnly: false };
  }
  const start = minuteUtc(resolved.start);
  const end = minuteUtc(resolved.end);
  return {
    pod,
    window: start === end ? `the reading at ${end} UTC` : `${start} to ${end} UTC`,
    ...(readings !== undefined ? { readings } : {}),
    // Only when the location filter dropped readings inside the request: a pod that merely has
    // earlier-site history long before the window lost nothing from it.
    currentSiteOnly: typeof resolved.label === "string"
      && resolved.label.includes("current-site readings")
      && searched?.complete === false,
  };
};

/**
 * Every distinct window this answer's sensor reads resolved, in call order. Repeats of the same
 * pod and window (one call per metric, or a deduped call) collapse to one, keeping the largest
 * reading count.
 */
export const coveredWindows = (invocations: readonly ToolInvocation[]): Coverage[] => {
  const byKey = new Map<string, Coverage>();
  invocations.forEach((call) => {
    const coverage = coverageOf(call);
    if (!coverage) {
      return;
    }
    const key = `${coverage.pod}\u0000${coverage.window}`;
    const seen = byKey.get(key);
    if (!seen || (coverage.readings ?? 0) > (seen.readings ?? 0)) {
      byKey.set(key, coverage);
    }
  });
  return [...byKey.values()];
};

const describeCoverage = (coverage: Coverage): string => {
  const details = [
    coverage.readings !== undefined
      ? `${coverage.readings} ${coverage.readings === 1 ? "reading" : "readings"}` : undefined,
    coverage.currentSiteOnly ? "current site only" : undefined,
  ].filter((part): part is string => part !== undefined);
  return `${coverage.pod}, ${coverage.window}${details.length > 0 ? ` (${details.join(", ")})` : ""}`;
};

/** True when `line` is one this module wrote. */
const isCoverageLine = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.startsWith(COVERAGE_PREFIX) || trimmed === NO_NEW_READINGS_LINE;
};

/** True when `text` carries a line this module wrote, so the conversation has read pod data. */
export const hasCoverageLine = (text: string): boolean => text.split("\n").some(isCoverageLine);

/**
 * Removes this module's lines from an earlier reply before it reaches the model as history, so the
 * model never copies them into an answer of its own; the prompt has it name the window in words.
 */
export const stripCoverageLines = (text: string): string => {
  if (!hasCoverageLine(text)) {
    return text;
  }
  return text
    .split("\n")
    .filter((line) => !isCoverageLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

/**
 * The line appended to an answer: the windows its sensor reads covered; otherwise, when an earlier
 * reply in this chat read pod data, a line saying this one read none. Nothing for a chat that has
 * never read pod data. An answer that made a report read its data through `generate_report`,
 * whose period the "New PDF" line gives, so it gets no "no new readings" line.
 */
export const coverageLines = (
  invocations: readonly ToolInvocation[],
  earlierData: boolean,
  madeReport: boolean,
): string[] => {
  const windows = coveredWindows(invocations);
  if (windows.length > 0) {
    return [`${COVERAGE_PREFIX} ${windows.map(describeCoverage).join("; ")}.`];
  }
  return earlierData && !madeReport ? [NO_NEW_READINGS_LINE] : [];
};
