import { omittedNotice, parseReportOmit, REPORT_OMIT_GROUPS } from "../../src/report/omit";

describe("parseReportOmit", () => {
  it("treats an absent, null or empty list as leaving nothing out", () => {
    expect(parseReportOmit(undefined)).toEqual({ omit: [] });
    expect(parseReportOmit(null)).toEqual({ omit: [] });
    expect(parseReportOmit([])).toEqual({ omit: [] });
  });

  it("deduplicates and orders the groups, so equivalent requests render alike", () => {
    expect(parseReportOmit(["data_quality", "turbidity_notes", "data_quality"]))
      .toEqual({ omit: ["turbidity_notes", "data_quality"] });
  });

  it("rejects anything but a list of known group names", () => {
    ["turbidity_notes", ["recommendations"], [1], { turbidity_notes: true }].forEach((value) => {
      expect(parseReportOmit(value).error).toContain(REPORT_OMIT_GROUPS.join(", "));
    });
    expect(parseReportOmit(Array(11).fill("data_quality")).error).toBeDefined();
  });
});

describe("omittedNotice", () => {
  it("is absent when nothing was left out", () => {
    expect(omittedNotice([])).toBeUndefined();
  });

  it("names each left-out group and that the requester asked for it", () => {
    expect(omittedNotice(["turbidity_notes", "data_quality"]))
      .toBe("turbidity notes, Data Quality section (at the requester's request)");
  });
});
