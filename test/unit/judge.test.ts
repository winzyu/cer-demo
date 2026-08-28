/**
 * Guards the Tier-2 judge harness (`RETRIEVAL_BAKEOFF.md` §7b / §8b).
 *
 * Everything here is offline. The one thing this harness does that costs money — calling a model
 * — is the one thing not exercised; what is tested is everything that decides *whether* a call is
 * made, what it is asked, and what its answer is then allowed to mean. A parser that silently
 * defaults a missing score, or a gate that averages a non-servable class into an arm's mean,
 * would move a pre-registered threshold without anyone seeing it happen.
 */
import fs from "fs";
import os from "os";
import path from "path";
import {
  citationsPrompt,
  correctnessPrompt,
  needsGroundingForCorrectness,
  parseVerdict,
  ungroundedPrompt,
  type JudgeEvidence,
} from "../../src/eval/judge/prompts";
import {
  budgetOf,
  buildTasks,
  isServable,
  judgesOwnFamily,
  summarize,
  type JudgeRecord,
} from "../../src/eval/judge/runner";
import {
  agreementFor,
  calibrate,
  cohensKappa,
  findStaleRows,
  gradingSets,
  readHumanRows,
  readPacketAnswers,
} from "../../src/eval/judge/calibrate";

const evidence = (overrides: Partial<JudgeEvidence> = {}): JudgeEvidence => ({
  question: "What is the hypoxia threshold?",
  answer: "Below 2 mg/L is hypoxic 【1】.",
  rubric: { must_contain: ["states the 2 mg/L threshold"], must_not: ["invents a range"] },
  context: [{ id: "source-of-truth.pdf", text: "Hypoxia begins below 2 mg/L." }],
  systemPrompt: "AUTHORITATIVE NORMAL RANGES:\n- pH: 6.5 to 8.5",
  history: [],
  ...overrides,
});

const record = (over: Partial<JudgeRecord>): JudgeRecord => ({
  arm: "firestore-direct",
  fixtureId: "threshold-do-hypoxia",
  fixtureClass: "threshold-lookup",
  turn: 1,
  dimension: "correctness",
  items: [],
  note: "",
  promptTokens: 100,
  completionTokens: 10,
  model: "judge",
  judgedAt: "2026-08-25T00:00:00.000Z",
  ...over,
});

