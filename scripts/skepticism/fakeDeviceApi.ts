/**
 * A local stand-in for the device API, serving the data-skepticism fleet
 * (`test/fixtures/skepticism/fleet.ts`) so the paid replay never reads production.
 *
 *   npx ts-node --transpile-only scripts/skepticism/fakeDeviceApi.ts [--port 5199] [--log <file>] [--ph-swing 1.9] [--noaa-tides]
 *
 * Point the server at it with `DEVICE_API_BASE_URL=http://localhost:5199/api/v1`. Any bearer token
 * is accepted and every pod belongs to the caller. The fleet is built once at start-up, ending at
 * that instant, so restart it between sessions to keep the readings current. Each request is
 * appended to the log as one JSON line. `--ph-swing` sets Bay Mouth's dawn-to-afternoon pH fall
 * (`FleetOptions.bayMouthPhSwing`): 1.9 takes every afternoon well below the pod's minimum of 6.
 * `--noaa-tides` reads NOAA's predicted tides at the station nearest Tidal Flat Pod (a public API,
 * no key) and drives that pod's tide from them, so `get_tides` finds its peaks following the real
 * tide; without it the pod's tide is synthetic and matches no station.
 */
import fs from "fs";
import http from "http";
import { NoaaTides, type TideEvent } from "../../src/tides/noaaTides";
import {
  DEFAULT_PH_SWING, SCENARIO_DAYS, TIDAL_FLAT_SITE, buildFleet, routeDeviceApi,
} from "../../test/fixtures/skepticism/fleet";

const argument = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : fallback;
};

const port = Number(argument("port", "5199"));
const logFile = argument("log", "");
const phSwing = Number(argument("ph-swing", String(DEFAULT_PH_SWING)));
const now = Math.floor(Date.now() / 60_000) * 60_000;

/** Highs and lows covering Tidal Flat's readings, a day either side, at its nearest station. */
const realTides = async (): Promise<{ tides: TideEvent[]; station: string }> => {
  const noaa = new NoaaTides();
  const nearest = await noaa.nearestStation(TIDAL_FLAT_SITE.lat, TIDAL_FLAT_SITE.lon);
  if (!nearest) throw new Error("NOAA lists no tide station near Tidal Flat Pod");
  const day = 24 * 60 * 60_000;
  const tides = await noaa.highsAndLows(nearest.station.id, now - (SCENARIO_DAYS + 1) * day, now + day);
  return { tides, station: `${nearest.station.id} ${nearest.station.name}, ${nearest.distanceKm.toFixed(1)} km, ${tides.length} highs and lows` };
};

const start = async (): Promise<void> => {
  const real = process.argv.includes("--noaa-tides") ? await realTides() : undefined;
  const fleet = buildFleet(now, { bayMouthPhSwing: phSwing, tidalFlatTides: real?.tides });

  const server = http.createServer((req, res) => {
    const path = req.url ?? "/";
    const authorized = /^Bearer \S+/.test(req.headers.authorization ?? "");
    const body = authorized && req.method === "GET" ? routeDeviceApi(fleet, path) : undefined;
    const status = !authorized ? 401 : body === undefined ? 404 : 200;
    if (logFile) fs.appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), path, status })}\n`);
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body ?? { error: status === 401 ? "missing bearer token" : `not served: ${path}` }));
  });

  server.listen(port, "127.0.0.1", () => {
    const counts = Object.entries(fleet.readings).map(([label, rows]) => `${label} ${rows.length}`).join(", ");
    console.log(`[FakeDeviceAPI] http://127.0.0.1:${port}/api/v1, fleet ending ${new Date(fleet.now).toISOString()}, pH swing ${phSwing}: ${counts}`);
    console.log(`[FakeDeviceAPI] Tidal Flat tide: ${real ? `NOAA ${real.station}` : "synthetic"}`);
  });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
