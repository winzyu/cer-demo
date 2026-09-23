import { Router } from "express";
import { ReportController } from "../controllers/ReportController";
import { quotaGuard } from "../middleware/quotaGuard";
import { requireCallerToken } from "../middleware/requireCallerToken";

const router = Router();
const reportController = new ReportController();

// A report is a customer's water-quality data, read with the caller's own token, so the token
// gate comes first; the report allowance is checked before any device read is spent.
router.post("/", requireCallerToken, quotaGuard(undefined, "report"), reportController.createReport);

export default router;
