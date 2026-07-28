import express, { Express } from "express";
import morgan from "morgan";
import helmet from "helmet";
import cors from "cors";

import healthRoutes from "./routes/healthRoutes";
import api from "./routes";
import { notFound } from "./middleware/notFound";
import { errorHandler } from "./middleware/errorHandler";

const app: Express = express();

// Middleware order is load-bearing (docs/migration/CONVENTIONS.md §3).
app.use(morgan("dev"));
app.use(
  helmet({
    // API is called cross-origin from the static frontend.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "Clean Earth RAG service" });
});

app.use(healthRoutes); // GET /health — unversioned, for infra probes and the frontend
app.use("/api/v1", api);

app.use(notFound);
app.use(errorHandler);

export default app;
