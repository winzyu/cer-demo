import { Router } from "express";
import chatRoutes from "./chatRoutes";

/** API v1 aggregator. Resource routers mount here. */
const router = Router();

router.get("/", (_req, res) => {
  res.json({ message: "Clean Earth RAG API v1" });
});

router.use("/chat", chatRoutes);

export default router;
