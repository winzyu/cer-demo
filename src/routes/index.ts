import { Router } from "express";

/**
 * API v1 aggregator. Resource routers (e.g. chat) mount here in later phases:
 *   router.use("/chat", chatRoutes);
 */
const router = Router();

router.get("/", (_req, res) => {
  res.json({ message: "Clean Earth RAG API v1" });
});

export default router;
