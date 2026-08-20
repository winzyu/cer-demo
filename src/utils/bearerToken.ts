import type { Request } from "express";

/**
 * The caller's bearer token, or `undefined` when there isn't a usable one.
 *
 * `undefined` rather than an empty string for a malformed or absent header, so the device client
 * falls back to `DEVICE_API_TOKEN`: a header of `Bearer ` must not be forwarded as a token that
 * is guaranteed to 401.
 *
 * Shared by `DeviceController` and `ChatController` because the two must agree exactly. The
 * device API scopes every response to the token holder's organization, so a path that parses
 * the header differently — or skips it — reads a different org's fleet.
 */
export const callerToken = (req: Request): string | undefined => {
  const header = req.headers.authorization;
  if (typeof header !== "string") {
    return undefined;
  }
  const match = /^Bearer\s+(\S.*)$/i.exec(header.trim());
  return match ? match[1].trim() : undefined;
};
