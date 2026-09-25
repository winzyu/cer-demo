import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { codedError } from "../utils/errors";
import { createLogger } from "../utils/logger";
import {
  ORGANIZATION_ID_HEADER, SERVICE_KEY_HEADER, USER_ID_HEADER, setVerifiedIdentity,
} from "../utils/serviceIdentity";

const log = createLogger("ServiceKey");

/** Generous for any id the CER server issues, small enough that a key cannot become a payload. */
const MAX_ID_CHARS = 128;

/** Printable ASCII only: ids land in Firestore document ids and in logs. */
const SAFE_ID = /^[\x21-\x7e]+$/;

/**
 * Hashing both sides first gives `timingSafeEqual` equal-length inputs, so neither the key's
 * length nor its prefix leaks through response timing.
 */
const sameSecret = (presented: string, expected: string): boolean => crypto.timingSafeEqual(
  crypto.createHash("sha256").update(presented).digest(),
  crypto.createHash("sha256").update(expected).digest(),
);

const headerOf = (req: Request, name: string): string | undefined => {
  const value = req.headers[name];
  return typeof value === "string" ? value.trim() : undefined;
};

const validId = (value: string | undefined): value is string => (
  value !== undefined && value.length > 0 && value.length <= MAX_ID_CHARS && SAFE_ID.test(value)
);

/**
 * The check between the CER server and this service (release plan S2, runbook §5).
 *
 * ## Why a shared secret and not Cloud Run identity tokens
 *
 * Cloud Run removes the signature from the service token it forwards, so this process cannot
 * verify one itself, and minting identity tokens in the CER server was moved after launch. A
 * shared secret from Secret Manager, sent on every call and compared in constant time, gives the
 * one property the quota needs: only the CER server can say who the user is. Invoker IAM can be
 * added in front later without changing this contract.
 *
 * ## What it guards
 *
 * Every `/api/v1` route. `/health` sits outside the router so probes still work. When
 * `CER_RAG_SERVICE_KEY` is unset the check is off and identity headers are ignored, which keeps
 * local runs, the eval harness and the demo frontend working unchanged; production refuses to
 * boot in that state (`config`).
 *
 * The user id header is required once the key matches: every guarded route is counted or reports
 * a count, and a call without it would otherwise fall back to a token-hash bucket that a fresh
 * login resets.
 */
export const requireServiceKey = (expectedKey: string | undefined = config.serviceAuth.key) => (
  (req: Request, _res: Response, next: NextFunction): void => {
    if (expectedKey === undefined) {
      next();
      return;
    }

    const presented = headerOf(req, SERVICE_KEY_HEADER);
    if (!presented || !sameSecret(presented, expectedKey)) {
      // Neither value is logged; only the fact and the route.
      log.warn(`Refused ${req.method} ${req.originalUrl}: ${presented ? "wrong" : "missing"} service key.`);
      next(codedError(401, "This service accepts requests from the CER server only.", "service_key_invalid"));
      return;
    }

    const userId = headerOf(req, USER_ID_HEADER);
    const organizationId = headerOf(req, ORGANIZATION_ID_HEADER);
    if (!validId(userId) || (organizationId && !validId(organizationId))) {
      next(codedError(
        400,
        `The CER server must send the user's id in ${USER_ID_HEADER}`
        + ` (and an organization id, when there is one, in ${ORGANIZATION_ID_HEADER}).`,
        "service_identity_required",
      ));
      return;
    }

    setVerifiedIdentity(req, { userId, organizationId: organizationId || null });
    next();
  }
);
