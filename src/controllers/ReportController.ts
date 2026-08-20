import { NextFunction, Request, Response } from "express";
import path from "path";
import fs from "fs";
import createHttpError from "http-errors";
import { REPORTS_DIR } from "../tools/generateReport";

/** Matches the `report_<8 hex chars>.pdf` filenames `GenerateReport` writes -- rejects anything
 * else before it reaches a filesystem path, so a `..`-laden request can't escape REPORTS_DIR. */
const SAFE_FILENAME = /^[a-zA-Z0-9_-]+\.pdf$/;

export class ReportController {
  /** `GET /api/v1/reports/:filename` — serves a PDF `generate_report` already wrote to disk. */
  getReport = (req: Request, res: Response, next: NextFunction): void => {
    const { filename } = req.params;
    if (!SAFE_FILENAME.test(filename)) {
      next(createHttpError(400, "Invalid report filename."));
      return;
    }
    const filePath = path.join(REPORTS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      next(createHttpError(404, "Report not found. Reports are stored on local disk and do not "
        + "survive a redeploy -- see generateReport.ts."));
      return;
    }
    res.sendFile(filePath);
  };
}
