/**
 * Guards the §8a hard-gate checker.
 *
 * The first test is the reason this file exists. A naive `answer.includes(REFUSAL_SENTENCE)` scores
 * **zero** on a perfect refusal, because the model emits U+2011 NON-BREAKING HYPHEN in
 * `water‑quality` where the pinned constant has U+002D — and NFKC folds U+2011 to U+2010, not to
 * U+002D, so normalising without an explicit dash class does not save it either. That would have
 * reported a passing arm as failing an absolute pre-registered gate.
 */
import {
  checkCitations,
  checkFigures,
  checkRefusal,
} from "../../src/eval/gates/checks";
import {
  closestWindow,
  editDistance,
  normalizeForMatch,
} from "../../src/eval/gates/normalize";
import { REFUSAL_SENTENCE } from "../../src/prompt/systemPrompt";

/** Exactly what `eval/transcripts/warm/firestore-direct/refusal-pathogens.json` turn 2 contains. */
const NBSP_HYPHEN_REFUSAL = REFUSAL_SENTENCE.replace("water-quality", "water‑quality");

const context = (text: string, id = "doc.pdf"): { id: string; text: string }[] => [{ id, text }];

describe("normalizeForMatch", () => {
  it("folds the non-breaking hyphen NFKC leaves alone", () => {
    expect("water‑quality".normalize("NFKC")).not.toBe("water-quality");
    expect(normalizeForMatch("water‑quality")).toBe("water-quality");
  });

  it("folds micro sign onto greek mu, matching the BM25 tokenizer", () => {
    expect(normalizeForMatch("µS/cm")).toBe(normalizeForMatch("μS/cm"));
  });

  it("folds typographic apostrophes and collapses exotic whitespace", () => {
    expect(normalizeForMatch("don’t")).toBe("don't");
    expect(normalizeForMatch("a  b")).toBe("a b");
  });

  it("drops zero-width characters rather than treating them as a difference", () => {
    expect(normalizeForMatch("pH​ 6.5")).toBe("ph 6.5");
  });
});

describe("editDistance", () => {
  it("counts single-character edits", () => {
    expect(editDistance("abc", "abc")).toBe(0);
    expect(editDistance("abc", "abd")).toBe(1);
    expect(editDistance("abc", "ab")).toBe(1);
  });

  it("abandons early once the cutoff is provably exceeded", () => {
    expect(editDistance("abcdef", "zzzzzz", 2)).toBeGreaterThan(2);
  });
});

describe("closestWindow", () => {
  it("finds the sentence inside a longer answer", () => {
    const { distance } = closestWindow("padding here. needle. trailing", "needle.", 2);
    expect(distance).toBe(0);
  });

  it("tolerates a one-character difference", () => {
    const { distance } = closestWindow("padding needlz. trailing", "needle.", 2);
    expect(distance).toBe(1);
  });
});

describe("checkRefusal", () => {
  it("reports an untouched refusal as an exact match", () => {
    const result = checkRefusal(`${REFUSAL_SENTENCE} The threshold is not in the documents.`);
    expect(result.match).toBe("exact");
    expect(result.distance).toBe(0);
  });

  it("passes the real transcript's non-breaking hyphen, and says why", () => {
    // The whole point: a naive comparison fails here, on an answer that is a perfect refusal.
    expect(NBSP_HYPHEN_REFUSAL.includes(REFUSAL_SENTENCE)).toBe(false);

    const result = checkRefusal(NBSP_HYPHEN_REFUSAL);
    expect(result.match).toBe("normalized");
    expect(result.note).toContain("U+2011");
  });

  it("separates a tolerance match from an exact one so 100% never quietly means close enough", () => {
    const typo = REFUSAL_SENTENCE.replace("grounded", "groundedd");
    const result = checkRefusal(typo, 2);
    expect(result.match).toBe("tolerance");
    expect(result.distance).toBe(1);
    expect(result.note).toContain("NOT an exact pass");
  });

  it("refuses to tolerate anything at tolerance 0 beyond folding", () => {
    const typo = REFUSAL_SENTENCE.replace("grounded", "groundedd");
    expect(checkRefusal(typo, 0).match).toBe("absent");
    // Folding is not tolerance, so it still passes with the knob at zero.
    expect(checkRefusal(NBSP_HYPHEN_REFUSAL, 0).match).toBe("normalized");
  });

  it("marks a real answer absent and scores its distance from the sentence", () => {
    const result = checkRefusal("The E. coli threshold is 126 CFU/100 mL.");
    expect(result.match).toBe("absent");
    expect(result.similarity).toBeLessThan(0.5);
  });
});

