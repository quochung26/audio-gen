import { resolve } from "node:path";
import { loadEnv } from "@audio/config";
import { prisma } from "@audio/database";
import { logger } from "../lib/logger";

/**
 * Convert old `file:///…` references in the DB into relative store keys.
 *
 * Why it is needed: the first version stored ABSOLUTE paths. Renaming the project
 * directory, moving to another machine, or moving from macOS to WSL2 loses every
 * reference to already-generated audio — the files are still on disk but unreachable.
 *
 * Run: `pnpm fix:storage-refs` (add `--apply` to actually write; a dry run by default)
 *
 * Safe: only touches values starting with `file://`. `http(s)` URLs and already-correct
 * keys are skipped, so repeated runs break nothing.
 */

const apply = process.argv.includes("--apply");
const root = resolve(process.cwd(), loadEnv().STORAGE_LOCAL_DIR);

interface Table {
  name: string;
  findMany: () => Promise<Array<{ id: string; url: string }>>;
  update: (id: string, url: string) => Promise<unknown>;
}

const tables: Table[] = [
  {
    name: "AudioAsset",
    findMany: () =>
      prisma.audioAsset.findMany({ where: { url: { startsWith: "file://" } }, select: { id: true, url: true } }),
    update: (id, url) => prisma.audioAsset.update({ where: { id }, data: { url } }),
  },
  {
    name: "Export",
    findMany: () =>
      prisma.export.findMany({ where: { url: { startsWith: "file://" } }, select: { id: true, url: true } }),
    update: (id, url) => prisma.export.update({ where: { id }, data: { url } }),
  },
  {
    name: "AudioTrack",
    findMany: () =>
      prisma.audioTrack.findMany({ where: { url: { startsWith: "file://" } }, select: { id: true, url: true } }),
    update: (id, url) => prisma.audioTrack.update({ where: { id }, data: { url } }),
  },
];

logger.info(`[fix-refs] store root: ${root}`);
logger.info(`[fix-refs] mode: ${apply ? "WRITING" : "dry run (add --apply to write)"}`);

let converted = 0;
let outside = 0;

for (const table of tables) {
  const rows = await table.findMany();
  if (rows.length === 0) {
    logger.info(`[fix-refs] ${table.name}: no rows need converting`);
    continue;
  }

  for (const row of rows) {
    const abs = row.url.slice("file://".length);

    // A path outside the current store — usually the trace of a directory rename. It does
    // not guess: it reports so a person can handle it, because a wrong guess points at the
    // wrong file.
    if (abs !== root && !abs.startsWith(root + "/")) {
      logger.warn(`[fix-refs] ${table.name} ${row.id}: outside the current store, SKIPPED — ${abs}`);
      outside++;
      continue;
    }

    const key = abs.slice(root.length + 1);
    logger.info(`[fix-refs] ${table.name} ${row.id}: ${key}`);
    if (apply) await table.update(row.id, key);
    converted++;
  }
}

logger.info(
  `[fix-refs] ${apply ? "converted" : "would convert"} ${converted} rows` +
    (outside > 0 ? `, ${outside} rows outside the store need handling by hand` : ""),
);

await prisma.$disconnect();
