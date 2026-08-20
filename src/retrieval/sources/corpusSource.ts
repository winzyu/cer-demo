/**
 * Where an adapter gets corpus text from.
 *
 * Two implementations exist because the bake-off and day-to-day development have different needs:
 * a measured run must read from the real datastore so Firestore's costs are counted, while local
 * work should not require credentials. Selection is **explicit config**, never an automatic
 * fallback — a silent switch would let a run be measured against the wrong source and quietly
 * misreport the arm's cost.
 */
export interface CorpusDocument {
  filename: string;
  title: string;
  sourceUrl?: string;
  text: string;
}

export interface CorpusSource {
  /** Identifies the source in logs and in the bake-off report. */
  readonly name: string;
  /** Documents in the ◆G9 direct-feed slice, in a stable order. */
  loadSlice(): Promise<CorpusDocument[]>;
}
