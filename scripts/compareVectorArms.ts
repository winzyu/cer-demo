/**
 * CLI: prove that `local-vector` and `firestore-vector` rank identically.
 *
 *   npm run compare:vector-arms
 *   npm run compare:vector-arms -- --top-k=10 --tolerance=1e-4
 *
 * **Requires both credentials**: `FIREWORKS_API_KEY` (one embedding call per query) and Firestore
 * application-default credentials pointed at a project whose `corpus_chunks` collection is seeded
 * *and* has its vector index built. Exits non-zero on any ranking disagreement, so it is usable
 * as a gate.
 *
 * Why this needs proving rather than assuming: the vector index on `corpus_chunks` is configured
 * `flat` — exhaustive, not approximate — and both arms use COSINE over the same nomic embeddings,
 * so the rankings *should* be identical. "Should" is the word that hides bugs. A disagreement here
 * means one of: the collection holds chunks the cache does not (or vice versa — note that
 * `seed:firestore-chunks` never prunes, while `embed:cache` does, so a Firestore collection
 * re-seeded after a corpus edit keeps stale chunks until it is wiped), an embedding written as a
 * plain array, or a genuinely different distance computation.
 *
 * **One embedding per query, shared by both arms.** Each adapter would otherwise call the
 * embedding endpoint itself, and any nondeterminism there would show up as an arm disagreement it
 * did not cause. Injecting the same vector into both isolates the comparison to the index and the
 * ranking, which is the thing under test.
 */
import { CHUNK_COLLECTION, FirestoreVectorAdapter } from "../src/retrieval/adapters/FirestoreVectorAdapter";
import {
  LocalVectorAdapter, cosineSimilarity, readEmbeddingCache,
} from "../src/retrieval/adapters/LocalVectorAdapter";
import { getFirestore } from "../src/config/database";
import { EmbeddingService } from "../src/services/EmbeddingService";
import { loadFixtures } from "../src/eval/fixtures";
import { DEFAULT_TOP_K } from "../src/retrieval/options";
import type { Chunk } from "../src/types/retrieval.types";
import { createLogger } from "../src/utils/logger";

const log = createLogger("CompareArms");

interface Args {
  topK: number;
  /** Scores are floats computed by different engines; only a gap beyond this is reported. */
  tolerance: number;
}

const parseArgs = (argv: string[]): Args => {
  const value = (name: string): string | undefined => argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3);

  return {
    topK: Number(value("top-k") ?? DEFAULT_TOP_K),
    tolerance: Number(value("tolerance") ?? 1e-4),
  };
};

/**
 * Replays one pre-computed query vector to whichever adapter asks. Stands in for
 * `EmbeddingService` in both arms so they are handed byte-identical input.
 */
class SharedQueryEmbedding {
  vector: number[] = [];

  // eslint-disable-next-line @typescript-eslint/require-await
  async embedQuery(): Promise<number[]> {
    if (this.vector.length === 0) {
      throw new Error("No query vector has been set for this comparison.");
    }
    return this.vector;
  }
}

/** Every fixture's first user turn — the curated question set, without duplicating it here. */
const queries = (): string[] => loadFixtures().map((fixture) => fixture.turns[0].content);

const ids = (chunks: Chunk[]): string[] => chunks.map((chunk) => chunk.id);

