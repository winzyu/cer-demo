/**
 * CLI: describe the shape of a Firestore database without printing its contents.
 *
 *   npx ts-node scripts/censusFirestore.ts --project <id> --database <id> [--out <file>]
 *
 * Read-only: the script never writes, and it prints only collection names, document counts, field
 * paths with their types and how many sampled documents carry each, array lengths, the value sets
 * of a few enumerated fields named in ENUM_FIELDS, and min/avg/max of numeric sensor readings.
 * It never prints document ids, names, emails, text or coordinates (no statistics on lat/lon).
 * Map keys that look like ids or emails collapse to `{*}`, so a map keyed by user id cannot leak
 * its keys.
 *
 * The server's mirror seed (`clean-earth-rovers-server` `scripts/mirror/`) is built from this
 * output, so the local database has production's shape without production's records.
 * Uses Application Default Credentials (`gcloud auth application-default login`).
 */
import { writeFileSync } from "fs";
import {
  Firestore, Timestamp, GeoPoint, DocumentReference,
} from "@google-cloud/firestore";

/** How many documents to sample per collection; anything not listed gets DEFAULT_SAMPLE. */
const SAMPLES: Record<string, { limit: number; orderBy?: string }> = {
  devices: { limit: 500 },
  organizations: { limit: 500 },
  users: { limit: 200 },
  chats: { limit: 20, orderBy: "lastInteraction" },
  "water-data": { limit: 500, orderBy: "timestamp" },
};
const DEFAULT_SAMPLE = 50;

/** Fields whose distinct values are categories, not personal data. */
const ENUM_FIELDS = new Set(["role", "operatingEnvironment", "notificationFrequency", "displayed", "archived"]);

/** Numeric fields under these prefixes get min/avg/max, which the mirror's fake readings follow. */
const STAT_PREFIXES = ["water_data."];

/** Firmware writes this when a sensor fails to read (see the server's DevicesService). */
const SENSOR_FAILURE = 1_000_000_000;

/** A key is shown only if it reads like a schema word or a numeric sensor code. */
const isSchemaKey = (key: string): boolean => /^\d{1,4}$/.test(key) || (/^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(key) && !/^(?=.*\d)[A-Za-z0-9]{16,}$/.test(key));

interface FieldStats {
  types: Record<string, number>;
  present: number;
  values?: Record<string, number>;
  numeric?: { n: number; min: number; max: number; sum: number; failures: number };
  arrayLength?: { min: number; max: number; sum: number; n: number };
}

const typeOf = (value: unknown): string => {
  if (value === null) return "null";
  if (value instanceof Timestamp) return "timestamp";
  if (value instanceof GeoPoint) return "geopoint";
  if (value instanceof DocumentReference) return "reference";
  if (Buffer.isBuffer(value)) return "bytes";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "double";
  if (typeof value === "object") {
    return (value as { constructor?: { name?: string } }).constructor?.name === "VectorValue" ? "vector" : "map";
  }
  return typeof value;
};

