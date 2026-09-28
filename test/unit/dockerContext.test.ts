import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  copySources, isIncluded, parseDockerignore,
} from "../../scripts/dockerContext";

/**
 * Proves what the image carries without Docker (release plan S1): this machine has none, so the
 * build context is checked by applying `.dockerignore` the way Docker does and reading the
 * Dockerfile's `COPY` lines. `scripts/dockerContext.ts` lists the same context for a checkout.
 */

const ROOT = path.resolve(__dirname, "../..");
const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), "utf8");
const rules = parseDockerignore(read(".dockerignore"));
const dockerfile = read("Dockerfile");

describe("the .dockerignore matcher follows Docker's documented rules", () => {
  // Examples from the Docker `.dockerignore` reference, so the matcher is checked against the
  // behavior it claims rather than only against the file it is used on.
  it("anchors patterns at the context root and stops `*` at a slash", () => {
    const docs = parseDockerignore("*/temp*\n*/*/temp*\ntemp?");
    expect(isIncluded(docs, "somedir/temporary.txt")).toBe(false);
    expect(isIncluded(docs, "somedir/subdir/temporary.txt")).toBe(false);
    expect(isIncluded(docs, "tempa")).toBe(false);
    expect(isIncluded(docs, "temporary.txt")).toBe(true);
    expect(isIncluded(docs, "a/b/c/temporary.txt")).toBe(true);
  });

  it("lets `**` span any number of directories", () => {
    const docs = parseDockerignore("**/*.go");
    expect(isIncluded(docs, "main.go")).toBe(false);
    expect(isIncluded(docs, "a/b/main.go")).toBe(false);
    expect(isIncluded(docs, "a/b/main.ts")).toBe(true);
  });

  it("applies the last matching line, so `!` re-includes and a later line re-excludes", () => {
    const docs = parseDockerignore("*.md\n!README*.md\nREADME-secret.md");
    expect(isIncluded(docs, "notes.md")).toBe(false);
    expect(isIncluded(docs, "README.md")).toBe(true);
    expect(isIncluded(docs, "README-secret.md")).toBe(false);
  });

  it("excludes a directory's contents when the directory matches", () => {
    const docs = parseDockerignore("node_modules");
    expect(isIncluded(docs, "node_modules/openai/index.js")).toBe(false);
  });
});

describe("the image's build context", () => {
  it.each([
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "src/index.ts",
    "src/catalogue/catalogue.json",
    "release/artifacts.sha256",
    "data/corpus/corpus.json",
    "data/embeddings/cache.json",
  ])("includes %s", (file) => {
    expect(isIncluded(rules, file)).toBe(true);
  });

  it.each([
    ".env",
    ".env.production",
    "serviceAccountKey.json",
    "node_modules/openai/package.json",
    ".git/HEAD",
    ".claude/worktrees/x/src/index.ts",
    "docs/STATUS.md",
    "documents/manual.pdf",
    "eval/transcripts/run.jsonl",
    "test/unit/quota.test.ts",
    "scripts/seedFirestore.ts",
    "data/device-fields/pods.json",
    "data/backend-surface/users.json",
    "data/results/judge/run.jsonl",
    "data/corpus/corpus.backup.json",
    "data/embeddings/cache.old.json",
    "water-quality-source-of-truth-v2.pdf",
    "Dockerfile",
  ])("excludes %s", (file) => {
    expect(isIncluded(rules, file)).toBe(false);
  });

  it("lets in every file the Dockerfile copies from the context", () => {
    const sources = copySources(dockerfile);
    expect(sources).toEqual(expect.arrayContaining([
      "release/artifacts.sha256", "data/corpus/corpus.json", "data/embeddings/cache.json",
    ]));
    sources
      .map((source) => source.replace("*", ""))
      .forEach((source) => expect(isIncluded(rules, source)).toBe(true));
  });
});

describe("the Dockerfile", () => {
  it("checks the data files against the pinned hashes and reads the corpus from the image", () => {
    expect(dockerfile).toMatch(/^RUN sha256sum -c release\/artifacts\.sha256$/m);
    expect(dockerfile).toMatch(/^ENV CORPUS_SOURCE=artifact$/m);
  });

  it("uses a Node version the dependencies support (openai 7 needs 22 or later)", () => {
    const versions = [...dockerfile.matchAll(/^FROM node:(\d+)/gm)].map((match) => Number(match[1]));
    expect(versions.length).toBeGreaterThan(0);
    versions.forEach((version) => expect(version).toBeGreaterThanOrEqual(22));
  });

  it("does not run as root", () => {
    expect(dockerfile).toMatch(/^USER node$/m);
  });
});

/**
 * These read the git-ignored files, so they run only in a checkout that has them, which is the
 * only kind of checkout that can build the image.
 */
const corpusPath = path.join(ROOT, "data/corpus/corpus.json");
const cachePath = path.join(ROOT, "data/embeddings/cache.json");
const haveData = fs.existsSync(corpusPath) && fs.existsSync(cachePath);
const withData = haveData ? describe : describe.skip;

withData("the data files in this checkout", () => {
  it("match the hashes the Dockerfile checks", () => {
    read("release/artifacts.sha256").trim().split("\n").forEach((line) => {
      const [hash, file] = line.split(/\s+/);
      const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex");
      expect(`${actual}  ${file}`).toBe(`${hash}  ${file}`);
    });
  });

  it("are one pair: every cached chunk is a corpus chunk with the same text, and none is missing", () => {
    const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8")) as {
      documents: Array<{ chunks: Array<{ id: string; text: string }> }>;
    };
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf8")) as {
      chunks: Array<{ id: string; text: string }>;
    };
    const corpusChunks = new Map(
      corpus.documents.flatMap((doc) => doc.chunks).map((chunk) => [chunk.id, chunk.text]),
    );

    expect(cache.chunks.length).toBe(corpusChunks.size);
    cache.chunks.forEach((chunk) => expect(corpusChunks.get(chunk.id)).toBe(chunk.text));
  });
});
