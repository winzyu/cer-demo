import crypto from "crypto";
import type { Request } from "express";
import { config } from "../config";
import type { QuotaScope } from "../config";
import { callerToken } from "../utils/bearerToken";

/**
 * Derives the bucket a request counts against.
 *
 * ## What this service can actually key on — and what it cannot
 *
 * The upstream Gilligan backend counts against a **user id** and an **organization**, both of
 * which it has because its own middleware verified the JWT and loaded the user document. This
 * service has neither. It authenticates nobody: `callerToken` lifts the bearer header verbatim
 * and forwards it to the device API, which is the thing that decides whether it is valid. So:
 *
 * - **There is no user id here.** The token *is* a JWT, and its payload could be base64-decoded
 *   for a `sub` — but decoding an unverified token means keying quota on a claim any caller can
 *   forge by editing the payload, which is a quota that anyone can reset. A hash of the whole
 *   token is not forgeable in that way: producing a second bucket means producing a second
 *   token the device API accepts.
 * - **There is no organization.** Resolving one needs a backend round-trip this service does not
 *   make. `QuotaScope = "global"` is the honest stand-in for an org counter on a single-tenant
 *   deployment; a real per-org quota needs the identity work that lands with real auth.
 * - **The demo frontend sends no `Authorization` header at all** (`frontend/js/api.js`), so in
 *   the configuration the team runs today, `caller` scope resolves to the IP branch below.
 *
 * ## The IP fallback's limits
 *
 * `req.ip` is the socket peer unless Express is told to trust a proxy, and `src/app.ts` does not
 * set `trust proxy`. Behind Cloud Run or any load balancer that makes every caller one IP — one
 * shared bucket for the deployment. Trusting `X-Forwarded-For` without also pinning how many
 * hops to trust just moves the problem, since the header is caller-writable, so the honest state
 * is: **IP-scoped quota is only meaningful for direct connections**, and `config` warns about it
 * at startup. Until the frontend sends a token, `QUERY_QUOTA_SCOPE=global` is the setting whose
 * behavior matches what it claims.
 */

/** Token hashes are truncated: the prefix is far past collision risk and stays greppable. */
const TOKEN_HASH_LENGTH = 16;

/**
 * Hashed, never stored raw. Quota keys reach logs and error paths, and these tokens are minted
 * without an expiry upstream — a leaked one is valid forever.
 */
const hashToken = (token: string): string => crypto
  .createHash("sha256")
  .update(token)
  .digest("hex")
  .slice(0, TOKEN_HASH_LENGTH);

/** `::ffff:127.0.0.1` and `127.0.0.1` are the same caller and must not get two buckets. */
const normalizeIp = (ip: string): string => ip.replace(/^::ffff:/, "");

export const quotaKeyFor = (
  req: Request,
  scope: QuotaScope = config.quota.scope,
): string => {
  if (scope === "global") {
    return "global";
  }

  const token = callerToken(req);
  if (token) {
    return `token:${hashToken(token)}`;
  }

  const ip = typeof req.ip === "string" && req.ip.length > 0 ? normalizeIp(req.ip) : undefined;
  // `anonymous` rather than a random per-request key: an unattributable caller must not get an
  // unlimited allowance by being unattributable. They all share one bucket.
  return ip ? `ip:${ip}` : "anonymous";
};
