import { slugify } from "@audio/core";
import { prisma } from "@audio/database";

/**
 * A slug nobody is using yet.
 *
 * Checked against BOTH Series and Episode: the two tables share one slug namespace
 * because the Player serves `/story/<slug>` and `/listen/<slug>` from the same root, and
 * the unique constraints are per-table so a cross-table clash is not caught by the DB.
 */
export async function freeSlug(source: string): Promise<string> {
  const base = slugify(source);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const [s, e] = await Promise.all([
      prisma.series.findUnique({ where: { slug: candidate }, select: { id: true } }),
      prisma.episode.findUnique({ where: { slug: candidate }, select: { id: true } }),
    ]);
    if (!s && !e) return candidate;
  }
  return `${base}-${Date.now()}`;
}
