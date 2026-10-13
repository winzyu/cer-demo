// Read-only: the Algalita Pod's registry record and the last 32 days of /water/period readings from
// the device API named in .env, written as raw JSON to argv[2]. Production: run it yourself, after
// announcing it; it makes two GET requests and writes nothing anywhere but the output file.
//
//   node scripts/flagging/pullAlgalitaReadings.mjs <out.json>
import fs from "fs";

const out = process.argv[2];
if (!out) throw new Error("usage: node scripts/flagging/pullAlgalitaReadings.mjs <out.json>");
const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split("\n")
  .map((line) => /^([A-Z_]+)=(.*)$/.exec(line)).filter(Boolean)
  .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const base = env.DEVICE_API_BASE_URL.replace(/\/+$/, "");
const headers = { Authorization: `Bearer ${env.DEVICE_API_TOKEN}` };
const label = "dev:351077454569099";
const get = async (path) => {
  const response = await fetch(base + path, { headers });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.json();
};
const devices = await get("/devices");
const device = devices.find((d) => d?.data?.label === label);
const readings = await get(`/water/period/32/day?device=${encodeURIComponent(label)}`);
fs.writeFileSync(out, JSON.stringify({ fetchedAt: new Date().toISOString(), device, readings }));
console.log(`device found: ${Boolean(device)}; readings: ${readings.length}; `
  + `first ${readings[0]?.date}; last ${readings.at(-1)?.date}`);
