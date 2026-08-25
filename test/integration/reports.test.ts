import request from "supertest";
import fs from "fs";
import path from "path";
import app from "../../src/app";
import { REPORTS_DIR } from "../../src/tools/generateReport";
import { recordReportOwner } from "../../src/report/reportOwnership";

/**
 * `GET /api/v1/reports/:filename` end to end — the route, `requireCallerToken`, and the ownership
 * check, all the real thing. No model, no device API, no network.
 *
 * The bug this pins: the route had **no authentication at all**. `generate_report` names its
 * output `report_<8 hex>.pdf` (~32 bits), writes it to local disk with no expiry, and returns the
 * URL for the UI to show — so a PDF of a named customer's site coordinates and water-quality
 * readings was a guessable capability URL that anyone on the internet could walk.
 *
 * Two properties are asserted, because a login gate alone would only fix half of it: an anonymous
 * caller is refused, **and** an authenticated caller who is not the report's owner is refused
 * too. Every other route here is org-scoped by the caller's token; a report endpoint that
 * accepted any valid token would be the one place one organization could read another's data.
 *
 * Files are written into the real `REPORTS_DIR` (`<cwd>/generated_reports`, gitignored) because
 * that is what the mounted controller reads. They are named distinctly and removed afterwards.
 */

const OWNER = "owner-jwt";
const OTHER_ORG = "some-other-orgs-jwt";

/** Distinct from anything `generate_report` would mint, so cleanup cannot eat a real report. */
const OWNED = "report_testowned.pdf";
const ORPHANED = "report_testorphan.pdf";
const MISSING = "report_testabsent.pdf";

const REPORT_URL = (filename: string): string => `/api/v1/reports/${filename}`;
const PDF_BYTES = "%PDF-1.4\n%fake pdf for the route test\n";

/** Every file this suite creates, so afterAll can remove exactly those and nothing else. */
const created: string[] = [];

const write = (filename: string, owner?: string): void => {
  const filePath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(filePath, PDF_BYTES);
  created.push(filePath);
  if (owner !== undefined) {
    recordReportOwner(REPORTS_DIR, filename, owner);
    created.push(`${filePath}.owner`);
  }
};

beforeAll(() => {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  write(OWNED, OWNER);
  // No ownership sidecar: a PDF written before this check existed, or one whose sidecar is gone.
  write(ORPHANED);
});

afterAll(() => {
  created.forEach((filePath) => fs.rmSync(filePath, { force: true }));
  // Only if this suite left it empty — a developer's real reports must survive the test run.
  try {
    fs.rmdirSync(REPORTS_DIR);
  } catch {
    /* not empty, or not ours to remove */
  }
});

describe("GET /api/v1/reports/:filename", () => {
  it("refuses an unauthenticated request for a report that exists", async () => {
    const response = await request(app).get(REPORT_URL(OWNED)).expect(401);

    expect(response.body.code).toBe("caller_token_required");
    expect(response.body.error).toBe(response.body.message);
    // Body shape is fixed: `status` never appears in it (CONVENTIONS §6).
    expect(response.body).not.toHaveProperty("status");
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    // And nothing of the PDF leaked into the refusal.
    expect(JSON.stringify(response.body)).not.toContain("%PDF");
  });

  it("serves the PDF to the token it was generated with", async () => {
    const response = await request(app)
      .get(REPORT_URL(OWNED))
      .set("Authorization", `Bearer ${OWNER}`)
      .expect(200);

    expect(response.headers["content-type"]).toMatch(/application\/pdf/);
    expect(response.text ?? String(response.body)).toContain("%PDF");
  });

  it("refuses a different organization's valid token, and does not admit the report exists", async () => {
    const present = await request(app)
      .get(REPORT_URL(OWNED))
      .set("Authorization", `Bearer ${OTHER_ORG}`)
      .expect(404);

    const absent = await request(app)
      .get(REPORT_URL(MISSING))
      .set("Authorization", `Bearer ${OTHER_ORG}`)
      .expect(404);

    // Identical answers on purpose. Eight hex characters is a guessable namespace, and a
    // distinguishable 403 would confirm a hit — turning the route into an enumeration oracle.
    expect(present.status).toBe(absent.status);
    expect(present.body.error).toBe(absent.body.error);
  });

  it("fails closed on a report with no ownership record", async () => {
    // Not "unknown owner, therefore anyone". There is no way to establish who this belongs to,
    // and that is a reason to refuse rather than a reason to allow.
    await request(app)
      .get(REPORT_URL(ORPHANED))
      .set("Authorization", `Bearer ${OWNER}`)
      .expect(404);
  });

  it("still rejects a traversal attempt, and does not let a token past the filename guard", async () => {
    // The path guard was already correct and is untouched; this pins that adding auth in front
    // of it did not reorder the two, and that a valid token buys no filesystem reach.
    const response = await request(app)
      .get("/api/v1/reports/%2e%2e%2f%2e%2e%2fetc%2fpasswd")
      .set("Authorization", `Bearer ${OWNER}`)
      .expect(400);

    expect(response.body.error).toMatch(/Invalid report filename/);
  });

  it("refuses an anonymous traversal attempt at the gate, before touching a path", async () => {
    await request(app).get("/api/v1/reports/%2e%2e%2fetc%2fpasswd").expect(401);
  });
});
