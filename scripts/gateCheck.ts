/**
 * `npm run gate:check` — decides `RETRIEVAL_BAKEOFF.md` §8a's three hard gates over captured
 * transcripts. No LLM, no network, deterministic, seconds per run.
 *
 * **Why it runs before the judge.** §8a makes fabricated figures, refusal integrity and citation
 * validity *absolute*: an arm failing one is out at any price. Deciding them mechanically and
 * first means never paying to grade an arm that was already eliminated, and it means the check can
 * be re-run after every corpus change instead of once per funded sweep (§8b).
 *
 * **What a pass does not mean.** Clearing these three says an arm did not invent a number, refused
 * where it had to, and cited nothing it was not given. It says nothing about whether the answers
 * were correct — that is §8a's other two gates and they need a judge.
 *
 *   npm run gate:check
 *   npm run gate:check -- --pass=cold --arm=firestore-direct
 *   npm run gate:check -- --tolerance=0 --out=data/gate-check/warm.json
 */
import fs from "fs";
import path from "path";
import { runGateCheck } from "../src/eval/gates/runner";
import type { ArmGateResult } from "../src/eval/gates/runner";
import { createLogger } from "../src/utils/logger";

const log = createLogger("GateCheck");

const arg = (name: string): string | undefined => process.argv
  .find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const mark = (met: boolean): string => (met ? "PASS" : "FAIL");

const printArm = (result: ArmGateResult): void => {
  const { refusal, citations, figures } = result;

  log.info("");
  log.info(`${result.arm}  (${result.pass} pass, ${result.turns} turns)  ${mark(result.gatesMet)}`);
  log.info(
    `  refusal integrity   ${mark(refusal.met).padEnd(4)}  `
    + `${refusal.required} required — ${refusal.exact} exact, ${refusal.normalized} folded, `
    + `${refusal.tolerance} within tolerance, ${refusal.absent} absent`,
  );
  log.info(
    `  citation validity   ${mark(citations.met).padEnd(4)}  `
    + `${citations.valid}/${citations.total} resolve `
    + `(${(citations.rate * 100).toFixed(1)}%, floor 95%)`,
  );
  log.info(
    `  fabricated figures  ${mark(figures.met).padEnd(4)}  `
    + `${figures.unexplained} unexplained of ${figures.total} `
    + `(${figures.conversions} explained by °C/°F conversion)`,
  );

  if (result.findings.length > 0) {
    log.info(`  findings (${result.findings.length}):`);
    result.findings.slice(0, 20).forEach((f) => {
      log.info(`    [${f.gate}] ${f.fixtureId} t${f.turn}: ${f.detail}`);
    });
    if (result.findings.length > 20) {
      log.info(`    ... ${result.findings.length - 20} more (use --out to see them all)`);
    }
  }
};

const main = (): void => {
  const pass = arg("pass") ?? "warm";
  const arms = arg("arm")?.split(",");
  const tolerance = arg("tolerance") ? Number(arg("tolerance")) : undefined;
  const outPath = arg("out");

  if (tolerance !== undefined && (!Number.isInteger(tolerance) || tolerance < 0)) {
    throw new Error(`--tolerance must be a non-negative integer, got "${arg("tolerance")}".`);
  }

  const results = runGateCheck({ pass, arms, tolerance });

  if (results.length === 0) {
    throw new Error(`No arms found for the "${pass}" pass.`);
  }

  results.forEach(printArm);

  log.info("");
  log.info("Tier 1 summary (§8a hard gates):");
  results.forEach((r) => log.info(`  ${r.arm.padEnd(22)} ${mark(r.gatesMet)}`));
  log.info("");
  log.info("These gates decide admission to the judging pass, not answer quality.");
  log.info("Correctness and ungrounded claims still need §7b's judge on the survivors.");

  if (outPath) {
    const resolved = path.resolve(outPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, `${JSON.stringify(results, null, 2)}\n`, "utf8");
    log.info(`\nWrote ${path.relative(process.cwd(), resolved)}`);
  }
};

main();
