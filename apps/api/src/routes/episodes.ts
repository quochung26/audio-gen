import { Hono } from "hono";
import { AudioTrackKind, EpisodeStatus, JobStatus, prisma } from "@audio/database";
import {
  assertTransition,
  chapterSetupSchema,
  countWords,
  estimateDurationMs,
  sceneSetupSchema,
  syncState,
  type CharacterOverride,
} from "@audio/core";
import { DEFAULT_BGM_VOLUME } from "@audio/config";
import { cleanupAudio, filesRemovedNote } from "../lib/cleanup";
import { connection, enqueue } from "../lib/queue";
import { field, splitLines, UserError } from "../lib/http";

export const episodes = new Hono();

episodes.get("/:id", async (c) => {
  const ep = await prisma.episode.findUniqueOrThrow({
    where: { id: c.req.param("id") },
    include: {
      // `language`/`draftLanguage`: the episode page needs to know whether the
      // story has a rewrite step, so it shows the right block and does not offer
      // approval on a draft that has not been rewritten yet.
      series: {
        select: {
          id: true,
          title: true,
          genre: true,
          language: true,
          draftLanguage: true,
          // So the episode page can build the "who is in this scene" picker.
          characters: {
            orderBy: [{ isNarrator: "desc" }, { name: "asc" }],
            select: { id: true, name: true, isNarrator: true },
          },
        },
      },
      chapters: {
        orderBy: { order: "asc" },
        include: {
          scenes: {
            orderBy: { order: "asc" },
            // Capped: a revision carries a whole scene, and an episode has a dozen
            // scenes. Uncapped, the page payload grows with every edit ever made.
            include: {
              revisions: { orderBy: { createdAt: "desc" }, take: 5 },
            },
          },
        },
      },
      blocks: { orderBy: { order: "asc" } },
      renderJobs: { orderBy: { queuedAt: "desc" }, take: 1 },
    },
  });
  return c.json(ep);
});

/** Data for the audio page: blocks, exports, the music library. */
episodes.get("/:id/audio", async (c) => {
  const id = c.req.param("id");
  const [episode, bgmTracks, sfxTracks] = await Promise.all([
    prisma.episode.findUniqueOrThrow({
      where: { id },
      include: {
        series: { select: { id: true, title: true } },
        bgmTrack: true,
        blocks: {
          orderBy: { order: "asc" },
          include: {
            audioAsset: { select: { id: true, url: true, durationMs: true, refCount: true } },
            character: { select: { name: true, voice: { select: { name: true } } } },
            sfxTrack: { select: { id: true, title: true, licenseType: true } },
          },
        },
        exports: { where: { type: "AUDIO_MP3" }, orderBy: { part: "asc" } },
        renderJobs: { where: { type: { in: ["TTS", "MIX"] } }, orderBy: { queuedAt: "desc" }, take: 1 },
      },
    }),
    prisma.audioTrack.findMany({ where: { kind: AudioTrackKind.BGM }, orderBy: { title: "asc" } }),
    prisma.audioTrack.findMany({ where: { kind: AudioTrackKind.SFX }, orderBy: { title: "asc" } }),
  ]);

  // Whether live has drifted from local — see packages/core/src/sync-state.ts.
  const newest = <T extends { updatedAt: Date }>(xs: T[]) =>
    xs.length === 0 ? null : new Date(Math.max(...xs.map((x) => x.updatedAt.getTime())));

  return c.json({
    episode,
    bgmTracks,
    sfxTracks,
    sync: syncState({
      status: episode.status,
      syncedAt: episode.syncedAt,
      episodeUpdatedAt: episode.updatedAt,
      blocksUpdatedAt: newest(episode.blocks),
      exportsUpdatedAt: newest(episode.exports),
    }),
  });
});

// ═══════════════════ Writing ═══════════════════

episodes.post("/:id/write-scenes", async (c) => {
  const episodeId = c.req.param("id");
  const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  await enqueue({
    type: "WRITE_SCENE",
    episodeId,
    // Applies to this run only; blank means the worker uses its default.
    payload: { episodeId, model: field(body, "model") || undefined },
  });
  return c.json({ ok: true });
});