describe("checkCitations", () => {
  it("accepts a marker that resolves to supplied context", () => {
    const result = checkCitations({ answer: "Three weeks【1】.", context: context("line a\nline b") });
    expect(result).toMatchObject({ total: 1, valid: 1 });
  });

  it("flags a citation pointing past the end of the supplied context", () => {
    const result = checkCitations({ answer: "As noted【9】.", context: context("only one chunk") });
    expect(result.valid).toBe(0);
    expect(result.issues[0].reason).toContain("1 chunk(s) were supplied");
  });

  it("flags a line range the cited chunk does not have", () => {
    const result = checkCitations({ answer: "See【1†L1-L40】.", context: context("a\nb\nc") });
    expect(result.valid).toBe(0);
    expect(result.issues[0].reason).toContain("which has 3");
  });

  it("accepts a line range inside the chunk", () => {
    const result = checkCitations({ answer: "See【1†L1-L2】.", context: context("a\nb\nc") });
    expect(result.valid).toBe(1);
  });
});

describe("checkFigures", () => {
  it("passes a figure that appears in the supplied context", () => {
    const result = checkFigures({ answer: "pH ranges 6.5 to 8.5.", context: context("pH 6.5-8.5 normal") });
    expect(result.issues).toHaveLength(0);
  });

  it("flags a figure that appears nowhere in the context", () => {
    const result = checkFigures({ answer: "E. coli above 126 CFU is unsafe.", context: context("no numbers here") });
    expect(result.issues.map((i) => i.value)).toContain("126");
  });

  it("ignores markdown ordinals and citation markers", () => {
    const result = checkFigures({
      answer: "1. Rinse the probe【7†L2-L9】.\n2. Wait.",
      context: context("rinse then wait"),
    });
    expect(result.issues).toHaveLength(0);
  });

  it("matches across thousands separators, in both directions", () => {
    const separated = checkFigures({ answer: "Up to 200,000 uS/cm.", context: context("range 5 - 200000 uS/cm") });
    expect(separated.issues).toHaveLength(0);

    // The direction that actually bit: the system prompt writes `0 to 1,500`, answers write `1500`.
    const plain = checkFigures({
      answer: "Conductivity 0-1500 uS/cm.",
      context: [],
      grounding: ["Conductivity (this deployment is freshwater): 0 to 1,500 µS/cm"],
    });
    expect(plain.issues).toHaveLength(0);
  });

  it("counts the system prompt and the question as grounding, not invention", () => {
    const result = checkFigures({
      answer: "pH 8.4 sits inside the operator range of 6.5 to 8.5.",
      context: [],
      grounding: ["- pH: 6.5 to 8.5", "Is a pH of 8.4 normal?"],
    });
    expect(result.issues).toHaveLength(0);
  });

  it("explains a temperature the decoder converted rather than calling it fabricated", () => {
    // Context holds 25 °C; an answer quoting 77 °F is a conversion, not an invention. The label
    // names the direction that produced the answer's figure from the context's.
    const result = checkFigures({ answer: "It reads 77 degrees.", context: context("water temperature 25 C") });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].explained).toBe("°C→°F");
  });
});
