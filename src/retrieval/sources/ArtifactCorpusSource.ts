import { CORPUS_OUTPUT, readCorpus } from "../../ingestion/ingest";
import type { CorpusDocument, CorpusSource } from "./corpusSource";

/**
 * Reads the slice from the on-disk ingestion artifact.
 *
 * The development default: no credentials, no network, and byte-identical to what the Firestore
 * source would hold, since both derive from the same `npm run ingest` output. Fine for building
 * and testing; **a measured bake-off run should use the Firestore source** so that datastore's
 * read costs appear in the numbers.
 */
export class ArtifactCorpusSource implements CorpusSource {
  readonly name = "artifact";

  private readonly artifactPath: string;

  constructor(artifactPath: string = CORPUS_OUTPUT) {
    this.artifactPath = artifactPath;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async loadSlice(): Promise<CorpusDocument[]> {
    const corpus = readCorpus(this.artifactPath);

    return corpus.documents
      .filter((document) => document.inDirectFeedSlice)
      .map(({
        filename, title, sourceUrl, text,
      }) => ({
        filename, title, sourceUrl, text,
      }));
  }
}
