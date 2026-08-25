import { NextFunction, Request, Response } from "express";
import { callerToken } from "../utils/bearerToken";
import { codedError } from "../utils/errors";

/**
 * Refuses a request to an org-scoped route that carries no `Authorization: Bearer` header.
 *
 * ## What this is, and what it is not
 *
 * This is **not** authentication. This service has no user store, no session, and no
 * `ACCESS_TOKEN_SECRET`, so it cannot verify a signature and does not try: a syntactically valid
 * header gets past this gate and the Clean Earth backend decides whether the token is real. What
 * the gate does is guarantee that **something the caller supplied** is what the upstream call is
 * authenticated with — because the alternative, before this existed, was
 * `DeviceApiClient` quietly falling back to the deployment's own `DEVICE_API_TOKEN`.
 *
 * That fallback is why the gate is necessary rather than merely tidy. `DEVICE_API_TOKEN` is in
 * practice a superadmin credential (`.env.example`: "a shared service token would let any chat
 * user read every device"), so an unauthenticated `GET /api/v1/devices` was answered out of the
 * whole fleet while the controller's docstring claimed the route was "org-scoped by the caller's
 * token". It was — but only when a caller token happened to be present.
 *
 * ## Where it is mounted
 *
 * Every route whose answer is derived from someone's organization: `GET /api/v1/devices` and
 * `GET /api/v1/reports/:filename`. **Not `POST /api/v1/chat`** — a chat turn against the document
 * corpus reads nothing org-scoped, and gating the whole endpoint on a token would refuse
 * questions this service can answer perfectly well without one. The org-scoped part of chat is
 * the sensor/report tool path, which enforces the same requirement where it actually applies
 * (`querySensorData.ts`, `generateReport.ts`).
 *
 * The `WWW-Authenticate` header is set because this is a real 401: RFC 7235 requires a challenge
 * with one, and it tells a generic HTTP client which scheme to retry under.
 */
export const requireCallerToken = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (callerToken(req)) {
    next();
    return;
  }

  res.setHeader("WWW-Authenticate", "Bearer");
  next(codedError(
    401,
    "This endpoint is scoped to the caller's organization and requires an "
    + "`Authorization: Bearer <token>` header.",
    "caller_token_required",
  ));
};
