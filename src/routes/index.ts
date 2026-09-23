import { Router } from "express";
import chatRoutes from "./chatRoutes";
import deviceRoutes from "./deviceRoutes";
import reportRoutes from "./reportRoutes";
import usageRoutes from "./usageRoutes";

/** API v1 aggregator. Resource routers mount here. */
const router = Router();

router.get("/", (_req, res) => {
  res.json({ message: "Clean Earth RAG API v1" });
});

router.use("/chat", chatRoutes);
router.use("/devices", deviceRoutes);
// `POST /reports` renders a PDF on request; `ReportController` refuses it while REPORT_TOOL is off.
router.use("/reports", reportRoutes);
// Read-only allowance status, deliberately outside `quotaGuard`: a client must still be able to
// ask how long it is refused for *after* it has been refused.
router.use("/usage", usageRoutes);

export default router;