/**
 * Write ONE scene — either an empty one, or over the top of an old draft.
 *
 * A 600–900 word scene already takes tens of seconds on a real GPU, so writing a
 * whole episode is one long wait with nothing to look at. Scene by scene lets
 * you read scene 1 and fix its beat before spending time on scene 2.
 *
 * Null out `text` before queueing: `write-scene` selects by `sceneId` so it is
 * not required, but doing it makes the UI show "not written" immediately rather
 * than leaving the old text sitting there until the job finishes.
 */
episodes.post("/:id/scenes/:sceneId/write", async (c) => {
  const episodeId = c.req.param("id");
  const sceneId = c.req.param("sceneId");
  const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);

  // What the writer said is wrong with the attempt on screen. Read BEFORE the text is
  // nulled below, and carried in the payload rather than looked up by the job — by the
  // time the job runs, the draft it is about is gone.
  const note = field(body, "note");
  const rejected = note
    ? ((await prisma.scene.findUnique({ where: { id: sceneId }, select: { text: true } }))?.text ??
      "")
    : "";

  await prisma.scene.update({ where: { id: sceneId }, data: { text: null } });
  await enqueue({
    type: "WRITE_SCENE",
    episodeId,
    payload: {
      sceneId,
      model: field(body, "model") || undefined,
      // Both or neither: a note about a draft nobody can see is advice about nothing.
      ...(note && rejected ? { note, rejected } : {}),
    },
  });
  return c.json({ ok: note ? "Rewriting with your note…" : true });
});

/**
 * Parse character overrides from a multi-line box, one `Name: outfit | note`
 * per line.
 *
 * Lines rather than dozens of separate fields, for the same reason as world
 * rules: the number of characters varies per chapter, and a flat `FormData`
 * would need indexed field names that every reader has to reassemble.
 */
function parseOverrides(value: unknown): CharacterOverride[] {
  return splitLines(value)
    .map((line) => {
      const at = line.indexOf(":");
      if (at < 0) return null;
      const name = line.slice(0, at).trim();
      const rest = line.slice(at + 1);
      const [outfit = "", note = ""] = rest.split("|");
      return name ? { name, outfit: outfit.trim(), note: note.trim() } : null;
    })
    .filter((c): c is CharacterOverride => Boolean(c));
}

/**
 * Setup for one CHAPTER — the middle tier between world setup and a beat.
 *
 * Overrides here beat the Story Bible, and `Scene.setup` beats these.
 */
/**
 * Ask for a different beat for one scene.
 *
 * The one part of outlining that had no button: a story, an episode and a chapter can
 * all be asked for again, a scene's beat could only be retyped.
 *
 * Leaves `text` alone. A scene already written keeps its prose — throwing away 900
 * words to change the sentence they came from is not something a button should do
 * quietly, and "rewrite" is right next to it for when that IS what you want.
 */
episodes.post("/:id/scenes/:sceneId/beat", async (c) => {
  const episodeId = c.req.param("id");
  const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);

  await enqueue({
    type: "SCENE_BEAT",
    episodeId,
    payload: { sceneId: c.req.param("sceneId"), model: field(body, "model") || undefined },
  });
  return c.json({ ok: "Asking for another beat…" });
});

episodes.put("/:id/chapters/:chapterId/setup", async (c) => {
  const body = await c.req.parseBody();
  const setup = chapterSetupSchema.parse({
    focus: field(body, "focus"),
    tone: field(body, "tone"),
    mustHappen: splitLines(body.mustHappen),
    constraints: splitLines(body.constraints),
    characters: parseOverrides(body.characters),
  });

  await prisma.chapter.update({ where: { id: c.req.param("chapterId") }, data: { setup } });
  return c.json({ ok: "Saved. Applies to every scene in this chapter, from the next run." });
});

/**
 * Outline ONE more chapter for this episode.
 *
 * The chapter tier's version of "New episode" on the story page: an episode opens with
 * a single chapter and grows one at a time, each planned knowing how the last actually
 * turned out rather than guessed from the idea.
 *
 * Blocked while the last chapter has unwritten scenes — outlining the next one on top
 * of beats nobody has written yet is exactly the guesswork this replaces. `force=1` for
 * a writer who wants the shape laid out first anyway.
 */