describe("judge prompts — blinding", () => {
  it("names no arm, so the judge cannot form a per-strategy impression", () => {
    // §7b's blinding requirement. The judge sees one answer per call with no sibling to compare
    // against, which is stronger than the human packet's shuffled A/B/C — but only as long as
    // nothing leaks the identity into the text.
    const arms = ["firestore-direct", "firestore-vector", "pgvector-rag", "hybrid-slice-lexvec"];
    [correctnessPrompt(evidence()), ungroundedPrompt(evidence())].forEach((prompt) => {
      arms.forEach((arm) => expect(prompt).not.toContain(arm));
      expect(prompt).not.toMatch(/retrieval strategy|which system|arm [ABC]/i);
    });
  });

  it("withholds the retrieval context from correctness when the rubric does not need it", () => {
    // Correctness is scored against the rubric, not the source text (GRADING_GUIDE §3), and
    // shipping ~11K tokens of slice to a dimension that must not use it is paid error.
    const plain = evidence({
      rubric: { must_contain: ["states the 2 mg/L threshold"], must_not: ["declares the water safe"] },
    });
    expect(correctnessPrompt(plain)).not.toContain("Hypoxia begins below 2 mg/L");
    expect(ungroundedPrompt(plain)).toContain("Hypoxia begins below 2 mg/L");
  });

  it("supplies it when a must_not asks whether the answer invented something", () => {
    // The defect the first calibration found: the judge scored two arms 0 for "inventing" the
    // >100 TU row of Table 6.8-5, which is verbatim in the source it was not shown.
    const invention = evidence({
      rubric: { must_contain: ["reproduces the table"], must_not: ["invents numeric criteria"] },
    });
    const prompt = correctnessPrompt(invention);
    expect(prompt).toContain("Hypoxia begins below 2 mg/L");
    expect(prompt).toMatch(/was NOT invented/);
    // ...and is still told not to re-grade truth against them, which is a different measurement.
    expect(prompt).toMatch(/entirely true and still miss the\s+rubric's points/);
  });

  it("gives groundedness the system prompt, not just the retrieved chunks", () => {
    // The ~24-false-positives-per-arm trap from §8b: operator ranges live in the system prompt,
    // and a judge told "context only" reports them as invented.
    expect(ungroundedPrompt(evidence())).toContain("AUTHORITATIVE NORMAL RANGES");
  });

  it("tells the judge a previous assistant answer is not grounding", () => {
    const prompt = ungroundedPrompt(evidence({
      history: [{ question: "and before?", answer: "The threshold is 9.9 mg/L." }],
    }));
    expect(prompt).toContain("The threshold is 9.9 mg/L.");
    expect(prompt).toMatch(/ASSISTANT answer is NOT grounding/);
  });
});

describe("refusals are graded on behaviour, not phrasing", () => {
  it("tells the judge that a paraphrased refusal satisfies a refusal rubric in full", () => {
    // The judge scored correctness 1 where the human scored 2, on a refusal that named the
    // missing information without using REFUSAL_SENTENCE verbatim. Tier 1 already passes that
    // answer (§8b vetoes on answering, not on wording), so the judge was stricter than the
    // pre-registration it implements.
    const prompt = correctnessPrompt(evidence({
      rubric: {
        must_contain: ["refuses to answer, in any wording"],
        must_not: ["gives a CFU/100 mL threshold"],
      },
    }));

    expect(prompt).toMatch(/Wording is not part of a refusal rubric/);
    expect(prompt).toMatch(/service's standard refusal sentence/);
  });

  it("leaves no live fixture demanding the exact refusal sentence", () => {
    // The rule above and the rubric text the judge is shown have to agree. A rubric still saying
    // "the exact refusal sentence" would contradict the instruction in the same prompt, and the
    // judge would be entitled to follow either.
    const raw = fs.readdirSync("eval/fixtures")
      .filter((name) => name.endsWith(".json"))
      .map((name) => fs.readFileSync(path.join("eval/fixtures", name), "utf8"));

    raw.forEach((text) => expect(text).not.toContain("exact refusal sentence"));
    expect(raw.some((text) => text.includes("refuses to answer"))).toBe(true);
  });
});

describe("correctness grounding predicate", () => {
  it("fires on the fixtures' invention-flavoured must_not items", () => {
    ["invents numeric criteria", "fabricates a reading", "invents a range not in the context",
      "answers from general knowledge", "describes an optical arrangement absent from the corpus",
    ].forEach((item) => {
      expect(needsGroundingForCorrectness({ must_contain: [], must_not: [item] })).toBe(true);
    });
  });

  it("does not fire on must_not items decidable from the answer alone", () => {
    // 85 of the fixtures' 110 distinct must_not items are these, and they stay cheap.
    ["declares the reading normal", "concludes saltwater intrusion", "asserts one cause with certainty",
      "answers only in % saturation with no mg/L figure",
    ].forEach((item) => {
      expect(needsGroundingForCorrectness({ must_contain: [], must_not: [item] })).toBe(false);
    });
  });

  it("is false when there is no must_not list at all", () => {
    expect(needsGroundingForCorrectness({ must_contain: ["x"], must_not: [] })).toBe(false);
  });
});

describe("citation support — judged per document, not per line range", () => {
  // Cohen's kappa was -0.06 before this: every disagreement was the judge calling a marker
  // invalid because the cited chunk's first lines are introductory, while the claim sat further
  // down the same file. GRADING_GUIDE §3 and §8a both say *document*, never line span.
  const twoChunksOneDoc = evidence({
    context: [
      { id: "source-of-truth.pdf", text: "Title. Scope. Core principle." },
      { id: "source-of-truth.pdf", text: "Hypoxia begins below 2 mg/L." },
      { id: "other.pdf", text: "Unrelated." },
    ],
  });

  it("groups every marker drawn from one document under that document", () => {
    const prompt = citationsPrompt(twoChunksOneDoc);
    expect(prompt).toMatch(/DOCUMENT: source-of-truth\.pdf\ncited by marker\(s\): \[1\] \[2\]/);
    expect(prompt).toMatch(/DOCUMENT: other\.pdf\ncited by marker\(s\): \[3\]/);
    // Both chunks' text has to be present under the one heading, or the grouping is cosmetic.
    expect(prompt).toContain("Title. Scope. Core principle.");
    expect(prompt).toContain("Hypoxia begins below 2 mg/L.");
  });

  it("tells the judge to ignore line numbers and why a wrong range is still valid", () => {
    const prompt = citationsPrompt(twoChunksOneDoc);
    expect(prompt).toMatch(/\*\*Ignore the line numbers\.\*\*/);
    expect(prompt).toMatch(/wrong line range is\s+valid/);
  });

  it("still fails a marker naming the wrong document", () => {
    // The hole in "pass it if the evidence exists anywhere in the context": that would score a
    // citation valid when the claim is in a different file, which is the defect being measured.
    expect(citationsPrompt(twoChunksOneDoc))
      .toMatch(/supported\s+instead by a DIFFERENT document/);
  });
});

describe("judge prompts — parsing", () => {
  it("reads a score out of a fenced reply", () => {
    const verdict = parseVerdict("correctness", '```json\n{"score": 2, "reason": "all points"}\n```');
    expect(verdict.score).toBe(2);
    expect(verdict.note).toBe("all points");
  });

  it("throws rather than defaulting when the score is missing or out of range", () => {
    // A defaulted grade is a fabricated one, and this feeds a pre-registered gate.
    expect(() => parseVerdict("correctness", '{"reason": "good"}')).toThrow(/expected 0, 1 or 2/);
    expect(() => parseVerdict("correctness", '{"score": 5}')).toThrow(/expected 0, 1 or 2/);
    expect(() => parseVerdict("correctness", "the answer was fine")).toThrow(/no JSON object/);
  });

  it("counts enumerated claims rather than trusting a stated number", () => {
    const verdict = parseVerdict(
      "ungrounded",
      '{"count": 9, "claims": [{"claim": "2-4 mg/L band", "why": "absent from context"}]}',
    );
    expect(verdict.items).toHaveLength(1);
    expect(verdict.note).toContain("2-4 mg/L band");
  });

  it("strips commas from notes, which would otherwise break the score CSV", () => {
    const verdict = parseVerdict(
      "citations",
      '{"invalid": [{"marker": "【6】", "why": "says 90%, not 95%"}]}',
    );
    expect(verdict.note).not.toContain(",");
  });

  it("accepts an empty finding list as a clean verdict", () => {
    expect(parseVerdict("ungrounded", '{"claims": []}').items).toHaveLength(0);
  });

  it("throws when the list the dimension needs is absent", () => {
    expect(() => parseVerdict("ungrounded", '{"score": 2}')).toThrow(/no "claims" array/);
  });
});

describe("judge task building", () => {
  const tasks = buildTasks({ pass: "warm", arms: ["firestore-direct"], only: ["refusal-pathogens"] });

  it("emits one call per dimension per turn, one dimension at a time", () => {
    const correctness = tasks.filter((t) => t.dimension === "correctness");
    expect(correctness).toHaveLength(2);
    expect(new Set(tasks.map((t) => t.dimension)).size).toBeGreaterThan(1);
  });

  it("skips the citation call when the answer cited nothing", () => {
    // Not a shortcut: an empty `invalid` list is the only verdict such a call can return, and
    // it is not free. `refusal-pathogens` refuses both turns and cites nothing.
    expect(tasks.filter((t) => t.dimension === "citations")).toHaveLength(0);
  });

  it("carries the captured context and the earlier turns into the evidence", () => {
    const turn2 = tasks.find((t) => t.turn === 2 && t.dimension === "ungrounded");
    expect(turn2!.evidence.history).toHaveLength(1);
    expect(turn2!.evidence.systemPrompt).toContain("AUTHORITATIVE NORMAL RANGES");
  });
});

describe("Tier-2 gate arithmetic", () => {
  it("exempts deep-in-manual from direct-feed only — §8a's servable set", () => {
    expect(isServable("firestore-direct", "deep-in-manual")).toBe(false);
    expect(isServable("firestore-direct", "threshold-lookup")).toBe(true);
    // The hybrid arm's slice is an addition to whole-corpus retrieval, not a limit on it.
    expect(isServable("hybrid-slice-lexvec", "deep-in-manual")).toBe(true);
    expect(isServable("firestore-vector", "deep-in-manual")).toBe(true);
  });

  it("keeps a non-servable class out of the arm's mean instead of dragging it down", () => {
    const results = summarize([
      record({ fixtureClass: "threshold-lookup", score: 2 }),
      record({ fixtureClass: "threshold-lookup", turn: 2, score: 2 }),
      record({ fixtureId: "deepmanual-x", fixtureClass: "deep-in-manual", score: 0 }),
    ], "warm");
    expect(results[0].correctness.overall).toBe(2);
    expect(results[0].correctness.met).toBe(true);
    expect(results[0].correctness.perClass.find((c) => c.class === "deep-in-manual")!.servable)
      .toBe(false);
    // Still reported — the exemption is a coverage cost, not an invisible one.
    expect(results[0].correctness.coverage).toBeLessThan(1);
  });

  it("fails an arm below 1.0 in any single servable class, however good the rest", () => {
    const results = summarize([
      record({ fixtureClass: "threshold-lookup", score: 2 }),
      record({ fixtureClass: "definitional", score: 2 }),
      record({ fixtureId: "acronym-x", fixtureClass: "acronym-exact-token", score: 0 }),
    ], "warm");
    expect(results[0].correctness.overall).toBeGreaterThan(1.3);
    expect(results[0].correctness.met).toBe(false);
  });

  it("thresholds ungrounded claims on turns carrying one, not on the claim count", () => {
    const clean = Array.from({ length: 57 }, (_, i) => record({
      turn: i + 1, dimension: "ungrounded", count: 0,
    }));
    const onePerTurn = summarize([...clean, record({
      turn: 58, dimension: "ungrounded", count: 6,
    })], "warm");
    // One turn in 58 is 1.7% — under the 2% ceiling even though it carries six claims.
    expect(onePerTurn[0].ungrounded.totalClaims).toBe(6);
    expect(onePerTurn[0].ungrounded.met).toBe(true);

    const twoTurns = summarize([...clean.slice(0, 56), record({
      turn: 57, dimension: "ungrounded", count: 1,
    }), record({ turn: 58, dimension: "ungrounded", count: 1 })], "warm");
    expect(twoTurns[0].ungrounded.met).toBe(false);
  });

  it("reports citation support without gating on it — Tier 1 owns that gate", () => {
    const results = summarize([
      record({ score: 2 }),
      record({ dimension: "citations", count: 4 }),
    ], "warm");
    expect(results[0].citationSupport.unsupported).toBe(4);
    expect(results[0].gatesMet).toBe(true);
  });
});

describe("judge family caveat", () => {
  it("spots that the chosen judge shares a family with the model under test", () => {
    // gpt-oss-120b was picked over a cross-family judge because it is the only non-under-test
    // model in prices.ts with a dated rate. That is a limitation of the quality claim, so the
    // run has to say it out loud rather than leave it to whoever writes the report.
    expect(judgesOwnFamily(
      "accounts/fireworks/models/gpt-oss-120b",
      "accounts/fireworks/models/gpt-oss-20b",
    )).toBe(true);
  });

  it("does not flag a genuinely different family", () => {
    expect(judgesOwnFamily(
      "accounts/fireworks/models/qwen3-235b-a22b-instruct-2507",
      "accounts/fireworks/models/gpt-oss-20b",
    )).toBe(false);
    expect(judgesOwnFamily(
      "accounts/fireworks/models/deepseek-v3",
      "accounts/fireworks/models/gpt-oss-20b",
    )).toBe(false);
  });
});

describe("judge budget", () => {
  it("leaves the dollar figure undefined for a model absent from the dated price sheet", () => {
    // §10.4 requires the date a price was read. A guessed rate in a cost report is worse than
    // a gap in one.
    expect(budgetOf([record({})], "accounts/fireworks/models/not-priced").usd).toBeUndefined();
    expect(budgetOf([record({})], "accounts/fireworks/models/gpt-oss-20b").usd)
      .toBeCloseTo((100 / 1e6) * 0.07 + (10 / 1e6) * 0.3);
  });
});

describe("calibration against the human sample", () => {
  const gradingRoot = path.join(process.cwd(), "eval", "grading", "warm");
  const rows = readHumanRows(
    path.join(gradingRoot, "scores.csv"),
    path.join(gradingRoot, "KEY.json"),
  );

  it("returns only the graded rows, resolved from label to arm", () => {
    expect(rows).toHaveLength(36);
    rows.forEach((row) => expect(row.arm).not.toBe(""));
    expect(new Set(rows.map((r) => r.fixtureId)).size).toBe(6);
  });

  it("does not read a blank cell as a zero", () => {
    // 36 of 174 rows are graded; counting the blanks as agreement would manufacture the number
    // this whole module exists to report.
    rows.forEach((row) => expect(row.correctness).not.toBeUndefined());
  });

  it("pairs a judge verdict to a human row through the key", () => {
    const target = rows[0];
    const agreement = agreementFor("correctness", rows, [record({
      arm: target.arm,
      fixtureId: target.fixtureId,
      turn: target.turn,
      score: target.correctness,
    })]);
    expect(agreement.pairs).toBe(1);
    expect(agreement.exact).toBe(1);
    expect(agreement.disagreements).toHaveLength(0);
  });

  it("records a disagreement with both sides' reasoning, so the rubric can be fixed", () => {
    const target = rows.find((r) => r.correctness === 2)!;
    const agreement = agreementFor("correctness", rows, [record({
      arm: target.arm,
      fixtureId: target.fixtureId,
      turn: target.turn,
      score: 0,
      note: "judge reason",
    })]);
    expect(agreement.disagreements[0]).toMatchObject({ human: 2, judge: 0, judgeNote: "judge reason" });
    expect(agreement.disagreements[0].humanNote.length).toBeGreaterThan(0);
  });
});

describe("cohensKappa", () => {
  it("is 1 when the raters never disagree, including when both are constant", () => {
    expect(cohensKappa([[0, 0], [1, 1], [2, 2]])).toBe(1);
    expect(cohensKappa([[0, 0], [0, 0]])).toBe(1);
  });

  it("is 0 for a rater that agrees only as often as chance predicts", () => {
    // The reason kappa is reported at all: `invalid_citations` is 0 in 33 of the human's 36
    // rows, so a judge answering "0" unconditionally scores ~92% raw agreement and is useless.
    const alwaysZero: [number, number][] = [
      ...Array.from({ length: 9 }, () => [0, 0] as [number, number]),
      [1, 0],
    ];
    expect(cohensKappa(alwaysZero)).toBe(0);
  });

  it("goes negative when the raters do worse than chance", () => {
    expect(cohensKappa([[0, 1], [1, 0], [0, 1], [1, 0]])).toBeLessThan(0);
  });
});

/**
 * The stale-grade guard. A grading packet is pinned to the transcripts it was built from; when an
 * arm is re-captured, its human rows describe answers that no longer exist. Scoring them anyway
 * once inverted the sign of a real result (`RETRIEVAL_COMPARISON.md` §6.4a), which is why this is
 * an exclusion rather than a warning.
 */
describe("stale human grades", () => {
  const sheet = [
    "# demo",
    "",
    "## Turn 1",
    "",
    "### Rubric",
    "",
    "### Answer A",
    "",
    "The original answer, as graded.",
    "",
    "<sub>Context supplied: 2 chunk(s) from 1 document(s) — x.pdf. Full text: `context/x.txt`</sub>",
    "",
    "### some-source.pdf (chunk abc, score 0.9)",
    "",
    "Chunk text that must NOT be read as part of the answer.",
    "",
    "### Answer B",
    "",
    "A second answer.",
    "",
    "<sub>Context supplied: 0 chunk(s) from 0 document(s) — none. Full text: `context/y.txt`</sub>",
    "",
  ].join("\n");

  it("reads each answer and stops at the context footer", () => {
    const answers = readPacketAnswers(sheet);

    expect(answers.get("1|A")).toBe("The original answer, as graded.");
    expect(answers.get("1|B")).toBe("A second answer.");
    // The chunk dump uses "### <source>" headings too; swallowing it would make every row look
    // stale, which is worse than not checking at all.
    expect(answers.get("1|A")).not.toContain("must NOT be read");
  });

  describe("against transcripts on disk", () => {
    let root: string;
    // Built per test rather than once: a row carries the packet it was graded from, and that
    // path only exists after `beforeEach` has made the temp tree.
    const rows = () => [{
      fixtureId: "demo",
      fixtureClass: "definitional",
      turn: 1,
      label: "A",
      arm: "some-arm",
      correctness: 2,
      notes: "",
      packetDir: path.join(root, "grading", "warm", "packet"),
    }];

    const writeTranscript = (answer: string): void => {
      const dir = path.join(root, "transcripts", "warm", "some-arm");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "demo.json"),
        JSON.stringify({ turns: [{ index: 0, answer }] }),
        "utf8",
      );
    };

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "stale-grades-"));
      const packet = path.join(root, "grading", "warm", "packet");
      fs.mkdirSync(packet, { recursive: true });
      fs.writeFileSync(path.join(packet, "demo.md"), sheet, "utf8");
    });

    const find = () => findStaleRows(
      rows(),
      "warm",
      path.join(root, "transcripts"),
    );

    it("flags a row whose answer was replaced by a re-capture", () => {
      writeTranscript("A completely different answer after re-capturing.");

      const stale = find();
      expect(stale).toHaveLength(1);
      expect(stale[0]).toMatchObject({ fixtureId: "demo", turn: 1, arm: "some-arm" });
      // The excerpts exist so a report can show the divergence rather than assert it.
      expect(stale[0].gradedExcerpt).toContain("original");
      expect(stale[0].currentExcerpt).toContain("different");
    });

    it("does not flag typographic drift — that would be worse than not checking", () => {
      // A non-breaking space where the packet has an ordinary one — the class of difference that
      // made the refusal gate need normalizeForMatch in the first place.
      writeTranscript("The original\u00a0answer, as graded.");

      expect(find()).toHaveLength(0);
    });

    it("does not flag a row it cannot check", () => {
      // No transcript written at all. Absence is not divergence — `unmatched` counts that case.
      expect(find()).toHaveLength(0);
    });

    it("leaves an unchanged answer alone", () => {
      writeTranscript("The original answer, as graded.");

      expect(find()).toHaveLength(0);
    });
  });
});

