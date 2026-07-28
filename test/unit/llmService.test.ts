import type OpenAI from "openai";
import { LlmService } from "../../src/services/LlmService";
import type { ChatMessage } from "../../src/types/chat.types";
import { config } from "../../src/config";

const messages: ChatMessage[] = [
  { role: "system", content: "system" },
  { role: "user", content: "what is ORP?" },
];

/** Minimal stand-in for the SDK surface LlmService actually touches. */
const fakeClient = (
  create: jest.Mock,
): OpenAI => ({ chat: { completions: { create } } }) as unknown as OpenAI;

const okResponse = (content: string) => ({
  choices: [{ message: { content } }],
  model: "accounts/fireworks/models/gpt-oss-20b",
  usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
});

describe("LlmService.complete", () => {
  const originalModel = config.fireworks.chatModel;

  beforeAll(() => {
    // config is frozen; the nested object is not, so the model can be set for these tests.
    (config.fireworks as { chatModel?: string }).chatModel = "test-model";
  });

  afterAll(() => {
    (config.fireworks as { chatModel?: string }).chatModel = originalModel;
  });

  it("returns the model's answer", async () => {
    const create = jest.fn().mockResolvedValue(okResponse("ORP is measured in mV."));
    const service = new LlmService(fakeClient(create));

    const answer = await service.complete(messages);

    expect(answer.content).toBe("ORP is measured in mV.");
    expect(answer.usage?.totalTokens).toBe(120);
  });

  it("sends the model, messages, max_tokens, and the cache-affinity user field", async () => {
    const create = jest.fn().mockResolvedValue(okResponse("ok"));
    const service = new LlmService(fakeClient(create));

    await service.complete(messages);

    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0][0];

    expect(params.model).toBe("test-model");
    expect(params.messages).toEqual(messages);
    expect(params.max_tokens).toBe(config.fireworks.maxTokens);
    // Required for serverless prompt-cache affinity — dropping it silently kills cache hits.
    expect(params.user).toBe(config.fireworks.user);
    expect(params.stream).toBe(false);
  });

  it("offers no tools — retrieval runs before the call", async () => {
    const create = jest.fn().mockResolvedValue(okResponse("ok"));
    await new LlmService(fakeClient(create)).complete(messages);

    expect(create.mock.calls[0][0].tools).toBeUndefined();
  });

  it("throws a 502 with a diagnosis when the model returns an empty answer", async () => {
    // The documented gpt-oss failure: the call succeeds, the answer is blank.
    const create = jest.fn().mockResolvedValue(okResponse("   "));
    const service = new LlmService(fakeClient(create));

    await expect(service.complete(messages)).rejects.toMatchObject({ statusCode: 502 });
    await expect(service.complete(messages)).rejects.toThrow(/LLM_MAX_TOKENS/);
  });

  it("throws a 503 when LLM_MODEL is not configured", async () => {
    (config.fireworks as { chatModel?: string }).chatModel = undefined;
    const create = jest.fn();

    try {
      await expect(
        new LlmService(fakeClient(create)).complete(messages),
      ).rejects.toMatchObject({ statusCode: 503 });
      expect(create).not.toHaveBeenCalled();
    } finally {
      (config.fireworks as { chatModel?: string }).chatModel = "test-model";
    }
  });

  it("propagates SDK failures rather than swallowing them", async () => {
    const create = jest.fn().mockRejectedValue(new Error("upstream exploded"));

    await expect(new LlmService(fakeClient(create)).complete(messages)).rejects.toThrow(
      "upstream exploded",
    );
  });
});

/** Mimics the SDK's streamed chunk shape. */
const streamOf = async function* streamOf(
  parts: unknown[],
): AsyncGenerator<unknown> {
  for (const part of parts) {
    yield part;
  }
};

const delta = (content: string) => ({
  choices: [{ delta: { content } }],
  model: "test-model",
});

describe("LlmService.completeStream", () => {
  const originalModel = config.fireworks.chatModel;

  beforeAll(() => {
    (config.fireworks as { chatModel?: string }).chatModel = "test-model";
  });

  afterAll(() => {
    (config.fireworks as { chatModel?: string }).chatModel = originalModel;
  });

  const collect = async (parts: unknown[]) => {
    const create = jest.fn().mockResolvedValue(streamOf(parts));
    const service = new LlmService(fakeClient(create));
    const events = [];
    // eslint-disable-next-line no-restricted-syntax
    for await (const event of service.completeStream(messages)) {
      events.push(event);
    }
    return { events, create };
  };

  it("yields text deltas in order", async () => {
    const { events } = await collect([delta("ORP "), delta("is "), delta("mV.")]);

    expect(events.map((e) => e.text).join("")).toBe("ORP is mV.");
  });

  it("requests a stream and asks for usage", async () => {
    const { create } = await collect([delta("hi")]);
    const params = create.mock.calls[0][0];

    expect(params.stream).toBe(true);
    expect(params.stream_options).toEqual({ include_usage: true });
    // Cache affinity must be set on the streaming path too.
    expect(params.user).toBe(config.fireworks.user);
  });

  it("passes an abort signal through so a disconnect stops generation", async () => {
    const create = jest.fn().mockResolvedValue(streamOf([delta("hi")]));
    const controller = new AbortController();
    const service = new LlmService(fakeClient(create));

    // eslint-disable-next-line no-restricted-syntax
    for await (const _ of service.completeStream(messages, controller.signal)) {
      // drain
    }

    expect(create.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });

  it("emits usage when the provider sends it", async () => {
    const { events } = await collect([
      delta("hi"),
      { choices: [], model: "test-model", usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } },
    ]);

    expect(events[events.length - 1].usage?.totalTokens).toBe(12);
  });

  it("tolerates a provider that never sends usage", async () => {
    const { events } = await collect([delta("hi")]);

    expect(events.every((e) => e.usage === undefined)).toBe(true);
  });

  it("throws a 502 when the stream produces no visible text", async () => {
    const create = jest.fn().mockResolvedValue(streamOf([{ choices: [{ delta: {} }] }]));
    const service = new LlmService(fakeClient(create));

    await expect(async () => {
      // eslint-disable-next-line no-restricted-syntax
      for await (const _ of service.completeStream(messages)) {
        // drain
      }
    }).rejects.toMatchObject({ statusCode: 502 });
  });
});