episodes.post("/:id/chapters", async (c) => {
  const episodeId = c.req.param("id");
  const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);

  const last = await prisma.chapter.findFirst({
    where: { episodeId },
    orderBy: { order: "desc" },
    select: { order: true, title: true, scenes: { where: { text: null }, select: { id: true } } },
  });

  if (last && last.scenes.length > 0 && field(body, "force") !== "1") {
    throw new UserError(
      `Chapter ${last.order}${last.title ? ` "${last.title}"` : ""} still has ` +
        `${last.scenes.length} unwritten scene${last.scenes.length === 1 ? "" : "s"}. ` +
        `Write them first, so the next chapter is planned from what the episode actually says.`,
    );
  }

  await enqueue({
    type: "NEXT_CHAPTER",
    episodeId,
    payload: { episodeId, model: field(body, "model") || undefined },
  });
  return c.json({ ok: "Outlining the next chapter…" });
});

/**
 * Outline ONE more scene for a chapter already under way.
 *
 * The scene tier's version of "Outline the next chapter". Three beats planned at once
 * are two guesses at scenes nobody has written; asked for one at a time, each is
 * planned from the previous scene's actual prose.
 *
 * Blocked while the chapter's last scene is unwritten, for exactly that reason — the
 * new beat would be planned against a beat rather than against a scene, which is the
 * thing this replaces. `force=1` for a writer laying out the shape first anyway.
 */
episodes.post("/:id/chapters/:chapterId/scenes", async (c) => {
  const chapterId = c.req.param("chapterId");
  const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);

  const last = await prisma.scene.findFirst({
    where: { chapterId },
    orderBy: { order: "desc" },
    select: { order: true, text: true },
  });

  if (last && !last.text && field(body, "force") !== "1") {
    throw new UserError(
      `Scene ${last.order} has not been written yet. Write it first, so the next scene ` +
        `is planned from what it actually says rather than from what it was meant to say.`,
    );
  }

  await enqueue({
    type: "NEXT_SCENE",
    episodeId: c.req.param("id"),
    payload: { chapterId, model: field(body, "model") || undefined },
  });
  return c.json({ ok: "Outlining the next scene…" });
});

/**
 * Keep what a scene said before an edit — but only once the episode is PUBLISHED.
 *
 * Editing a draft is just writing. Keeping every save of one would bury the versions
 * that matter under dozens that do not, and the draft has no readers to be wrong for.
 * Once an episode is out, the text being overwritten is the version listeners were
 * given, and nothing else records it.
 *
 * A no-op when the text has not actually changed: pressing Save twice is not a version.
 */
async function keepRevision(sceneId: string, next: string): Promise<void> {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    select: { text: true, chapter: { select: { episode: { select: { status: true } } } } },
  });

  const previous = scene?.text;
  if (!previous || previous === next) return;
  if (scene.chapter.episode.status !== EpisodeStatus.PUBLISHED) return;

  await prisma.sceneRevision.create({ data: { sceneId, text: previous } });
}

/**
 * Queue the running-summary rebuild, but only when there is actually a chain to repair.
 *
 * `Scene.storySoFar` is each paragraph plus the next scene folded in, so removing a
 * scene from the MIDDLE leaves every paragraph after it describing something that no
 * longer happened. Nothing fails; later scenes are just written against a story that
 * did not take place, which only ever shows up as prose that does not fit.
 *
 * Removing the LAST scene needs nothing — the paragraph a scene carries is the one it
 * produced, so the chain behind it is untouched. That is the common case, and it is why
 * this is a condition rather than an unconditional enqueue: a story of sixty scenes is
 * sixty model calls, and paying that to repair nothing would be its own bug.
 *
 * Says what it did, in the message the writer sees. A repair that takes minutes and
 * announces itself nowhere is indistinguishable from a stuck queue.
 */
async function repairSummaryFrom({
  episodeId,
  seriesId,
  fromSceneId,
}: {
  episodeId: string;
  seriesId: string;
  fromSceneId: string | null;
}): Promise<string> {
  if (!fromSceneId) return "";

  await enqueue({
    type: "REFOLD_SUMMARY",
    episodeId,
    payload: { seriesId, fromSceneId },
  });
  return " Rebuilding the story summary from the scene after it — later scenes still describe what was just deleted until that finishes.";
}

/**
 * Rebuild the running summary from this scene onward.
 *
 * The manual half of the same repair. Editing a scene's prose by hand breaks the chain
 * exactly the way deleting one does, but a delete is a deliberate structural change
 * while an edit is often a typo — refolding the rest of the story on every save would
 * cost dozens of model calls to fix nothing. So the deletes do it themselves and the
 * edits offer this.
 */
