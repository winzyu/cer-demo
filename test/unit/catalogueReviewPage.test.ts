import { catalogue, parseCatalogue } from "../../src/catalogue";
import { renderReviewPage } from "../../src/catalogue/reviewPage";

describe("renderReviewPage", () => {
  const page = renderReviewPage(catalogue);

  it("shows every entry and referral with its review status", () => {
    catalogue.entries.forEach((entry) => {
      expect(page).toContain(`id="${entry.id}"`);
      expect(page).toContain(`href="#${entry.id}"`);
    });
    catalogue.referrals.forEach((referral) => expect(page).toContain(referral.service));
    expect(page).toContain(`Catalogue version ${catalogue.version}`);
  });

  it("is deterministic, so a changed page always means changed content", () => {
    expect(renderReviewPage(catalogue)).toBe(page);
  });

  it("escapes catalogue text rather than rendering it as markup", () => {
    const hostile = parseCatalogue({
      version: "t<1>",
      sources: { test: "A & B" },
      referrals: [{ id: "pro", service: "<b>Pro</b>", review: { status: "draft" } }],
      entries: [{
        id: "entry",
        title: "<script>alert(1)</script>",
        kind: "limitation",
        text: "\"quoted\" & <i>tagged</i>",
        appliesTo: { conditions: "c" },
        requiredEvidence: "e",
        limitations: "l",
        referral: "pro",
        sources: ["test §1"],
        review: { status: "draft" },
      }],
    });
    const html = renderReviewPage(hostile);
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<b>Pro</b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&quot;quoted&quot; &amp; &lt;i&gt;tagged&lt;/i&gt;");
  });
});
