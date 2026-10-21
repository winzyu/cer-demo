#!/usr/bin/env node
/**
 * Writes the settings file for the report-omission Mirror stack
 * (docs/runbooks/MIRROR_RUNBOOK.md §4) and prints its path.
 *
 *   node scripts/mirror/reportOmitEnv.mjs [output-path]
 *
 * The file holds fresh random secrets for this run only and is created mode 600; nothing is
 * printed but the path. Gilligan's model settings are production's (release/cer-gilligan.env.yaml);
 * the Firestore and device-API settings point every service at the local emulator and the local
 * CER server, so nothing reaches production. Delete the file when the stack is stopped.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const WORK = path.join(os.homedir(), "code/work/clean-earth-rovers");
const out = process.argv[2] ?? path.join(os.tmpdir(), `report-omit-mirror-env.${crypto.randomBytes(4).toString("hex")}`);

const settings = {
  MIRROR_SERVER: path.join(WORK, "worktrees/mirror-report-omit"),
  GILLIGAN_DIR: path.join(WORK, "repo/cer-demo/.claude/worktrees/omit-mirror"),
  DASHBOARD_DIR: path.join(WORK, "worktrees/dashboard-land"),
  JAVA_HOME: path.join(os.homedir(), ".local/opt/jdk-21.0.12.1+1"),
  // Firestore: the emulator only. The server, seed and Gilligan refuse a project not named demo-.
  MIRROR_PROJECT_ID: "demo-cer-mirror",
  FIRESTORE_PROJECT_ID: "demo-cer-mirror",
  FIRESTORE_DATABASE_ID: "(default)",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  DB_ENVIRONMENT: "main",
  NODE_ENV: "development",
  ACCESS_TOKEN_SECRET: crypto.randomBytes(32).toString("hex"),
  CER_RAG_SERVICE_KEY: crypto.randomBytes(32).toString("hex"),
  DEV_UPSTREAM_BASE_URL: "", DEV_LOCAL_PATHS: "", DEV_CHAT_STORE: "", DEV_UNVERIFIED_AUTH: "",
  NODEMAILER_APP_EMAIL: "mirror@example.invalid",
  NODEMAILER_APP_PASSWORD: "mirror-only-placeholder",
  STRIPE_SECRET_KEY: "sk_test_mirror_only",
  // cer-api -> Gilligan, and Gilligan -> cer-api for pod data, both local.
  GILLIGAN_BACKEND: "rag",
  CER_RAG_BASE_URL: "http://localhost:8010",
  CER_RAG_TIMEOUT_MS: "120000",
  FRONTEND_URL: "http://localhost:3100", DEV_FRONTEND_URL: "http://localhost:3100",
  DEV_BASE_URL: "http://localhost:5101",
  DEVICE_API_BASE_URL: "http://localhost:5101/api/v1",
  DEVICE_API_TOKEN: "",
  // Gilligan, as production runs it.
  LLM_MODEL: "accounts/fireworks/models/glm-5p3-flash",
  LLM_REASONING_EFFORT: "low",
  MAX_TOOL_ROUNDS: "16",
  QUERY_REWRITE: "true", QUERY_REWRITE_FIRST_TURN: "true",
  DEFAULT_RETRIEVAL: "local-vector", CORPUS_SOURCE: "artifact", DEBUG_RETRIEVAL: "false",
  SENSOR_TOOL: "true", REPORT_TOOL: "true",
  CATALOGUE_PROMPT: "true", CATALOGUE_DRAFTS: "false",
  PREDECESSOR_PERIOD_HANDOFF: "false",
  WATER_TYPE: "freshwater",
  AUDIT_LOG: "false",
  QUERY_QUOTA: "true", QUERY_QUOTA_STORE: "firestore", QUERY_QUOTA_WINDOW: "1d", QUERY_QUOTA_SCOPE: "caller",
  QUERY_QUOTA_REQUESTS: "20", QUERY_QUOTA_REPORTS: "5", QUERY_QUOTA_TOKENS: "1000000", QUERY_QUOTA_WARN_AT: "0.2",
  // Dashboard: every browser call goes to the local cer-api.
  NEXT_PUBLIC_API_BASE_URL: "http://localhost:5101", API_PROXY_TARGET: "http://localhost:5101",
  NEXT_TELEMETRY_DISABLED: "1",
};

fs.writeFileSync(
  out,
  `${Object.entries(settings).map(([key, value]) => `export ${key}='${value}'`).join("\n")}\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(out);
