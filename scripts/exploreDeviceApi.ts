/**
 * Device-API exploration and recording.
 *
 * Read-only reconnaissance against the live Clean Earth backend: list the pods the token can
 * see, pull a sample of readings from the ones we are cleared to test with, and **record every
 * raw response to disk** so the rest of Phase N3 can be built and tested without re-hitting
 * someone else's production API.
 *
 * The recording is the point. `docs/migration/DEVICE_API.md` documents the contract as read from
 * the backend's source; this proves what the deployment actually returns, and the captured
 * fixtures become the offline test data for `query_sensor_data`.
 *
 *   npm run explore:devices                       # list pods only — one cheap call, no readings
 *   npm run explore:devices -- --pods=Algalita,OWC # sample the pods we are cleared to use
 *   npm run explore:devices -- --all               # sample every visible pod
 *   npm run explore:devices -- --no-record         # print, write nothing
 *
 * Credentials: `DEVICE_API_BASE_URL` + `DEVICE_API_TOKEN` in `.env`, or `--email/--password`
 * (or `CER_EMAIL`/`CER_PASSWORD`) to log in and mint a token for this run.
 */

import { promises as fs } from "fs";
import path from "path";
import { DeviceApiClient } from "../src/devices/DeviceApiClient";
import { METRICS, formatMetric } from "../src/devices/metrics";
import { config } from "../src/config";
import type { DeviceSummary, PeriodUnit } from "../src/types/device.types";

/**
 * Pods the operator cleared for testing. Overridable with `--pods=`.
 *
 * "OWC" is registered as **"Old Woman Creek 2026"** — the acronym appears nowhere in the device
 * name, so a filter of `owc` alone silently matches nothing and the run looks like a success
 * with one pod missing. Both spellings are kept for that reason.
 */
const DEFAULT_POD_FILTERS = ["algalita", "old woman creek", "owc"];

const OUT_ROOT = path.join(process.cwd(), "data", "device-api");

interface Args {
  filters: string[];
  all: boolean;
  record: boolean;
  email?: string;
  password?: string;
  outDir: string;
}

