import { turnClaimIds, type TurnClaimAssignment } from "../../src/eval/retrieval/turnClaims";

/**
 * A per-turn split is only trustworthy if it accounts for exactly the claims the fixture's notes
 * name: a missing, foreign or double-booked id means it was written against other notes.
 */

const assignment = (overrides: Partial<TurnClaimAssignment> = {}): TurnClaimAssignment => ({
  fixtureId: "fx",
  turns: [
    { turn: 1, claims: [{ claimId: "a-b-01" }, { claimId: "c-d-01" }] },
    { turn: 2, claims: [{ claimId: "c-d-01" }] },
  ],
  neither: [{ claimId: "e-f-01" }],
  ...overrides,
});

const resolved = ["a-b-01", "c-d-01", "e-f-01"];

describe("turnClaimIds", () => {
  it("returns each turn's claim ids, a claim shared by both turns in both", () => {
    expect(turnClaimIds(assignment(), "fx", resolved, 2)).toEqual([["a-b-01", "c-d-01"], ["c-d-01"]]);
  });

  it("rejects a resolved claim that is neither assigned nor in neither", () => {
    expect(() => turnClaimIds(assignment({ neither: [] }), "fx", resolved, 2))
      .toThrow("e-f-01 is not assigned");
  });

  it("rejects an id the fixture does not name", () => {
    expect(() => turnClaimIds(assignment({ neither: [{ claimId: "e-f-01" }, { claimId: "x-y-01" }] }), "fx", resolved, 2))
      .toThrow("x-y-01 is not a resolved claim");
  });

  it("rejects a claim both assigned and in neither", () => {
    expect(() => turnClaimIds(assignment({ neither: [{ claimId: "e-f-01" }, { claimId: "a-b-01" }] }), "fx", resolved, 2))
      .toThrow("a-b-01 is both assigned and in neither");
  });

  it("rejects a wrong fixture id or turn numbering", () => {
    expect(() => turnClaimIds(assignment(), "other", resolved, 2)).toThrow("fixtureId is \"fx\"");
    expect(() => turnClaimIds(assignment(), "fx", resolved, 3)).toThrow("expected [1, 2, 3]");
  });
});
