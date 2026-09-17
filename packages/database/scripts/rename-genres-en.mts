/**
 * Rename the seeded genres from Vietnamese to English, one time, on a DB that
 * already has stories in it.
 *
 * A plain reseed cannot do this. `seedGenres` upserts on `name`, so against a DB
 * holding "kinh dị" it CREATES "horror" beside it and leaves the old row, the old
 * description and every story still pointing at the old name.
 *
 * `Genre.name` is a lookup key in three places — `Series.genre`, `Series.tags` and
 * `Prompt.genre` — and none of them is a foreign key, so nothing stops them going
 * stale. A story left on the old name silently loses its genre description from the
 * Story Bible, and the prose drifts a run or two later with nothing to point at.
 * So the rename and those three columns move together, in one transaction.
 *
 * It also clears a `promptName` that has come to say exactly what `name` says. The
 * column exists to give the model a fuller label than the listener gets; once the
 * names are English most of them are the same string twice, and a blank one already
 * falls back to `name`.
 *
 *   pnpm --filter @audio/database db:rename-genres        # say what would change
 *   pnpm --filter @audio/database db:rename-genres --write # do it
 */
import { prisma } from "@audio/database";

/** Old Vietnamese name → the English one now in prisma/seed.ts. */
const RENAME: Record<string, string> = {
  "kinh dị": "horror",
  "tình cảm": "romance",
  "đam mỹ": "danmei",
  "bách hợp": "yuri",
  "trinh thám": "detective",
  "đời thường": "slice of life",
  "kỳ ảo": "fantasy",
  "hành động": "action",
  "chính kịch": "drama",
  "gia đình": "family drama",
  "người lớn": "erotica",
  "kỳ ảo hắc ám": "dark fantasy",
  "võ hiệp": "wuxia",
  "tiên hiệp": "xianxia",
  "khoa học viễn tưởng": "science fiction",
  "hậu tận thế": "post-apocalyptic",
  "giật gân": "thriller",
  hài: "comedy",
  "phương tây": "western setting",
  "phương đông": "east asian setting",
};

const write = process.argv.includes("--write");

const genres = await prisma.genre.findMany({
  select: { id: true, name: true, promptName: true },
});
const byName = new Map(genres.map((g) => [g.name, g.id]));

// A name on both sides of the table means an earlier half-finished run, or a genre
// somebody added by hand. Merging the two rows is a judgement call about which
// description survives, so refuse rather than guess.
const collisions = Object.entries(RENAME).filter(
  ([from, to]) => byName.has(from) && byName.has(to),
);
if (collisions.length > 0) {
  console.error("Both names already exist, so this cannot be a rename:");
  for (const [from, to] of collisions) console.error(`  "${from}" and "${to}"`);
  console.error("Delete or merge one side on the Genres page, then run this again.");
  process.exit(1);
}

const renames = Object.entries(RENAME).filter(([from]) => byName.has(from));
const series = await prisma.series.findMany({ select: { id: true, genre: true, tags: true } });
const prompts = await prisma.prompt.findMany({ select: { id: true, genre: true } });

const touchedSeries = series.filter(
  (s) => RENAME[s.genre] || s.tags.some((t) => RENAME[t]),
);
const touchedPrompts = prompts.filter((p) => p.genre && RENAME[p.genre]);

console.log(`${renames.length} genres to rename`);
for (const [from, to] of renames) console.log(`  ${from} → ${to}`);
console.log(`${touchedSeries.length} series to rewrite`);
for (const s of touchedSeries) {
  const genre = RENAME[s.genre] ?? s.genre;
  const tags = s.tags.map((t) => RENAME[t] ?? t);
  console.log(`  ${s.id}: genre=${genre} tags=[${tags.join(", ")}]`);
}
console.log(`${touchedPrompts.length} prompt variants to re-key`);

// Compared against the name this genre is ABOUT to have, so a row renamed and made
// redundant in the same run is caught on that run rather than needing a second one.
const redundant = genres.filter((g) => {
  const after = RENAME[g.name] ?? g.name;
  return g.promptName.trim() !== "" && g.promptName.trim().toLowerCase() === after.toLowerCase();
});
console.log(`${redundant.length} promptNames to clear as duplicates of the name`);
for (const g of redundant) console.log(`  ${RENAME[g.name] ?? g.name}`);

if (renames.length + touchedSeries.length + touchedPrompts.length + redundant.length === 0) {
  console.log("\nNothing to do — the catalogue is already in English.");
  await prisma.$disconnect();
  process.exit(0);
}

if (!write) {
  console.log("\nNothing written. Re-run with --write to apply.");
  await prisma.$disconnect();
  process.exit(0);
}

// One transaction: a rename that lands while the stories pointing at it do not is
// exactly the silent breakage this script exists to avoid.
await prisma.$transaction([
  ...renames.map(([from, to]) =>
    prisma.genre.update({ where: { name: from }, data: { name: to } }),
  ),
  ...touchedSeries.map((s) =>
    prisma.series.update({
      where: { id: s.id },
      data: { genre: RENAME[s.genre] ?? s.genre, tags: s.tags.map((t) => RENAME[t] ?? t) },
    }),
  ),
  ...touchedPrompts.map((p) =>
    prisma.prompt.update({ where: { id: p.id }, data: { genre: RENAME[p.genre!] } }),
  ),
  ...redundant.map((g) => prisma.genre.update({ where: { id: g.id }, data: { promptName: "" } })),
]);

console.log(
  `\n✔ renamed ${renames.length} genres, rewrote ${touchedSeries.length} series and ` +
    `${touchedPrompts.length} prompt variants, cleared ${redundant.length} promptNames`,
);
await prisma.$disconnect();
