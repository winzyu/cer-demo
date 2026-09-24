import fs from "fs";
import path from "path";

/**
 * `citations.js` is pure and DOM-free, so — same approach as `test/unit/frontendAuth.test.ts` —
 * it is evaluated directly from source in Jest's `node` environment rather than through a build
 * step or jsdom.
 */

const FRONTEND = path.resolve(__dirname, "../../frontend");
const read = (file: string): string => fs.readFileSync(path.join(FRONTEND, file), "utf8");

type Segment = { type: "text"; value: string } | { type: "cite"; index: number };

interface CitationsModule {
  MARKER_PATTERN: RegExp;
  stripOpenMarker: (text: string) => string;
  splitCitations: (text: string) => Segment[];
  collapseCitationQuotes: (text: string) => string;
}

const loadCitations = (): CitationsModule => {
  const source = read("js/citations.js").replace(/^export /gm, "");
  // Evaluating the real module is the point here; the input is a file in this repository, not
  // anything user-supplied.
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${source}\nreturn { MARKER_PATTERN, stripOpenMarker, splitCitations, collapseCitationQuotes };`);
  return factory() as CitationsModule;
};

const { stripOpenMarker, splitCitations, collapseCitationQuotes } = loadCitations();

/** Every text segment's value, concatenated — for asserting a quote never survives. */
const textOf = (segments: Segment[]): string => segments
  .filter((s): s is { type: "text"; value: string } => s.type === "text")
  .map((s) => s.value)
  .join("");

describe("splitCitations — marker forms", () => {
  const forms: Array<[string, string]> = [
    ["plain", "【3】"],
    ["legacy line span", "【3†L1-L4】"],
    ["quoted, dagger separator, straight quotes", '【3†"a quoted span"】'],
    ["quoted, colon separator", '【3:"a quoted span"】'],
    ["quoted, space separator", '【3 "a quoted span"】'],
    ["quoted, typographic quotes", "【3†“a quoted span”】"],
  ];

  it.each(forms)("%s yields one cite segment with the right index, text preserved", (_label, marker) => {
    const segments = splitCitations(`before ${marker} after`);
    expect(segments).toEqual([
      { type: "text", value: "before " },
      { type: "cite", index: 3 },
      { type: "text", value: " after" },
    ]);
  });
});

describe("splitCitations — quote text is never carried in a segment", () => {
  it("drops a straight-quoted quote", () => {
    const segments = splitCitations('Oxygen dissolves less as water warms 【3†"solubility of oxygen decreases with heat"】.');
    expect(textOf(segments)).not.toContain("solubility of oxygen decreases with heat");
  });

  it("drops a typographic-quoted quote", () => {
    const segments = splitCitations("See 【2†“a note, with a comma; and a semicolon”】 here.");
    expect(textOf(segments)).not.toContain("a note, with a comma; and a semicolon");
  });

  it("drops a quote containing punctuation but no 】", () => {
    const segments = splitCitations('Reading: 【1†"pH 6.5-8.5 (normal range), per the datasheet"】 confirmed.');
    expect(textOf(segments)).not.toContain("pH 6.5-8.5 (normal range), per the datasheet");
  });
});

describe("splitCitations — non-markers are left as text", () => {
  it("leaves an editorial 【commentary …】 span untouched", () => {
    const text = "before 【commentary this is a note, not a citation】 after";
    expect(splitCitations(text)).toEqual([{ type: "text", value: text }]);
  });

  it("leaves an ASCII [1] footnote-style bracket untouched", () => {
    const text = "See reference [1] for details.";
    expect(splitCitations(text)).toEqual([{ type: "text", value: text }]);
  });
});

describe("splitCitations — multiple markers", () => {
  it("handles two markers separated by text", () => {
    const segments = splitCitations('Oxygen 【1†"a"】 and temperature 【2†"b"】 are related.');
    expect(segments).toEqual([
      { type: "text", value: "Oxygen " },
      { type: "cite", index: 1 },
      { type: "text", value: " and temperature " },
      { type: "cite", index: 2 },
      { type: "text", value: " are related." },
    ]);
  });

  it("handles two adjacent markers with no text between them", () => {
    const segments = splitCitations('【1†"a b c"】【2†"d e f"】');
    expect(segments).toEqual([
      { type: "cite", index: 1 },
      { type: "cite", index: 2 },
    ]);
  });
});

describe("stripOpenMarker", () => {
  it("cuts an unclosed trailing numeric marker", () => {
    expect(stripOpenMarker('…warms 【3†"solubility of oxy')).toBe("…warms ");
  });

  it("leaves a closed marker alone", () => {
    const text = 'done 【2†"fully quoted"】 tail';
    expect(stripOpenMarker(text)).toBe(text);
  });

  it("leaves an unclosed 【commentary span alone", () => {
    const text = "note 【commentary about stuff";
    expect(stripOpenMarker(text)).toBe(text);
  });

  it("leaves ordinary text alone", () => {
    const text = "just plain text, nothing bracketed";
    expect(stripOpenMarker(text)).toBe(text);
  });
});

describe("malformed markers from the 2026-09-13 smoke capture", () => {
  // gpt-oss-120b closed every marker with "} instead of "】 in the first smoke run.
  const answer = "* Conductivity: 90 % in 1 s【1†\"90% in 1s\"}\n* ORP: 95 % in 1 s【2†\"95% in 1s\"}\n\nWait 5–10 seconds.";

  it("renders a \"}-closed marker as a citation and hides its quote", () => {
    const segments = splitCitations(answer);
    expect(segments.filter((s) => s.type === "cite").map((s) => (s as { index: number }).index)).toEqual([1, 2]);
    expect(textOf(segments)).not.toContain("90% in 1s");
    expect(textOf(segments)).toContain("Wait 5–10 seconds.");
  });

  it("never hides the rest of the answer behind a \"}-closed marker", () => {
    expect(stripOpenMarker(answer)).toBe(answer);
  });

  it("does not let a malformed marker swallow text up to a later marker", () => {
    const text = "First claim【1†\"alpha beta\"} and ordinary prose here. Second【2†\"gamma delta\"】.";
    const segments = splitCitations(text);
    expect(textOf(segments)).toContain("and ordinary prose here.");
    expect(segments.filter((s) => s.type === "cite")).toHaveLength(2);
  });

  it("consumes a real 】 after a \"} or \"] closer so no doubled bracket renders", () => {
    const text = "Claim【5†\"quote one\"}】 and more【6†\"quote two\"]】.";
    const segments = splitCitations(text);
    expect(segments.filter((s) => s.type === "cite").map((s) => (s as { index: number }).index)).toEqual([5, 6]);
    expect(textOf(segments)).toBe("Claim and more.");
    expect(collapseCitationQuotes(text)).toBe("Claim【5】 and more【6】.");
  });

  it("does not treat a long unclosed tail as a marker in progress", () => {
    const tail = `Answer【3†"${"word ".repeat(80)}`;
    expect(stripOpenMarker(tail)).toBe(tail);
  });
});

