-- Enable pgvector BEFORE Prisma pushes the schema.
--
-- The order matters: `StoryFact.embedding` is declared `Unsupported("vector(1024)")` so
-- `prisma db push` creates the column itself — and a `vector` column cannot be created
-- while the extension is off. On a machine already set up this is a no-op.
CREATE EXTENSION IF NOT EXISTS vector;
