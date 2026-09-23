/**
 * Renders a report PDF offline, with no server and no LLM.
 *
 *   npx ts-node scripts/renderReport.ts --device="Algalita Pod" --range="last 30 days"
 *
 * Same pipeline `POST /api/v1/reports` runs (`src/report/produceReport.ts`),
 * but driven by `DEVICE_API_TOKEN` the way `verify:sensor` is, so the layout can be iterated on
 * without a chat round-trip. Writes to `generated_reports/` and prints the input it rendered.
 * Wording follows `CATALOGUE_DRAFTS`, as the server's does.
 * Live read-only calls against production — one pod at a time.
 */

import fs from "fs";
import path from "path";
import { DeviceApiClient } from "../src/devices/DeviceApiClient";
import { QuerySensorData } from "../src/tools/querySensorData";
import { prepareReport, renderReportPdf } from "../src/report/produceReport";

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const run = async (): Promise<void> => {
  const device = arg("device", "Algalita Pod");
  const timeRange = arg("range", "last 30 days");
  const out = arg("out", path.join(process.cwd(), "generated_reports", "offline_report.pdf"));

  const sensor = new QuerySensorData({ client: new DeviceApiClient({ useConfiguredToken: true }) });
  const prepared = await prepareReport(sensor, { timeRange, device });
  if (prepared.error !== undefined) {
    process.stdout.write(`FAILED: ${prepared.error}\n`);
    process.exitCode = 1;
    return;
  }
  const {
    report, status, narrative, skippedParameters,
  } = prepared;

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await renderReportPdf(prepared));

  process.stdout.write(`${JSON.stringify({
    out,
    status,
    skippedParameters,
    site: report.site,
    events: report.events,
    narrative: {
      summaryBullets: narrative.summaryBullets,
      parameterAnalysis: [...narrative.parameterAnalysis],
      recommendationsOperational: narrative.recommendationsOperational,
      recommendationsInvestigative: narrative.recommendationsInvestigative,
      recommendationsStakeholder: narrative.recommendationsStakeholder,
    },
    parameters: report.parameters.map((p) => ({
      label: p.baseline.label,
      baseline: [p.baseline.baselineMin, p.baseline.baselineMax, p.baseline.hasFixedBaseline],
      min: p.min,
      max: p.max,
      mean: p.mean,
      median: p.median,
      pattern: p.pattern,
      buckets: p.series?.length,
    })),
    dataQuality: report.dataQuality,
  }, null, 2)}\n`);
};

run().catch((e: unknown) => {
  process.stdout.write(`FAILED: ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exitCode = 1;
});
