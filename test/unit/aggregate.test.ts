import { aggregate, isAggregation } from "../../src/tools/aggregate";
import type { Sample } from "../../src/tools/aggregate";

const at = (iso: string): { atMs: number; at: string } => ({ atMs: Date.parse(iso), at: iso });

const sample = (iso: string, value: number, valid = true): Sample => ({ ...at(iso), value, valid });

/** Four readings, deliberately out of chronological order in the array. */
const series: Sample[] = [
  sample("2026-08-11T12:00:00.000Z", 7.4),
  sample("2026-08-11T09:00:00.000Z", 9.2),
  sample("2026-08-11T15:00:00.000Z", 5.0),
  sample("2026-08-11T06:00:00.000Z", 6.0),
];

describe("isAggregation", () => {
  it("accepts the six legacy aggregations and nothing else", () => {
    ["min", "max", "mean", "median", "latest", "raw"].forEach((name) => {
      expect(isAggregation(name)).toBe(true);
    });
    ["avg", "sum", "count", "", "MEAN", null, 3].forEach((name) => {
      expect(isAggregation(name)).toBe(false);
    });
  });
});

describe("aggregate", () => {
  it("computes min, max and mean over the window", () => {
    expect(aggregate(series, "min", 200).value).toBe(5.0);
    expect(aggregate(series, "max", 200).value).toBe(9.2);
    expect(aggregate(series, "mean", 200).value).toBeCloseTo((7.4 + 9.2 + 5.0 + 6.0) / 4, 10);
  });

  it("averages the two middle values for an even-sized median", () => {
    // 5.0, 6.0, 7.4, 9.2 -> (6.0 + 7.4) / 2
    expect(aggregate(series, "median", 200).value).toBeCloseTo(6.7, 10);
  });

  it("takes the middle value for an odd-sized median", () => {
    expect(aggregate(series.slice(0, 3), "median", 200).value).toBe(7.4);
  });

  it("reads 'latest' by timestamp, not by array position", () => {
    // The newest reading sits third in the input array. Trusting order here would report
    // 7.4 mg/L as the current value, which is a real number from the wrong moment.
    const result = aggregate(series, "latest", 200);

    expect(result.value).toBe(5.0);
    expect(result.observedAt).toBe("2026-08-11T15:00:00.000Z");
  });

  it("returns raw samples in chronological order", () => {
    const result = aggregate(series, "raw", 200);

    expect(result.samples?.map((entry) => entry.value)).toEqual([6.0, 9.2, 7.4, 5.0]);
    expect(result.truncated).toBeUndefined();
  });

  it("carries no single value for a raw series", () => {
    // A series has no scalar answer; leaving `value` null means nothing downstream can quote
    // one reading as though it were the whole window.
    expect(aggregate(series, "raw", 200).value).toBeNull();
  });

  describe("empty and missing windows", () => {
    it("returns null, never 0, when the window is empty", () => {
      // The single most important assertion in this file. The device API answers an empty
      // window with zeros for all six metrics (DEVICE_API.md §12b); a 0 here would be
      // indistinguishable from a real anoxic reading and the eval's quality floor treats a
      // fabricated figure as automatic disqualification.
      (["min", "max", "mean", "median", "latest", "raw"] as const).forEach((aggregation) => {
        const result = aggregate([], aggregation, 200);

        expect(result.value).toBeNull();
        expect(result.value).not.toBe(0);
        expect(result.nSamples).toBe(0);
      });
    });

    it("returns null when every sample in the window is faulted", () => {
      const faulted = [sample("2026-08-11T12:00:00.000Z", 7.4, false)];
      const result = aggregate(faulted, "mean", 200);

      expect(result.value).toBeNull();
      expect(result.nSamples).toBe(0);
      expect(result.excludedFaulted).toBe(1);
    });
  });

  describe("0 is a valid reading", () => {
    it("keeps zero-valued samples in every statistic", () => {
      // ORP and turbidity genuinely read 0 (timeline.md). A falsy check anywhere in the
      // pipeline would drop them — and dropping the zeros from a turbidity series biases it
      // upward, which reads as worse water rather than as a bug.
      const zeros = [
        sample("2026-08-11T09:00:00.000Z", 0),
        sample("2026-08-11T12:00:00.000Z", 0),
        sample("2026-08-11T15:00:00.000Z", 6),
      ];

      expect(aggregate(zeros, "min", 200).value).toBe(0);
      expect(aggregate(zeros, "mean", 200).value).toBe(2);
      expect(aggregate(zeros, "median", 200).value).toBe(0);
      expect(aggregate(zeros, "raw", 200).samples).toHaveLength(3);
      expect(aggregate(zeros, "min", 200).nSamples).toBe(3);
    });

    it("distinguishes a genuine zero from an empty window", () => {
      const allZero = [sample("2026-08-11T09:00:00.000Z", 0)];

      expect(aggregate(allZero, "mean", 200)).toMatchObject({ value: 0, nSamples: 1 });
      expect(aggregate([], "mean", 200)).toMatchObject({ value: null, nSamples: 0 });
    });
  });

  describe("faulted probes", () => {
    const mixed: Sample[] = [
      sample("2026-08-11T09:00:00.000Z", 8.0),
      sample("2026-08-11T12:00:00.000Z", 99.9, false),
      sample("2026-08-11T15:00:00.000Z", 6.0),
    ];

    it("excludes faulted samples from the statistic", () => {
      // A faulted probe keeps reporting a plausible-looking number — 99.9 would drag this
      // mean from 7.0 to 38.0 and nothing in the output would say why.
      expect(aggregate(mixed, "mean", 200).value).toBe(7.0);
      expect(aggregate(mixed, "max", 200).value).toBe(8.0);
    });

    it("reports how many were excluded rather than hiding the exclusion", () => {
      const result = aggregate(mixed, "mean", 200);

      expect(result.nSamples).toBe(2);
      expect(result.excludedFaulted).toBe(1);
    });

    it("does not let a faulted reading be the 'latest'", () => {
      const trailingFault = [
        sample("2026-08-11T09:00:00.000Z", 8.0),
        sample("2026-08-11T15:00:00.000Z", 99.9, false),
      ];
      const result = aggregate(trailingFault, "latest", 200);

      expect(result.value).toBe(8.0);
      expect(result.observedAt).toBe("2026-08-11T09:00:00.000Z");
    });

    it("keeps faulted samples out of raw output too", () => {
      expect(aggregate(mixed, "raw", 200).samples).toHaveLength(2);
    });
  });

  describe("the raw cap", () => {
    const long: Sample[] = Array.from({ length: 250 }, (_, index) => sample(
      new Date(Date.parse("2026-08-01T00:00:00.000Z") + index * 60_000).toISOString(),
      index,
    ));

    it("caps the series and says that it did", () => {
      const result = aggregate(long, "raw", 200);

      expect(result.samples).toHaveLength(200);
      expect(result.truncated).toBe(true);
    });

    it("keeps the most recent rows when truncating", () => {
      // A truncated series should end where the question does. Keeping the oldest 200 would
      // answer "what happened lately" with data from the start of the window.
      const result = aggregate(long, "raw", 200);

      expect(result.samples?.[result.samples.length - 1].value).toBe(249);
      expect(result.samples?.[0].value).toBe(50);
    });

    it("still reports the true sample count behind the cap", () => {
      expect(aggregate(long, "raw", 200).nSamples).toBe(250);
    });
  });
});
