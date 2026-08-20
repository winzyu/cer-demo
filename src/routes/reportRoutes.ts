import { Router } from "express";
import { ReportController } from "../controllers/ReportController";

const router = Router();
const reportController = new ReportController();

router.get("/:filename", reportController.getReport);

export default router;
