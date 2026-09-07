import { Hono } from "hono";
import { BatchStatus, JobStatus, prisma } from "@audio/database";
import {
  checkTags,
  isLanguage,
  parseTags,
  normalizeCast,
  parseWorld,
  planDraft,
  type CastMember,
  seriesBible,
  worldSetupSchema,
  type StoryBibleRecord,
} from "@audio/core";
import { rename, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { checkCover, ffprobe } from "@audio/audio";
import { loadEnv } from "@audio/config";
import { getDefaultLanguage } from "@audio/llm";
import { enqueue } from "../lib/queue";
import { cleanupAudio, filesRemovedNote } from "../lib/cleanup";
import { putLocal, safeFileName, storageRoot } from "../lib/storage";
import { field, splitLines, UserError } from "../lib/http";

export const series = new Hono();

series.get("/", async (c) => {
  const rows = await prisma.series.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { episodes: true, characters: true } } },
  });
  return c.json(rows);
});

/**
 * Genres stories ACTUALLY use — suggestions when creating a prompt variant.
 *
 * Different from `/api/genres`: this comes from real data, including genres typed
 * by hand that are not in the catalogue. The catalogue drives the picker, this
 * drives prompt variants — a variant is only worth making for a genre that has
 * stories.
 */
series.get("/genres", async (c) => {
  const rows = await prisma.series.findMany({
    distinct: ["genre"],
    select: { genre: true },
    orderBy: { genre: "asc" },
  });
  return c.json(rows.map((r) => r.genre));
});

series.get("/:id", async (c) => {
  const s = await prisma.series.findUniqueOrThrow({
    where: { id: c.req.param("id") },
    include: {
      characters: { orderBy: [{ isNarrator: "desc" }, { name: "asc" }], include: { voice: true } },
      episodes: {
        orderBy: { number: "asc" },
        include: {
          _count: { select: { chapters: true, blocks: true } },
          exports: { where: { type: "AUDIO_MP3" }, select: { id: true } },
        },
      },
      batchRuns: { orderBy: { startedAt: "desc" }, take: 1 },
    },
  });
  return c.json({ ...s, world: parseWorld((s.storyBible as StoryBibleRecord | null)?.world) });
});

