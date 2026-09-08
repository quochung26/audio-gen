import { prisma } from "@audio/database";
import { normalizeCast, type CastMember } from "@audio/core";
import { field, UserError } from "./http";

/**
 * Read the cast sent with the create-story form.
 *
 * The UI sends ONE `cast` field as JSON rather than dozens of separate inputs:
 * the list varies in length, and a flat `FormData` would need indexed field names
 * that every reader has to reassemble.
 *
 * Cards are looked up in the DB for their `voiceId` and to fill fields the writer
 * left blank — but any field the writer did type wins, because that is the whole
 * point of "edit without saving back to the card".
 */
export async function resolveCast(body: Record<string, unknown>): Promise<CastMember[]> {
  const raw = field(body, "cast");
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UserError("Could not read the cast that was sent.");
  }
  if (!Array.isArray(parsed)) throw new UserError("Could not read the cast that was sent.");

  const rows = parsed as Array<Record<string, unknown>>;
  const cardIds = rows.map((r) => String(r.cardId ?? "")).filter(Boolean);
  const cards = cardIds.length
    ? await prisma.characterCard.findMany({ where: { id: { in: cardIds } } })
    : [];
  const byId = new Map(cards.map((c) => [c.id, c]));

  const cast = rows.map((r) => {
    const card = byId.get(String(r.cardId ?? ""));
    const text = (key: string) => (typeof r[key] === "string" ? (r[key] as string).trim() : "");
    return {
      // A card deleted mid-flight drops the link, not the character: the writer
      // already typed the name into the form, and losing them wastes that work.
      cardId: card?.id ?? null,
      name: text("name") || card?.name || "",
      role: text("role") || card?.role || null,
      description: text("description") || card?.description || null,
      speech: text("speech") || card?.speech || null,
      outfit: text("outfit") || card?.outfit || null,
      appearance: text("appearance") || card?.appearance || null,
      voiceHint: text("voiceHint") || card?.voiceHint || null,
      isNarrator: r.isNarrator === true || r.isNarrator === "true",
    };
  });

  return normalizeCast(cast);
}
