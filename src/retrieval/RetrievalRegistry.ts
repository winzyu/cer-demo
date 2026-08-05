import { config } from "../config";
import type { RetrievalConfig } from "../config";
import type { RetrievalAdapter } from "../types/retrieval.types";
import { ValidationError } from "../utils/errors";
import { createLogger } from "../utils/logger";

const log = createLogger("Retrieval");

/**
 * The slice of retrieval config the registry actually reads. Narrower than `RetrievalConfig` on
 * purpose: unrelated additions to that interface should not force every caller and test to supply
 * fields the registry ignores.
 */
export type RegistrySettings = Pick<RetrievalConfig, "defaultMode" | "debug">;

/**
 * Maps a mode name to a retrieval implementation and applies the selection rules.
 *
 * A class with constructor DI (docs/migration/CONVENTIONS.md §12) rather than a module-level
 * singleton map: tests get their own isolated registry instead of the suite depending on
 * import order, and `settings` can be varied without touching process env.
 */
export class RetrievalRegistry {
  private readonly adapters = new Map<string, RetrievalAdapter>();

  /** Only the selection settings — the registry has no interest in where corpora come from. */
  private readonly settings: RegistrySettings;

  constructor(settings: RegistrySettings = config.retrieval) {
    this.settings = settings;
  }

  register(adapter: RetrievalAdapter): void {
    if (this.adapters.has(adapter.mode)) {
      // Silent replacement would make retrieval depend on import order — the kind of bug
      // that only shows up as an inexplicable bake-off result.
      throw new Error(`Retrieval mode "${adapter.mode}" is already registered.`);
    }
    this.adapters.set(adapter.mode, adapter);
  }

  get(mode: string): RetrievalAdapter | undefined {
    return this.adapters.get(mode);
  }

  modes(): string[] {
    return [...this.adapters.keys()].sort();
  }

  /**
   * Picks the adapter for a request.
   *
   * The request's `retrieval` field is honored **only** when `DEBUG_RETRIEVAL` is true;
   * otherwise it is ignored (not rejected) and the configured default is used. This keeps
   * a public endpoint from letting callers choose their own retrieval strategy — and cost —
   * in production, while leaving the bake-off free to switch arms per request in dev.
   */
  resolve(requestedMode?: string): RetrievalAdapter {
    const override = this.overrideFor(requestedMode);

    if (override !== undefined) {
      const adapter = this.adapters.get(override);
      if (!adapter) {
        // Caller-supplied and caller-fixable => 400, not a server fault.
        throw new ValidationError(
          `Unknown retrieval mode "${override}". Available: ${this.modes().join(", ")}.`,
        );
      }
      return adapter;
    }

    const { defaultMode } = this.settings;
    const adapter = this.adapters.get(defaultMode);
    if (!adapter) {
      // Misconfiguration, not bad input: DEFAULT_RETRIEVAL names something unregistered.
      throw new Error(
        `Configured DEFAULT_RETRIEVAL="${defaultMode}" is not registered. Available: ${
          this.modes().join(", ") || "(none)"
        }.`,
      );
    }
    return adapter;
  }

  /** Returns the mode to override with, or undefined to fall through to the default. */
  private overrideFor(requestedMode?: string): string | undefined {
    if (requestedMode === undefined || requestedMode.trim() === "") {
      return undefined;
    }
    if (!this.settings.debug) {
      log.warn(
        `Ignoring requested retrieval mode "${requestedMode}" — DEBUG_RETRIEVAL is false.`,
      );
      return undefined;
    }
    return requestedMode.trim();
  }
}
