import {
  FIRST_TURN_REWRITE_SYSTEM_PROMPT,
  REWRITE_HISTORY_MESSAGES,
  REWRITE_MAX_CHARS,
  REWRITE_MESSAGE_CHARS,
  buildRewriteMessages,
  cleanRewrite,
  rewriteQuery,
  type RewriteCompleter,
} from "../../src/retrieval/queryRewrite";
import type { ChatMessage } from "../../src/types/chat.types";

/**
 * The rewrite is retrieval-only and must never fail a question: a first turn makes no call, and
 * any error or unusable output falls back to the user's own message.
 */

const history: ChatMessage[] = [
  { role: "user", content: "The pod below the mine adit reads pH 3.2 and conductivity looks high." },
  { role: "assistant", content: "Low pH raises conductivity because hydrogen ions conduct strongly." },
];

const completer = (content: string): RewriteCompleter & { calls: ChatMessage[][] } => {
  const calls: ChatMessage[][] = [];
  return {
    calls,
    complete: async (messages) => {
      calls.push(messages);
      return { content, usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 } };
    },
  };
};

describe("rewriteQuery", () => {
  it("returns a first turn unchanged without calling the model", async () => {
    const llm = completer("unused");
    const result = await rewriteQuery(llm, "What is ORP?", []);
    expect(result).toEqual({ query: "What is ORP?", rewritten: false });
    expect(llm.calls).toHaveLength(0);
  });

  it("rewrites a first turn with the first-turn prompt when firstTurn is set", async () => {
    const llm = completer("ORP definition oxidation-reduction potential");
    const result = await rewriteQuery(llm, "What is ORP?", [], { firstTurn: true });
    expect(result).toMatchObject({ query: "ORP definition oxidation-reduction potential", rewritten: true });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0][0].content).toBe(FIRST_TURN_REWRITE_SYSTEM_PROMPT);
  });

  it("searches with the rewrite on a follow-up and reports its usage", async () => {
    const llm = completer("pH buffer calibration accuracy at pH 3 in acid mine drainage\n");
    const result = await rewriteQuery(llm, "Are our normal buffers even good down there?", history);
    expect(result.query).toBe("pH buffer calibration accuracy at pH 3 in acid mine drainage");
    expect(result.rewritten).toBe(true);
    expect(result.usage?.totalTokens).toBe(120);
    expect(llm.calls).toHaveLength(1);
  });

  it("falls back to the original message when the model throws", async () => {
    const llm: RewriteCompleter = { complete: async () => { throw new Error("502"); } };
    const result = await rewriteQuery(llm, "And the buffers?", history);
    expect(result).toEqual({ query: "And the buffers?", rewritten: false });
  });

  it("falls back to the original message on empty or overlong output", async () => {
    await expect(rewriteQuery(completer("  \n "), "And the buffers?", history))
      .resolves.toMatchObject({ query: "And the buffers?", rewritten: false });
    await expect(rewriteQuery(completer("x".repeat(REWRITE_MAX_CHARS + 1)), "And the buffers?", history))
      .resolves.toMatchObject({ query: "And the buffers?", rewritten: false });
  });

  it("ignores history that holds only system or tool messages", async () => {
    const llm = completer("unused");
    const result = await rewriteQuery(llm, "What is ORP?", [{ role: "system", content: "x" }]);
    expect(result.rewritten).toBe(false);
    expect(llm.calls).toHaveLength(0);
  });
});

describe("buildRewriteMessages", () => {
  it("keeps only the most recent user and assistant messages, clipped", () => {
    const long: ChatMessage[] = Array.from({ length: 6 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn ${i} ${"y".repeat(REWRITE_MESSAGE_CHARS)}`,
    }));
    const [system, user] = buildRewriteMessages("latest?", long);
    expect(system.role).toBe("system");
    expect(user.content).not.toContain("turn 1 ");
    expect(user.content).toContain(`turn ${6 - REWRITE_HISTORY_MESSAGES} `);
    expect(user.content).toContain("…");
    expect(user.content).toContain("Latest message:\nlatest?");
  });
});

describe("cleanRewrite", () => {
  it("takes the first non-empty line and strips wrapping quotes", () => {
    expect(cleanRewrite('\n"ORP drift with steady DO"\nbecause...')).toBe("ORP drift with steady DO");
  });
});