/**
 * Create a story — queue the outline job and return its id so the UI can jump to
 * the progress page.
 */
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
async function resolveCast(body: Record<string, unknown>): Promise<CastMember[]> {
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

series.post("/", async (c) => {
  const body = await c.req.parseBody();
  const idea = field(body, "idea");
  if (!idea) throw new UserError("Idea is required");

  // World setup is optional. Given one, the AI has to stick to it; without one it
  // invents its own and you fix it on the Story Bible page later.
  const world = worldSetupSchema.parse({
    setting: field(body, "setting"),
    tone: field(body, "tone"),
    rules: splitLines(body.rules),
    constraints: splitLines(body.constraints),
    glossary: [],
  });

  // Language is fixed AT CREATION and never changes: switch midway and the arc
  // summary, the character names and the voices of earlier episodes all drift.
  const language = field(body, "language");
  if (language && !isLanguage(language)) throw new UserError(`Invalid language: "${language}"`);

  // The DRAFT language is the opposite — changeable at any time (see PUT
  // /:id/draft-language): it only decides the next write, and scenes already
  // rewritten stay as they are.
  const draftLanguage = field(body, "draftLanguage");
  if (draftLanguage && !isLanguage(draftLanguage)) {
    throw new UserError(`Invalid draft language: "${draftLanguage}"`);
  }

  // The cast picked up front: cards from the library, plus characters typed just
  // for this story. Cards are flattened RIGHT HERE so the worker never has to know
  // the card table exists — it just receives a list of characters, and where they
  // came from does not matter. What was sent already carries the writer's hand
  // edits, and those edits win.
  const cast = await resolveCast(body);

  const job = await enqueue({
    type: "OUTLINE",
    payload: {
      idea,
      language: language || (await getDefaultLanguage()),
      draftLanguage,
      cast,
      genre: field(body, "genre") || "kinh dị",
      tags: field(body, "tags"),
      // Always EXACTLY ONE episode. Outlining 10 up front from one line of idea
      // makes episode 8 onward the model's guess at a story not yet written;
      // episode by episode, each one is outlined knowing how the last one ended.
      // Add episodes with "Write a new episode" on the story page.
      episodeCount: 1,
      world,
      // Applies to this run only; blank means the worker uses its default.
      model: field(body, "model") || undefined,
    },
  });
  return c.json({ jobId: job.id });
});

/**
 * Outline the next episode.
 *
 * Blocked while the latest episode has no summary: without one the new episode
 * gets outlined without knowing how the last one ended — exactly what writing
 * episode by episode exists to avoid.
 */
series.post("/:id/episodes", async (c) => {
  const seriesId = c.req.param("id");
  const body = await c.req.parseBody();

  const s = await prisma.series.findUniqueOrThrow({
    where: { id: seriesId },
    select: { id: true },
  });

  const last = await prisma.episode.findFirst({
    where: { seriesId: s.id },
    orderBy: { number: "desc" },
    select: { number: true, title: true, summary: true },
  });

  if (last && !last.summary && field(body, "force") !== "1") {
    throw new UserError(
      `Episode ${last.number} "${last.title}" has no summary yet. Finish and summarise it first, ` +
        `otherwise the new episode gets outlined without knowing how the last one ended.`,
    );
  }

  const job = await enqueue({
    type: "NEXT_EPISODE",
    payload: { seriesId: s.id, model: field(body, "model") || undefined },
  });
  return c.json({ jobId: job.id });
});

/**
 * Edit the sub-genre tags.
 *
 * Takes effect on the next write: the Story Bible is REBUILT from the latest data
 * on every scene, never from a pre-rendered copy. Finished episodes do not change
 * — they were written under the old direction.
 */
series.put("/:id/tags", async (c) => {
  const body = await c.req.parseBody();
  const raw = field(body, "tags");

  const errors = checkTags(raw);
  if (errors.length > 0) throw new UserError(errors.join("; "));

  const tags = parseTags(raw);
  await prisma.series.update({ where: { id: c.req.param("id") }, data: { tags } });

  return c.json({
    ok: tags.length > 0 ? `Saved ${tags.length} sub-genre tags.` : "All sub-genre tags removed.",
    warnings:
      tags.length > 0
        ? ["Applies to episodes written from now on. Finished ones keep the old direction."]
        : [],
  });
});

series.get("/:id/world", async (c) => {
  const s = await prisma.series.findUniqueOrThrow({ where: { id: c.req.param("id") } });
  const stored = (s.storyBible ?? {}) as StoryBibleRecord;
  return c.json({
    world: parseWorld(stored.world),
    bible: stored.bible ?? "",
    title: s.title,
    genre: s.genre,
  });
});

/**
 * Save the world setup. Overwrites `world`, LEAVES `raw` (the AI-generated
 * outline) alone — the two are separate so editing world rules cannot lose the
 * outline, and regenerating the outline cannot lose the world rules.
 */
/**
 * Change a story's DRAFT language.
 *
 * Unlike `Series.language`, this one can change midway: it only decides the next
 * scene written, and scenes already written and rewritten are untouched. Turning
 * it off (empty string) writes straight in the output language from then on.
 */
series.put("/:id/draft-language", async (c) => {
  const body = await c.req.parseBody();
  const value = field(body, "draftLanguage");
  if (value && !isLanguage(value)) throw new UserError(`Invalid language: "${value}"`);

  const updated = await prisma.series.update({
    where: { id: c.req.param("id") },
    data: { draftLanguage: value },
    select: { language: true, draftLanguage: true },
  });
  const plan = planDraft(updated.language, updated.draftLanguage);

  return c.json({
    ok: plan.translate
      ? `Drafts are written in "${plan.draft}", then rewritten into "${plan.output}".`
      : `Written straight in "${plan.output}", with no rewrite step.`,
  });
});

series.put("/:id/world", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const s = await prisma.series.findUniqueOrThrow({ where: { id }, include: { characters: true } });
  const stored = (s.storyBible ?? {}) as StoryBibleRecord;

  const world = worldSetupSchema.parse({
    setting: field(body, "setting"),
    tone: field(body, "tone"),
    rules: splitLines(body.rules),
    constraints: splitLines(body.constraints),
    glossary: splitLines(body.glossary)
      .map((line) => {
        const [term, ...rest] = line.split(":");
        return { term: (term ?? "").trim(), meaning: rest.join(":").trim() };
      })
      .filter((g) => g.term),
  });

  await prisma.series.update({
    where: { id },
    data: {
      storyBible: {
        ...stored,
        world,
        bible: seriesBible({
          title: s.title,
          genre: s.genre,
          tags: s.tags,
          genreNotes: await prisma.genre.findMany({
            where: { name: { in: [s.genre, ...s.tags] } },
            select: { name: true, promptName: true, description: true },
          }),
          description: s.description,
          world,
          characters: s.characters,
          episodes: stored.raw?.episodes,
        }),
      } as object,
    },
  });
  return c.json({ ok: true });
});

