import { Router } from "express";
import chatRoutes from "./chatRoutes";
import deviceRoutes from "./deviceRoutes";
import reportRoutes from "./reportRoutes";

/** API v1 aggregator. Resource routers mount here. */
const router = Router();

router.get("/", (_req, res) => {
  res.json({ message: "Clean Earth RAG API v1" });
});

router.use("/chat", chatRoutes);
router.use("/devices", deviceRoutes);
// Not gated on REPORT_TOOL: a PDF generate_report already wrote to disk should stay
// fetchable even if the flag is later turned off, same reasoning DeviceController's
// route uses for not gating on SENSOR_TOOL.
router.use("/reports", reportRoutes);

export default router;
