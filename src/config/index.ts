import "dotenv/config";
import { createLogger } from "../utils/logger";

const log = createLogger("Config");

export type NodeEnv = "development" | "test" | "production";
export type WaterType = "freshwater" | "saltwater";

export interface FirestoreConfig {
  /** Undefined => rely on Application Default Credentials to infer the project. */
  projectId?: string;
  databaseId: string;
}

export interface FireworksConfig {
  apiKey?: string;
  baseUrl: string;
  chatModel?: string;
  embeddingModel: string;
  /**
   * Deliberately generous. gpt-oss models emit reasoning tokens before visible output and
   * truncate to an empty answer if starved — a low cap fails as silence, not as an error.
   */
  maxTokens: number;
  /**
   * Sampling temperature. **Defaults to 0**, which is both the sane default for a grounded
   * water-quality assistant and a hard requirement of the N2 bake-off: sampling variance across
   * arms would measure the sampler rather than the retrieval strategy
   * (`RETRIEVAL_BAKEOFF.md` §7a). Previously unset, which meant the provider default applied and
   * answers were not reproducible.
   */
  temperature: number;
  /**
   * Sent as the OpenAI `user` field. On Fireworks serverless this drives cache affinity:
   * requests sharing a value tend to land on the same worker, which is what makes prompt
   * caching actually hit. A constant is correct for a single-tenant demo; revisit when
   * requests carry real user identity.
   */
  user: string;
}

export interface DeviceApiConfig {
  /**
   * Base URL of the Clean Earth backend, **including** the `/api/v1` suffix. The dashboard
   * builds this from `NEXT_PUBLIC_API_BASE_URL` + "/api/v1"; this service takes the whole
   * thing so there is one value to get right.
   */
  baseUrl?: string;
  /**
   * Dev-only bearer token. Production forwards the *caller's* JWT instead — a shared
   * service token would let any chat user read every device. Kept separate so the
   * distinction stays explicit rather than accidental.
   */
  devToken?: string;
  timeoutMs: number;
  /**
   * Device the sensor tool answers about when the caller names none.
   *
   * Optional on purpose: unset means "the model must name a device, and an ambiguous
   * question gets an error listing the choices". A wrong default is worse than no default
   * here — the two cleared test pods are in different water bodies on opposite coasts, so
   * silently answering about the wrong one produces a confident, well-formatted, wrong answer.
   */
  defaultDeviceLabel?: string;
}

/**
 * The tool-calling layer restored in Phase N3 (`MIGRATION_SPEC.md` §3).
 *
 * ⚠️ `sensorTool` gates a change to the **system prompt**, which is a pinned control for the
 * Phase N2 retrieval bake-off (`RETRIEVAL_BAKEOFF.md` §4). It defaults to **false** so the
 * default prompt stays byte-identical to the one all three captured arms ran against, and so
 * no `tools` array is attached to a chat request. ◆G7 is still open on ungraded quality; turning
 * this on during a capture run makes that run incomparable to the captured three.
 */
export interface ToolsConfig {
  /** Master switch for `query_sensor_data` — the prompt block, the tools array, and the loop. */
  sensorTool: boolean;
  /**
   * Master switch for `generate_report` — the prompt block's report-vs-stat routing rule, the
   * tools array entry, and the tool registry.
   *
   * Separate from `sensorTool` rather than folded into it: `generate_report` calls
   * `QuerySensorData.query()` directly (not through the model's tool loop), so it does not
   * strictly need `sensorTool` on to function -- but it does need `DEVICE_API_BASE_URL`
   * configured, same as `sensorTool` does, since both ultimately read the same device data.
   * Also defaults to **false**, for the same system-prompt pinning reason `sensorTool` does
   * (`RETRIEVAL_BAKEOFF.md` §4) -- see systemPrompt.ts's REPORT_TOOL_BLOCK.
   */
  reportTool: boolean;
  /**
   * Tool-enabled rounds before the loop forces a text-only answer. Legacy was 5
   * (`MIGRATION_SPEC.md` §9, hard-coded); raised here because the six-parameter eval fixture
   * needs one call per metric plus room for follow-ups, which 5 cannot fit. This is N5's
   * "raise the tool-round cap" item landing early — see `timeline.md`.
   *
   * The cost of a high cap is the failure mode, not the happy path: a model that loops burns
   * one paid LLM call per round. `ChatOrchestrator` short-circuits repeated identical calls so
   * a stuck model cannot spend the whole budget re-asking one question.
   */
  maxToolRounds: number;
  /**
   * Rows `aggregation: "raw"` may return (legacy `RAW_LIMIT`). A cap, not a page size — raw
   * output goes straight into the next prompt, so an uncapped window would push the real
   * question out of the model's attention and bill for the privilege.
   */
  rawLimit: number;
}

export interface ChatConfig {
  /**
   * Hard cap on prior messages accepted from a caller. History is unbounded input the client
   * controls, so without a cap one conversation can grow the prompt — and the bill — without
   * limit. Oldest messages are dropped first.
   */
  maxHistoryMessages: number;
}

export type CorpusSourceName = "artifact" | "firestore";

export interface RetrievalConfig {
  /** Registry key for the adapter selected by default (validated by the registry, later phase). */
  defaultMode: string;
  /** When true, a request may override the retrieval mode; otherwise the override is ignored. */
  debug: boolean;
  /**
   * Where corpus text is read from. `artifact` (the local ingestion output) needs no credentials
   * and is the development default; `firestore` is required for a measured bake-off run so that
   * datastore's read costs are counted. Explicit rather than auto-detected — a silent fallback
   * could have a run measured against the wrong source and misreport the arm's cost.
   */
  corpusSource: CorpusSourceName;
}