/**
 * Top-up grading rounds. A sample is not built once: arms get re-captured, and arms get added.
 * Re-grading everything to absorb either would throw away good human judgement, and rebuilding the
 * original packet in place re-labels answers that grades were already written against.
 */
describe("grading rounds", () => {
  let root: string;

  const sheetFor = (answer: string): string => [
    "# demo", "", "## Turn 1", "", "### Answer A", "", answer, "",
    "<sub>Context supplied: 0 chunk(s) from 0 document(s) — none. Full text: `context/x.txt`</sub>",
    "",
  ].join("\n");

  const writeSet = (dir: string, answer: string, score: string, label = "A"): void => {
    fs.mkdirSync(path.join(dir, "packet"), { recursive: true });
    fs.writeFileSync(path.join(dir, "packet", "demo.md"), sheetFor(answer), "utf8");
    fs.writeFileSync(
      path.join(dir, "KEY.json"),
      JSON.stringify({ key: { demo: { [label]: "some-arm" } } }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "scores.csv"),
      "fixture,class,turn,label,correctness_0_1_2,ungrounded_claims,invalid_citations,notes\n"
      + `demo,definitional,1,${label},${score},0,0,\n`,
      "utf8",
    );
  };

  const writeTranscript = (answer: string): void => {
    const dir = path.join(root, "transcripts", "warm", "some-arm");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "demo.json"),
      JSON.stringify({ turns: [{ index: 0, answer }] }),
      "utf8",
    );
  };

  const judged = [{
    arm: "some-arm",
    fixtureId: "demo",
    fixtureClass: "definitional",
    turn: 1,
    dimension: "correctness" as const,
    score: 2,
    note: "",
    items: [],
    promptTokens: 1,
    completionTokens: 1,
    model: "m",
    judgedAt: "2026-08-27T00:00:00.000Z",
  }];

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "grading-rounds-"));
  });

  const gradingRoot = () => path.join(root, "grading");
  const run = () => calibrate(
    "warm",
    judged,
    gradingRoot(),
    path.join(root, "transcripts"),
  );

  it("finds the base packet and every round, base first", () => {
    writeSet(path.join(gradingRoot(), "warm"), "original", "1");
    writeSet(path.join(gradingRoot(), "rounds", "2026-08-27", "warm"), "replacement", "2");

    const sets = gradingSets(gradingRoot(), "warm");
    expect(sets).toHaveLength(2);
    expect(sets[0].scoresPath).toContain(path.join("grading", "warm"));
    expect(sets[1].scoresPath).toContain(path.join("rounds", "2026-08-27"));
  });

  it("lets a round supersede the base row it re-grades", () => {
    // Same arm, fixture and turn — a re-grade. The label differs between packets, which is exactly
    // why the merge key cannot include it.
    writeSet(path.join(gradingRoot(), "warm"), "replacement", "0");
    writeSet(path.join(gradingRoot(), "rounds", "2026-08-27", "warm"), "replacement", "2", "B");
    writeTranscript("replacement");

    const report = run();
    expect(report.humanRows).toBe(1);
    expect(report.stale).toHaveLength(0);
    // The judge said 2; the round says 2 and the base said 0. Agreement proves the round won.
    expect(report.dimensions[0].exact).toBe(1);
  });

  it("clears a stale row once a round re-grades it against the current answer", () => {
    // The base graded text that no longer exists — the firestore-vector situation.
    writeSet(path.join(gradingRoot(), "warm"), "the old answer", "2");
    writeTranscript("the new answer after a re-capture");
    expect(run().stale).toHaveLength(1);

    // A round built from the current transcripts restores the row to the sample.
    writeSet(
      path.join(gradingRoot(), "rounds", "2026-08-27", "warm"),
      "the new answer after a re-capture",
      "2",
      "B",
    );

    const report = run();
    expect(report.stale).toHaveLength(0);
    expect(report.dimensions[0].pairs).toBe(1);
  });
});
