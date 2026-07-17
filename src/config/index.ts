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
}

export interface RetrievalConfig {
  /** Registry key for the adapter selected by default (validated by the registry, later phase). */
  defaultMode: string;
  /** When true, a request may override the retrieval mode; otherwise the override is ignored. */
  debug: boolean;
}

export interface Config {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  port: number;
  logLevel: string;
  firestore: FirestoreConfig;
  fireworks: FireworksConfig;
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
    },
    retrieval: {
      defaultMode: readString("DEFAULT_RETRIEVAL", "stub") as string,
      debug: readBool("DEBUG_RETRIEVAL", false),
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