/**
 * Set the story's cover art.
 *
 * Checks Apple Podcasts' rules AT UPLOAD: Apple rejects a feed after submission,
 * and waiting days for a rejection costs far more than saying so here. But it
 * only BLOCKS on a broken or oversized file — a small image is still accepted,
 * with a warning, so you can put a placeholder up while waiting for the real art.
 */
series.put("/:id/cover", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const file = body.file;

  if (!(file instanceof File) || file.size === 0) throw new UserError("No image selected");
  if (loadEnv().STORAGE_DRIVER !== "local") {
    throw new UserError("Uploads only work with STORAGE_DRIVER=local.");
  }

  // Keep the original extension: ffprobe can infer the format from content, but
  // browsers and Apple go by the file extension.
  const ext = extname(safeFileName(file.name)) || ".jpg";
  const key = `library/covers/${id}${ext}`;

  // Write to a TEMP name, check it, and only then move it into place.
  //
  // Writing straight to `key` is broken: uploading a corrupt .jpg overwrites the
  // .jpg cover in use, then cleanup deletes that file — leaving the old cover gone
  // with the DB still pointing at it. This exact bug happened in testing.
  const tmpKey = `library/covers/.tmp-${id}${ext}`;
  const tmpPath = join(storageRoot(), tmpKey);
  await putLocal(tmpKey, Buffer.from(await file.arrayBuffer()));

  const probe = await ffprobe(tmpPath).catch(() => null);
  const check = probe
    ? checkCover(probe)
    : { ok: false, errors: ["Could not read the file — is it an image?"], warnings: [] };

  if (!check.ok) {
    await unlink(tmpPath).catch(() => {});
    throw new UserError(check.errors.join(" "));
  }

  // `rename` within one filesystem is atomic — there is no moment where `key`
  // exists holding half-written content.
  await rename(tmpPath, join(storageRoot(), key));
  await prisma.series.update({ where: { id }, data: { coverUrl: key } });
  return c.json({
    ok: check.warnings.length === 0 ? "Cover art set." : "Cover art set, but:",
    warnings: check.warnings,
    width: probe?.width,
    height: probe?.height,
  });
});

/**
 * Delete a whole story.
 *
 * No second confirmation at the API — Studio already asked. But it BLOCKS two
 * situations that would leave debris nobody can clean up by hand:
 *
 *  1. Jobs still queued. The DB rows cascade away, while the Redis job still runs
 *     and then dies because it cannot find its episode — and that error says
 *     nothing about the story having just been deleted.
 *  2. Episodes still published. The local DB is wiped but the hosted DB is not,
 *     and from then on there is no way left to take them down.
 *
 * Prisma's cascade handles the DB (episodes, scenes, blocks, characters, facts,
 * exports…). FILES have to be cleaned up here: block audio is shared by
 * `cacheKey`, so a file is only deleted when no other block points at it.
 */
