import type OpenAI from "openai";
import { APIError } from "openai";
import { config } from "../../src/config";
import { LlmService } from "../../src/services/LlmService";
import { BUSY_MESSAGE, ModelCallGate } from "../../src/services/modelCallGate";
import type { ChatMessage } from "../../src/types/chat.types";

/** Release plan S4: one retry on a Fireworks 429/503, then "busy"; at most 8 calls at once. */

const providerError = (status: number, retryAfter?: string): APIError => new APIError(
  status,
  { message: "slow down" },
  "slow down",
  new Headers(retryAfter ? { "retry-after": retryAfter } : {}),
);

const gateWith = (over: Partial<ConstructorParameters<typeof ModelCallGate>[0]> = {}) => {
  const sleep = jest.fn(() => Promise.resolve());
  const gate = new ModelCallGate({
    maxConcurrent: 8, queueTimeoutMs: 20_000, retryDelayMs: 2_000, sleep, ...over,
  });
  return { gate, sleep };
};

describe("ModelCallGate retry", () => {
  it.each([429, 503])("retries a Fireworks %i once and returns the second answer", async (status) => {
    const { gate, sleep } = gateWith();
    const call = jest.fn()
      .mockRejectedValueOnce(providerError(status))
      .mockResolvedValueOnce("answer");

    await expect(gate.run(call)).resolves.toBe("answer");
    expect(call).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("answers busy, as a coded 503, when the retry is refused too", async () => {
    const { gate } = gateWith();
    const call = jest.fn().mockRejectedValue(providerError(429));

    await expect(gate.run(call)).rejects.toMatchObject({
      status: 503, code: "model_busy", message: BUSY_MESSAGE,
    });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("waits the provider's short Retry-After, and caps a long one", async () => {
    const short = gateWith();
    await short.gate.run(jest.fn()
      .mockRejectedValueOnce(providerError(429, "3"))
      .mockResolvedValueOnce("ok"));
    expect(short.sleep).toHaveBeenCalledWith(3_000);

    const long = gateWith();
    await long.gate.run(jest.fn()
      .mockRejectedValueOnce(providerError(429, "600"))
      .mockResolvedValueOnce("ok"));
    expect(long.sleep).toHaveBeenCalledWith(10_000);
  });

  it.each([
    ["a provider 400", providerError(400)],
    ["a provider 500", providerError(500)],
    ["our own 503 for a missing key", Object.assign(new Error("FIREWORKS_API_KEY is not configured."), { status: 503 })],
  ])("does not retry %s", async (_label, error) => {
    const { gate } = gateWith();
    const call = jest.fn().mockRejectedValue(error);

    await expect(gate.run(call)).rejects.toBe(error);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("does not retry for a caller who has gone", async () => {
    const { gate } = gateWith();
    const controller = new AbortController();
    controller.abort();
    const call = jest.fn().mockRejectedValue(providerError(429));

    await expect(gate.run(call, controller.signal)).rejects.toBeInstanceOf(APIError);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("frees the slot whether the call succeeds or fails", async () => {
    const { gate } = gateWith({ maxConcurrent: 1 });
    await gate.run(() => Promise.resolve(1));
    await expect(gate.run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(gate.inFlight).toBe(0);
  });
});

describe("ModelCallGate concurrency", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  /** A call that stays open until the test releases it. */
  const held = () => {
    let finish: (value: string) => void = () => undefined;
    const promise = new Promise<string>((resolve) => {
      finish = resolve;
    });
    return { call: () => promise, finish };
  };

  it("runs at most maxConcurrent calls and starts the next as one finishes", async () => {
    const { gate } = gateWith({ maxConcurrent: 8 });
    const calls = Array.from({ length: 9 }, () => held());
    const started = calls.map(() => jest.fn());

    const results = calls.map((c, i) => gate.run(() => {
      started[i]();
      return c.call();
    }));
    await Promise.resolve();
    await Promise.resolve();

    expect(gate.inFlight).toBe(8);
    expect(started.filter((fn) => fn.mock.calls.length > 0)).toHaveLength(8);
    expect(started[8]).not.toHaveBeenCalled();

    calls[0].finish("first");
    await results[0];
    await Promise.resolve();
    expect(started[8]).toHaveBeenCalled();
    expect(gate.inFlight).toBe(8);

    calls.forEach((c) => c.finish("done"));
    await Promise.all(results);
    expect(gate.inFlight).toBe(0);
  });

  it("answers busy when no slot frees up within the queue timeout", async () => {
    jest.useFakeTimers();
    const { gate } = gateWith({ maxConcurrent: 1, queueTimeoutMs: 20_000 });
    const first = held();
    const running = gate.run(first.call);

    const waiting = gate.run(() => Promise.resolve("never"));
    jest.advanceTimersByTime(20_000);

    await expect(waiting).rejects.toMatchObject({ status: 503, code: "model_busy" });
    first.finish("ok");
    await running;
    expect(gate.inFlight).toBe(0);
  });

  it("does not hand a timed-out waiter's slot to anyone", async () => {
    jest.useFakeTimers();
    const { gate } = gateWith({ maxConcurrent: 1, queueTimeoutMs: 100 });
    const first = held();
    const running = gate.run(first.call);
    const late = gate.run(() => Promise.resolve("late"));
    jest.advanceTimersByTime(100);
    await expect(late).rejects.toMatchObject({ code: "model_busy" });

    first.finish("ok");
    await running;
    await expect(gate.run(() => Promise.resolve("next"))).resolves.toBe("next");
    expect(gate.inFlight).toBe(0);
  });
});

describe("LlmService through the gate", () => {
  const messages: ChatMessage[] = [{ role: "user", content: "what is ORP?" }];
  const originalModel = config.fireworks.chatModel;

  beforeAll(() => {
    (config.fireworks as { chatModel?: string }).chatModel = "test-model";
  });
  afterAll(() => {
    (config.fireworks as { chatModel?: string }).chatModel = originalModel;
  });

  const client = (create: jest.Mock): OpenAI => (
    { chat: { completions: { create } } }) as unknown as OpenAI;

  it("retries a 429 on complete() and returns the answer", async () => {
    const { gate } = gateWith();
    const create = jest.fn()
      .mockRejectedValueOnce(providerError(429))
      .mockResolvedValueOnce({
        choices: [{ message: { content: "ORP is in mV." } }],
        model: "m",
        usage: { total_tokens: 10 },
      });

    const answer = await new LlmService(client(create), gate).complete(messages);
    expect(answer.content).toBe("ORP is in mV.");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("answers busy from completeStream() when opening the stream is refused twice", async () => {
    const { gate } = gateWith();
    const create = jest.fn().mockRejectedValue(providerError(503));
    const stream = new LlmService(client(create), gate).completeStream(messages);

    await expect(stream.next()).rejects.toMatchObject({ code: "model_busy" });
    expect(create).toHaveBeenCalledTimes(2);
    expect(gate.inFlight).toBe(0);
  });

  it("holds a stream's slot until the stream is read to the end", async () => {
    const { gate } = gateWith({ maxConcurrent: 1 });
    async function* chunks() {
      yield { choices: [{ delta: { content: "O" } }], model: "m" };
      yield { choices: [{ delta: { content: "RP" } }], model: "m" };
    }
    const create = jest.fn().mockResolvedValue(chunks());
    const stream = new LlmService(client(create), gate).completeStream(messages);

    await stream.next();
    expect(gate.inFlight).toBe(1);

    const rest = [];
    for await (const event of stream) {
      rest.push(event);
    }
    expect(rest).toHaveLength(1);
    expect(gate.inFlight).toBe(0);
  });

  it("frees a stream's slot when the reader stops early", async () => {
    const { gate } = gateWith({ maxConcurrent: 1 });
    async function* chunks() {
      yield { choices: [{ delta: { content: "O" } }], model: "m" };
      yield { choices: [{ delta: { content: "RP" } }], model: "m" };
    }
    const stream = new LlmService(client(jest.fn().mockResolvedValue(chunks())), gate)
      .completeStream(messages);

    await stream.next();
    await stream.return(undefined);
    expect(gate.inFlight).toBe(0);
  });
});
