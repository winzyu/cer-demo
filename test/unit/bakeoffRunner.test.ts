import { SPOT_CHECK_QUERIES, parseArgs } from "../../src/eval/cli";
import {
  ArmMismatchError,
  replayAll,
  replayFixture,
  summarize,
} from "../../src/eval/runner";
import type { AskFn, AskResult } from "../../src/eval/runner";
import { totalsFor, transcriptPath } from "../../src/eval/transcript";
import type { TranscriptRunMeta, TranscriptTurn } from "../../src/eval/transcript";
import { parseSseChunk } from "../../src/eval/transport";
import type { LoadedFixture } from "../../src/eval/types";

const run: TranscriptRunMeta = {
  startedAt: "2026-07-30T00:00:00.000Z",
  gitSha: "abc123",
  model: "test-model",
  temperature: 0,
  maxTokens: 4096,
  corpusSource: "artifact",
  baseUrl: "http://localhost:8000/api/v1",
  transport: "sse",
  cacheReportingAvailable: true,
};

const fixture = (id: string, questions: string[]): LoadedFixture => ({
  id,
  class: "definitional",
  expected_to_favor: "tie",
  answerable_from: [],
  requires: [],
  notes: "test fixture",
  turns: questions.map((content) => ({
    role: "user" as const,
    content,
    rubric: { must_contain: ["x"], must_not: [] },
  })),
  sliceCoverage: "none",
  runnable: true,
});

const answerWith = (overrides: Partial<AskResult> = {}): AskFn => async ({ query }) => ({
  answer: `answer to ${query}`,
  mode: "firestore-direct",
  context: [{ id: "c1", text: "context text", source: "doc.pdf" }],
  usage: { promptTokens: 100, completionTokens: 10, cachedPromptTokens: 80 },
  ttftMs: 50,
  wallMs: 200,
  ...overrides,
});

const options = { arm: "firestore-direct", pass: "warm" as const, run };

describe("replayFixture", () => {
  it("sends prior turns as history and never replays them as new questions", async () => {
    const seen: { query: string; history: unknown[] }[] = [];
    const ask: AskFn = async (request) => {
      seen.push({ query: request.query, history: request.history });
      return (await answerWith()(request));
    };

    await replayFixture(fixture("f1", ["first?", "second?", "third?"]), ask, options);

    expect(seen.map((s) => s.query)).toEqual(["first?", "second?", "third?"]);
    // Turn N sees 2*(N) prior messages: each earlier turn contributes a user and an assistant.
    expect(seen.map((s) => s.history.length)).toEqual([0, 2, 4]);
    expect(seen[2].history).toEqual([
      { role: "user", content: "first?" },
      { role: "assistant", content: "answer to first?" },
      { role: "user", content: "second?" },
      { role: "assistant", content: "answer to second?" },
    ]);
  });

  it("captures the exact context supplied to the model", async () => {
    // Without this field groundedness cannot be graded at all — an invented claim is
    // indistinguishable from a supported one.
    const transcript = await replayFixture(fixture("f1", ["q?"]), answerWith(), options);

    expect(transcript.turns[0].context).toEqual([
      { id: "c1", text: "context text", source: "doc.pdf" },
    ]);
  });

  it("aborts when the service answers as a different arm", async () => {
    // The registry *ignores* an override when DEBUG_RETRIEVAL is false rather than rejecting it,
    // so without this guard the sweep records the default arm three times and looks fine.
    const ask = answerWith({ mode: "stub" });

    await expect(replayFixture(fixture("f1", ["q?"]), ask, options))
      .rejects.toThrow(ArmMismatchError);
  });

  it("mentions DEBUG_RETRIEVAL in the mismatch error", async () => {
    await expect(replayFixture(fixture("f1", ["q?"]), answerWith({ mode: "stub" }), options))
      .rejects.toThrow(/DEBUG_RETRIEVAL/);
  });

  it("records a failed turn and stops the conversation", async () => {
    let calls = 0;
    const ask: AskFn = async (request) => {
      calls += 1;
      if (calls === 2) throw new Error("HTTP 502");
      return answerWith()(request);
    };

    const transcript = await replayFixture(fixture("f1", ["a?", "b?", "c?"]), ask, options);

    // Turn 3's history would have to contain an answer that never existed.
    expect(transcript.turns).toHaveLength(2);
    expect(transcript.turns[1].error).toBe("HTTP 502");
    expect(transcript.turns[1].answer).toBe("");
    expect(calls).toBe(2);
  });

  it("stamps arm, pass and run metadata onto the transcript", async () => {
    const transcript = await replayFixture(fixture("f1", ["q?"]), answerWith(), options);

    expect(transcript).toMatchObject({
      fixtureId: "f1", arm: "firestore-direct", pass: "warm",
    });
    expect(transcript.run.gitSha).toBe("abc123");
    expect(transcript.run.temperature).toBe(0);
  });
});