episodes.post("/:id/scenes/:sceneId/refold", async (c) => {
  const sceneId = c.req.param("sceneId");
  const scene = await prisma.scene.findUniqueOrThrow({
    where: { id: sceneId },
    select: { chapter: { select: { episode: { select: { seriesId: true } } } } },
  });

  await enqueue({
    type: "REFOLD_SUMMARY",
    episodeId: c.req.param("id"),
    payload: { seriesId: scene.chapter.episode.seriesId, fromSceneId: sceneId },
  });
  return c.json({ ok: "Rebuilding the story summary from this scene onward…" });
});

/**
 * Scene ids of the WHOLE story in reading order.
 *
 * The series, not the episode: `Scene.storySoFar` is the story's running summary and
 * carries across episode boundaries, so the scene following the last one of episode 4
 * is the first one of episode 5.
 */
async function sceneIdsInReadingOrder(seriesId: string): Promise<string[]> {
  const rows = await prisma.scene.findMany({
    where: { chapter: { episode: { seriesId } } },
    orderBy: [
      { chapter: { episode: { number: "asc" } } },
      { chapter: { order: "asc" } },
      { order: "asc" },
    ],
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Refuse to change an episode's shape while it is in flight or already out.
 *
 * Shared by the chapter and scene deletes. A WRITE_SCENE mid-flight writes into a row
 * that may no longer exist by the time it finishes, and a published episode's text is
 * what listeners were given — the episode delete already refuses for the same reason.
 */
async function assertEditableShape(episodeId: string): Promise<void> {
  const [ep, running] = await Promise.all([
    prisma.episode.findUniqueOrThrow({
      where: { id: episodeId },
      select: { number: true, publishedAt: true },
    }),
    prisma.renderJob.count({
      where: { episodeId, status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] } },
    }),
  ]);

  if (running > 0) {
    throw new UserError(
      `${running} job${running === 1 ? " is" : "s are"} running or queued for this episode. ` +
        `Wait for them to finish, then delete.`,
    );
  }
  if (ep.publishedAt) {
    throw new UserError(
      `Episode ${ep.number} is published. Unpublish it first — the text being removed is ` +
        `what listeners were given.`,
    );
  }
}

/**
 * Delete a chapter, with its scenes and their revisions.
 *
 * Needed the moment chapters started arriving one at a time: "Outline the next chapter"
 * hands back something to accept or reject, and until now there was no reject. The only
 * way out was deleting the whole episode.
 *
 * Later chapters ARE renumbered, unlike episodes. A chapter's order is internal — it
 * orders the draft and nothing else stores it, while an episode's number is in the slug,
 * in StoryFact and in the feed. Ascending so each update lands on a number the one
 * before it has already vacated; descending would collide on `(episodeId, order)`.
 */
episodes.delete("/:id/chapters/:chapterId", async (c) => {
  const episodeId = c.req.param("id");
  const chapterId = c.req.param("chapterId");
  await assertEditableShape(episodeId);

  const chapter = await prisma.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    select: {
      order: true,
      title: true,
      _count: { select: { scenes: true } },
      episode: { select: { seriesId: true } },
      scenes: { orderBy: { order: "desc" }, take: 1, select: { id: true } },
    },
  });
  const { seriesId } = chapter.episode;

  // What follows the chapter's LAST scene: where the running summary picks up once
  // everything in this chapter is gone.
  const order = await sceneIdsInReadingOrder(seriesId);
  const lastOfChapter = chapter.scenes[0]?.id;
  const nextSceneId = lastOfChapter ? (order[order.indexOf(lastOfChapter) + 1] ?? null) : null;

  const later = await prisma.chapter.findMany({
    where: { episodeId, order: { gt: chapter.order } },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });

  await prisma.$transaction([
    prisma.chapter.delete({ where: { id: chapterId } }),
    ...later.map((ch) =>
      prisma.chapter.update({ where: { id: ch.id }, data: { order: ch.order - 1 } }),
    ),
  ]);

  const repairing = await repairSummaryFrom({ episodeId, seriesId, fromSceneId: nextSceneId });

  return c.json({
    ok:
      `Deleted chapter ${chapter.order}${chapter.title ? ` "${chapter.title}"` : ""} ` +
      `and its ${chapter._count.scenes} scene${chapter._count.scenes === 1 ? "" : "s"}.` +
      repairing,
  });
});

