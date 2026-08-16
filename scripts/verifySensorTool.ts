import { DeviceApiClient } from "../src/devices/DeviceApiClient";
import { QuerySensorData, dedupeByLabel } from "../src/tools/querySensorData";
import { config } from "../src/config";

/**
 * Live read-only check that `query_sensor_data` is pulling real pod data.
 *
 *   npm run verify:sensor                      # both cleared pods
 *   npm run verify:sensor -- --pods=Algalita   # one of them
 *   npm run verify:sensor -- --json            # machine-readable
 *
 * **No LLM is involved and nothing is written.** This runs the tool directly, so a failure here
 * is a data-path failure — credentials, device matching, decoding, aggregation — with the model
 * removed as a variable. Verify this before spending tokens on a chat round-trip; a wrong answer
 * in the chat is much harder to attribute when both halves are untested.
 *
 * These calls hit **production**. There is no QA mirror (`docs/migration/DEVICE_API.md` §3), so
 * every request is a read against a live customer fleet: no writes, no bursts, one pod at a time.
 *
 * What to look for is printed as a checklist at the end. The interesting rows are the ones that
 * would look plausible if they were wrong — temperature in the right unit, a stale pod reporting
 * `null` rather than `0`, and turbidity carrying its provisional-index caveat.
 */

interface Args {
  pods: string[];
  json: boolean;
}

const parseArgs = (argv: string[]): Args => {
  const args: Args = { pods: ["Algalita", "OWC"], json: false };
  argv.forEach((arg) => {
    if (arg.startsWith("--pods=")) {
      args.pods = arg.slice("--pods=".length).split(",").map((pod) => pod.trim()).filter(Boolean);
    } else if (arg === "--json") {
      args.json = true;
    }
  });
  return args;
};

/** One representative query per thing that could silently be wrong. */
const PROBES: Array<{ label: string; args: Record<string, unknown>; watch: string }> = [
  {
    label: "latest dissolved oxygen",
    args: { metric: "dissolved_oxygen", time_range: "now", aggregation: "latest" },
    watch: "a real value with a timestamp, not null",
  },
  {
    label: "latest temperature",
    args: { metric: "temperature", time_range: "now", aggregation: "latest" },
    watch: "°F and plausible for the site — a value near 20-30 means Celsius leaked through",
  },
  {
    label: "mean pH over the last day",
    args: { metric: "ph", time_range: "last day", aggregation: "mean" },
    watch: "n_samples > 0, and the resolved range ending at the pod's own last reading",
  },
  {
    label: "mean conductivity over the last day",
    args: { metric: "conductivity", time_range: "last day", aggregation: "mean" },
    watch: "the water-type note when the pod disagrees with WATER_TYPE",
  },
  {
    label: "mean turbidity over the last day",
    args: { metric: "turbidity", time_range: "last day", aggregation: "mean" },
    watch: "the provisional/uncalibrated caveat travelling with the number",
  },
  {
    label: "min dissolved oxygen over the last week",
    args: { metric: "dissolved_oxygen", time_range: "last week", aggregation: "min" },
    watch: "a wider window than the last probe, still anchored to the last reading",
  },
];

const short = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(4);
  return String(value);
};

const run = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));

  if (!config.deviceApi.baseUrl) {
    process.stdout.write("DEVICE_API_BASE_URL is not set. See docs/migration/DEVICE_API.md §5.\n");
    process.exitCode = 1;
    return;
  }
  if (!config.deviceApi.devToken) {
    process.stdout.write("DEVICE_API_TOKEN is not set. See docs/migration/DEVICE_API.md §5.\n");
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Device API: ${config.deviceApi.baseUrl}\n`);
  process.stdout.write(`Token: present (${config.deviceApi.devToken.length} chars, not printed)\n`);
  process.stdout.write(`WATER_TYPE: ${config.waterType}\n`);
  process.stdout.write(`SENSOR_TOOL: ${config.tools.sensorTool} (not required by this script)\n\n`);

  const client = new DeviceApiClient();
  const devices = dedupeByLabel(await client.listDevices());
  process.stdout.write(`Devices visible to this token: ${devices.length}\n`);

  const results: Record<string, Record<string, unknown>> = {};

  for (const pod of args.pods) {
    process.stdout.write(`\n${"=".repeat(72)}\n${pod}\n${"=".repeat(72)}\n`);

    // A fresh instance per pod so the device-list cache is exercised the way a request would.
    const tool = new QuerySensorData({ client });

    for (const probe of PROBES) {
      // Sequential on purpose: this is someone else's production API.
      // eslint-disable-next-line no-await-in-loop
      const result = await tool.run({ ...probe.args, device: pod });
      results[`${pod} — ${probe.label}`] = result;

      if (args.json) {
        continue;
      }

      if (result.error) {
        process.stdout.write(`\n  ${probe.label}\n    ERROR: ${String(result.error)}\n`);
        continue;
      }

      const range = result.time_range_resolved as { start: string; end: string } | null;
      process.stdout.write(`\n  ${probe.label}\n`);
      process.stdout.write(`    value        ${short(result.value)} ${String(result.unit ?? "")}\n`);
      process.stdout.write(`    n_samples    ${short(result.n_samples)}`);
      process.stdout.write(`   faulted excluded ${short(result.excluded_faulted)}\n`);
      if (result.observed_at) {
        process.stdout.write(`    observed_at  ${String(result.observed_at)}\n`);
      }
      process.stdout.write(`    range        ${range ? `${range.start} → ${range.end}` : "none"}\n`);
      process.stdout.write(`    last report  ${short(result.device_last_reported)}\n`);
      if (result.note) {
        process.stdout.write(`    note         ${String(result.note)}\n`);
      }
      process.stdout.write(`    watch for    ${probe.watch}\n`);
    }
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }

  process.stdout.write(`\n${"=".repeat(72)}\nWhat a passing run looks like\n${"=".repeat(72)}\n`);
  process.stdout.write([
    "  * Algalita Pod returns real values and n_samples in the tens for a day window.",
    "  * Temperature reads in the high 60s-80s °F. A value around 20-30 means the Celsius",
    "    normalization was bypassed and the decoder is being sidestepped somewhere.",
    "  * Old Woman Creek 2026 may return value: null with n_samples: 0 — that is CORRECT if",
    "    the pod is still silent. It must never return 0 for all six metrics.",
    "  * Its resolved range ends at its own last reading, not at today.",
    "  * Conductivity on Algalita carries the water-type note whenever WATER_TYPE is freshwater.",
    "  * Turbidity always carries the provisional/uncalibrated caveat.",
    "",
  ].join("\n"));
};

run().catch((error: unknown) => {
  process.stdout.write(`\nFAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
