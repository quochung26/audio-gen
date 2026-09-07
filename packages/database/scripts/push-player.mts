import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { LOCAL_ONLY_TABLES } from "../src/publish-scope";

/**
 * Push the schema to the HOSTED DB the Player reads.
 *
 * `prisma db push` takes no `--url` flag, it only reads `DATABASE_URL` — so this script
 * reruns prisma with `DATABASE_URL` replaced by `PLAYER_DATABASE_URL`. Typing that by hand
 * is easy to get wrong, and getting it wrong here pushes the schema over the production DB.
 *
 * Run: `pnpm db:push:player`
 */

const url = process.env.PLAYER_DATABASE_URL;
if (!url) {
  console.error(
    "PLAYER_DATABASE_URL is not set.\n" +
      "This is the hosted DB the Player reads — blank means Studio and the Player share\n" +
      "one DB, and then there is nothing to push.",
  );
  process.exit(1);
}
if (url === process.env.DATABASE_URL) {
  console.error("PLAYER_DATABASE_URL is the same as DATABASE_URL. The two must differ.");
  process.exit(1);
}

console.log(`Pushing the schema to the hosted DB: ${url.replace(/:[^:@]*@/, ":***@")}`);

const res = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
if (res.status !== 0) process.exit(res.status ?? 1);

// Also checks the privacy boundary. The schema pushed is the FULL schema, so the
// local-only tables exist on hosted too — they have to be EMPTY. Any row here means
// something left the machine that should not have.
const client = new PrismaClient({ datasourceUrl: url });
const counts: Array<[string, number]> = [];
for (const table of LOCAL_ONLY_TABLES) {
  const [row] = await client.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*)::bigint AS n FROM "${table}"`,
  );
  counts.push([table, Number(row?.n ?? 0)]);
}
await client.$disconnect();

const dirty = counts.filter(([, n]) => n > 0);
console.log("\nTables that must be local only — checked on the hosted DB:");
for (const [t, n] of counts) console.log(`  ${n === 0 ? "✔" : "✖"} ${t}: ${n} rows`);

if (dirty.length > 0) {
  console.error(
    `\nFORBIDDEN DATA on the hosted DB: ${dirty.map(([t]) => t).join(", ")}.\n` +
      "The PUBLISH job never writes to these tables — check whether anyone pointed\n" +
      "DATABASE_URL at the hosted DB and then ran Studio or the worker.",
  );
  process.exit(1);
}
console.log("\nClean. The hosted DB holds published content only.");
