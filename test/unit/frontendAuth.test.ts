import fs from "fs";
import path from "path";

/**
 * The demo page's credential store, and the invariants that keep a bearer token out of places
 * it can never be recalled from.
 *
 * `frontend/` has no build step and no DOM test environment (`jest.config.js` is `node`, and
 * jsdom is not a dependency — adding one to test a 150-line store would cost more than it
 * proves). So `auth.js` is evaluated directly with a fake `localStorage`, which exercises the
 * real module rather than a copy of its logic, and the wiring around it is asserted against the
 * source text.
 */

const FRONTEND = path.resolve(__dirname, "../../frontend");
const read = (file: string): string => fs.readFileSync(path.join(FRONTEND, file), "utf8");

interface AuthModule {
  listAccounts: () => Array<{ id: string; name: string; active: boolean }>;
  activeAccount: () => { id: string; name: string } | null;
  activeToken: () => string | null;
  isSignedIn: () => boolean;
  saveAccount: (name: string, token: string) => string | null;
  setActiveAccount: (id: string) => boolean;
  forgetAccount: (id: string) => void;
  signOut: () => void;
  authHeaders: () => Record<string, string>;
  describeToken: (token: string) => string | null;
}

const EXPORTS = [
  "listAccounts", "activeAccount", "activeToken", "isSignedIn", "saveAccount",
  "setActiveAccount", "forgetAccount", "signOut", "authHeaders", "describeToken",
];

/** Loads auth.js over a fresh in-memory store. `seed` plants a pre-existing raw value. */
const loadAuth = (seed?: string): AuthModule => {
  const cells: Record<string, string> = {};
  if (seed !== undefined) cells["gilligan.accounts"] = seed;

  const win = {
    localStorage: {
      getItem: (key: string) => (key in cells ? cells[key] : null),
      setItem: (key: string, value: string) => { cells[key] = value; },
      removeItem: (key: string) => { delete cells[key]; },
    },
  };

  const source = read("js/auth.js").replace(/^export /gm, "");
  // Evaluating the real module is the point here; the input is a file in this repository, not
  // anything user-supplied.
  // eslint-disable-next-line no-new-func
  const factory = new Function("window", "atob", `${source}\nreturn { ${EXPORTS.join(", ")} };`);
  return factory(win, (b64: string) => Buffer.from(b64, "base64").toString("binary")) as AuthModule;
};

/** A JWT-shaped string. Signature is irrelevant: the page decodes for display only. */
const fakeJwt = (payload: Record<string, unknown>): string => {
  const body = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${body}.signature`;
};

describe("frontend credential store", () => {
  it("sends no Authorization header at all when signed out", () => {
    // Not an empty bearer: the server distinguishes caller_token_required from
    // device_auth_expired, and the pod bar says something different for each.
    const auth = loadAuth();
    expect(auth.authHeaders()).toEqual({});
    expect(auth.isSignedIn()).toBe(false);
  });

  it("saves a token, makes it active, and sends it", () => {
    const auth = loadAuth();
    auth.saveAccount("Superadmin", "tok-super");
    expect(auth.authHeaders()).toEqual({ Authorization: "Bearer tok-super" });
    expect(auth.activeAccount()?.name).toBe("Superadmin");
  });

  it("switches between accounts, which is how a different organization is reached", () => {
    const auth = loadAuth();
    const superadmin = auth.saveAccount("Superadmin", "tok-super") as string;
    auth.saveAccount("Harbor QA", "tok-harbor");

    expect(auth.activeToken()).toBe("tok-harbor");
    expect(auth.setActiveAccount(superadmin)).toBe(true);
    expect(auth.activeToken()).toBe("tok-super");
    expect(auth.listAccounts()).toHaveLength(2);
  });

  it("replaces the token when the same label is saved again, rather than duplicating it", () => {
    const auth = loadAuth();
    auth.saveAccount("Harbor QA", "tok-old");
    auth.saveAccount("Harbor QA", "tok-new");

    expect(auth.listAccounts()).toHaveLength(1);
    expect(auth.activeToken()).toBe("tok-new");
  });

  it("forgets an account, which is the page's only revocation", () => {
    const auth = loadAuth();
    const id = auth.saveAccount("Harbor QA", "tok-harbor") as string;
    auth.forgetAccount(id);

    expect(auth.listAccounts()).toHaveLength(0);
    expect(auth.authHeaders()).toEqual({});
  });

  it("signs out without deleting the saved accounts", () => {
    const auth = loadAuth();
    auth.saveAccount("Harbor QA", "tok-harbor");
    auth.signOut();

    expect(auth.authHeaders()).toEqual({});
    expect(auth.listAccounts()).toHaveLength(1);
  });

  it("refuses to save an empty token", () => {
    const auth = loadAuth();
    expect(auth.saveAccount("Blank", "   ")).toBeNull();
    expect(auth.isSignedIn()).toBe(false);
  });

  it("reads corrupt storage as signed out rather than throwing", () => {
    // Private mode, a hand-edited value, a half-written entry. The page must still load.
    expect(loadAuth("not json at all").authHeaders()).toEqual({});
    expect(loadAuth("{\"activeId\":\"gone\",\"accounts\":[]}").isSignedIn()).toBe(false);
    expect(loadAuth("{\"accounts\":[{\"id\":\"a\"}]}").listAccounts()).toHaveLength(0);
  });

  it("describes a token from its payload, for display only", () => {
    const auth = loadAuth();
    const described = auth.describeToken(fakeJwt({
      role: "customer",
      organization: { id: "org-1", name: "Harbor City Water" },
      email: "qa@harbor.example.invalid",
    }));
    expect(described).toBe("customer · Harbor City Water · qa@harbor.example.invalid");
    expect(auth.describeToken("not-a-jwt")).toBeNull();
  });
});

describe("frontend credential wiring", () => {
  it("attaches the caller's token to every org-scoped call", () => {
    const api = read("js/api.js");
    // The devices fetch and the chat POST both carry it: /chat is not gated wholesale, but
    // query_sensor_data and generate_report behind it are.
    expect(api).toMatch(/getDevices[\s\S]*?headers: authHeaders\(\)/);
    expect(api).toMatch(/"Content-Type": "application\/json", \.\.\.authHeaders\(\)/);
    expect(read("js/report.js")).toContain("headers: authHeaders()");
  });

  it("never puts a token in a URL", () => {
    // A non-expiring bearer credential in a query string lands in browser history, Referer
    // headers and every proxy log in between. This is the rule that decision turned into.
    //
    // Comments are stripped first: several of these files *discuss* why `?token=` was rejected,
    // and a test that cannot tell prose from code would push the reasoning out of the source.
    const code = (file: string): string => read(file)
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ")
      .replace(/<!--[\s\S]*?-->/g, " ");

    ["js/api.js", "js/auth.js", "js/accountbar.js", "js/report.js", "index.html"].forEach((file) => {
      expect(code(file)).not.toMatch(/[?&]token=/);
    });
  });

  it("does not navigate straight to the report route", () => {
    // A browser navigation carries no Authorization header, so the click has to be a fetch.
    const report = read("js/report.js");
    expect(report).toContain("event.preventDefault()");
    expect(report).toContain("URL.createObjectURL");
  });

  it("keeps the token field a password input and clears it after saving", () => {
    expect(read("index.html")).toMatch(/id="account-token"[\s\S]*?type="password"/);
    expect(read("js/accountbar.js")).toContain("tokenEl.value = \"\"");
  });
});
