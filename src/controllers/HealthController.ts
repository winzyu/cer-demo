import { Request, Response } from "express";
import { config } from "../config";

/**
 * Liveness endpoint. Intentionally does no network I/O (no Firestore/Fireworks calls),
 * so it always succeeds while the process is up and never blocks on external services.
 * Config presence is reported as cheap booleans for at-a-glance diagnostics.
 */
export class HealthController {
  getHealth = (_req: Request, res: Response): void => {
    res.status(200).json({
      status: "ok",
      service: "clean-earth-rag",
      environment: config.nodeEnv,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        fireworksConfigured: Boolean(config.fireworks.apiKey),
        firestoreProjectConfigured: Boolean(config.firestore.projectId),
      },
    });
  };
}
