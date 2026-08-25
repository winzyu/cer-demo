import { Router } from "express";
import { ReportController } from "../controllers/ReportController";
import { requireCallerToken } from "../middleware/requireCallerToken";

const router = Router();
const reportController = new ReportController();

// A generated PDF is a customer's water-quality data. The filename is 8 hex characters
// (`generateReport.ts`), which is a capability URL with ~32 bits of entropy, no expiry, and — until
// this gate — no authentication at all. `requireCallerToken` establishes that *somebody* is
// asking; `ReportController` then checks that it is the same somebody the report was generated
// for, because a token from any other organization must not be enough.
router.get("/:filename", requireCallerToken, reportController.getReport);

export default router;
