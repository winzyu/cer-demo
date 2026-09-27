import { APIError } from "openai";
import { config } from "../config";
import { codedError } from "../utils/errors";
import { createLogger } from "../utils/logger";

const log = createLogger("ModelGate");

/** Statuses Fireworks uses for "saturated, try later" (architecture §2c). */
const BUSY_STATUSES: ReadonlySet<number> = new Set([429, 503]);

/** A `Retry-After` longer than this is not worth holding a user's request open for. */
const MAX_RETRY_WAIT_MS = 10_000;

export const BUSY_MESSAGE = "Gilligan is busy right now. Please try again in a minute.";

const busy = () => codedError(503, BUSY_MESSAGE, "model_busy");

/** Only the provider's own saturation answers; our own 503s (a missing key) are not retried. */
export const isProviderBusy = (error: unknown): error is APIError => (
  error instanceof APIError && typeof error.status === "number" && BUSY_STATUSES.has(error.status)
);

/** Seconds form only; the HTTP-date form is rare from APIs and falls back to the default. */
const retryAfterMs = (error: APIError): number | undefined => {
  const raw = error.headers?.get?.("retry-after");
  return raw && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) * 1000 : undefined;
};

export interface ModelCallGateOptions {
  maxConcurrent: number;
  queueTimeoutMs: number;
  retryDelayMs: number;
  /** Injected so tests do not wait in real time. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

/**
 * Every Fireworks chat call passes through here (release plan S4).
 *
 * ## Concurrency
 *
 * At most `maxConcurrent` calls are in flight across the process; the rest queue in arrival order
 * for up to `queueTimeoutMs`, then fail as "busy". Fireworks' limits are adaptive
 * tokens-per-minute ceilings, so a burst of simultaneous tool loops is what trips them; a short
 * queue here turns a busy minute into a wait instead of a wall of 429s. A streamed call holds its
 * slot until the stream ends, because that is when the provider stops working on it.
 *
 * ## Retry
 *
 * A 429 or 503 from Fireworks is retried once, after `Retry-After` when the provider sends a short
 * one and `retryDelayMs` otherwise; a second refusal becomes the coded `model_busy` 503, which the
 * page shows as "busy, try again" rather than as an error. The SDK's own retries are switched off
 * (`LlmService`) so this is the only retry policy, and it stays visible here.
 */
export class ModelCallGate {
  private readonly options: Required<ModelCallGateOptions>;

  private active = 0;

  private readonly waiting: Array<() => void> = [];

  constructor(options: ModelCallGateOptions) {
    this.options = { sleep: realSleep, ...options };
  }

  /** Calls in flight now. For tests and diagnostics. */
  get inFlight(): number {
    return this.active;
  }

  /**
   * Waits for a slot and returns its release function, which is safe to call more than once.
   * Rejects with `model_busy` when no slot frees up in time.
   */
  acquire(): Promise<() => void> {
    const release = this.releaser();
    if (this.active < this.options.maxConcurrent) {
      this.active += 1;
      return Promise.resolve(release);
    }

    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      const grant = (): void => {
        clearTimeout(timer);
        this.active += 1;
        resolve(release);
      };
      timer = setTimeout(() => {
        const index = this.waiting.indexOf(grant);
        if (index >= 0) {
          this.waiting.splice(index, 1);
        }
        log.warn(`No model-call slot within ${this.options.queueTimeoutMs} ms; answering busy.`);
        reject(busy());
      }, this.options.queueTimeoutMs);
      this.waiting.push(grant);
    });
  }

  /** Runs `call` inside a slot, retrying once on a provider 429/503. */
  async run<T>(call: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire();
    try {
      return await this.withRetry(call, signal);
    } finally {
      release();
    }
  }

  /**
   * The retry alone, for a call whose slot the caller holds (a stream, which keeps its slot after
   * this returns). Not retried once the caller has gone: `signal` aborted means nobody is waiting.
   */
  async withRetry<T>(call: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (!isProviderBusy(error) || signal?.aborted) {
        throw error;
      }
      const wait = Math.min(retryAfterMs(error) ?? this.options.retryDelayMs, MAX_RETRY_WAIT_MS);
      log.warn(`Fireworks answered ${error.status}; retrying once in ${wait} ms.`);
      await this.options.sleep(wait);
    }

    try {
      return await call();
    } catch (error) {
      if (isProviderBusy(error)) {
        log.warn(`Fireworks answered ${error.status} again; answering busy.`);
        throw busy();
      }
      throw error;
    }
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.active -= 1;
      // The next waiter, if any, takes the slot at once (its `grant` counts it back in).
      this.waiting.shift()?.();
    };
  }
}

/** The process-wide gate: the limit is on the deployment's calls, not on one controller's. */
export const modelCallGate = new ModelCallGate({
  maxConcurrent: config.fireworks.maxConcurrent,
  queueTimeoutMs: config.fireworks.queueTimeoutMs,
  retryDelayMs: config.fireworks.retryDelayMs,
});
