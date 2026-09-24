import { Request, Response } from "express";
import { config } from "../config";

/** Template values such as `<your-key>`, `your_api_key`, `changeme` or `xxxx` are not config. */
const PLACEHOLDER_PATTERN = /^(<.*>|your[-_ ].*|changeme|placeholder|x{3,}|todo)$/i;

/** True only for a value that is non-blank and not an obvious placeholder. */
export const isConfiguredValue = (value: string | undefined): boolean => {
  const trimmed = value?.trim() ?? "";
  return trimmed !== "" && !PLACEHOLDER_PATTERN.test(trimmed);
};

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
        fireworksConfigured: isConfiguredValue(config.fireworks.apiKey),
        firestoreProjectConfigured: isConfiguredValue(config.firestore.projectId),
      },
    });
  };
}
