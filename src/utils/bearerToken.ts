import type { Request } from "express";

/**
 * The caller's bearer token, or `undefined` when there isn't a usable one.
 *
 * `undefined` rather than an empty string for a malformed or absent header: a header of `Bearer `
 * carries no credential, and forwarding the empty string as one would only guarantee a 401 from
 * upstream. That `undefined` used to be load-bearing in the other direction — it was what made
 * `DeviceApiClient` reach for `DEVICE_API_TOKEN` — so "no usable token" quietly meant "use the
 * deployment's". It now means what it says, and `requireCallerToken` turns it into a 401 here.
 *
 * Shared by `requireCallerToken`, `DeviceController`, `ReportController`, `ChatController` and
 * `quotaKey` because they must agree exactly. The device API scopes every response to the token
 * holder's organization, so a path that parses the header differently — or skips it — reads a
 * different org's fleet, and a gate that parsed it differently from the client behind it would be
 * a gate with a way around.
 */
export const callerToken = (req: Request): string | undefined => {
  const header = req.headers.authorization;
  if (typeof header !== "string") {
    return undefined;
  }
  const match = /^Bearer\s+(\S.*)$/i.exec(header.trim());
  return match ? match[1].trim() : undefined;
};
