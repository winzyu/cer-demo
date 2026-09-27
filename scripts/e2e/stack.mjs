// The local stack the Gilligan end-to-end bot drives: the Firestore mirror, the CER server on
// its mirror branch, and cer-demo. See docs/migration/GILLIGAN_E2E_TEST_TICKET.md.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./cdp.mjs";

/** A `demo-` project never resolves to a real one; the server and seed refuse anything else. */
export const MIRROR_PROJECT = process.env.MIRROR_PROJECT_ID ?? "demo-cer-mirror";
if (!MIRROR_PROJECT.startsWith("demo-")) throw new Error(`MIRROR_PROJECT_ID must start with demo- (got "${MIRROR_PROJECT}")`);
export const EMULATOR_HOST = "127.0.0.1:8080";
export const SERVER_API = "http://localhost:5101/api/v1";

const emulatorDocs = (database = "(default)") =>
  `http://${EMULATOR_HOST}/v1/projects/${MIRROR_PROJECT}/databases/${encodeURIComponent(database)}/documents`;
const emulatorHeaders = { Authorization: "Bearer owner", "Content-Type": "application/json" };

/** Firestore REST reads and writes against the emulator only; the host is fixed above. */
export const emulator = {
  async list(collection, database) {
    const documents = [];
    let pageToken = "";
    do {
      const url = `${emulatorDocs(database)}/${collection}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
      const body = await (await fetch(url, { headers: emulatorHeaders })).json();
      documents.push(...(body.documents ?? []));
      pageToken = body.nextPageToken ?? "";
    } while (pageToken);
    return documents;
  },
  async get(collection, id) {
    const response = await fetch(`${emulatorDocs()}/${collection}/${encodeURIComponent(id)}`, { headers: emulatorHeaders });
    return response.ok ? response.json() : null;
  },
  async patch(collection, id, fields) {
    const response = await fetch(`${emulatorDocs()}/${collection}/${encodeURIComponent(id)}`, {
      method: "PATCH", headers: emulatorHeaders, body: JSON.stringify({ fields }),
    });
    if (!response.ok) throw new Error(`emulator patch ${collection}/${id}: ${response.status} ${await response.text()}`);
    return response.json();
  },
};

export const plain = (value) => {
  if (value == null) return value;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(plain);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([k, v]) => [k, plain(v)]));
  return undefined;
};
const docId = (document) => document.name.split("/").pop();

/** Seeded pods and organizations, read back from the emulator so a reseed cannot drift from them. */
export const loadEntities = async () => {
  const devices = (await emulator.list("devices")).map((d) => ({
    id: docId(d), name: plain(d.fields.name), label: plain(d.fields.label), organization: plain(d.fields.organization) ?? "",
    mergedInto: plain(d.fields.mergedInto) ?? "",
  }));
  const organizations = (await emulator.list("organizations")).map((d) => ({ id: docId(d), name: plain(d.fields.name) }));
  return { devices, organizations };
};

/**
 * Model tokens cer-demo's Firestore quota store has counted in one database. Every token priced at
 * the model's output rate gives an upper bound on spend.
 */
export const usageTokens = async (database = "(default)") =>
  (await emulator.list("gilligan_usage", database)).reduce((sum, d) => sum + (plain(d.fields.tokens) ?? 0), 0);
export const OUTPUT_USD_PER_MILLION = 0.60; // gpt-oss-120b on Fireworks, src/eval/prices.ts

export const legacyChats = async (userId) =>
  (await emulator.list("chats"))
    .filter((d) => plain(d.fields.user) === userId && plain(d.fields.assistant) !== "cer-rag")
    .map((d) => ({ id: docId(d), firstQuestion: plain(d.fields.messages)?.[0]?.question?.text ?? "" }));

const CER_ORG = "FF8Syo9Sypomrf4fqOez";

/**
 * Personas from the ticket. `pods` is what the pod picker should list. Emails drop the zero padding
 * of the user id, as the mirror seed does.
 */
export const PERSONAS = {
  super: { userId: "user-super-0000000001", org: CER_ORG, all: true,
    pods: ["Harbor Pier Buoy", "Lakeside Buoy 2026", "Demo Public Dock Buoy", "Seaview Marina", "dev:100000000000012"] },
  harborAdmin: { userId: "user-harbor-admin-01", org: "org-harbor-000000001", pods: ["Harbor Pier Buoy"] },
  harborCust: { userId: "user-harbor-cust-01", org: "org-harbor-000000001", pods: ["Harbor Pier Buoy"] },
  lakeCust: { userId: "user-lake-cust-0001", org: "org-lake-00000000001", pods: ["Lakeside Buoy 2026"] },
  seaviewAdmin: { userId: "user-seaview-admin-1", org: "org-seaview-00000001", pods: ["Seaview Marina"] },
  univCust: { userId: "user-univ-cust-00001", org: "org-univ-00000000001", pods: ["dev:100000000000012"] },
  bayCust: { userId: "user-bay-cust-000001", org: "org-bay-000000000001", pods: [] },
  orphan: { userId: "user-orphan-000001", org: "", pods: [] },
  invited: { userId: "user-harbor-cust-03", org: "org-harbor-000000001", pods: [] },
  seaviewCust1: { userId: "user-seaview-cust-01", org: "org-seaview-00000001", pods: ["Seaview Marina"] },
  seaviewCust2: { userId: "user-seaview-cust-02", org: "org-seaview-00000001", pods: ["Seaview Marina"] },
  riverCust: { userId: "user-river-cust-0001", org: "org-river-0000000001", pods: [] },
};

/** With `mirror:seed -- --fixtures`, pickers gain the moved and no-GPS pods (server scripts/mirror/README.md). */
export const applyFixtures = (entities) => {
  if (!entities.devices.some((d) => d.label === "dev:100000000000016")) return false;
  PERSONAS.super.pods.push("Lakeside Mobile Buoy", "River Watch Float");
  PERSONAS.lakeCust.pods.push("Lakeside Mobile Buoy");
  PERSONAS.riverCust.pods.push("River Watch Float");
  return true;
};
export const PASSWORD = "mirror-dev-password";
export const emailOf = (persona) => `${persona.userId.replace(/-0*(\d+)$/, "-$1")}@mirror.example.invalid`;

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Names, labels and organization names the persona must never be shown. A predecessor with no
 * organization (null, missing, empty or an id that does not exist) belongs to the organization of
 * the pod it merged into (release plan Q6), so that organization may see it.
 */
export const forbiddenTerms = (persona, entities) => {
  if (persona.all) return [];
  const terms = new Set();
  const known = new Set(entities.organizations.map((o) => o.id));
  const orgOf = new Map(entities.devices.map((d) => [d.label, d.organization]));
  for (const device of entities.devices) {
    if (device.organization === persona.org && persona.org !== "") continue;
    const unowned = !device.organization || !known.has(device.organization);
    if (unowned && device.mergedInto && persona.org !== "" && orgOf.get(device.mergedInto) === persona.org) continue;
    terms.add(device.name);
    terms.add(device.label);
  }
  for (const organization of entities.organizations) {
    if (organization.id !== persona.org) terms.add(organization.name);
  }
  return [...terms].filter(Boolean).map((term) => ({ term, pattern: new RegExp(`${escape(term)}(?!\\d)`, "i") }));
};

/**
 * One process group per service, so stopping it stops ts-node-dev's children too and nothing
 * else. Logs go to the run directory.
 */
class Service {
  constructor(name, { cwd, command, env = {}, ready, logFile }) {
    Object.assign(this, { name, cwd, command, env, ready, logFile });
  }

  async isUp() {
    try { return await this.ready(); } catch { return false; }
  }

  async start(extraEnv = {}) {
    if (await this.isUp()) throw new Error(`${this.name} is already running; stop the one outside the bot first`);
    const log = fs.openSync(this.logFile, "a");
    fs.writeSync(log, `\n==== start ${new Date().toISOString()} ${Object.keys(extraEnv).join(",")}\n`);
    this.child = spawn("bash", ["-c", this.command], {
      cwd: this.cwd, detached: true, stdio: ["ignore", log, log],
      env: { ...process.env, ...this.env, ...extraEnv },
    });
    fs.closeSync(log);
    for (let i = 0; i < 240; i++) {
      if (await this.isUp()) return;
      if (this.child.exitCode !== null) throw new Error(`${this.name} exited during start; see ${this.logFile}`);
      await delay(250);
    }
    throw new Error(`${this.name} did not become ready; see ${this.logFile}`);
  }

  async stop() {
    if (!this.child) return;
    const group = -this.child.pid;
    for (const [signal, wait] of [["SIGINT", 8000], ["SIGTERM", 5000], ["SIGKILL", 3000]]) {
      try { process.kill(group, signal); } catch { break; }
      const end = Date.now() + wait;
      while (Date.now() < end && (await this.isUp())) await delay(200);
      if (!(await this.isUp())) break;
    }
    this.child = undefined;
  }

  async restart(extraEnv = {}) {
    await this.stop();
    await this.start(extraEnv);
  }
}

const readEnvFile = (file, key) => {
  const line = fs.readFileSync(file, "utf8").split("\n").find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1) : "";
};

export const createServices = ({ serverDir, cerDir, runDir }) => {
  const serviceKey = readEnvFile(path.join(serverDir, ".env.mirror.local"), "CER_RAG_SERVICE_KEY");
  if (!serviceKey) throw new Error("CER_RAG_SERVICE_KEY is missing from the server's .env.mirror.local");
  const server = new Service("server", {
    cwd: serverDir,
    command: "exec npm run dev:mirror",
    env: { MIRROR_PROJECT_ID: MIRROR_PROJECT },
    ready: async () => (await fetch(`${SERVER_API}/devices`)).status === 401,
    logFile: path.join(runDir, "server.log"),
  });
  // DEVICE_API_TOKEN is set empty on purpose: a missed setting then fails closed instead of reading
  // production with the superadmin token from cer-demo's .env.
  const cer = new Service("cer-demo", {
    cwd: cerDir,
    command: "exec npm run dev",
    env: {
      PORT: "8010", DEVICE_API_BASE_URL: SERVER_API, DEVICE_API_TOKEN: "",
      SENSOR_TOOL: "true", REPORT_TOOL: "true",
      CORPUS_SOURCE: "artifact", DEFAULT_RETRIEVAL: "hybrid-slice-vector", AUDIT_LOG: "false",
      // The release allowances (manual guide, "Make one temporary settings file").
      QUERY_QUOTA: "true", QUERY_QUOTA_STORE: "firestore", QUERY_QUOTA_WINDOW: "1d", QUERY_QUOTA_SCOPE: "caller",
      QUERY_QUOTA_REQUESTS: "20", QUERY_QUOTA_REPORTS: "5", QUERY_QUOTA_TOKENS: "1000000",
      FIRESTORE_EMULATOR_HOST: EMULATOR_HOST, FIRESTORE_PROJECT_ID: MIRROR_PROJECT, FIRESTORE_DATABASE_ID: "(default)",
      // Q6: a predecessor with no organization is read for its successor's organization.
      PREDECESSOR_PERIOD_HANDOFF: "true",
      CER_RAG_SERVICE_KEY: serviceKey,
    },
    ready: async () => (await fetch("http://localhost:8010/health")).ok,
    logFile: path.join(runDir, "cer-demo.log"),
  });
  return { server, cer };
};

export const reseed = (serverDir, runDir, { fixtures = true } = {}) => new Promise((resolve, reject) => {
  const log = fs.openSync(path.join(runDir, "seed.log"), "a");
  const child = spawn("bash", ["-c", `exec npm run mirror:seed${fixtures ? " -- --fixtures" : ""}`], {
    cwd: serverDir, stdio: ["ignore", log, log],
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: EMULATOR_HOST, MIRROR_PROJECT_ID: MIRROR_PROJECT },
  });
  child.on("exit", (code) => { fs.closeSync(log); code === 0 ? resolve() : reject(new Error(`seed exited ${code}`)); });
});