const parseArgs = (argv: string[]): Args => {
  const args: Args = {
    filters: DEFAULT_POD_FILTERS,
    all: false,
    record: true,
    email: process.env.CER_EMAIL,
    password: process.env.CER_PASSWORD,
    outDir: OUT_ROOT,
  };

  argv.forEach((arg) => {
    const [flag, ...rest] = arg.split("=");
    const value = rest.join("=");
    switch (flag) {
      case "--pods":
        args.filters = value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        break;
      case "--all":
        args.all = true;
        break;
      case "--no-record":
        args.record = false;
        break;
      case "--email":
        args.email = value;
        break;
      case "--password":
        args.password = value;
        break;
      case "--out":
        args.outDir = path.resolve(value);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  });

  return args;
};

/** Substring match on name or label, case-insensitive — pod names are typed by humans. */
const matches = (device: DeviceSummary, filters: string[]): boolean => {
  const haystack = `${device.name ?? ""} ${device.label ?? ""}`.toLowerCase();
  return filters.some((filter) => haystack.includes(filter));
};

/**
 * Collapses registry entries that share a `label`.
 *
 * The registry holds genuine duplicates — "Algalita Pod" appears three times under three
 * document ids, twice within the same organization, all pointing at `dev:351077454569099`.
 * A label is one physical pod, so sampling per document id would hit the same device N times
 * and record N identical copies of its readings as if they were separate evidence.
 */
const dedupeByLabel = (devices: DeviceSummary[]): DeviceSummary[] => {
  const seen = new Map<string, DeviceSummary>();
  devices.forEach((device) => {
    if (device.label && !seen.has(device.label)) {
      seen.set(device.label, device);
    }
  });
  return [...seen.values()];
};

const write = async (dir: string, name: string, payload: unknown): Promise<void> => {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

/**
 * Windows sampled per pod. Small and fixed: enough to see whether a pod is currently reporting
 * and what its recent range looks like, without pulling a five-year series off a production
 * database on a reconnaissance run.
 */
const WINDOWS: Array<{ duration: number; unit: PeriodUnit; slug: string }> = [
  { duration: 1, unit: "day", slug: "1-day" },
  { duration: 1, unit: "week", slug: "1-week" },
];

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));

  if (!config.deviceApi.baseUrl) {
    throw new Error(
      "DEVICE_API_BASE_URL is not set. Add it to .env — see docs/migration/DEVICE_API.md §5.",
    );
  }

  let client = new DeviceApiClient();
  client.describe();

  if (args.email && args.password) {
    // Minted for this run only and never written to disk — the recorded output is read
    // through by humans and would otherwise carry a live credential into a shared folder.
    process.stdout.write("Logging in...\n");
    const token = await client.login(args.email, args.password);
    client = new DeviceApiClient({ token });
    process.stdout.write("  token acquired (not recorded)\n");
  } else if (!config.deviceApi.devToken) {
    throw new Error(
      "No credentials. Set DEVICE_API_TOKEN in .env, or pass --email= and --password=.",
    );
  }

  const runDir = path.join(args.outDir, new Date().toISOString().replace(/[:.]/g, "-"));

  process.stdout.write("\nFetching device list...\n");
  const devices = await client.listDevices();
  process.stdout.write(`  ${devices.length} device(s) visible to this token\n\n`);

  process.stdout.write("NAME                                LABEL                     ENVIRONMENT\n");
  process.stdout.write("-".repeat(88));
  process.stdout.write("\n");
  devices.forEach((device) => {
    const name = (device.name ?? "(unnamed)").padEnd(35);
    const label = (device.label ?? "(no label)").padEnd(25);
    process.stdout.write(`${name} ${label} ${device.operatingEnvironment ?? "—"}\n`);
  });
  process.stdout.write("\n");

  if (args.record) {
    await write(runDir, "devices.json", devices);
    process.stdout.write(`Recorded device list -> ${path.relative(process.cwd(), runDir)}\n\n`);
  }

  const matched = args.all ? devices : devices.filter((d) => matches(d, args.filters));
  const selected = dedupeByLabel(matched);
  if (matched.length !== selected.length) {
    process.stdout.write(
      `Note: ${matched.length} registry entries collapsed to ${selected.length} distinct pod(s) by label.\n`,
    );
  }

  if (selected.length === 0) {
    process.stdout.write(
      `No device matched [${args.filters.join(", ")}].\n`
      + "The names above are what this token can actually see — adjust --pods= to match one,\n"
      + "or use --all. If the pods you expect are missing, the token belongs to a different\n"
      + "organization: the backend scopes /devices to the token holder's org.\n",
    );
    return;
  }

  process.stdout.write(`Sampling ${selected.length} pod(s): ${selected.map((d) => d.name ?? d.label).join(", ")}\n`);

  for (const device of selected) {
    const label = device.label;
    if (!label) {
      process.stdout.write(`\n  ${device.name ?? device.id}: no label — cannot be queried, skipping\n`);
      continue;
    }

    const podDir = path.join(runDir, label.replace(/[^a-zA-Z0-9._-]/g, "_"));
    process.stdout.write(`\n=== ${device.name ?? label} (${label}) ===\n`);

    // Sequential on purpose: this is someone else's production API, and a reconnaissance
    // script has no business opening a burst of parallel connections against it.
    /* eslint-disable no-await-in-loop */
    try {
      const last = await client.getLastReading(label);
      if (!last) {
        process.stdout.write(
          "  last reading: none returned. /water/last also filters out readings with no GPS fix,\n"
          + "                so this can mean 'reporting without a fix' rather than 'silent'.\n",
        );
      } else {
        process.stdout.write(`  last reading: ${last.observedAt ?? "(no timestamp)"}`);
        process.stdout.write(last.location ? `  @ ${last.location}\n` : "\n");
        METRICS.forEach((metric) => {
          process.stdout.write(`    ${formatMetric(last.metrics[metric.key])}\n`);
        });
      }
      if (args.record) await write(podDir, "last.json", last);
    } catch (error) {
      process.stdout.write(`  last reading FAILED: ${(error as Error).message}\n`);
    }

    for (const window of WINDOWS) {
      try {
        const averages = await client.getAverages(window.duration, window.unit, label);
        if (averages.empty) {
          // Printing the zeros here would put "DO 0 mg/L, pH 0" in front of a human as if the
          // pod had measured it. It measured nothing.
          process.stdout.write(
            `  avg ${window.slug}: NO READINGS in window (API returned zeros for all six metrics)\n`,
          );
        } else {
          const summary = METRICS
            .map((m) => averages.metrics[m.key])
            .filter((m) => m.value !== undefined)
            .map((m) => `${m.label} ${m.value}${m.unit ? ` ${m.unit}` : ""}`)
            .join(", ");
          process.stdout.write(`  avg ${window.slug}: ${summary || "(no data)"}\n`);
        }
        if (args.record) await write(podDir, `average-${window.slug}.json`, averages.raw);
      } catch (error) {
        process.stdout.write(`  avg ${window.slug} FAILED: ${(error as Error).message}\n`);
      }
    }

    try {
      const period = await client.getPeriod(1, "day", label);
      const faulted = period.filter(
        (reading) => METRICS.some((m) => reading.metrics[m.key].valid === false),
      ).length;
      process.stdout.write(
        `  period 1-day: ${period.length} reading(s)`
        + (faulted > 0 ? `, ${faulted} with at least one probe fault\n` : "\n"),
      );
      if (args.record) {
        // Raw, not decoded: the decoder is the thing these fixtures exist to test.
        await write(podDir, "period-1-day.json", period.map((reading) => reading.raw));
      }
    } catch (error) {
      process.stdout.write(`  period 1-day FAILED: ${(error as Error).message}\n`);
    }
    /* eslint-enable no-await-in-loop */
  }

  if (args.record) {
    process.stdout.write(
      `\nRecorded to ${path.relative(process.cwd(), runDir)}\n`
      + "data/ is git-ignored — sensor data is confidential per CLAUDE.md.\n",
    );
  }
};

main().catch((error: Error) => {
  process.stderr.write(`\nExploration failed: ${error.message}\n`);
  process.exit(1);
});
