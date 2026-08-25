import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * Binds a generated PDF to the credential that generated it.
 *
 * ## The problem
 *
 * `generate_report` names its output `report_<8 hex>.pdf` — about 32 bits of entropy — writes it
 * to local disk, and hands the URL back to the model, which puts it in front of the user. Nothing
 * expires it. Before this module, `GET /api/v1/reports/:filename` had no authentication at all,
 * so those PDFs, which contain a named customer's site coordinates and water-quality readings,
 * were guessable capability URLs.
 *
 * ## Why an owner check, and not just a login gate
 *
 * `requireCallerToken` alone would fix the *unauthenticated* half and leave the interesting half:
 * every route in this service is org-scoped by the caller's token, so a report gate that accepts
 * **any** valid token lets one organization read another's report by guessing eight hex
 * characters. The whole point of forwarding the caller's token upstream is that org A never sees
 * org B's data; a report endpoint that ignores that would be the one place it leaks.
 *
 * ## Why a hash of the token, and why a file
 *
 * This service cannot verify a JWT — it has no `ACCESS_TOKEN_SECRET` — so it has no user id and
 * no organization to bind to, only the opaque bearer string itself. Reading `sub` out of an
 * unverified payload would bind ownership to a claim any caller can forge by editing base64,
 * which is not ownership at all. `quotaKey.ts` reached the same conclusion for the same reason:
 * hashing the whole token means producing a second identity requires producing a second token the
 * device API accepts.
 *
 * The hash goes in a sidecar file next to the PDF rather than in a process-memory map because the
 * PDF outlives the process — the map would forget owners on every restart while the reports it
 * described stayed on disk, i.e. reports nobody could ever fetch. A sidecar has exactly the PDF's
 * lifetime: same directory, deleted by the same `rm -rf`, gone in the same redeploy.
 *
 * ## Residual risk, accepted deliberately
 *
 * - **A re-login loses access to older reports.** A fresh `POST /users/login` mints a different
 *   token string, so the same human hashes differently and their earlier PDFs become unreachable.
 *   Acceptable here: reports are generated and linked within one conversation, they already do
 *   not survive a redeploy, and the alternative — trusting an unverified `sub` — is a worse trade
 *   than asking someone to regenerate a report. Real per-user report history needs real identity,
 *   which is the same work `quotaKey.ts` is waiting on.
 * - **Anyone holding the token holds the report.** That is the definition of a bearer credential
 *   and is true of every other route here.
 * - **No expiry.** Out of scope for this fix; the PDFs are already tied to a disk that does not
 *   survive a redeploy. A TTL sweeper is a reasonable follow-up, not a prerequisite.
 */

/**
 * Appended to the PDF's own name. `.pdf.owner` cannot itself be requested through the route:
 * `ReportController`'s `SAFE_FILENAME` requires the name to *end* in `.pdf`.
 */
const OWNER_SUFFIX = ".owner";

/**
 * Full sha256, not the 16-char prefix `quotaKey.ts` truncates to — this one decides access rather
 * than which counter a request lands in, so there is no reason to trade any of it for legibility.
 */
const fingerprint = (token: string): string => crypto
  .createHash("sha256")
  .update(token)
  .digest("hex");

const sidecarPath = (reportsDir: string, filename: string): string => (
  path.join(reportsDir, `${filename}${OWNER_SUFFIX}`)
);

/** Records who a freshly written report belongs to. Called once, right after the PDF lands. */
export const recordReportOwner = (
  reportsDir: string,
  filename: string,
  token: string,
): void => {
  fs.writeFileSync(sidecarPath(reportsDir, filename), fingerprint(token), "utf8");
};

/**
 * Whether `token` is the credential this report was generated with.
 *
 * **Fails closed on a missing or unreadable sidecar.** A PDF with no owner file is one written
 * before this existed, or one whose sidecar was removed; either way nothing here can establish
 * who it belongs to, and "cannot establish" must not read as "anyone".
 */
export const isReportOwner = (
  reportsDir: string,
  filename: string,
  token: string,
): boolean => {
  let recorded: string;
  try {
    recorded = fs.readFileSync(sidecarPath(reportsDir, filename), "utf8").trim();
  } catch {
    return false;
  }

  const a = Buffer.from(recorded, "utf8");
  const b = Buffer.from(fingerprint(token), "utf8");
  // Length-checked first: `timingSafeEqual` throws on a mismatch rather than returning false.
  // Both sides are hex digests of a fixed width, so an unequal length means a corrupt sidecar.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
