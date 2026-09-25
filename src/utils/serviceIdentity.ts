import type { Request } from "express";

/**
 * The user a request is on behalf of, as the CER server asserted it.
 *
 * Only ever set by `requireServiceKey`, after the shared key matched, so a value here is one the
 * CER server vouched for: it verified the user's JWT and loaded the user document. It is used for
 * quota keys and nothing else. Data access still rests on the forwarded user JWT, which the device
 * API checks on every call, so a wrong identity here can misattribute usage but cannot widen what
 * a caller can read (architecture §2b).
 */
export interface ServiceIdentity {
  userId: string;
  /** `null` for a user with no organization, which the CER server allows. */
  organizationId: string | null;
}

/** Header names shared with `clean-earth-rovers-server` `CerRagService`. */
export const SERVICE_KEY_HEADER = "x-cer-rag-service-key";
export const USER_ID_HEADER = "x-cer-rag-user-id";
export const ORGANIZATION_ID_HEADER = "x-cer-rag-organization-id";

/**
 * Keyed by the request object rather than stored on it, so nothing else can set it by accident
 * (a body parser, a test double, a future middleware writing `req.identity`), and the entry goes
 * when the request is collected.
 */
const verified = new WeakMap<Request, ServiceIdentity>();

export const setVerifiedIdentity = (req: Request, identity: ServiceIdentity): void => {
  verified.set(req, identity);
};

/** The CER server's asserted user, or `undefined` when the service check is off or absent. */
export const verifiedIdentity = (req: Request): ServiceIdentity | undefined => verified.get(req);
