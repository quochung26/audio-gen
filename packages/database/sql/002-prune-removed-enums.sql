-- Clear rows holding an enum value the schema is about to drop.
--
-- Postgres refuses to remove a label from an enum type while any row still holds it, and
-- Prisma reports that as a failed push rather than as "delete these rows first". So this
-- runs BEFORE `prisma db push`, in the same slot as the pgvector extension: the schema
-- cannot be applied until it has.
--
-- `step::text = '…'` rather than `step = '…'` on purpose. Comparing against a bare literal
-- makes Postgres parse it AS the enum, which is an error the moment the label is gone — so
-- the naive version works exactly once and then breaks every push after it. Casting the
-- column to text compares strings, which is true before the change and simply matches
-- nothing after. On a machine already migrated, and on a fresh one, this is a no-op.
--
-- ARC_SUMMARY: the arc summary was removed once `Scene.storySoFar` carried the story
-- forward after every scene instead of every few episodes. LlmRun rows are telemetry for
-- calls to a step that no longer exists; there is nothing left to compare them against.
DELETE FROM "LlmRun"    WHERE step::text = 'ARC_SUMMARY';
DELETE FROM "RenderJob" WHERE type::text = 'ARC_SUMMARY';
DELETE FROM "Prompt"    WHERE step::text = 'ARC_SUMMARY';
