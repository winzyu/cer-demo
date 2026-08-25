import { NextFunction, Request, Response } from "express";
import path from "path";
import fs from "fs";
import createHttpError from "http-errors";
import { REPORTS_DIR } from "../tools/generateReport";
import { isReportOwner } from "../report/reportOwnership";
import { callerToken } from "../utils/bearerToken";
import { createLogger } from "../utils/logger";

const log = createLogger("Reports");

/** Matches the `report_<8 hex chars>.pdf` filenames `GenerateReport` writes -- rejects anything
 * else before it reaches a filesystem path, so a `..`-laden request can't escape REPORTS_DIR.
 * Requiring the `.pdf` ending is also what keeps the `.pdf.owner` sidecars unreachable. */
const SAFE_FILENAME = /^[a-zA-Z0-9_-]+\.pdf$/;

/**
 * `GET /api/v1/reports/:filename` — serves a PDF `generate_report` already wrote to disk.
 *
 * Two gates, and they answer different questions. `requireCallerToken` (mounted in
 * `reportRoutes.ts`) asks whether anybody is asking at all. This controller asks whether it is
 * the *same* somebody the report was generated for — see `reportOwnership.ts` for why a valid
 * token from another organization is not good enough, and what residual risk that leaves.
 */
export class ReportController {
  private readonly reportsDir: string;

  /** `reportsDir` is injectable so tests do not have to write into the process's cwd. */
  constructor(reportsDir: string = REPORTS_DIR) {
    this.reportsDir = reportsDir;
  }

  getReport = (req: Request, res: Response, next: NextFunction): void => {
    const { filename } = req.params;
    if (!SAFE_FILENAME.test(filename)) {
      next(createHttpError(400, "Invalid report filename."));
      return;
    }

    // Non-null by construction: `requireCallerToken` refuses the request before it gets here.
    const token = callerToken(req) as string;
    const filePath = path.join(this.reportsDir, filename);

    // One answer for "no such report" and for "not yours", on purpose. The filenames are eight
    // hex characters, so a distinguishable 403 would turn this route into an oracle that confirms
    // a guess — letting an attacker enumerate which reports exist before working on getting at
    // one. A 404 tells a legitimate caller exactly what they need to know: this URL will not
    // give you a PDF.
    if (!fs.existsSync(filePath) || !isReportOwner(this.reportsDir, filename, token)) {
      if (fs.existsSync(filePath)) {
        // Logged so an operator can tell a genuine mismatch from a stale link. The token is not
        // logged, and neither is its hash -- the filename is enough to correlate.
        log.warn(`Refused ${filename}: caller is not the credential it was generated with.`);
      }
      next(createHttpError(404, "Report not found. Reports are stored on local disk, are readable "
        + "only by the credential that generated them, and do not survive a redeploy -- see "
        + "generateReport.ts."));
      return;
    }

    res.sendFile(filePath);
  };
}
