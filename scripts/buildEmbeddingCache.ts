/**
 * CLI: embed `data/corpus/corpus.json` into the local vector cache the `local-vector` arm reads.
 *
 *   npm run ingest && npm run embed:cache
 *   npm run embed:cache -- --force            # re-embed everything, ignoring what is cached
 *   npm run embed:cache -- --out=/tmp/x.json  # write somewhere else
 *
 * Reads the shared ingestion artifact rather than re-parsing the PDFs — the one-parse rule
 * (`RETRIEVAL_BAKEOFF.md` §4). If this script chunked its own text, `local-vector` and
 * `firestore-vector` would be searching different corpora and any ranking difference between
 * them would be uninterpretable.
 *
 * **Incremental, keyed by chunk id.** Chunk ids are content-derived (`src/ingestion/chunk.ts`),
 * so editing one source document changes only that document's ids and every other chunk is
 * reused from the cache for free. That is the property that makes a churning source-of-truth
 * corpus affordable: a one-document edit re-embeds tens of chunks, not 393.
 *
 * The output is **not** checked in — `data/` is git-ignored, so the cache is machine-local and a
 * fresh clone must run this once.
 */
import fs from "fs";
import path from "path";
import { config } from "../src/config";
import { estimateTokens, readCorpus } from "../src/ingestion/ingest";
import {
  EMBED_BATCH, EMBEDDING_DIMENSIONS, EmbeddingService, batched,
} from "../src/services/EmbeddingService";
import { EMBEDDING_CACHE_PATH, validateEmbeddingCache } from "../src/retrieval/adapters/LocalVectorAdapter";
import type { CachedChunk, EmbeddingCache } from "../src/retrieval/adapters/LocalVectorAdapter";
import { createLogger } from "../src/utils/logger";

const log = createLogger("EmbedCache");

interface Args {
  force: boolean;
  out: string;
}

const parseArgs = (argv: string[]): Args => {
  const out = argv.find((arg) => arg.startsWith("--out="))?.slice("--out=".length);
  return { force: argv.includes("--force"), out: out ?? EMBEDDING_CACHE_PATH };
};

/** A chunk as it comes out of the corpus artifact, already paired with its citation source. */
interface PendingChunk {
  id: string;
  source: string;
  text: string;
}

/**
 * Flattens the corpus into the chunk list this cache mirrors, in document then reading order.
 *
 * Duplicate ids are dropped rather than embedded twice. An id is `filename + hash(text)`, so a
 * collision means one document contains the same chunk text twice — real, if rare, with a
 * 400-char overlap over repeated boilerplate. Embedding it twice would pay twice for a vector
 * that can only appear once in a store keyed by id.
 */
const corpusChunks = (): PendingChunk[] => {
  const corpus = readCorpus();
  const seen = new Set<string>();
  const chunks: PendingChunk[] = [];
  let duplicates = 0;

  corpus.documents.forEach((document) => {
    const source = document.sourceUrl ?? document.filename;
    document.chunks.forEach((chunk) => {
      if (seen.has(chunk.id)) {
        duplicates += 1;
        return;
      }
      seen.add(chunk.id);
      chunks.push({ id: chunk.id, source, text: chunk.text });
    });
  });

  if (duplicates > 0) {
    log.warn(`${duplicates} duplicate chunk id(s) in the corpus — kept one copy of each.`);
  }
  return chunks;
};

/**
 * Loads the existing cache for reuse, or returns an empty map.
 *
 * A cache built with a different model is **refused, not merged**. Vectors from two models have
 * the same width and no shared geometry, so a mixed cache would rank fluently and wrongly — the
 * exact failure shape this whole arm exists to eliminate.
 */
const loadReusable = (out: string, force: boolean, model: string): Map<string, CachedChunk> => {
  if (force || !fs.existsSync(out)) {
    return new Map();
  }

  const existing = JSON.parse(fs.readFileSync(out, "utf8")) as EmbeddingCache;

  if (existing.model !== model) {
    throw new Error(
      `${out} was built with model "${existing.model}" but EMBEDDING_MODEL is now "${model}". `
      + "Vectors from two models cannot be mixed. Re-run with `--force` to rebuild from scratch.",
    );
  }
  if (existing.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `${out} holds ${existing.dimensions}-dimension vectors; this build expects `
      + `${EMBEDDING_DIMENSIONS}. Re-run with \`--force\`.`,
    );
  }

  return new Map(existing.chunks.map((chunk) => [chunk.id, chunk]));
};