const main = async (): Promise<void> => {
  const { topK, tolerance } = parseArgs(process.argv.slice(2));

  const shared = new SharedQueryEmbedding();
  // Structurally compatible with the one method both adapters call; the cast is the price of
  // not widening `RetrievalAdapter`'s constructor to accept an interface it does not need.
  const asService = shared as unknown as EmbeddingService;
  const local = new LocalVectorAdapter(undefined, asService);
  const firestore = new FirestoreVectorAdapter(undefined, asService);
  const embeddings = new EmbeddingService();

  // The cache is read here as well as inside the adapter, so this script can recompute the
  // cosine for a chunk Firestore ranked. That is what makes a *score* comparison possible even
  // when the two indexes hold different chunks — see the drift note below.
  const cache = readEmbeddingCache();
  const vectorsById = new Map(cache.chunks.map((entry) => [entry.id, entry.embedding]));

  // Preflight, because the most likely cause of a disagreement is not a bug in either arm: it is
  // the two stores holding different corpora. `embed:cache` prunes chunks the corpus no longer
  // has; `seed:firestore-chunks` never deletes and skips any document already present, so a
  // collection seeded before a corpus change is both missing new chunks and keeping dead ones.
  const remoteTotal = await getFirestore().collection(CHUNK_COLLECTION).count().get();
  const remoteCount = remoteTotal.data().count;
  if (remoteCount !== cache.chunks.length) {
    log.warn(
      `Firestore holds ${remoteCount} chunks; the cache holds ${cache.chunks.length}. The two arms `
      + "are searching different corpora, so ranking differences below are expected and prove "
      + "nothing about the distance computation. Wipe `corpus_chunks` and re-run "
      + "`npm run seed:firestore-chunks` for a like-for-like comparison.",
    );
  }

  const questions = queries();
  log.info(`Comparing ${questions.length} queries at top-k ${topK}.`);

  let identical = 0;
  let scoresAgree = 0;
  let scoresComparable = 0;
  let absentFromCache = 0;
  const disagreements: string[] = [];

  for (let i = 0; i < questions.length; i += 1) {
    const query = questions[i];

    // eslint-disable-next-line no-await-in-loop
    shared.vector = await embeddings.embedQuery(query);

    // Sequential, and local first: if the cache is missing this fails before spending a
    // Firestore read on every remaining query.
    // eslint-disable-next-line no-await-in-loop
    const localChunks = await local.getContext(query, { topK });
    // eslint-disable-next-line no-await-in-loop
    const remoteChunks = await firestore.getContext(query, { topK });

    const localIds = ids(localChunks);
    const remoteIds = ids(remoteChunks);
    const sameOrder = localIds.length === remoteIds.length
      && localIds.every((id, index) => id === remoteIds[index]);

    // Drift is measured **per chunk id**, not per rank position: recompute this process's cosine
    // for each chunk Firestore returned and compare it with the similarity Firestore reported for
    // that same chunk. Comparing position-for-position would be meaningless the moment the two
    // orders differ, whereas this isolates "do the two engines compute the same distance?" from
    // "do the two stores hold the same chunks?" — the two failures worth telling apart.
    const comparable = remoteChunks.filter((remote) => vectorsById.has(remote.id));
    absentFromCache += remoteChunks.length - comparable.length;
    const drift = comparable
      .map((remote) => {
        const stored = vectorsById.get(remote.id) as number[];
        return Math.abs((remote.score ?? 0) - cosineSimilarity(shared.vector, stored));
      })
      .reduce((worst, delta) => Math.max(worst, delta), 0);

    if (comparable.length > 0) {
      // Only counted when there was something to compare. A query whose Firestore results are
      // all absent from the cache has a drift of zero over an empty set, and reporting that as
      // agreement would turn "the two stores share no chunks" into a passing number.
      scoresComparable += 1;
      if (drift <= tolerance) {
        scoresAgree += 1;
      }
    }

    if (sameOrder && drift <= tolerance) {
      identical += 1;
      log.info(`  [${i + 1}/${questions.length}] match (max score drift ${drift.toExponential(1)})`);
    } else {
      disagreements.push(
        `"${query.slice(0, 70)}"\n      local:     ${localIds.join(", ") || "(none)"}`
        + `\n      firestore: ${remoteIds.join(", ") || "(none)"}`
        + `\n      ${remoteChunks.length - comparable.length} of Firestore's results are absent `
        + `from the cache; max score drift on the rest: ${
          comparable.length === 0 ? "n/a (nothing comparable)" : drift.toExponential(2)}`,
      );
      log.warn(`  [${i + 1}/${questions.length}] DISAGREEMENT`);
    }
  }

  log.info(`\n${identical}/${questions.length} queries ranked identically.`);
  if (scoresComparable === 0) {
    log.warn(
      "No query returned a chunk present in both stores, so the distance computations were never "
      + "actually compared. Re-seed `corpus_chunks` from the current corpus and run this again.",
    );
  } else {
    log.info(
      `${scoresAgree}/${scoresComparable} queries agreed on every score for the chunks both `
      + `stores hold (tolerance ${tolerance}).`,
    );
  }
  if (absentFromCache > 0) {
    log.warn(
      `${absentFromCache} returned chunk(s) exist in Firestore but not in the cache — stale rows `
      + "from a corpus edit, not a ranking difference.",
    );
  }

  if (disagreements.length > 0) {
    log.error(`${disagreements.length} disagreement(s):\n  - ${disagreements.join("\n  - ")}`);
    // Non-zero, because a silent "mostly the same" is how a broken index gets shipped.
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  log.error("Comparison failed", error instanceof Error ? error : undefined);
  process.exitCode = 1;
});
