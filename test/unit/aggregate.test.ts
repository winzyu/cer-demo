import {
  aggregate, autoBucketMs, bucketize, isAggregation,
} from "../../src/tools/aggregate";
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
  it("accepts the six legacy aggregations plus the two added in N3", () => {
    ["min", "max", "mean", "median", "latest", "raw", "earliest", "series"].forEach((name) => {
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
      (["min", "max", "mean", "median", "latest", "earliest", "raw", "series"] as const)
        .forEach((aggregation) => {
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

describe("earliest", () => {
  it("reads the oldest reading by timestamp, not by array position", () => {
    const result = aggregate(series, "earliest", 200);

    expect(result.value).toBe(6.0);
    expect(result.observedAt).toBe("2026-08-11T06:00:00.000Z");
  });

  it("is the exact mirror of latest", () => {
    expect(aggregate(series, "earliest", 200).observedAt)
      .not.toBe(aggregate(series, "latest", 200).observedAt);
  });

  it("is unaffected by the raw cap", () => {
    // The regression this aggregation exists for. Asked for the earliest reading, the model
    // reached for `raw`, which keeps the NEWEST 200 rows — so the oldest row it saw was the
    // 200th-from-last and it reported that as the pod's first reading. Live, that was
    // 2026-08-12 against a true first reading of 2026-06-13.
    const long: Sample[] = Array.from({ length: 500 }, (_, index) => sample(
      new Date(Date.parse("2026-06-13T00:00:00.000Z") + index * 60_000).toISOString(),
      index,
    ));

    const raw = aggregate(long, "raw", 200);
    const earliest = aggregate(long, "earliest", 200);

    expect(raw.samples?.[0].value).toBe(300);
    expect(raw.truncated).toBe(true);
    expect(earliest.value).toBe(0);
    expect(earliest.observedAt).toBe("2026-06-13T00:00:00.000Z");
  });

  it("skips faulted readings when finding the oldest", () => {
    const leadingFault = [
      sample("2026-08-11T06:00:00.000Z", 99.9, false),
      sample("2026-08-11T09:00:00.000Z", 8.0),
    ];
    const result = aggregate(leadingFault, "earliest", 200);

    expect(result.value).toBe(8.0);
    expect(result.observedAt).toBe("2026-08-11T09:00:00.000Z");
  });
});

describe("raw truncation reporting", () => {
  const long: Sample[] = Array.from({ length: 250 }, (_, index) => sample(
    new Date(Date.parse("2026-08-01T00:00:00.000Z") + index * 60_000).toISOString(),
    index,
  ));

  it("says which end of the window survived", () => {
    // "truncated" alone does not tell a reader that the OLDEST rows are the missing ones,
    // which is exactly what made the earliest-reading question unanswerable from this field.
    const result = aggregate(long, "raw", 200);

    expect(result.truncated).toBe(true);
    expect(result.truncatedKept).toBe("newest");
  });

  it("reports neither field when nothing was dropped", () => {
    const result = aggregate(long.slice(0, 10), "raw", 200);

    expect(result.truncated).toBeUndefined();
    expect(result.truncatedKept).toBeUndefined();
  });
});

describe("series", () => {
  /** Six hours of readings, one every ten minutes. */
  const sixHours: Sample[] = Array.from({ length: 36 }, (_, index) => sample(
    new Date(Date.parse("2026-08-11T00:00:00.000Z") + index * 10 * 60_000).toISOString(),
    index,
  ));

  it("buckets the window and summarizes each bucket", () => {
    const result = aggregate(sixHours, "series", 200, { bucketMs: 60 * 60_000 });

    expect(result.series).toHaveLength(6);
    expect(result.series?.[0]).toMatchObject({ n: 6, min: 0, max: 5 });
    expect(result.series?.[0].mean).toBeCloseTo(2.5, 10);
  });

  it("carries no scalar value", () => {
    expect(aggregate(sixHours, "series", 200).value).toBeNull();
  });

  it("echoes the bucket width so an auto choice is visible", () => {
    expect(aggregate(sixHours, "series", 200, { bucketMs: 60 * 60_000 }).bucketMs)
      .toBe(60 * 60_000);
    expect(aggregate(sixHours, "series", 200).bucketMs).toBeGreaterThan(0);
  });

  it("aligns buckets to the epoch, not to the first reading", () => {
    // Two calls over near-identical windows must put the same clock hour in the same bucket,
    // or the series they return are not comparable — which defeats asking for one.
    const offset = sixHours.slice(2);
    const a = aggregate(sixHours, "series", 200, { bucketMs: 60 * 60_000 });
    const b = aggregate(offset, "series", 200, { bucketMs: 60 * 60_000 });

    expect(b.series?.[0].start).toBe(a.series?.[0].start);
  });

  it("omits empty buckets rather than zero-filling them", () => {
    // A gap in reporting is not a reading of zero. Zero-filling would reintroduce the exact
    // fabrication the empty-window guard exists to prevent, at bucket granularity.
    const gapped = [
      sample("2026-08-11T00:00:00.000Z", 5),
      sample("2026-08-11T05:00:00.000Z", 7),
    ];
    const result = aggregate(gapped, "series", 200, { bucketMs: 60 * 60_000 });

    expect(result.series).toHaveLength(2);
    expect(result.series?.every((bucket) => bucket.n > 0)).toBe(true);
    expect(result.series?.some((bucket) => bucket.mean === 0)).toBe(false);
  });

  it("excludes faulted readings from its buckets", () => {
    const withFault = [
      sample("2026-08-11T00:00:00.000Z", 5),
      sample("2026-08-11T00:30:00.000Z", 99.9, false),
    ];
    const result = aggregate(withFault, "series", 200, { bucketMs: 60 * 60_000 });

    expect(result.series?.[0]).toMatchObject({ n: 1, mean: 5 });
    expect(result.excludedFaulted).toBe(1);
  });
});

describe("autoBucketMs", () => {
  const spanning = (hours: number): Sample[] => [
    sample("2026-08-11T00:00:00.000Z", 1),
    sample(new Date(Date.parse("2026-08-11T00:00:00.000Z") + hours * 3_600_000).toISOString(), 2),
  ];

  it("keeps the bucket count human-sized whatever the window", () => {
    // The work worth taking off a 20B model: asked for "the last week" it would pick hourly
    // and get 168 buckets, which is no better than raw rows.
    [6, 24, 24 * 7, 24 * 30].forEach((hours) => {
      const bucketMs = autoBucketMs(spanning(hours), 60);
      expect(hours * 3_600_000 / bucketMs).toBeLessThanOrEqual(60);
    });
  });

  it("never returns a zero or negative width for a single instant", () => {
    expect(autoBucketMs([sample("2026-08-11T00:00:00.000Z", 1)])).toBeGreaterThan(0);
  });
});

describe("bucketize", () => {
  it("caps the number of buckets, keeping the most recent", () => {
    const many: Sample[] = Array.from({ length: 100 }, (_, index) => sample(
      new Date(Date.parse("2026-08-11T00:00:00.000Z") + index * 3_600_000).toISOString(),
      index,
    ));
    const buckets = bucketize(many, 3_600_000, 10);

    expect(buckets).toHaveLength(10);
    expect(buckets[buckets.length - 1].max).toBe(99);
  });
});