describe("replayAll", () => {
  it("replays in a stable id order regardless of input order", async () => {
    const order: string[] = [];
    const ask: AskFn = async (request) => {
      order.push(request.query);
      return answerWith()(request);
    };

    await replayAll([fixture("zebra", ["z?"]), fixture("alpha", ["a?"])], ask, options);

    // Same order for every arm and every pass, or the passes are not comparable.
    expect(order).toEqual(["a?", "z?"]);
  });
});

describe("totalsFor", () => {
  const turn = (usage?: TranscriptTurn["usage"]): TranscriptTurn => ({
    index: 0, question: "q", answer: "a", context: [], mode: "m", usage, timing: { wallMs: 10 },
  });

  it("sums reported token counts", () => {
    const totals = totalsFor([
      turn({ promptTokens: 100, completionTokens: 5, cachedPromptTokens: 60 }),
      turn({ promptTokens: 200, completionTokens: 7, cachedPromptTokens: 150 }),
    ]);

    expect(totals).toMatchObject({
      promptTokens: 300, completionTokens: 12, cachedPromptTokens: 210, wallMs: 20,
    });
  });

  it("leaves cached tokens undefined when nothing reported them", () => {
    // Summing to 0 would manufacture a 0% cache hit rate — the conclusion that sinks
    // direct-feed — out of an absence of data.
    const totals = totalsFor([turn({ promptTokens: 100, completionTokens: 5 })]);

    expect(totals.cachedPromptTokens).toBeUndefined();
    expect(totals.promptTokens).toBe(100);
  });
});

describe("summarize", () => {
  const transcriptWith = (turns: TranscriptTurn[]) => ({
    fixtureId: "f", fixtureClass: "definitional", arm: "a", pass: "cold" as const, run, turns, totals: totalsFor(turns),
  });
  const goodTurn: TranscriptTurn = {
    index: 0,
    question: "q",
    answer: "a",
    context: [{ id: "c", text: "t", source: "s" }],
    mode: "a",
    usage: { promptTokens: 100, completionTokens: 5, cachedPromptTokens: 0 },
    timing: { wallMs: 10 },
  };

  it("warns when no cached-token data came back at all", () => {
    const turns = [{ ...goodTurn, usage: { promptTokens: 100, completionTokens: 5 } }];
    const summary = summarize([transcriptWith(turns)], "cold");

    expect(summary.cachedPromptTokens).toBeUndefined();
    expect(summary.cacheHitRate).toBeUndefined();
    expect(summary.warnings.join(" ")).toMatch(/NOT a 0% cache hit rate/);
  });

  it("warns when a cold pass was served from cache", () => {
    const turns = [{ ...goodTurn, usage: { promptTokens: 100, completionTokens: 5, cachedPromptTokens: 90 } }];
    const summary = summarize([transcriptWith(turns)], "cold");

    expect(summary.warnings.join(" ")).toMatch(/labelled "cold" but 90 prompt tokens/);
  });

  it("warns when a turn was answered with empty context", () => {
    // A misconfigured adapter returning nothing produces a clean-looking, meaningless dataset.
    const summary = summarize([transcriptWith([{ ...goodTurn, context: [] }])], "warm");

    expect(summary.warnings.join(" ")).toMatch(/EMPTY context/);
  });

  it("warns about failed turns", () => {
    const summary = summarize([transcriptWith([{ ...goodTurn, error: "boom" }])], "warm");

    expect(summary.failedTurns).toBe(1);
    expect(summary.warnings.join(" ")).toMatch(/1 turn\(s\) failed/);
  });

  it("is silent on a clean warm run", () => {
    const summary = summarize([transcriptWith([goodTurn])], "warm");

    expect(summary.warnings).toEqual([]);
    expect(summary.cacheHitRate).toBe(0);
  });
});