/**
 * Delete ONE scene, with its revisions.
 *
 * The reject half of "Outline the next scene". "Another beat" replaces a beat in place,
 * which is the right tool when the scene should exist and say something else; this is
 * for when it should not exist at all.
 *
 * Scenes are renumbered within the chapter, for the same reason chapters are.
 *
 * Does NOT re-fold `storySoFar`. Deleting the LAST scene of a chapter — what this is
 * almost always for — leaves the chain correct, because the running summary a scene
 * carries is the one it produced. Delete one from the MIDDLE and every later scene's
 * summary still contains it, until those scenes are written again.
 */
episodes.delete("/:id/scenes/:sceneId", async (c) => {
  const episodeId = c.req.param("id");
  const sceneId = c.req.param("sceneId");
  await assertEditableShape(episodeId);

  const scene = await prisma.scene.findUniqueOrThrow({
    where: { id: sceneId },
    select: {
      order: true,
      chapterId: true,
      chapter: { select: { order: true, episode: { select: { seriesId: true } } } },
    },
  });
  const { seriesId } = scene.chapter.episode;

  // The scene that follows this one in the STORY, captured before the delete — it is
  // where the running summary has to be rebuilt from. Null means this was the last
  // scene there is, and the chain is already correct.
  const order = await sceneIdsInReadingOrder(seriesId);
  const nextSceneId = order[order.indexOf(sceneId) + 1] ?? null;

  const later = await prisma.scene.findMany({
    where: { chapterId: scene.chapterId, order: { gt: scene.order } },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });

  await prisma.$transaction([
    prisma.scene.delete({ where: { id: sceneId } }),
    ...later.map((sc) =>
      prisma.scene.update({ where: { id: sc.id }, data: { order: sc.order - 1 } }),
    ),
  ]);

  const repairing = await repairSummaryFrom({ episodeId, seriesId, fromSceneId: nextSceneId });

  return c.json({
    ok: `Deleted scene ${scene.chapter.order}.${scene.order}.` + repairing,
  });
});

/** Rename a chapter. */
episodes.put("/:id/chapters/:chapterId", async (c) => {
  const body = await c.req.parseBody();
  await prisma.chapter.update({
    where: { id: c.req.param("chapterId") },
    data: { title: field(body, "title") || null },
  });
  return c.json({ ok: "Chapter title saved." });
});

/**
 * Edit the episode's summary by hand.
 *
 * It was written by SUMMARIZE and shown read-only, which left "summarise again" as the
 * only way to change it — a re-roll, when what is usually wanted is fixing the one
 * sentence that got it wrong.
 *
 * Worth editing because it is read in two places that do not forgive it. The NEXT
 * episode's scenes get it verbatim as "the summary of the previous episode", so a fold
 * that dropped a death has every later scene writing around someone who is dead. And it
 * is the `<description>` of the episode's item in the RSS feed, where listeners read it.
 *
 * Blank clears it rather than storing "": `buildSceneContext` only loads a summary that
 * is `not: null`, so an empty one would otherwise send the next episode a heading with
 * nothing under it.
 */
episodes.put("/:id/summary", async (c) => {
  const body = await c.req.parseBody();
  const summary = field(body, "summary").trim();

  await prisma.episode.update({
    where: { id: c.req.param("id") },
    data: { summary: summary || null },
  });
  return c.json({
    ok: summary
      ? "Summary saved. The next episode's scenes read this one."
      : "Summary cleared. The next episode will be written without it.",
  });
});