const record = (fields: Map<string, FieldStats>, path: string, value: unknown): void => {
  const stats = fields.get(path) ?? { types: {}, present: 0 };
  fields.set(path, stats);
  const type = typeOf(value);
  stats.types[type] = (stats.types[type] ?? 0) + 1;
  stats.present += 1;

  const leaf = path.split(".").pop() ?? "";
  const enumerable = type === "string" || type === "boolean";
  if (ENUM_FIELDS.has(leaf) && enumerable && String(value).length <= 40) {
    stats.values = stats.values ?? {};
    stats.values[String(value)] = (stats.values[String(value)] ?? 0) + 1;
  }
  let numeric = NaN;
  if (typeof value === "number") numeric = value;
  else if (type === "string" && /^-?\d+(\.\d+)?$/.test(value as string)) numeric = Number(value);
  const isCoordinate = /(^|_)(lat|lon|lng)$/i.test(leaf);
  const isSensorPath = STAT_PREFIXES.some((prefix) => path.startsWith(prefix));
  if (isSensorPath && !isCoordinate && Number.isFinite(numeric)) {
    const s = stats.numeric ?? {
      n: 0, min: Infinity, max: -Infinity, sum: 0, failures: 0,
    };
    stats.numeric = s;
    if (numeric >= SENSOR_FAILURE) s.failures += 1;
    else {
      s.n += 1; s.sum += numeric;
      s.min = Math.min(s.min, numeric); s.max = Math.max(s.max, numeric);
    }
  }

  if (type === "array") {
    const items = value as unknown[];
    const a = stats.arrayLength ?? {
      min: Infinity, max: 0, sum: 0, n: 0,
    };
    stats.arrayLength = a;
    a.min = Math.min(a.min, items.length); a.max = Math.max(a.max, items.length);
    a.sum += items.length; a.n += 1;
    items.forEach((item) => record(fields, `${path}[]`, item));
  } else if (type === "map") {
    const entries = Object.entries(value as Record<string, unknown>);
    const opaque = entries.length > 60 || entries.some(([key]) => !isSchemaKey(key));
    entries.forEach(([key, child]) => record(fields, `${path}.${opaque ? "{*}" : key}`, child));
  }
};

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const main = async (): Promise<void> => {
  const projectId = argument("project");
  const databaseId = argument("database");
  if (!projectId || !databaseId) throw new Error("Usage: --project <id> --database <id> [--out <file>]");
  const db = new Firestore({ projectId, databaseId });
  const target = process.env.FIRESTORE_EMULATOR_HOST ? `emulator ${process.env.FIRESTORE_EMULATOR_HOST}` : "LIVE";
  console.error(`Census of ${projectId}/${databaseId} (${target}), read-only.`);

  const collections = await db.listCollections();
  const report: Record<string, unknown> = {};
  for (const collection of collections) {
    const { limit, orderBy } = SAMPLES[collection.id] ?? { limit: DEFAULT_SAMPLE };
    // eslint-disable-next-line no-await-in-loop
    const { count } = (await collection.count().get()).data();
    const query = orderBy ? collection.orderBy(orderBy, "desc").limit(limit) : collection.limit(limit);
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await query.get();
    const fields = new Map<string, FieldStats>();
    const subcollections = new Set<string>();
    for (const doc of snapshot.docs) {
      Object.entries(doc.data())
        .forEach(([key, value]) => record(fields, isSchemaKey(key) ? key : "{*}", value));
    }
    // Subcollections, checked on the first few sampled documents only.
    for (const doc of snapshot.docs.slice(0, 10)) {
      // eslint-disable-next-line no-await-in-loop
      (await doc.ref.listCollections()).forEach((sub) => subcollections.add(sub.id));
    }

    const sortedFields = [...fields.entries()].sort(([a], [b]) => a.localeCompare(b));
    report[collection.id] = {
      count,
      sampled: snapshot.size,
      sampleOrder: orderBy ? `${orderBy} desc` : "document id",
      subcollections: [...subcollections].sort(),
      fields: Object.fromEntries(sortedFields.map(([path, s]) => [path, {
        types: s.types,
        present: s.present,
        ...(s.values ? { values: s.values } : {}),
        ...(s.numeric && s.numeric.n > 0 ? {
          numeric: {
            n: s.numeric.n,
            min: s.numeric.min,
            avg: +(s.numeric.sum / s.numeric.n).toFixed(3),
            max: s.numeric.max,
            failures: s.numeric.failures,
          },
        } : {}),
        ...(s.arrayLength ? {
          arrayLength: {
            min: s.arrayLength.min,
            avg: +(s.arrayLength.sum / s.arrayLength.n).toFixed(1),
            max: s.arrayLength.max,
          },
        } : {}),
      }])),
    };
  }

  const output = JSON.stringify({
    projectId, databaseId, takenAt: new Date().toISOString(), collections: report,
  }, null, 2);
  const out = argument("out");
  if (out) writeFileSync(out, `${output}\n`);
  console.log(output);
  await db.terminate();
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