export interface Config {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  port: number;
  logLevel: string;
  firestore: FirestoreConfig;
  fireworks: FireworksConfig;
  deviceApi: DeviceApiConfig;
  tools: ToolsConfig;
  chat: ChatConfig;
  retrieval: RetrievalConfig;
  waterType: WaterType;
}

// Validation errors are collected so the process fails once, with every problem listed.
const errors: string[] = [];

const readString = (name: string, fallback?: string): string | undefined => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  return raw.trim();
};

const readInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    errors.push(`${name} must be an integer (got "${raw}")`);
    return fallback;
  }
  return value;
};

/** Like `readInt` but accepts decimals — temperature is the only such value so far. */
const readFloat = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    errors.push(`${name} must be a number (got "${raw}")`);
    return fallback;
  }
  return value;
};

const readBool = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }
  errors.push(`${name} must be a boolean (got "${raw}")`);
  return fallback;
};

const readEnum = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
  const raw = readString(name);
  if (raw === undefined) {
    return fallback;
  }
  if (!allowed.includes(raw as T)) {
    errors.push(`${name} must be one of [${allowed.join(", ")}] (got "${raw}")`);
    return fallback;
  }
  return raw as T;
};

const load = (): Config => {
  const nodeEnv = readEnum<NodeEnv>(
    "NODE_ENV",
    ["development", "test", "production"],
    "development",
  );

  const config: Config = {
    nodeEnv,
    isProduction: nodeEnv === "production",
    port: readInt("PORT", 8000),
    logLevel: readString("LOG_LEVEL", "info") as string,
    firestore: {
      projectId: readString("FIRESTORE_PROJECT_ID"),
      databaseId: readString("FIRESTORE_DATABASE_ID", "(default)") as string,
    },
    fireworks: {
      apiKey: readString("FIREWORKS_API_KEY"),
      baseUrl: readString("FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1") as string,
      chatModel: readString("LLM_MODEL"),
      embeddingModel: readString("EMBEDDING_MODEL", "nomic-ai/nomic-embed-text-v1.5") as string,
      maxTokens: readInt("LLM_MAX_TOKENS", 4096),
      temperature: readFloat("LLM_TEMPERATURE", 0),
      user: readString("FIREWORKS_USER", "clean-earth-rag") as string,
    },
    deviceApi: {
      baseUrl: readString("DEVICE_API_BASE_URL"),
      devToken: readString("DEVICE_API_TOKEN"),
      timeoutMs: readInt("DEVICE_API_TIMEOUT_MS", 10000),
      defaultDeviceLabel: readString("SENSOR_DEVICE_LABEL"),
    },
    tools: {
      sensorTool: readBool("SENSOR_TOOL", false),
      reportTool: readBool("REPORT_TOOL", false),
      maxToolRounds: readInt("MAX_TOOL_ROUNDS", 16),
      rawLimit: readInt("RAW_LIMIT", 200),
    },
    chat: {
      maxHistoryMessages: readInt("MAX_HISTORY_MESSAGES", 20),
    },
    retrieval: {
      defaultMode: readString("DEFAULT_RETRIEVAL", "stub") as string,
      debug: readBool("DEBUG_RETRIEVAL", false),
      corpusSource: readEnum<CorpusSourceName>(
        "CORPUS_SOURCE",
        ["artifact", "firestore"],
        "artifact",
      ),
    },
    waterType: readEnum<WaterType>("WATER_TYPE", ["freshwater", "saltwater"], "freshwater"),
  };

  // A cap of 0 would offer tools and then never let the model use a result, which reads as
  // "the tool is broken" rather than as a misconfiguration.
  if (config.tools.maxToolRounds < 1) {
    errors.push(`MAX_TOOL_ROUNDS must be at least 1 (got ${config.tools.maxToolRounds})`);
  }
  if (config.tools.rawLimit < 1) {
    errors.push(`RAW_LIMIT must be at least 1 (got ${config.tools.rawLimit})`);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${errors.join("\n  - ")}`);
  }

  // Missing secrets/models are warnings, not fatal: the skeleton must boot and pass /health
  // without them. They become hard requirements when the chat phase lands.
  if (!config.fireworks.apiKey) {
    log.warn("FIREWORKS_API_KEY is not set — LLM calls will fail until it is provided.");
  }
  if (!config.fireworks.chatModel) {
    log.warn("LLM_MODEL is not set — set it before enabling the chat endpoint.");
  }
  if (config.tools.sensorTool) {
    // Loud on purpose. This is the switch that un-pins the N2 bake-off's system prompt, and a
    // capture run made with it on is not comparable to the three already captured
    // (RETRIEVAL_BAKEOFF.md §4). Better a line in every startup log than a silently voided sweep.
    log.warn(
      `SENSOR_TOOL is ON — the system prompt carries a tool block and ${config.tools.maxToolRounds} tool rounds are enabled. `
      + "Bake-off arms captured with it OFF are not comparable to runs made with it ON.",
    );
    if (!config.deviceApi.baseUrl) {
      log.warn("SENSOR_TOOL is on but DEVICE_API_BASE_URL is not set — query_sensor_data will fail at call time.");
    }
  }
  if (config.tools.reportTool) {
    log.warn(
      "REPORT_TOOL is ON — the system prompt carries a report-vs-stat routing rule and "
      + "generate_report is registered. Same bake-off-comparability caveat as SENSOR_TOOL above.",
    );
    if (!config.deviceApi.baseUrl) {
      log.warn("REPORT_TOOL is on but DEVICE_API_BASE_URL is not set — generate_report will fail at call time.");
    }
  }
  if (config.isProduction && !config.firestore.projectId) {
    log.warn("FIRESTORE_PROJECT_ID is not set in production — relying on Application Default Credentials.");
  }

  return config;
};

export const config: Config = Object.freeze(load());