series.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const s = await prisma.series.findUniqueOrThrow({
    where: { id },
    select: { id: true, title: true, coverUrl: true },
  });

  const running = await prisma.renderJob.count({
    where: {
      episode: { seriesId: id },
      status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
    },
  });
  if (running > 0) {
    throw new UserError(
      `${running} jobs are running or queued for this story. Wait for them (or stop the batch run), then delete.`,
    );
  }

  const published = await prisma.episode.count({
    where: { seriesId: id, publishedAt: { not: null } },
  });
  if (published > 0) {
    throw new UserError(
      `${published} episodes are published. Unpublish them first — deleting here leaves the hosted copies with no way to take them down.`,
    );
  }

  // Collect the file keys BEFORE deleting the rows: once gone, they are unreadable.
  const [blocks, exports] = await Promise.all([
    prisma.block.findMany({
      where: { episode: { seriesId: id }, audioAssetId: { not: null } },
      select: { audioAssetId: true },
    }),
    prisma.export.findMany({ where: { episode: { seriesId: id } }, select: { url: true } }),
  ]);
  const assetIds = [...new Set(blocks.map((b) => b.audioAssetId!))];

  await prisma.series.delete({ where: { id } });

  // Exports and the cover belong to this story alone so they go straight away;
  // block audio is shared, and `cleanupAudio` handles that.
  const files = await cleanupAudio({
    assetIds,
    urls: [...exports.map((e) => e.url), ...(s.coverUrl ? [s.coverUrl] : [])],
  });

  return c.json({ ok: `Deleted "${s.title}"${filesRemovedNote(files)}.` });
});

series.delete("/:id/cover", async (c) => {
  // The file on disk STAYS — a published episode may still point at it via RSS.
  await prisma.series.update({ where: { id: c.req.param("id") }, data: { coverUrl: null } });
  return c.json({ ok: "Cover art removed." });
});

series.put("/:id/arc-summary", async (c) => {
  const body = await c.req.parseBody();
  await prisma.series.update({
    where: { id: c.req.param("id") },
    data: { arcSummary: field(body, "arcSummary") || null },
  });
  return c.json({ ok: true });
});

series.put("/:id/default-voice", async (c) => {
  const body = await c.req.parseBody();
  await prisma.series.update({
    where: { id: c.req.param("id") },
    data: { defaultVoiceId: field(body, "defaultVoiceId") || null },
  });
  return c.json({ ok: true });
});

// ═══════════════════ Batch runs ═══════════════════

series.post("/:id/batch", async (c) => {
  const seriesId = c.req.param("id");
  const body = await c.req.parseBody();

  const existing = await prisma.batchRun.findFirst({
    where: { seriesId, status: { in: [BatchStatus.RUNNING, BatchStatus.WAITING_REVIEW] } },
  });
  if (existing) throw new UserError("This story already has a run going. Stop that one first.");

  const run = await prisma.batchRun.create({
    data: {
      seriesId,
      autoApprove: body.autoApprove === "on" || body.autoApprove === "true",
      withAudio: body.withAudio === "on" || body.withAudio === "true",
      status: BatchStatus.RUNNING,
    },
  });
  await enqueue({ type: "BATCH", payload: { runId: run.id } });
  return c.json({ runId: run.id });
});

/**
 * Stop a run. The job currently RUNNING finishes — cutting it off midway leaves
 * half-written data. It just means no further step gets queued after it.
 */
series.delete("/:id/batch/:runId", async (c) => {
  await prisma.batchRun.update({
    where: { id: c.req.param("runId") },
    data: { status: BatchStatus.CANCELLED, finishedAt: new Date(), currentEpisodeId: null },
  });
  return c.json({ ok: true });
});

// ═══════════════════ Characters ═══════════════════

/** Exactly one narrator per story. Clear the flag on everyone else. */
async function ensureSingleNarrator(seriesId: string, keepId: string) {
  await prisma.character.updateMany({
    where: { seriesId, isNarrator: true, id: { not: keepId } },
    data: { isNarrator: false },
  });
}

function characterInput(body: Record<string, unknown>) {
  return {
    name: field(body, "name"),
    role: field(body, "role") || null,
    description: field(body, "description") || null,
    speech: field(body, "speech") || null,
    outfit: field(body, "outfit") || null,
    appearance: field(body, "appearance") || null,
    // `state` is updated by the summary job after each episode, but stays editable
    // — if the AI misread a plot point it has to be fixable, or the error spreads
    // into the next episode.
    state: field(body, "state") || null,
    voiceHint: field(body, "voiceHint") || null,
    isNarrator: body.isNarrator === "on" || body.isNarrator === "true",
  };
}

