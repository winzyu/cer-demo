import {
  TEMPERATURE_BASELINE_RAIL_F,
  temperatureThreshold,
  thresholdRejectionNote,
} from "../../src/report/operatorThresholds";

/**
 * The registry's temperature thresholds are the report's only source of a temperature baseline,
 * and they are hand-entered strings with known junk in them (`BACKEND_FIELDS.md` §3c). Every
 * case below is taken from a real device document read live on 2026-08-21, not invented: the
 * failure this guards against is a customer-facing PDF stating "72 °F is outside the acceptable
 * range of 0-0".
 */
describe("temperatureThreshold", () => {
  describe("accepts a real operator-set range", () => {
    it.each([
      ["Algalita Pod", "50", "80", 50, 80],
      ["Marina Park DataPod™", "40", "95", 40, 95],
      ["PCH Public Dock Buoy", "40", "95", 40, 95],
      ["Old Woman Creek 2026", "30", "100", 30, 100],
    ])("%s: %s-%s °F", (_name, min, max, expectedMin, expectedMax) => {
      const verdict = temperatureThreshold({ minTemperature: min, maxTemperature: max });

      expect(verdict).toEqual({ usable: true, min: expectedMin, max: expectedMax });
    });
  });

  describe("casting", () => {
    it("casts the registry's string values to numbers rather than comparing strings", () => {
      const verdict = temperatureThreshold({ minTemperature: "50", maxTemperature: "80" });

      expect(verdict.usable).toBe(true);
      // The whole point: strings out of Firestore, numbers into the report. `"50" > "8"` is
      // false as a string comparison, so a caller that skipped the cast would mis-order them.
      expect(verdict).toMatchObject({ min: 50, max: 80 });
      expect(typeof (verdict as { min: number }).min).toBe("number");
      expect(typeof (verdict as { max: number }).max).toBe("number");
    });

    it("keeps a fractional string value intact", () => {
      expect(temperatureThreshold({ minTemperature: "41.5", maxTemperature: "89.6" }))
        .toEqual({ usable: true, min: 41.5, max: 89.6 });
    });

    it("accepts values already stored as numbers", () => {
      expect(temperatureThreshold({ minTemperature: 50, maxTemperature: 80 }))
        .toEqual({ usable: true, min: 50, max: 80 });
    });

    it("tolerates surrounding whitespace, which a form field can easily leave behind", () => {
      expect(temperatureThreshold({ minTemperature: " 50 ", maxTemperature: "80\n" }))
        .toEqual({ usable: true, min: 50, max: 80 });
    });

    it.each([
      ["an empty string", ""],
      ["whitespace only", "   "],
      ["free text", "n/a"],
    ])("rejects %s rather than letting Number() turn it into 0", (_label, bad) => {
      // Number("") and Number(" ") are both 0 -- exactly the value the all-zero rows carry, so
      // a blank field must not become a baseline edge of 0 °F.
      expect(temperatureThreshold({ minTemperature: bad, maxTemperature: "80" }))
        .toEqual({ usable: false, reason: "non-numeric" });
    });

    it("rejects a non-string, non-number value instead of coercing it", () => {
      const verdict = temperatureThreshold(
        { minTemperature: true, maxTemperature: 80 } as unknown as Record<string, string | number>,
      );

      // Number(true) is 1, which would sail through every other rule as a plausible-looking edge.
      expect(verdict).toEqual({ usable: false, reason: "non-numeric" });
    });
  });

  describe("rejects unusable ranges", () => {
    it("treats an all-zero threshold set as unset, not as a range every reading exceeds", () => {
      // Trinidad Island DataPod™ and dev:860322068098448 both carry all ten values as "0".
      const allZero = {
        minTemperature: "0",
        maxTemperature: "0",
        minPH: "0",
        maxPH: "0",
        minORP: "0",
        maxORP: "0",
        minDissolvedOxygen: "0",
        maxDissolvedOxygen: "0",
        minConductivity: "0",
        maxConductivity: "0",
      };

      expect(temperatureThreshold(allZero)).toEqual({ usable: false, reason: "unset" });
    });

    it("treats any identical min and max as unset, not only the zero case", () => {
      // The `Test 2` row in the recorded fixture carries minTemperature = maxTemperature = "1".
      expect(temperatureThreshold({ minTemperature: "1", maxTemperature: "1" }))
        .toEqual({ usable: false, reason: "unset" });
      expect(temperatureThreshold({ minTemperature: "68", maxTemperature: "68" }))
        .toEqual({ usable: false, reason: "unset" });
    });

    it("rejects an inverted range rather than silently swapping the ends", () => {
      // Swapping would produce a range the operator never entered, and a report that quietly
      // disagrees with what the registry shows them.
      expect(temperatureThreshold({ minTemperature: "95", maxTemperature: "40" }))
        .toEqual({ usable: false, reason: "inverted" });
    });

    it("rejects a placeholder magnitude outside the sanity rail", () => {
      // `100000` is the placeholder style seen on maxConductivity; CER Conference Pod has
      // maxPH=100 and maxDissolvedOxygen=100 in the same spirit.
      expect(temperatureThreshold({ minTemperature: "0", maxTemperature: "100000" }))
        .toEqual({ usable: false, reason: "implausible" });
      expect(temperatureThreshold({ minTemperature: "-460", maxTemperature: "80" }))
        .toEqual({ usable: false, reason: "implausible" });
    });

    it("rejects the whole pair when only one edge is a placeholder, rather than half-keeping it", () => {
      // Clamping the bad edge to the rail would invent a number, which is the failure mode this
      // module exists to prevent.
      expect(temperatureThreshold({ minTemperature: "50", maxTemperature: "500" }))
        .toEqual({ usable: false, reason: "implausible" });
    });

    it.each([
      ["no thresholds object at all", undefined, "no-thresholds"],
      ["a null thresholds field", null, "no-thresholds"],
      ["an empty thresholds object", {}, "no-thresholds"],
    ])("reports %s as having no baseline available", (_label, thresholds, reason) => {
      // 2 of the 15 live devices carry no `thresholds` field.
      expect(temperatureThreshold(thresholds as Record<string, string | number> | null | undefined))
        .toEqual({ usable: false, reason });
    });

    it("reports a threshold set with no temperature keys as missing, not as unset", () => {
      // Turbidity has no threshold field at all on any device, so a partially-populated set is a
      // real registry state -- the reason has to name which field to go add.
      expect(temperatureThreshold({ minPH: "6", maxPH: "8" }))
        .toEqual({ usable: false, reason: "missing" });
      expect(temperatureThreshold({ minTemperature: "50" }))
        .toEqual({ usable: false, reason: "missing" });
    });
  });

  describe("the sanity rail", () => {
    const [lo, hi] = TEMPERATURE_BASELINE_RAIL_F;

    it("admits every threshold pair observed live on the fleet", () => {
      // Widest real pair is Old Woman Creek 2026's 30-100 °F; a rail that rejected it would be
      // deleting a real operator baseline, which is worse than the junk it is meant to catch.
      expect(lo).toBeLessThanOrEqual(30);
      expect(hi).toBeGreaterThanOrEqual(100);
    });

    it("stays tighter than the probe rail, because it judges intent rather than physics", () => {
      // plausibility.ts uses -40 to 140 °F for "could a probe have emitted this reading".
      expect(lo).toBeGreaterThan(-40);
      expect(hi).toBeLessThan(140);
    });

    it("is inclusive at both edges", () => {
      expect(temperatureThreshold({ minTemperature: String(lo), maxTemperature: String(hi) }))
        .toEqual({ usable: true, min: lo, max: hi });
      expect(temperatureThreshold({ minTemperature: String(lo - 1), maxTemperature: String(hi) }))
        .toEqual({ usable: false, reason: "implausible" });
      expect(temperatureThreshold({ minTemperature: String(lo), maxTemperature: String(hi + 1) }))
        .toEqual({ usable: false, reason: "implausible" });
    });
  });
});

describe("thresholdRejectionNote", () => {
  it.each([
    "no-thresholds", "missing", "non-numeric", "unset", "inverted", "implausible",
  ] as const)("gives %s an actionable sentence naming the registry as the fix", (reason) => {
    const note = thresholdRejectionNote(reason);

    expect(note).toContain("registry");
    expect(note.endsWith(".")).toBe(true);
  });

  it("never prints the placeholder range itself", () => {
    // The zeros on an absent baseline are internal placeholders; "0-0" must not reach a reader.
    const notes = (["no-thresholds", "missing", "non-numeric", "unset", "inverted", "implausible"] as const)
      .map(thresholdRejectionNote);

    expect(notes.some((n) => n.includes("0-0"))).toBe(false);
  });
});
