/**
 * Per-turn claim assignments (`eval/turn-claims/<fixtureId>.json`): which of a fixture's named
 * claims each user turn's rubric needs. `scripts/resolveRetrievalLabels.ts --turn-claims=<dir>`
 * uses them to label each turn with only its own passages, instead of giving both turns every
 * claim the fixture's notes name.
 */

export interface TurnClaimAssignment {
  fixtureId: string;
  turns: Array<{ turn: number; claims: Array<{ claimId: string }> }>;
  neither: Array<{ claimId: string }>;
}

/**
 * Claim ids per turn (index 0 is turn 1), validated against the fixture's resolved claim ids:
 * every resolved id is assigned to a turn or to `neither`, never both, and no other id appears.
 * A mismatch means the assignment was written against different notes or claims, so it throws
 * rather than labelling a turn from a stale split.
 */
export const turnClaimIds = (
  assignment: TurnClaimAssignment,
  fixtureId: string,
  resolvedIds: string[],
  turnCount: number,
): string[][] => {
  const where = `turn claims for ${fixtureId}`;
  const errors: string[] = [];
  if (assignment.fixtureId !== fixtureId) {
    errors.push(`${where}: fixtureId is "${assignment.fixtureId}"`);
  }
  const numbers = assignment.turns.map((t) => t.turn);
  const expected = Array.from({ length: turnCount }, (_, i) => i + 1);
  if (numbers.join(",") !== expected.join(",")) {
    errors.push(`${where}: turns are [${numbers.join(", ")}], expected [${expected.join(", ")}]`);
  }

  const resolved = new Set(resolvedIds);
  const assigned = new Set<string>();
  const perTurn = assignment.turns.map((t) => {
    const ids = t.claims.map((c) => c.claimId);
    if (new Set(ids).size !== ids.length) errors.push(`${where}: turn ${t.turn} repeats a claim`);
    ids.forEach((id) => assigned.add(id));
    return ids;
  });
  const neither = new Set(assignment.neither.map((c) => c.claimId));

  [...assigned, ...neither].filter((id) => !resolved.has(id))
    .forEach((id) => errors.push(`${where}: ${id} is not a resolved claim of this fixture`));
  [...neither].filter((id) => assigned.has(id))
    .forEach((id) => errors.push(`${where}: ${id} is both assigned and in neither`));
  resolvedIds.filter((id) => !assigned.has(id) && !neither.has(id))
    .forEach((id) => errors.push(`${where}: ${id} is not assigned`));

  if (errors.length > 0) throw new Error(errors.join("\n"));
  return perTurn;
};
