import {
  catalogue, entriesFor, parseCatalogue, usableGuidance, waterClassFor,
} from "../../src/catalogue";
import rawCatalogue from "../../src/catalogue/catalogue.json";

/**
 * The guidance catalogue's validator and selection rules. The shipped file is checked here too,
 * so a malformed edit fails the suite before it fails a boot.
 */

const approved = { status: "approved", by: "Supervisor", date: "2026-09-20" };

const minimal = (entryOverrides: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  version: "t.1",
  sources: { test: "Test" },
  referrals: [{ id: "pro", service: "Professional review", review: { status: "draft" } }],
  entries: [{
    id: "entry-one",
    title: "Entry",
    kind: "explanation",
    text: "Text.",
    appliesTo: { triggers: ["Hypoxia"], conditions: "c" },
    requiredEvidence: "e",
    limitations: "l",
    sources: ["test §1"],
    review: { status: "draft" },
    ...entryOverrides,
  }],
  ...extra,
});

describe("parseCatalogue", () => {
  it("accepts the shipped catalogue", () => {
    expect(() => parseCatalogue(rawCatalogue)).not.toThrow();
    expect(catalogue.entries.length).toBeGreaterThan(0);
  });

  it("accepts a minimal valid catalogue", () => {
    expect(parseCatalogue(minimal()).entries[0].id).toBe("entry-one");
  });

  it.each([
    ["an approval with no reviewer", { review: { status: "approved", date: "2026-09-20" } }, 'must record "by" and "date"'],
    ["a malformed approval date", { review: { ...approved, date: "20 Sept" } }, "must be YYYY-MM-DD"],
    ["an unknown trigger", { appliesTo: { triggers: ["Flood"], conditions: "c" } }, "must be one of"],
    ["an unknown referral", { referral: "nobody" }, 'referral "nobody" is not a known referral id'],
    ["a source with no known key", { sources: ["wikipedia"] }, 'must start with a key of "sources"'],
    ["a non-kebab id", { id: "Entry_One" }, "must be kebab-case"],
    ["a confidence above 1", { appliesTo: { triggers: ["Hypoxia"], minConfidence: 2, conditions: "c" } }, "from 0 to 1"],
    ["an empty text", { text: " " }, ".text must be a non-empty string"],
    ["an explanation keyed to a bare crossing", { appliesTo: { triggers: ["threshold-crossing"], conditions: "c" } }, "cannot use the threshold-crossing trigger"],
    ["a report next step with no slot", { kind: "next-step" }, "must name its report slot"],
    ["a slot on a chat-only entry", { kind: "next-step", slot: "operational", appliesTo: { conditions: "c" } }, "only allowed on a next-step with triggers"],
    ["a slot on an explanation", { slot: "operational" }, "only allowed on a next-step with triggers"],
  ])("rejects %s", (_, overrides, message) => {
    expect(() => parseCatalogue(minimal(overrides))).toThrow(message);
  });

  it("rejects a duplicate id", () => {
    const catalogueWithDuplicate = minimal();
    catalogueWithDuplicate.entries.push({ ...catalogueWithDuplicate.entries[0] });
    expect(() => parseCatalogue(catalogueWithDuplicate)).toThrow('"entry-one" is not unique');
  });

  it("lists every problem at once", () => {
    const error = (() => {
      try {
        parseCatalogue(minimal({ id: "Bad", text: "" }, { version: "" }));
      } catch (e) {
        return (e as Error).message;
      }
      return "";
    })();
    expect(error).toContain("catalogue.version");
    expect(error).toContain("must be kebab-case");
    expect(error).toContain(".text must be a non-empty string");
  });
});

describe("usableGuidance", () => {
  const parsed = parseCatalogue({
    version: "t.1",
    sources: { test: "Test" },
    referrals: [
      { id: "ok", service: "s", review: approved },
      { id: "pending", service: "s", review: { status: "draft" } },
    ],
    entries: ["approved", "draft", "rejected", "blocked"].map((id) => ({
      id,
      title: id,
      kind: "limitation",
      text: id,
      appliesTo: { conditions: "c" },
      requiredEvidence: "e",
      limitations: "l",
      sources: ["test §1"],
      ...(id === "blocked" ? { referral: "pending" } : { referral: "ok" }),
      review: id === "draft" ? { status: "draft" } : { ...approved, status: id === "rejected" ? "rejected" : "approved" },
    })),
  });

  it("keeps only approved entries whose referral is approved", () => {
    expect(usableGuidance(parsed, false).entries.map((e) => e.id)).toEqual(["approved"]);
  });

  it("adds drafts, never rejections, for supervisor review", () => {
    expect(usableGuidance(parsed, true).entries.map((e) => e.id)).toEqual(["approved", "draft", "blocked"]);
  });
});

describe("entriesFor", () => {
  const { entries } = usableGuidance(catalogue, true);
  const ids = (found: typeof entries) => found.map((e) => e.id);

  it("maps Freshwater to the freshwater signatures and every coastal type to marine", () => {
    expect(waterClassFor("Freshwater")).toBe("freshwater");
    (["Marine", "Brackish", "Estuarine"] as const).forEach((type) => {
      expect(waterClassFor(type)).toBe("marine");
    });
  });

  it("selects the sewage explanation that matches the water", () => {
    const marine = ids(entriesFor(entries, { trigger: "Sewage", water: "marine", confidence: 0.7 }));
    const fresh = ids(entriesFor(entries, { trigger: "Sewage", water: "freshwater", confidence: 0.7 }));
    expect(marine).toContain("sewage-marine");
    expect(marine).not.toContain("sewage-freshwater");
    expect(fresh).toContain("sewage-freshwater");
    expect(fresh).not.toContain("sewage-marine");
  });

  it("holds back an explanation below its confidence", () => {
    expect(ids(entriesFor(entries, { trigger: "Sewage", water: "marine", confidence: 0.5 })))
      .not.toContain("sewage-marine");
  });

  it("treats a missing confidence as zero and a missing severity as Low", () => {
    const found = ids(entriesFor(entries, { trigger: "threshold-crossing", water: "marine" }));
    expect(found).toEqual(expect.arrayContaining(["inspect-sensors", "confirm-readings", "share-report"]));
    expect(ids(entriesFor(entries, { trigger: "Hypoxia", water: "marine", confidence: 0.6 })))
      .not.toContain("low-oxygen-priority");
    expect(ids(entriesFor(entries, {
      trigger: "Hypoxia", water: "marine", confidence: 0.6, severity: "Moderate",
    }))).toContain("low-oxygen-priority");
  });

  it("never selects a chat-only entry for a report", () => {
    const chatOnly = entries.filter((e) => !e.appliesTo.triggers).map((e) => e.id);
    expect(chatOnly.length).toBeGreaterThan(0);
    const everything = (["Sewage", "Stormwater", "Hypoxia", "Thermal", "Acidic input", "Industrial",
      "Saltwater intrusion", "Algal bloom", "Inconclusive", "threshold-crossing"] as const)
      .flatMap((trigger) => (["marine", "freshwater"] as const).flatMap((water) => ids(entriesFor(entries, {
        trigger, water, confidence: 1, severity: "High",
      }))));
    chatOnly.forEach((id) => expect(everything).not.toContain(id));
  });
});