series.get("/:id/characters", async (c) => {
  const seriesId = c.req.param("id");
  const [characters, voices, defaultVoiceId] = await Promise.all([
    prisma.character.findMany({
      where: { seriesId },
      orderBy: [{ isNarrator: "desc" }, { name: "asc" }],
      include: { voice: true, _count: { select: { blocks: true } } },
    }),
    prisma.voice.findMany({ where: { enabled: true }, orderBy: [{ tier: "asc" }, { name: "asc" }] }),
    prisma.series
      .findUniqueOrThrow({ where: { id: seriesId }, select: { defaultVoiceId: true, title: true } }),
  ]);
  return c.json({ characters, voices, ...defaultVoiceId });
});

series.post("/:id/characters", async (c) => {
  const seriesId = c.req.param("id");
  const input = characterInput(await c.req.parseBody());
  if (!input.name) throw new UserError("Character name is required");

  // (seriesId, name) is unique — say so plainly rather than leaking a Prisma error.
  const existing = await prisma.character.findFirst({
    where: { seriesId, name: input.name },
    select: { id: true },
  });
  if (existing) throw new UserError(`This story already has a character called "${input.name}".`);

  const created = await prisma.character.create({ data: { ...input, seriesId } });
  if (input.isNarrator) await ensureSingleNarrator(seriesId, created.id);
  return c.json(created);
});

series.put("/:id/characters/:characterId", async (c) => {
  const seriesId = c.req.param("id");
  const id = c.req.param("characterId");
  const input = characterInput(await c.req.parseBody());
  if (!input.name) throw new UserError("Character name is required");

  const clash = await prisma.character.findFirst({
    where: { seriesId, name: input.name, id: { not: id } },
    select: { id: true },
  });
  if (clash) throw new UserError(`Another character is already called "${input.name}".`);

  await prisma.character.update({ where: { id }, data: input });
  if (input.isNarrator) await ensureSingleNarrator(seriesId, id);
  return c.json({ ok: true });
});

/**
 * Add a character to the story from an existing card.
 *
 * Copies the card's CONTENT rather than referencing it: from here the character
 * lives its own life inside the story, and later edits to the card leave it
 * alone.
 */
series.post("/:id/characters/from-card", async (c) => {
  const seriesId = c.req.param("id");
  const cardId = field(await c.req.parseBody(), "cardId");
  if (!cardId) throw new UserError("No card selected");

  const card = await prisma.characterCard.findUniqueOrThrow({ where: { id: cardId } });

  const existing = await prisma.character.findFirst({
    where: { seriesId, name: card.name },
    select: { id: true },
  });
  if (existing) throw new UserError(`This story already has a character called "${card.name}".`);

  const created = await prisma.character.create({
    data: {
      seriesId,
      cardId: card.id,
      name: card.name,
      role: card.role,
      description: card.description,
      speech: card.speech,
      outfit: card.outfit,
      appearance: card.appearance,
      voiceHint: card.voiceHint,
      voiceId: card.voiceId,
      isNarrator: card.isNarrator,
    },
  });
  if (card.isNarrator) await ensureSingleNarrator(seriesId, created.id);

  return c.json({ ok: `Added "${card.name}" from the card.` });
});

/**
 * Push a story's edited character BACK to the card library.
 *
 * A separate, deliberate click, because editing a character inside one story is
 * that story's business: "by now Tài knows he was tricked" is true of the story
 * being written and false of every other. This only happens when the writer
 * decides the edit is worth carrying across.
 *
 * A character that came from a card overwrites that card; one without a card
 * creates a new one. `asNew=1` forces a new card even when there is one — for
 * splitting a variant off the original.
 */
