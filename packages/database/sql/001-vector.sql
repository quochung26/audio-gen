-- The index for StoryFact's embedding column.
--
-- The COLUMN itself is created by Prisma (declared `Unsupported("vector(1024)")` in the
-- schema); the extension is enabled by sql/000-extension.sql before the push. All that is
-- left here is the index, because Prisma cannot declare an index on a type it does not
-- understand.
-- Run after every `prisma db push` / `migrate` — the db:vector script handles it.

-- In case this file is run by hand against a DB built some other way.
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "StoryFact" ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- HNSW for cosine nearest-neighbour search. This index only earns its keep past a few
-- hundred facts; below that Postgres scans sequentially and is still fast.
CREATE INDEX IF NOT EXISTS storyfact_embedding_hnsw
  ON "StoryFact" USING hnsw (embedding vector_cosine_ops);

-- The "which facts have no embedding" query runs often.
CREATE INDEX IF NOT EXISTS storyfact_embedding_null
  ON "StoryFact" ("seriesId") WHERE embedding IS NULL;
