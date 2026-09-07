import { Hono } from "hono";
import { prisma } from "@audio/database";
import { field, UserError } from "../lib/http";

/**
 * The character card library — characters reusable across stories.
 *
 * A card and a character inside a story are deliberately separate: editing the
 * character does NOT touch the card, and editing the card does NOT touch stories
 * already using it. Pushing an edit back to a card is its own action the writer
 * has to click — see
 * `POST /api/series/:id/characters/:characterId/save-card`.
 *
 * Why: a story in progress silently changing because the library changed is a
 * failure nobody sees — the prose of later episodes shifts, and nothing in that
 * story records why.
 */
export const characterCards = new Hono();

function cardInput(body: Record<string, unknown>) {
  return {
    name: field(body, "name"),
    role: field(body, "role") || null,
    description: field(body, "description") || null,
    speech: field(body, "speech") || null,
    outfit: field(body, "outfit") || null,
    appearance: field(body, "appearance") || null,
    voiceHint: field(body, "voiceHint") || null,
    voiceId: field(body, "voiceId") || null,
    isNarrator: body.isNarrator === "on" || body.isNarrator === "true",
  };
}

characterCards.get("/", async (c) => {
  const [cards, voices] = await Promise.all([
    prisma.characterCard.findMany({
      orderBy: [{ isNarrator: "desc" }, { name: "asc" }],
      include: {
        voice: { select: { id: true, name: true, language: true } },
        // How many stories use the card — shown so the effect of editing it is
        // clear (the answer is: none, but that has to be said).
        _count: { select: { characters: true } },
      },
    }),
    prisma.voice.findMany({
      where: { enabled: true },
      orderBy: [{ language: "asc" }, { name: "asc" }],
      select: { id: true, name: true, language: true },
    }),
  ]);
  return c.json({ cards, voices });
});

characterCards.post("/", async (c) => {
  const input = cardInput(await c.req.parseBody());
  if (!input.name) throw new UserError("Missing character name");

  const clash = await prisma.characterCard.findUnique({ where: { name: input.name } });
  if (clash) throw new UserError(`A card named "${input.name}" already exists.`);

  const created = await prisma.characterCard.create({ data: input });
  return c.json({ ok: `Added the card "${created.name}".`, id: created.id });
});

characterCards.put("/:id", async (c) => {
  const id = c.req.param("id");
  const input = cardInput(await c.req.parseBody());
  if (!input.name) throw new UserError("Missing character name");

  const clash = await prisma.characterCard.findFirst({
    where: { name: input.name, id: { not: id } },
    select: { id: true },
  });
  if (clash) throw new UserError(`Another card is already named "${input.name}".`);

  await prisma.characterCard.update({ where: { id }, data: input });
  return c.json({
    ok: "Card saved. Stories using it do NOT change — each keeps its own copy.",
  });
});

/**
 * Delete a card.
 *
 * Not blocked even when stories use it: `Character` already holds a full copy,
 * `cardId` is only provenance and `onDelete: SetNull` clears it. Unlike `Genre` —
 * deleting a genre costs those stories their Bible description, which is why
 * that one is blocked.
 */
characterCards.delete("/:id", async (c) => {
  const card = await prisma.characterCard.delete({ where: { id: c.req.param("id") } });
  return c.json({ ok: `Deleted the card "${card.name}". Characters in stories are untouched.` });
});
