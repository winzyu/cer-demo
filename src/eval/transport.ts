import type { AskFn, AskRequest, AskResult } from "./runner";

/**
 * HTTP transports for the bake-off runner.
 *
 * The runner drives the **real service over HTTP** rather than calling the controller in-process,
 * so the latency and token counts it records are the ones production would see
 * (`RETRIEVAL_BAKEOFF.md` §7a).
 */

export interface TransportOptions {
  /** Service base URL including the version prefix, e.g. `http://localhost:8000/api/v1`. */
  baseUrl: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 180_000;

/** One `event:`/`data:` pair off the wire. */
export interface SseEvent {
  event: string;
  data: unknown;
}

/**
 * Splits an SSE byte stream into events.
 *
 * Exported for testing: the buffering rule — an event is only complete at a blank line — is the
 * part that silently corrupts data when it is wrong, because a half-received `done` frame simply
 * looks like a run with no token counts.
 */
export const parseSseChunk = (buffer: string): { events: SseEvent[]; rest: string } => {
  const events: SseEvent[] = [];
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";

  frames.forEach((frame) => {
    const lines = frame.split("\n");
    const eventLine = lines.find((line) => line.startsWith("event: "));
    const dataLine = lines.find((line) => line.startsWith("data: "));
    if (!eventLine || !dataLine) return;
    try {
      events.push({
        event: eventLine.slice("event: ".length).trim(),
        data: JSON.parse(dataLine.slice("data: ".length)),
      });
    } catch {
      // A frame we cannot parse is dropped rather than crashing the sweep; the missing
      // usage or answer shows up as a warning in the summary.
    }
  });

  return { events, rest };
};

const postJson = async (
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Streaming transport — **the default**, because it is the only one that yields
 * time-to-first-token, and TTFT is a reported metric (§6). Usage arrives on the `done` event
 * when the provider sends it.
 */
export const createSseTransport = (options: TransportOptions): AskFn => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async (request: AskRequest): Promise<AskResult> => {
    const started = Date.now();
    const response = await postJson(
      `${options.baseUrl}/chat`,
      { ...request, stream: true },
      timeoutMs,
    );

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      throw new Error(`chat failed: HTTP ${response.status} ${detail.slice(0, 300)}`);
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = "";
    let answer = "";
    let mode = "";
    let context: AskResult["context"] = [];
    let model: string | undefined;
    let usage: AskResult["usage"];
    let ttftMs: number | undefined;
    let streamError: string | undefined;

    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseChunk(buffer);
      buffer = parsed.rest;

      // Indexed rather than `forEach`: a callback here would close over eight mutable
      // locals, which is both a lint error and a genuinely easy thing to get subtly wrong.
      for (let i = 0; i < parsed.events.length; i += 1) {
        const { event, data } = parsed.events[i];
        const payload = data as Record<string, unknown>;
        if (event === "meta") {
          mode = String(payload.mode ?? "");
          context = (payload.citations ?? []) as AskResult["context"];
        } else if (event === "token") {
          // First visible token, not first byte: `meta` always precedes it, so timing from
          // the response start would measure retrieval, not generation latency.
          if (ttftMs === undefined) ttftMs = Date.now() - started;
          answer += String(payload.text ?? "");
        } else if (event === "done") {
          model = payload.model as string | undefined;
          usage = payload.usage as AskResult["usage"];
        } else if (event === "error") {
          streamError = String(payload.message ?? payload.error ?? "stream error");
        }
      }
    }

    if (streamError) {
      throw new Error(streamError);
    }

    return {
      answer, mode, context, model, usage, ttftMs, wallMs: Date.now() - started,
    };
  };
};

/**
 * Non-streaming fallback. Loses TTFT, so only worth using when the provider does not emit a
 * usage event over the stream — token counts matter more to this experiment than latency does.
 */
export const createJsonTransport = (options: TransportOptions): AskFn => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async (request: AskRequest): Promise<AskResult> => {
    const started = Date.now();
    const response = await postJson(`${options.baseUrl}/chat`, request, timeoutMs);
    const wallMs = Date.now() - started;

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`chat failed: HTTP ${response.status} ${detail.slice(0, 300)}`);
    }

    const body = await response.json() as Record<string, unknown>;
    return {
      answer: String(body.answer ?? ""),
      mode: String(body.mode ?? ""),
      context: (body.citations ?? []) as AskResult["context"],
      model: body.model as string | undefined,
      usage: body.usage as AskResult["usage"],
      wallMs,
    };
  };
};