episodes.put("/:id/scenes/:sceneId", async (c) => {
  const episodeId = c.req.param("id");
  const body = await c.req.parseBody();

  // Each field is written only when the form actually SENT it. The episode page
  // has two separate forms for a scene — one edits the draft, one edits the
  // instructions — and writing both blindly means saving instructions wipes the
  // draft.
  const data: Record<string, unknown> = {};
  if ("text" in body) {
    data.text = String(body.text ?? "");
    await keepRevision(c.req.param("sceneId"), data.text as string);
  }
  if ("beat" in body) data.beat = field(body, "beat");
  // The running summary this scene left behind. Editable because it is the single
  // thing every LATER scene reads about the story, and a model that folded it wrong
  // — dropped a death, invented a reconciliation — poisons every scene after this
  // one until somebody corrects it. Blank clears it: the block then disappears from
  // the next scene's prompt rather than carrying something known to be wrong.
  if ("storySoFar" in body) data.storySoFar = field(body, "storySoFar") || null;
  // Empty is valid and means something: "not known yet" → the Bible loads in full.
  if ("characterIds" in body) {
    data.characterIds = field(body, "characterIds").split(",").map((v) => v.trim()).filter(Boolean);
  }
  if ("note" in body || "characters" in body) {
    data.setup = sceneSetupSchema.parse({
      note: field(body, "note"),
      characters: parseOverrides(body.characters),
    });
  }

  await prisma.scene.update({ where: { id: c.req.param("sceneId") }, data });

  // Editing only the instructions leaves the draft alone — no need to reassemble.
  if (!("text" in body)) return c.json({ ok: "Instructions saved for this scene." });

  // The draft is the scenes joined in READING order: chapter first, then scene
  // within it. Update now so the next step does not have to reassemble.
  //
  // The word count and the duration go with it. This used to set only `draftText` and
  // `status`, which is the exact failure the comment on `syncEpisodeDraft` in the
  // worker warns about: the episode carries the previous draft's length and estimated
  // runtime while its text is new, and nothing says so. That helper is the other copy
  // of this; the two live in different apps and have to be changed together.
  const scenes = await prisma.scene.findMany({
    where: { chapter: { episodeId } },
    orderBy: [{ chapter: { order: "asc" } }, { order: "asc" }],
    select: { text: true },
  });
  const draftText = scenes.map((s) => s.text ?? "").join("\n\n");
  const words = countWords(draftText);

  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      draftText,
      wordCount: words,
      durationMs: estimateDurationMs(words),
      status: scenes.every((s) => s.text) ? EpisodeStatus.DRAFTED : EpisodeStatus.DRAFTING,
    },
  });
  return c.json({ ok: `Saved. The episode is ${words} words now.` });
});

/**
 * The text being generated, read live while the model writes.
 *
 * The worker writes the partial draft into Redis (`services/stream.ts`); this
 * only reads it back. Returns `null` when nothing is running — Studio takes that
 * as "stop asking".
 *
 * Redis trouble also returns `null` rather than throwing: losing the live view is
 * minor, breaking the episode page is not.
 */
episodes.get("/:id/stream", async (c) => {
  try {
    const raw = await connection().get(`stream:episode:${c.req.param("id")}`);
    return c.json(raw ? (JSON.parse(raw) as unknown) : null);
  } catch {
    return c.json(null);
  }
});

/**
 * Delete an episode.
 *
 * Blocks the same two situations as deleting a whole story: jobs still queued,
 * and the episode being published. See `DELETE /api/series/:id`.
 *
 * Also deletes the episode's FACTS. The relation declares `onDelete: SetNull` so
 * by default they survive — and they are exactly what has to go: facts are
 * retrieved by vector into every later scene, so dropping a bad episode while
 * keeping its facts leaves episode 8 still steered by a plot point from an
 * episode that no longer exists.
 *
 * Does NOT renumber later episodes. The number appears in the slug, in
 * `StoryFact`, in the index and in the arc summary; renumbering breaks all of
 * them. Deleting a middle episode leaves a gap, and `NEXT_EPISODE` takes the
 * highest + 1, so it still works.
 */
episodes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const ep = await prisma.episode.findUniqueOrThrow({
    where: { id },
    select: { id: true, number: true, title: true, seriesId: true, publishedAt: true },
  });

  const running = await prisma.renderJob.count({
    where: { episodeId: id, status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] } },
  });
  if (running > 0) {
    throw new UserError(`${running} jobs are running or queued for this episode. Wait for them, then delete.`);
  }

  if (ep.publishedAt) {
    throw new UserError(
      "This episode is published. Unpublish it first — deleting it here leaves the hosted copy with no way to take it down.",
    );
  }

  const [blocks, exports] = await Promise.all([
    prisma.block.findMany({
      where: { episodeId: id, audioAssetId: { not: null } },
      select: { audioAssetId: true },
    }),
    prisma.export.findMany({ where: { episodeId: id }, select: { url: true } }),
  ]);

  // Before deleting the episode: `SetNull` would leave orphaned facts that still
  // carry an `episodeNumber`, and they would keep being retrieved as normal.
  const facts = await prisma.storyFact.deleteMany({ where: { episodeId: id } });

  await prisma.episode.delete({ where: { id } });

  const files = await cleanupAudio({
    assetIds: [...new Set(blocks.map((b) => b.audioAssetId!))],
    urls: exports.map((e) => e.url),
  });

  return c.json({
    ok:
      `Deleted episode ${ep.number}${filesRemovedNote(files)}` +
      (facts.count > 0 ? `, along with ${facts.count} of its facts` : "") +
      ".",
    // What canNOT be undone. Say it rather than let the writer assume it is
    // clean: later episodes are still written from these.
    warnings: [
      "Character states and the arc summary still carry what this episode left behind — edit them by hand on the Characters and Story Bible pages if needed.",
      `Episodes are not renumbered: later ones keep their numbers, so the sequence will skip ${ep.number}.`,
    ],
  });
});

