import { Hono } from "hono";
import { prisma } from "@audio/database";
import { field, UserError } from "../lib/http";

export const genres = new Hono();

const MAX_NAME = 40;
const MAX_DESCRIPTION = 600;

/** The genre catalogue, with how many stories use each. */
genres.get("/", async (c) => {
  const rows = await prisma.genre.findMany({ orderBy: { name: "asc" } });

  // Count MAIN and SUB genres alike: deleting one that is a sub-genre for a few
  // stories still costs them part of their direction.
  const series = await prisma.series.findMany({ select: { genre: true, tags: true } });
  const used = new Map<string, number>();
  for (const s of series) {
    for (const name of new Set([s.genre, ...s.tags])) {
      used.set(name, (used.get(name) ?? 0) + 1);
    }
  }

  return c.json({
    genres: rows.map((g) => ({ ...g, usedBy: used.get(g.name) ?? 0 })),
    // Genres stories use that are not in the catalogue — old data, or typed by
    // hand into the sub-genre box. Surfaced so they can be given a description.
    unlisted: [...used.keys()]
      .filter((name) => !rows.some((g) => g.name === name))
      .sort()
      .map((name) => ({ name, usedBy: used.get(name)! })),
  });
});

function readInput(body: Record<string, unknown>): {
  name: string;
  promptName: string;
  description: string;
} {
  const name = field(body, "name").trim().replace(/\s+/g, " ");
  // Empty is valid: unset means the model reads `name` itself.
  const promptName = field(body, "promptName").trim().replace(/\s+/g, " ");
  const description = field(body, "description").trim();

  if (!name) throw new UserError("Missing genre name");
  if (name.length > MAX_NAME) throw new UserError(`Genre name is at most ${MAX_NAME} characters`);
  if (promptName.length > MAX_NAME) {
    throw new UserError(`The model name is at most ${MAX_NAME} characters`);
  }
  if (!description) {
    // With no description the row does nothing — a genre already works without
    // being in the catalogue at all.
    throw new UserError("Missing description. The description is what the model reads to understand this genre.");
  }
  if (description.length > MAX_DESCRIPTION) {
    throw new UserError(`The description is at most ${MAX_DESCRIPTION} characters — it goes into every model call.`);
  }
  return { name, promptName, description };
}

genres.post("/", async (c) => {
  const input = readInput(await c.req.parseBody());

  const existing = await prisma.genre.findUnique({ where: { name: input.name } });
  if (existing) throw new UserError(`The genre "${input.name}" already exists.`);

  await prisma.genre.create({ data: input });
  return c.json({ ok: `Added "${input.name}".` });
});

genres.put("/:id", async (c) => {
  const id = c.req.param("id");
  const input = readInput(await c.req.parseBody());
  const before = await prisma.genre.findUniqueOrThrow({ where: { id } });

  const clash = await prisma.genre.findUnique({ where: { name: input.name } });
  if (clash && clash.id !== id) throw new UserError(`The genre "${input.name}" already exists.`);

  await prisma.genre.update({ where: { id }, data: input });

  // RENAMING does not follow stories still on the old name: `Series.genre` holds
  // a string, not a foreign key. Say so rather than mass-editing — renaming the
  // genre of a finished story changes how it is filed, which is the writer's
  // call.
  const renamed = before.name !== input.name;
  const stillOld = renamed
    ? await prisma.series.count({ where: { OR: [{ genre: before.name }, { tags: { has: before.name } }] } })
    : 0;

  return c.json({
    ok: `Saved "${input.name}".`,
    warnings:
      stillOld > 0
        ? [`${stillOld} stories still say "${before.name}". Change them on their own pages if you want them to follow.`]
        : [],
  });
});

genres.put("/:id/toggle", async (c) => {
  const g = await prisma.genre.findUniqueOrThrow({ where: { id: c.req.param("id") } });
  await prisma.genre.update({ where: { id: g.id }, data: { enabled: !g.enabled } });
  return c.json({
    ok: g.enabled
      ? `Hid "${g.name}" from the pickers. Stories using it are unaffected.`
      : `Unhid "${g.name}".`,
  });
});

genres.delete("/:id", async (c) => {
  const g = await prisma.genre.findUniqueOrThrow({ where: { id: c.req.param("id") } });

  const used = await prisma.series.count({
    where: { OR: [{ genre: g.name }, { tags: { has: g.name } }] },
  });
  if (used > 0) {
    // Deleting costs those stories their Story Bible description with nothing
    // said — the prose shifts on the next run and the cause is very hard to
    // trace.
    throw new UserError(
      `${used} stories use "${g.name}". Hiding it removes it from the pickers while those stories keep the description.`,
    );
  }

  await prisma.genre.delete({ where: { id: g.id } });
  return c.json({ ok: `Deleted "${g.name}".` });
});