describe("code-review findings, 2026-09-13", () => {
  it("never hides a sentence written after an unclosed marker's closing quote", () => {
    const text = 'Normal is set per pod 【1†"Range 0 − 14". Rinse the probe before storage.';
    expect(stripOpenMarker(text)).toBe(text);
  });

  it("still hides a marker whose quote has just closed at the end of the stream", () => {
    expect(stripOpenMarker('Warmer water 【3†"holds less oxygen"')).toBe("Warmer water ");
  });

  it("removes quotes containing markdown syntax before markdown can split them", () => {
    const text = 'See 【2†"use *low* flow, ~slowly~, per `SOP-1` at https://x.test"】 and 【4†"plain"】.';
    const collapsed = collapseCitationQuotes(text);
    expect(collapsed).toBe("See 【2】 and 【4】.");
    expect(collapsed).not.toContain("low");
  });
});

describe("render.js wiring", () => {
  it("imports citations.js and uses it inside updateMessageBody, building <sup> via createElement", () => {
    const render = read("js/render.js");
    expect(render).toMatch(/import\s*\{[^}]*stripOpenMarker[^}]*\}\s*from\s*"\.\/citations\.js"/);
    expect(render).toMatch(/import\s*\{[^}]*splitCitations[^}]*\}\s*from\s*"\.\/citations\.js"/);
    expect(render).toContain("stripOpenMarker(");
    expect(render).toContain("collapseCitationQuotes(stripOpenMarker(text))");
    expect(render).toContain("splitCitations(");
    expect(render).toContain('createElement("sup")');
  });
});


describe("Task C marker compatibility", () => {
  it("keeps document and tool references distinct and strips invalid marker contents", () => {
    expect(collapseCitationQuotes('Doc 【5†"sample"}】 Tool 【T1】 Empty 【】 Unknown 【?】'))
      .toBe("Doc 【5】 Tool 【T1】 Empty  Unknown ");
    expect(collapseCitationQuotes('Doc 【5†"sample"}  】 Tool 【T1】'))
      .toBe("Doc 【5】 Tool 【T1】");
    expect(splitCitations("【T1】")).toEqual([{ type: "tool", handle: "T1" }]);
  });
});