/** Approve the draft — the gate stopping a raw draft going further. */
episodes.post("/:id/approve", async (c) => {
  const episodeId = c.req.param("id");
  const ep = await prisma.episode.update({
    where: { id: episodeId },
    data: { humanReviewed: true, reviewedAt: new Date(), reviewedBy: "studio" },
  });

  // Unblocks a batch run waiting on this exact episode. Studio does NOT decide
  // the next step — it only queues a BATCH job; the worker owns the chain.
  const run = await prisma.batchRun.findFirst({
    where: { seriesId: ep.seriesId, status: { in: ["RUNNING", "WAITING_REVIEW"] } },
    orderBy: { startedAt: "desc" },
  });
  if (run) await enqueue({ type: "BATCH", payload: { runId: run.id } });

  return c.json({ ok: true });
});

episodes.post("/:id/unapprove", async (c) => {
  await prisma.episode.update({
    where: { id: c.req.param("id") },
    data: { humanReviewed: false, reviewedAt: null, reviewedBy: null },
  });
  return c.json({ ok: true });
});

episodes.post("/:id/audio-script", async (c) => {
  const episodeId = c.req.param("id");
  const ep = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
  try {
    assertTransition(ep.status as "DRAFTED", "SCRIPTED", { humanReviewed: ep.humanReviewed });
  } catch (err) {
    throw new UserError((err as Error).message);
  }
  await enqueue({ type: "AUDIO_EDIT", episodeId, payload: { episodeId } });
  return c.json({ ok: true });
});

/**
 * Rewrite the draft into the output language.
 *
 * `force=1` rewrites from the original kept in `Scene.sourceText` — use it after
 * editing the rewrite prompt. Without it the job only touches scenes not yet
 * rewritten.
 */
episodes.post("/:id/translate", async (c) => {
  const episodeId = c.req.param("id");
  const force = c.req.query("force") === "1";
  await enqueue({ type: "TRANSLATE", episodeId, payload: { episodeId, force } });
  return c.json({ ok: true });
});

episodes.post("/:id/summarize", async (c) => {
  const episodeId = c.req.param("id");
  await enqueue({ type: "SUMMARIZE", episodeId, payload: { episodeId } });
  return c.json({ ok: true });
});

// ═══════════════════ Audio ═══════════════════

episodes.post("/:id/render", async (c) => {
  const episodeId = c.req.param("id");
  const force = c.req.query("force") === "1";
  await enqueue({ type: "TTS", episodeId, payload: { episodeId, force } });
  return c.json({ ok: true });
});

episodes.post("/:id/blocks/:blockId/rerender", async (c) => {
  const episodeId = c.req.param("id");
  const blockId = c.req.param("blockId");
  await prisma.block.update({ where: { id: blockId }, data: { audioAssetId: null } });
  await enqueue({ type: "TTS", episodeId, payload: { episodeId, blockId } });
  return c.json({ ok: true });
});

episodes.put("/:id/blocks/:blockId/approve", async (c) => {
  const blockId = c.req.param("blockId");
  const b = await prisma.block.findUniqueOrThrow({ where: { id: blockId } });
  await prisma.block.update({ where: { id: blockId }, data: { approved: !b.approved } });
  return c.json({ ok: true });
});

/**
 * Assign a sound effect to a block.
 *
 * The effect plays at the START of the block when mixing. Saving the choice does
 * NOT rebuild the episode — the user clicks "Re-export MP3" when happy.
 */