series.post("/:id/characters/:characterId/save-card", async (c) => {
  const character = await prisma.character.findUniqueOrThrow({
    where: { id: c.req.param("characterId") },
  });
  const asNew = c.req.query("asNew") === "1";

  const data = {
    name: character.name,
    role: character.role,
    description: character.description,
    speech: character.speech,
    outfit: character.outfit,
    appearance: character.appearance,
    voiceHint: character.voiceHint,
    voiceId: character.voiceId,
    isNarrator: character.isNarrator,
  };

  if (character.cardId && !asNew) {
    await prisma.characterCard.update({ where: { id: character.cardId }, data });
    return c.json({ ok: `Updated the card "${data.name}" in the library.` });
  }

  // Card names are unique. Say so plainly rather than leaking a Prisma error —
  // and name the way out, because a clash here usually means the writer wanted to
  // edit the existing card, not make a new one.
  const clash = await prisma.characterCard.findUnique({
    where: { name: data.name },
    select: { id: true },
  });
  if (clash) {
    throw new UserError(
      `The library already has a card called "${data.name}". Rename the character, or edit that card directly on the Character cards page.`,
    );
  }

  const card = await prisma.characterCard.create({ data });
  // Record the origin so the next save overwrites this card instead of adding one.
  await prisma.character.update({ where: { id: character.id }, data: { cardId: card.id } });

  return c.json({ ok: `Saved "${card.name}" as a new card in the library.` });
});

series.delete("/:id/characters/:characterId", async (c) => {
  const id = c.req.param("characterId");
  // Blocks keep a SNAPSHOT of the speaker name (`speakerLabel`), so deleting a
  // character does not break rendered audio — only the link is lost.
  await prisma.block.updateMany({ where: { characterId: id }, data: { characterId: null } });
  await prisma.character.delete({ where: { id } });
  return c.json({ ok: true });
});

/**
 * Casting: assign a voice to a character.
 *
 * Changing the voice does NOT break rendered audio — `Block` keeps a snapshot of
 * the voiceId, so an old block's cacheKey still points at the right old file.
 */
series.put("/:id/characters/:characterId/voice", async (c) => {
  const body = await c.req.parseBody();
  await prisma.character.update({
    where: { id: c.req.param("characterId") },
    data: { voiceId: field(body, "voiceId") || null },
  });
  return c.json({ ok: true });
});

// ═══════════════════ Story facts ═══════════════════

series.get("/:id/facts", async (c) => {
  const seriesId = c.req.param("id");
  const [facts, missing, meta] = await Promise.all([
    prisma.storyFact.findMany({
      where: { seriesId },
      orderBy: [{ episodeNumber: "asc" }, { kind: "asc" }],
    }),
    // A fact without an embedding is invisible to vector retrieval — count them so
    // it shows. The `embedding` column is an Unsupported type, hence raw SQL.
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM "StoryFact"
      WHERE "seriesId" = ${seriesId} AND embedding IS NULL`,
    prisma.series.findUniqueOrThrow({ where: { id: seriesId }, select: { title: true } }),
  ]);
  return c.json({ facts, missingVector: Number(missing[0]?.n ?? 0), title: meta.title });
});

/** Pin a fact: always loaded into the prompt, whatever its similarity. */
series.put("/:id/facts/:factId/pin", async (c) => {
  const id = c.req.param("factId");
  const f = await prisma.storyFact.findUniqueOrThrow({ where: { id } });
  await prisma.storyFact.update({ where: { id }, data: { pinned: !f.pinned } });
  return c.json({ ok: true });
});

/**
 * Mark an open thread as resolved — after which it stops loading by default.
 * Not deleted: vector search can still find it if a scene needs to call back to
 * it.
 */
series.put("/:id/facts/:factId/resolve", async (c) => {
  const id = c.req.param("factId");
  const body = await c.req.parseBody();
  const f = await prisma.storyFact.findUniqueOrThrow({ where: { id } });
  await prisma.storyFact.update({
    where: { id },
    data: {
      resolved: !f.resolved,
      resolvedInEpisode: f.resolved ? null : Number(body.episodeNumber ?? 0) || null,
    },
  });
  return c.json({ ok: true });
});

series.delete("/:id/facts/:factId", async (c) => {
  await prisma.storyFact.delete({ where: { id: c.req.param("factId") } });
  return c.json({ ok: true });
});
