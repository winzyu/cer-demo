/**
 * Caller credentials for this demo page: a set of named accounts, one active at a time.
 *
 * ## Why this exists
 *
 * Every org-scoped route now refuses a request with no `Authorization: Bearer` header —
 * `GET /api/v1/devices`, `POST /api/v1/reports`, and both tools reached through
 * `/chat`. Before that fix this page "worked" because `DeviceApiClient` silently fell back to
 * the deployment's `DEVICE_API_TOKEN`, a superadmin credential, so the pod picker was showing
 * every organization's fleet to an unauthenticated visitor. The 401 is the fix working; this
 * module is how the page carries a real credential instead.
 *
 * ## Why several accounts rather than one
 *
 * **A token's organization is fixed at login — there is no way to ask for a different one.**
 * Upstream mints tokens only through `POST /users/login`, scoped to that user's organization,
 * with no pod-level or org-level parameter. So "look at another organization's pods" means
 * "be another account", and switching accounts is the only way to see the org scoping actually
 * scope. Keeping several named tokens turns that into one click.
 *
 * ## Where the token lives, and where it must never go
 *
 * `localStorage`, same as the real dashboard. Deliberately **not**:
 *
 * - **a URL parameter** — that writes a non-expiring bearer credential into browser history,
 *   `Referer` headers, and every proxy and server log between here and the API;
 * - **a build-time constant or anything served by the backend** — it would then sit in the
 *   JS this page hands to every visitor, and re-create the superadmin fallback that was just
 *   removed, only harder to see.
 *
 * These tokens are minted with **no expiry** (`jwt.sign` is called without `expiresIn`), so a
 * pasted token stays valid until the account is deleted upstream. Treat one like a password:
 * `forgetAccount` is the only revocation this page has. Nothing here is ever logged.
 */

const STORAGE_KEY = "gilligan.accounts";

/** Shape: `{ activeId: string|null, accounts: [{ id, name, token }] }`. */
function readStore() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || !Array.isArray(parsed.accounts)) return { activeId: null, accounts: [] };
    // Filter defensively: a hand-edited or half-written entry must not break the page.
    const accounts = parsed.accounts.filter(
      (a) => a && typeof a.id === "string" && typeof a.token === "string" && a.token !== "",
    );
    const activeId = accounts.some((a) => a.id === parsed.activeId) ? parsed.activeId : null;
    return { activeId, accounts };
  } catch (e) {
    // Private mode, disabled storage, corrupt JSON. Signed-out is the safe reading.
    return { activeId: null, accounts: [] };
  }
}

function writeStore(store) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    // Nothing useful to do: the page still works for the current tab, it just will not
    // remember. Never surface the token in an error path.
  }
}

/** Every saved account, without its token. Use `activeToken()` to get the credential. */
export function listAccounts() {
  const { accounts, activeId } = readStore();
  return accounts.map((a) => ({ id: a.id, name: a.name, active: a.id === activeId }));
}

export function activeAccount() {
  const { accounts, activeId } = readStore();
  const found = accounts.find((a) => a.id === activeId);
  return found ? { id: found.id, name: found.name } : null;
}

export function activeToken() {
  const { accounts, activeId } = readStore();
  const found = accounts.find((a) => a.id === activeId);
  return found ? found.token : null;
}

export function isSignedIn() {
  return activeToken() !== null;
}

/**
 * Saves a token under a label and makes it active. Returns the new id.
 *
 * Re-saving an existing label replaces its token rather than adding a duplicate, so
 * refreshing a re-minted credential is the same gesture as adding one.
 */
export function saveAccount(name, token) {
  const trimmedToken = String(token || "").trim();
  if (trimmedToken === "") return null;
  const label = String(name || "").trim() || "Account";

  const store = readStore();
  const existing = store.accounts.find((a) => a.name === label);
  if (existing) {
    existing.token = trimmedToken;
    store.activeId = existing.id;
  } else {
    const id = `acct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    store.accounts.push({ id, name: label, token: trimmedToken });
    store.activeId = id;
  }
  writeStore(store);
  return store.activeId;
}

/** Switches the active account. Returns true when `id` named a saved one. */
export function setActiveAccount(id) {
  const store = readStore();
  if (!store.accounts.some((a) => a.id === id)) return false;
  store.activeId = id;
  writeStore(store);
  return true;
}

/** Deletes one saved account. This is the page's only revocation. */
export function forgetAccount(id) {
  const store = readStore();
  store.accounts = store.accounts.filter((a) => a.id !== id);
  if (store.activeId === id) store.activeId = null;
  writeStore(store);
}

/** Signs out without deleting anything: no active account, so no header is sent. */
export function signOut() {
  const store = readStore();
  store.activeId = null;
  writeStore(store);
}

/**
 * `{ Authorization: "Bearer …" }`, or `{}` when signed out.
 *
 * Signed-out sends **no** header rather than an empty one: the server distinguishes
 * `caller_token_required` (no credential) from `device_auth_expired` (a rejected one), and the
 * pod bar says something different for each.
 */
export function authHeaders() {
  const token = activeToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Best-effort human description of a token, for the account list — "customer · Harbor City".
 *
 * The JWT payload is base64url, signed rather than encrypted, so the holder can already read
 * it; decoding it here publishes nothing new. It is used **for display only** — never as
 * authority. Any claim in it is attacker-controlled as far as this page is concerned, and the
 * real check happens upstream when the token is presented.
 *
 * Returns null on anything unparseable, which is normal for a pasted string.
 */
export function describeToken(token) {
  try {
    const payload = String(token).split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(
      decodeURIComponent(
        atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
          .split("")
          .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
          .join(""),
      ),
    );
    const org = payload && json.organization;
    const orgLabel = org && typeof org === "object" ? (org.name || org.id) : org;
    const parts = [json.role, orgLabel, json.email].filter(
      (part) => typeof part === "string" && part !== "",
    );
    return parts.length > 0 ? parts.join(" · ") : null;
  } catch (e) {
    return null;
  }
}