episodes.put("/:id/blocks/:blockId/sfx", async (c) => {
  const body = await c.req.parseBody();
  const trackId = field(body, "sfxTrackId");

  if (trackId) {
    const track = await prisma.audioTrack.findUniqueOrThrow({ where: { id: trackId } });
    if (track.kind !== AudioTrackKind.SFX) throw new UserError("The selected track is not an effect");
  }

  await prisma.block.update({
    where: { id: c.req.param("blockId") },
    data: { sfxTrackId: trackId || null },
  });
  return c.json({ ok: trackId ? "Effect assigned. Click “Re-export MP3” to hear it." : "Effect removed." });
});

episodes.post("/:id/export", async (c) => {
  const episodeId = c.req.param("id");
  await enqueue({ type: "MIX", episodeId, payload: { episodeId } });
  return c.json({ ok: true });
});

/** Background music for the episode. Saving does NOT rebuild — the user re-exports. */
episodes.put("/:id/bgm", async (c) => {
  const episodeId = c.req.param("id");
  const body = await c.req.parseBody();
  const trackId = field(body, "bgmTrackId");
  const raw = Number(body.bgmVolume);
  const volume = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : DEFAULT_BGM_VOLUME;

  if (trackId) {
    const track = await prisma.audioTrack.findUniqueOrThrow({ where: { id: trackId } });
    if (track.kind !== AudioTrackKind.BGM) throw new UserError("The selected track is not background music");
  }

  await prisma.episode.update({
    where: { id: episodeId },
    data: { bgmTrackId: trackId || null, bgmVolume: volume },
  });
  return c.json({ ok: trackId ? "Saved. Click “Re-export MP3” to hear the difference." : "Music removed." });
});

/**
 * Publish — the episode appears on the player.
 *
 * `assertTransition` blocks three things: an invalid transition, an unapproved
 * draft, and assets with unverified licences.
 */
episodes.post("/:id/publish", async (c) => {
  const episodeId = c.req.param("id");
  const ep = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: {
      bgmTrack: { select: { licenseType: true } },
      blocks: { select: { sfxTrack: { select: { licenseType: true } } } },
      exports: { where: { type: "AUDIO_MP3" }, select: { id: true } },
    },
  });

  if (ep.exports.length === 0) {
    throw new UserError("This episode has no MP3 yet. Mix and export before publishing.");
  }

  const licenses = [ep.bgmTrack?.licenseType, ...ep.blocks.map((b) => b.sfxTrack?.licenseType)].filter(
    (l): l is NonNullable<typeof l> => Boolean(l),
  );

  try {
    assertTransition(ep.status as "READY", "PUBLISHED", {
      humanReviewed: ep.humanReviewed,
      assetLicenses: licenses,
    });
  } catch (err) {
    throw new UserError((err as Error).message);
  }

  await prisma.$transaction([
    prisma.episode.update({
      where: { id: episodeId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    }),
    prisma.series.update({ where: { id: ep.seriesId }, data: { status: "ONGOING" } }),
  ]);

  // Push to the hosted DB the Player reads. As a job rather than inline: the
  // hosted DB may be unreachable, and a network error must not break marking the
  // episode published locally.
  await enqueue({ type: "PUBLISH", episodeId, payload: { episodeId } });
  return c.json({ ok: "Published. Syncing to the player." });
});

/**
 * Push to the hosted DB again without changing status.
 *
 * Needed because the PUBLISH job has only ever run on publish and unpublish —
 * editing a title or rebuilding a script after publishing left live on the old
 * version with nothing to say so.
 */
episodes.post("/:id/resync", async (c) => {
  const episodeId = c.req.param("id");
  const ep = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    select: { status: true },
  });
  if (ep.status !== "PUBLISHED") {
    throw new UserError("An unpublished episode has nothing to sync.");
  }
  await enqueue({ type: "PUBLISH", episodeId, payload: { episodeId } });
  return c.json({ ok: "Re-syncing to the player." });
});

episodes.post("/:id/unpublish", async (c) => {
  const episodeId = c.req.param("id");
  await prisma.episode.update({
    where: { id: episodeId },
    data: { status: "READY", publishedAt: null },
  });
  // Remove from the hosted DB too — left there, the episode stays listenable
  // publicly while Studio treats it as unpublished.
  await enqueue({ type: "PUBLISH", episodeId, payload: { episodeId, remove: true } });
  return c.json({ ok: true });
});