/** Serialises atomically: a half-written cache would be indistinguishable from a corrupt one. */
const write = (out: string, cache: EmbeddingCache): void => {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const temporary = `${out}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(cache));
  fs.renameSync(temporary, out);
};

const main = async (): Promise<void> => {
  const { force, out } = parseArgs(process.argv.slice(2));
  const model = config.fireworks.embeddingModel;

  const chunks = corpusChunks();
  const reusable = loadReusable(out, force, model);

  const wanted = new Set(chunks.map((chunk) => chunk.id));
  const missing = chunks.filter((chunk) => !reusable.has(chunk.id));
  const reused = chunks.length - missing.length;
  const stale = [...reusable.keys()].filter((id) => !wanted.has(id));

  log.info(`Corpus: ${chunks.length} chunks. Cached: ${reused}. To embed: ${missing.length}.`);
  if (stale.length > 0) {
    // Dropped rather than kept. A cached chunk whose id is gone from the corpus is text that no
    // longer exists in any source document; leaving it in the index would let `local-vector`
    // cite a passage a reader cannot find. (Note this is where the two vector arms can diverge:
    // `seed:firestore-chunks` does not prune, so a re-seeded collection keeps stale chunks
    // unless it is wiped first.)
    log.info(`Dropping ${stale.length} cached chunk(s) no longer present in the corpus.`);
  }

  const embeddings = new EmbeddingService();

  // Assembled in corpus order regardless of what was reused, so the artifact's diff reflects the
  // corpus rather than the order things happened to be embedded in.
  const byId = new Map(reusable);
  const snapshot = (): EmbeddingCache => {
    const cached = chunks
      .map((chunk) => byId.get(chunk.id))
      .filter((chunk): chunk is CachedChunk => chunk !== undefined);
    return {
      model,
      dimensions: EMBEDDING_DIMENSIONS,
      chunkCount: cached.length,
      generatedAt: new Date().toISOString(),
      chunks: cached,
    };
  };

  // Batched by hand rather than handing the whole list to `embedDocuments`, so the cache is
  // written after every API call. A 393-chunk build is 13 calls; losing all of them to a
  // rate-limit error on the last one would be the difference between a resumable run and a
  // wasted one — and resuming is free, because the ids already written are simply reused.
  const groups = batched(missing, EMBED_BATCH);
  let embedded = 0;

  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    // eslint-disable-next-line no-await-in-loop
    const vectors = await embeddings.embedDocuments(group.map((chunk) => chunk.text));

    group.forEach((chunk, index) => {
      byId.set(chunk.id, { ...chunk, embedding: vectors[index] });
    });
    embedded += group.length;

    write(out, snapshot());
    log.info(`  checkpoint: ${embedded}/${missing.length} embedded, cache written.`);
  }

  if (groups.length === 0) {
    // Still rewritten: pruning stale entries is a change even when nothing was embedded.
    write(out, snapshot());
  }

  const final = snapshot();
  // Read back through the adapter's own validator, so a cache this script accepts is exactly a
  // cache `local-vector` will accept. Catching a mismatch here beats catching it at query time.
  validateEmbeddingCache(final, out, model);

  const newChars = missing.reduce((sum, chunk) => sum + chunk.text.length, 0);
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
  const bytes = fs.statSync(out).size;

  log.info(`Wrote ${out}`);
  log.info(`  model:      ${final.model} (${final.dimensions} dims)`);
  log.info(`  chunks:     ${final.chunkCount} (${embedded} embedded, ${reused} reused, ${stale.length} dropped)`);
  log.info(`  billed:     ~${estimateTokens(newChars).toLocaleString()} tokens this run`);
  log.info(`  full build: ~${estimateTokens(totalChars).toLocaleString()} tokens if rebuilt from scratch`);
  log.info(`  size:       ${(bytes / 1024 / 1024).toFixed(1)} MB on disk (git-ignored — not shared by a clone)`);
  log.info("Set DEFAULT_RETRIEVAL=local-vector (or send retrieval=local-vector) to use it.");
};

main().catch((error: unknown) => {
  log.error("Embedding cache build failed", error instanceof Error ? error : undefined);
  process.exitCode = 1;
});
