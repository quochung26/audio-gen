-- Turn the two code-owned catalogues from Postgres enums into plain text.
--
-- `Prompt.step`, `LlmRun.step` and `RenderJob.type` name a prompt step or a job type.
-- Both sets are decided by the code and grow with every feature, and as enums that
-- made each addition a schema push and each removal a migration Postgres refuses to
-- run while a single row still holds the value. See packages/database/src/catalogue.ts.
--
-- Done HERE rather than left to `prisma db push` so the conversion is explicit and
-- lossless: enum → text keeps every label as its own string, while a push deciding to
-- drop and recreate the column would take the queue's history and the LLM telemetry
-- with it.
--
-- Guarded on the column still being an enum ('USER-DEFINED'), so it runs once and is a
-- no-op on every push after that, and on a fresh database where Prisma already made
-- the columns text.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Prompt'
      AND column_name = 'step' AND data_type = 'USER-DEFINED'
  ) THEN
    ALTER TABLE "Prompt"    ALTER COLUMN "step" TYPE text;
    ALTER TABLE "LlmRun"    ALTER COLUMN "step" TYPE text;
    ALTER TABLE "RenderJob" ALTER COLUMN "type" TYPE text;
    DROP TYPE IF EXISTS "PromptStep";
    DROP TYPE IF EXISTS "JobType";
    RAISE NOTICE 'step/type columns converted from enum to text';
  END IF;
END $$;
