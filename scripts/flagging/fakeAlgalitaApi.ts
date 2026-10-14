/**
 * A local stand-in for the device API serving the Algalita month (`test/fixtures/algalita/month.ts`)
 * so the flagging replay never reads production.
 *
 *   npx ts-node --transpile-only scripts/flagging/fakeAlgalitaApi.ts [--port 5198] [--log <file>]
 *
 * Point a server at it with `DEVICE_API_BASE_URL=http://localhost:5198/api/v1`. Any bearer token is
 * accepted. The month ends at its newest reading (Oct 13 11:30 PDT), and the sensor tool anchors
 * relative ranges to the newest reading, so "last 30 days" is the customer's period on any day.
 */
import fs from "fs";
import http from "http";
import { routeDeviceApi } from "../../test/fixtures/skepticism/fleet";
import { algalitaMonth } from "../../test/fixtures/algalita/month";

const argument = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : fallback;
};

const port = Number(argument("port", "5198"));
const logFile = argument("log", "");
const fleet = algalitaMonth();

http.createServer((req, res) => {
  const path = req.url ?? "/";
  const authorized = /^Bearer \S+/.test(req.headers.authorization ?? "");
  const body = authorized && req.method === "GET" ? routeDeviceApi(fleet, path) : undefined;
  const status = !authorized ? 401 : body === undefined ? 404 : 200;
  if (logFile) fs.appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), path, status })}\n`);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body ?? { error: status === 401 ? "missing bearer token" : `not served: ${path}` }));
}).listen(port, "127.0.0.1", () => {
  console.log(`[FakeAlgalitaAPI] http://127.0.0.1:${port}/api/v1, ${fleet.readings[Object.keys(fleet.readings)[0]].length} readings ending ${new Date(fleet.now).toISOString()}`);
});
