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

/**
 * Postgres + pgvector sidecar for the Phase N2 `pgvector-rag` arm.
 *
 * ⚠️ Dev/experiment only — removed with the arm once ◆G7 resolves. Unset in every normal
 * deployment; the adapter fails with a clear message rather than the process refusing to boot,
 * matching how a missing Fireworks key is handled.
 */
export interface PgVectorConfig {
  url?: string;
}

export interface Config {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  port: number;
  logLevel: string;
  firestore: FirestoreConfig;
  fireworks: FireworksConfig;
  deviceApi: DeviceApiConfig;
  chat: ChatConfig;
  retrieval: RetrievalConfig;
  pgvector: PgVectorConfig;
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
    pgvector: {
      url: readString("PGVECTOR_URL"),
    },
    waterType: readEnum<WaterType>("WATER_TYPE", ["freshwater", "saltwater"], "freshwater"),
  };

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
  if (config.isProduction && !config.firestore.projectId) {
    log.warn("FIRESTORE_PROJECT_ID is not set in production — relying on Application Default Credentials.");
  }

  return config;
};

export const config: Config = Object.freeze(load());
