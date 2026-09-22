import { Router } from "express";
import { UsageController } from "../controllers/UsageController";

const router = Router();
const usageController = new UsageController();

// No `requireCallerToken`: the quota key falls back to a shared bucket for an anonymous caller
// (`quota/quotaKey.ts`), so an unauthenticated read reports that bucket's standing rather than
// failing. Nothing here is org-scoped customer data - it is two integers about the caller's own
// allowance - so there is nothing for a token to protect.
router.get("/", usageController.getUsage);

export default router;
