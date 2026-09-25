# Node 24 matches local development and the test runs; openai 7 needs Node 22 or later and
# pdf-parse 20.16 or later, so the old node:18 base could not run this code.
# ---- build stage ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

# The approved corpus and embedding cache ship inside the image (release plan S1), read from the
# working directory as data/corpus/corpus.json and data/embeddings/cache.json. Neither is in git,
# so build from a checkout that holds the real files (not symlinks); the hash check fails the
# build if either is missing, stale or from a different corpus.
COPY release/artifacts.sha256 ./release/artifacts.sha256
COPY data/corpus/corpus.json ./data/corpus/corpus.json
COPY data/embeddings/cache.json ./data/embeddings/cache.json
RUN sha256sum -c release/artifacts.sha256
ENV CORPUS_SOURCE=artifact

# Cloud Run injects PORT; default matches local dev.
EXPOSE 8000
USER node
CMD ["node", "dist/index.js"]