describe("parseSseChunk", () => {
  it("parses complete frames and holds the partial one back", () => {
    const { events, rest } = parseSseChunk(
      "event: meta\ndata: {\"mode\":\"stub\"}\n\nevent: token\ndata: {\"text\":\"hi\"}\n\nevent: to",
    );

    expect(events).toEqual([
      { event: "meta", data: { mode: "stub" } },
      { event: "token", data: { text: "hi" } },
    ]);
    // Buffering the tail is what stops a split `done` frame from vanishing along with the
    // token counts it carries.
    expect(rest).toBe("event: to");
  });

  it("drops an unparseable frame without killing the sweep", () => {
    const { events } = parseSseChunk("event: token\ndata: {broken\n\nevent: end\ndata: {}\n\n");

    expect(events).toEqual([{ event: "end", data: {} }]);
  });
});

describe("parseArgs", () => {
  it("requires an arm and a pass", () => {
    expect(() => parseArgs([])).toThrow(/--arm is required/);
    expect(() => parseArgs(["--arm=stub"])).toThrow(/--pass is required/);
  });

  it("rejects an unknown pass or transport", () => {
    expect(() => parseArgs(["--arm=stub", "--pass=lukewarm"])).toThrow(/--pass must be one of/);
    expect(() => parseArgs(["--arm=stub", "--pass=cold", "--transport=carrier-pigeon"]))
      .toThrow(/--transport must be one of/);
  });

  it("defaults to the streaming transport so TTFT is captured", () => {
    expect(parseArgs(["--arm=stub", "--pass=cold"]).transport).toBe("sse");
  });

  it("lets a spot check run without a pass", () => {
    expect(parseArgs(["--arm=stub", "--spot-check"]).spotCheck).toBe(true);
  });

  it("reports every argument problem at once", () => {
    let message = "";
    try {
      parseArgs(["--pass=tepid", "--transport=fax"]);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/--arm is required/);
    expect(message).toMatch(/--pass must be one of/);
    expect(message).toMatch(/--transport must be one of/);
  });

  it("parses the remaining options", () => {
    const args = parseArgs([
      "--arm=pgvector-rag", "--pass=warm", "--base-url=http://x/api/v1",
      "--out=tmp", "--only=definitional-orp", "--dry-run",
    ]);

    expect(args).toMatchObject({
      arm: "pgvector-rag",
      pass: "warm",
      baseUrl: "http://x/api/v1",
      outDir: "tmp",
      only: "definitional-orp",
      dryRun: true,
    });
  });
});

describe("spot-check probes", () => {
  it("covers in-slice, out-of-slice and refusal cases", () => {
    // Three probes that fail loudly rather than plausibly if the adapter is misconfigured.
    expect(SPOT_CHECK_QUERIES).toHaveLength(3);
  });
});

describe("transcriptPath", () => {
  it("separates passes and arms so they can never be blended", () => {
    expect(transcriptPath("firestore-direct", "cold", "definitional-orp"))
      .toBe("cold/firestore-direct/definitional-orp.json");
  });
});
