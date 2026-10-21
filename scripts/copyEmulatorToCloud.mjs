#!/usr/bin/env node
/**
 * Copies the fabricated CER mirror data from the local :8180 Firestore emulator into the
 * `cer-demo-fixtures` database of the test project `cer-demo-2026`, so it can be browsed in the
 * Firebase console. Source and target are fixed constants: the script cannot read anything but
 * the local emulator, and cannot write anywhere but that one named database.
 *
 *   node scripts/copyEmulatorToCloud.mjs            # dry run: counts the emulator, no cloud call
 *   node scripts/copyEmulatorToCloud.mjs --write    # copies every document (cloud writes)
 *   node scripts/copyEmulatorToCloud.mjs --verify   # compares cloud counts with the emulator's
 *
 * --write and --verify take a token from `gcloud auth print-access-token` for the active gcloud
 * account; the token is held in memory and never printed. Run them without guard.env sourced.
 * Documents are written whole with their typed values unchanged; a re-run overwrites the same ids
 * and leaves documents deleted from the emulator in place.
 */
import { execFileSync } from "node:child_process";

const SOURCE = "http://127.0.0.1:8180/v1/projects/conductive-fold-343604/databases/(default)/documents";
const TARGET_PROJECT = "cer-demo-2026";
const TARGET_DATABASE = "cer-demo-fixtures";
const TARGET_ROOT = `projects/${TARGET_PROJECT}/databases/${TARGET_DATABASE}/documents`;
const TARGET = `https://firestore.googleapis.com/v1/${TARGET_ROOT}`;
const SOURCE_ROOT = "projects/conductive-fold-343604/databases/(default)/documents";
const BATCH_SIZE = 500;

const mode = process.argv[2] ?? "--dry-run";
if (!["--dry-run", "--write", "--verify"].includes(mode)) {
  console.error(`Unknown option ${mode}; use --dry-run, --write or --verify.`);
  process.exit(2);
}

async function json(url, init = {}) {
  const response = await fetch(url, init);
  const body = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${url.split("?")[0]} -> ${response.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : {};
}

// The emulator treats "Bearer owner" as an admin caller, which listCollectionIds requires.
const emulatorHeaders = { Authorization: "Bearer owner", "Content-Type": "application/json" };

async function collectionIds(parentUrl) {
  const ids = [];
  let pageToken;
  do {
    const page = await json(`${parentUrl}:listCollectionIds`, {
      method: "POST",
      headers: emulatorHeaders,
      body: JSON.stringify({ pageSize: 300, pageToken }),
    });
    ids.push(...(page.collectionIds ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return ids;
}

async function readCollection(relativePath, out) {
  let pageToken;
  do {
    const query = new URLSearchParams({ pageSize: "300", ...(pageToken ? { pageToken } : {}) });
    const page = await json(`${SOURCE}/${relativePath}?${query}`, { headers: emulatorHeaders });
    for (const doc of page.documents ?? []) {
      const docPath = doc.name.slice(SOURCE_ROOT.length + 1);
      out.push({ path: docPath, fields: doc.fields ?? {} });
      for (const sub of await collectionIds(`${SOURCE}/${docPath}`)) {
        await readCollection(`${docPath}/${sub}`, out);
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
}

// Reference values name their database; point any at the target so they stay valid there.
function retarget(value) {
  if (Array.isArray(value)) return value.map(retarget);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) =>
        key === "referenceValue" && typeof inner === "string" && inner.startsWith(SOURCE_ROOT)
          ? [key, TARGET_ROOT + inner.slice(SOURCE_ROOT.length)]
          : [key, retarget(inner)],
      ),
    );
  }
  return value;
}

function topCollection(path) {
  return path.split("/")[0];
}

function countBy(docs) {
  const counts = {};
  for (const doc of docs) {
    const key = doc.path.split("/").length > 2 ? `${topCollection(doc.path)} (subcollections)` : topCollection(doc.path);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function cloudToken() {
  try {
    return execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    throw new Error("gcloud could not issue a token; run `gcloud auth login` without guard.env sourced.");
  }
}

async function write(docs, token) {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  let written = 0;
  for (let start = 0; start < docs.length; start += BATCH_SIZE) {
    let pending = docs.slice(start, start + BATCH_SIZE);
    for (let attempt = 1; pending.length > 0; attempt++) {
      const result = await json(`${TARGET}:batchWrite`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          writes: pending.map((doc) => ({ update: { name: `${TARGET_ROOT}/${doc.path}`, fields: retarget(doc.fields) } })),
        }),
      });
      const failed = pending.filter((_, i) => (result.status?.[i]?.code ?? 0) !== 0);
      written += pending.length - failed.length;
      if (failed.length && attempt === 3) {
        throw new Error(`${failed.length} writes still failing after 3 attempts, first: ${failed[0].path}`);
      }
      pending = failed;
    }
    console.log(`written ${written} / ${docs.length}`);
  }
}

async function cloudCount(collectionPath, token) {
  const slash = collectionPath.lastIndexOf("/");
  const parent = slash < 0 ? TARGET : `${TARGET}/${collectionPath.slice(0, slash)}`;
  const collectionId = collectionPath.slice(slash + 1);
  const result = await json(`${parent}:runAggregationQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredAggregationQuery: {
        structuredQuery: { from: [{ collectionId }] },
        aggregations: [{ alias: "n", count: {} }],
      },
    }),
  });
  return Number(result[0]?.result?.aggregateFields?.n?.integerValue ?? 0);
}

const docs = [];
for (const id of await collectionIds(SOURCE)) await readCollection(id, docs);
const counts = countBy(docs);
console.log(`emulator: ${docs.length} documents`, counts);

if (mode === "--write") {
  await write(docs, cloudToken());
  console.log(`done: ${docs.length} documents in ${TARGET_PROJECT}/${TARGET_DATABASE}`);
} else if (mode === "--verify") {
  const token = cloudToken();
  const collections = [...new Set(docs.map((d) => d.path.split("/").slice(0, -1).join("/")))];
  let mismatches = 0;
  for (const collection of collections) {
    const expected = docs.filter((d) => d.path.split("/").slice(0, -1).join("/") === collection).length;
    const actual = await cloudCount(collection, token);
    if (actual !== expected) mismatches++;
    if (actual !== expected || collection.split("/").length === 1) {
      console.log(`${actual === expected ? "ok  " : "DIFF"} ${collection}: cloud ${actual}, emulator ${expected}`);
    }
  }
  console.log(mismatches ? `${mismatches} collections differ` : "all collections match");
  process.exitCode = mismatches ? 1 : 0;
}
