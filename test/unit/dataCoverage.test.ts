import {
  NO_NEW_READINGS_LINE, coverageLines, coveredWindows, hasCoverageLine, stripCoverageLines,
} from "../../src/tools/dataCoverage";
import type { ToolInvocation } from "../../src/types/tool.types";

/**
 * The server-written "Data covered in this reply" line (`SPECS.md` §10.8). Michael, 2026-10-11:
 * "if you ask it for a summary or overview, it doesn't specify what window the summary or
 * overview is in."
 */

const sensorCall = (
  result: Record<string, unknown>,
  extra: Partial<ToolInvocation> = {},
): ToolInvocation => ({
  handle: "T1",
  raw_arguments: "{}",
  round: 1,
  name: "query_sensor_data",
  arguments: { metric: "all", time_range: "last 7 days", aggregation: "series" },
  result,
  ...extra,
});

/** Shaped on Bay Mouth Pod's week: 316 current-site readings, an earlier site long before. */
const week = (extra: Record<string, unknown> = {}) => sensorCall({
  device: { name: "Bay Mouth Pod", label: "dev:100000000000023" },
  time_range_requested: "last 7 days",
  time_range_resolved: {
    start: "2026-10-05T08:24:26.000Z", end: "2026-10-12T08:24:26.000Z", label: "last 7 days",
  },
  reading_counts: { used: 316, excluded: 16 },
  ...extra,
});

describe("coveredWindows", () => {
  it("gives the pod, the resolved window to the minute in UTC, and the readings used", () => {
    expect(coverageLines([week()], false, false)).toEqual([
      "Data covered in this reply: Bay Mouth Pod, 2026-10-05 08:24 to 2026-10-12 08:24 UTC (316 readings).",
    ]);
  });

  it("says when only current-site readings were used", () => {
    const moved = week({
      time_range_requested: "last 12 months",
      time_range_resolved: {
        start: "2026-08-23T08:24:26.000Z",
        end: "2026-10-12T08:24:26.000Z",
        label: "2026-08-23T08:24:26.000Z to 2026-10-12T08:24:26.000Z (current-site readings)",
      },
      reading_counts: { used: 2251, excluded: 0 },
    });
    expect(coverageLines([moved], false, false)[0]).toBe(
      "Data covered in this reply: Bay Mouth Pod, 2026-08-23 08:24 to 2026-10-12 08:24 UTC "
      + "(2251 readings, current site only).",
    );
  });

  it("names a single latest reading as a reading, not a window", () => {
    const latest = week({
      time_range_requested: "now",
      time_range_resolved: { start: "2026-10-12T08:24:26.000Z", end: "2026-10-12T08:24:26.000Z", label: "now" },
      reading_counts: { used: 1, excluded: 0 },
    });
    expect(coverageLines([latest], false, false)[0]).toBe(
      "Data covered in this reply: Bay Mouth Pod, the reading at 2026-10-12 08:24 UTC (1 reading).",
    );
  });

  it("says a read found nothing in the requested range, rather than staying silent", () => {
    const empty = week({ time_range_requested: "2026-01-01 to 2026-01-02", time_range_resolved: null, reading_counts: undefined });
    expect(coverageLines([empty], false, false)[0]).toBe(
      "Data covered in this reply: Bay Mouth Pod, no readings in the requested range (2026-01-01 to 2026-01-02).",
    );
  });

  it("lists distinct windows in call order and collapses repeats of the same one", () => {
    const longer = week({
      time_range_resolved: { start: "2026-08-23T08:24:26.000Z", end: "2026-10-12T08:24:26.000Z", label: "last 50 days" },
      reading_counts: { used: 2251, excluded: 0 },
    });
    const ph = week({ reading_counts: { used: 300, excluded: 32 } });
    expect(coveredWindows([week(), ph, longer, week({}), sensorCall(week().result as Record<string, unknown>, { deduped: true })]))
      .toEqual([
        { pod: "Bay Mouth Pod", window: "2026-10-05 08:24 to 2026-10-12 08:24 UTC", readings: 316, currentSiteOnly: false },
        { pod: "Bay Mouth Pod", window: "2026-08-23 08:24 to 2026-10-12 08:24 UTC", readings: 2251, currentSiteOnly: false },
      ]);
    expect(coverageLines([week(), longer], false, false)[0]).toBe(
      "Data covered in this reply: Bay Mouth Pod, 2026-10-05 08:24 to 2026-10-12 08:24 UTC (316 readings); "
      + "Bay Mouth Pod, 2026-08-23 08:24 to 2026-10-12 08:24 UTC (2251 readings).",
    );
  });

  it("skips tool errors and other tools", () => {
    expect(coveredWindows([
      sensorCall({ error: "Device not found" }),
      { ...week(), name: "get_pod_thresholds" },
      { ...week(), name: "generate_report" },
    ])).toEqual([]);
  });

  it("falls back to the pod's label when the registry gave no name", () => {
    const unnamed = week({ device: { label: "dev:100000000000023" } });
    expect(coverageLines([unnamed], false, false)[0]).toContain("dev:100000000000023, 2026-10-05 08:24");
  });
});

describe("coverageLines without a sensor read", () => {
  it("says a follow-up read nothing new when an earlier reply read pod data", () => {
    expect(coverageLines([], true, false)).toEqual([NO_NEW_READINGS_LINE]);
  });

  it("adds nothing to a chat that has never read pod data", () => {
    expect(coverageLines([], false, false)).toEqual([]);
  });

  it("adds nothing when the answer made a report, whose period the PDF line gives", () => {
    expect(coverageLines([], true, true)).toEqual([]);
  });
});

describe("hasCoverageLine and stripCoverageLines", () => {
  const reply = [
    "Over the last 7 days, Oct 5 to Oct 12, pH cycled daily between about 6.0 and 7.4.",
    "Data covered in this reply: Bay Mouth Pod, 2026-10-05 08:24 to 2026-10-12 08:24 UTC (316 readings).",
    "New PDF in this reply: Bay Mouth Pod, 2026-10-05 to 2026-10-12, full report.",
  ].join("\n\n");

  it("recognises both server lines", () => {
    expect(hasCoverageLine(reply)).toBe(true);
    expect(hasCoverageLine(`Figures as above.\n\n${NO_NEW_READINGS_LINE}`)).toBe(true);
    expect(hasCoverageLine("The data covered in this reply was fine.")).toBe(false);
  });

  it("removes only its own lines and closes the gap", () => {
    expect(stripCoverageLines(reply)).toBe([
      "Over the last 7 days, Oct 5 to Oct 12, pH cycled daily between about 6.0 and 7.4.",
      "New PDF in this reply: Bay Mouth Pod, 2026-10-05 to 2026-10-12, full report.",
    ].join("\n\n"));
    expect(stripCoverageLines("No lines here.")).toBe("No lines here.");
  });
});
