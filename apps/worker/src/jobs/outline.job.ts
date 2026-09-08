import {
  buildBible,
  parseTags,
  toLanguage,
  withLanguage,
  outlineSchema,
  planChapters,
  mergeCast,
  namesMentionedIn,
  normalizeCast,
  parseWorld,
  planDraft,
  renderCastForOutline,
  type CastMember,
  renderWorldForOutline,
  slugify,
  suggestChapterCount,
  suggestScenesPerChapter,
} from "@audio/core";
import { EpisodeStatus, SeriesKind, SeriesStatus, prisma } from "@audio/database";
import {
  getDefaultLanguage,
  getLlm,
  loadPrompt,
  recordFailure,
  recordRun,
  renderTemplate,
  resolveModel,
} from "@audio/llm";
import { EPISODE_TARGET_WORDS, SCENE_MAX_WORDS, SCENE_MIN_WORDS } from "@audio/config";
import { freeSlug } from "../services/slug";
import { streamProgress } from "../lib/progress";
import type { JobHandler } from "../lanes/create-lane";
import { logger } from "../lib/logger";

/**
 * Step 0a — turn one line of idea into an outline, then create the Series, Characters,
 * Episode and Scenes (with a `beat` and no content yet).
 *
 * JSON is forced by schema at the API layer rather than asked for in words: 14B models
 * return malformed JSON fairly often when only told in the prompt.
 */
export const outlineJob: JobHandler = async ({ job, setProgress }) => {
  const idea = String(job.data.idea ?? "");
  const genre = String(job.data.genre ?? "kinh dị");
  const episodeCount = Number(job.data.episodeCount ?? 1);
  // World setup the writer laid down FIRST — given one, the AI has to follow it rather
  // than inventing a setting of its own.
  const world = parseWorld(job.data.world);
  // Sub-genre tags the writer chose at creation — into the Bible, steering the story.
  const tags = parseTags(String(job.data.tags ?? ""));

  // The cast picked up front from cards, or typed just for this story. Empty means the AI
  // invents the characters as before.
  const cast = normalizeCast(Array.isArray(job.data.cast) ? (job.data.cast as CastMember[]) : []);

  if (!idea.trim()) throw new Error("An idea is required (payload.idea)");

  // The language chosen at creation; unset falls back to the Models page default.
  const language = toLanguage(job.data.language, await getDefaultLanguage());

  // The draft language: left blank when unset, or set to the output language itself —
  // building a rewrite step just to translate a language into itself is one more model
  // call that damages the prose for nothing.
  const draft = planDraft(language, job.data.draftLanguage);

  // The genre name for the model. `Series.genre` keeps the Vietnamese label because
  // listeners see it on the home page and in the RSS keywords; only the version that goes
  // into the prompt changes. See Genre.promptName.
  const known = await prisma.genre.findMany({
    where: { name: { in: [genre, ...tags] } },
    select: { name: true, promptName: true },
  });
  const forModel = new Map(
    known.filter((g) => g.promptName.trim()).map((g) => [g.name.toLowerCase(), g.promptName.trim()]),
  );
  const modelName = (label: string) => forModel.get(label.trim().toLowerCase()) ?? label;

  const chapterCount = suggestChapterCount(EPISODE_TARGET_WORDS);
  const scenesPerChapter = suggestScenesPerChapter();
  const prompt = await loadPrompt("OUTLINE", genre);
  const params = prompt.params;

  await setProgress(10);

  const llm = getLlm();
  const ctx = { step: "OUTLINE" as const, promptId: prompt.id, params };

  let result;
  try {
    // Three tiers: the model chosen for this run → the prompt's model → the default.
    // Xem packages/llm/src/model-settings.ts.
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "write",
    });

    result = await llm.generateJson({
      model,
      system: withLanguage(language),
      schema: outlineSchema,
      // The model call is the whole wait. Without this the bar sits at 10 until the
      // outline lands, which is indistinguishable from a dead worker.
      onToken: streamProgress({
        setProgress,
        from: 10,
        to: 55,
        maxTokens: Number(params.maxTokens) || undefined,
      }),
      prompt: renderTemplate(prompt.content, {
        idea,
        genre: modelName(genre),
        episodeCount,
        chapterCount,
        scenesPerChapter,
        sceneWords: Math.round((SCENE_MIN_WORDS + SCENE_MAX_WORDS) / 2),
        tags: tags.length > 0 ? tags.map(modelName).join(", ") : "(none)",
        world: renderWorldForOutline(world),
        cast: renderCastForOutline(cast),
      }),
      ...(params as object),
    });
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  await recordRun(ctx, result);
  await setProgress(60);

  const outline = result.data;
  logger.info(`[outline] "${outline.title}" — ${outline.episodes.length} episodes`);

  // A short story also belongs to a Series (see docs/database.md section 2.1)
  const kind = outline.episodes.length > 1 ? SeriesKind.LONG : SeriesKind.SHORT;

  // The cast, settled ONCE: the rows below and the Story Bible have to describe the
  // same people. Built separately, a character dropped from the rows survives in the
  // Bible and every scene write still knows them.
  const people = mergeCast(cast, outline.characters);

  const series = await prisma.series.create({
    data: {
      kind,
      title: outline.title,
      slug: await freeSlug(outline.title),
      description: outline.logline,
      // The genre the WRITER chose, NOT the one the model returned. This column is
      // the lookup key into `Genre.name` — it feeds the genre descriptions loaded
      // into every later Bible, the home page label and the RSS keywords. A model
      // answering "horror" for a story created under "kinh dị" matched nothing, and
      // the story then wrote on with no genre description at all.
      genre,
      tags,
      language,
      draftLanguage: draft.translate ? draft.draft : "",
      status: SeriesStatus.DRAFT,
      storyBible: {
        raw: outline,
        // With no setting from the writer, the AI's becomes the starting point, so the
        // Story Bible page has something to edit.
        world: { ...world, setting: world.setting.trim() || outline.setting },
        bible: buildBible(outline, { genre, world, tags, cast: people }),
      },
      characters: {
        // The writer's cast beats the model's, and with a cast chosen the model's
        // extras are dropped. `mergeCast` also de-duplicates names: the
        // (seriesId, name) constraint is unique, and models occasionally return two
        // characters with one name.
        create: people.map((c) => ({
          name: c.name,
          role: c.role,
          description: c.description,
          speech: c.speech,
          outfit: c.outfit,
          appearance: c.appearance,
          voiceHint: c.voiceHint,
          isNarrator: c.isNarrator ?? false,
          // Provenance, not a live link: editing the character here does not touch the card.
          cardId: c.cardId ?? null,
        })),
      },
    },
  });

  await setProgress(80);

  // Guess who is present in each scene, so the Bible only describes those in full.
  // Guessing short leaves the scene with an empty list and the Bible loads in full as
  // before — the writer fixes it on the episode page.
  const roster = await prisma.character.findMany({
    where: { seriesId: series.id },
    select: { id: true, name: true },
  });
  const idOfName = new Map(roster.map((c) => [c.name, c.id]));
  const names = roster.map((c) => c.name);

  for (const plan of outline.episodes) {
    await prisma.episode.create({
      data: {
        seriesId: series.id,
        number: plan.number,
        title: plan.title,
        slug: await freeSlug(`${outline.title} tap ${plan.number}`),
        status: EpisodeStatus.OUTLINED,
        outline: plan,
        chapters: {
          create: planChapters(plan.chapters).map((ch) => ({
            order: ch.order,
            title: ch.title,
            scenes: {
              create: ch.scenes.map((sc) => ({
                order: sc.order,
                beat: sc.beat,
                characterIds: namesMentionedIn(sc.beat, names)
                  .map((n) => idOfName.get(n))
                  .filter((id): id is string => Boolean(id)),
              })),
            },
          })),
        },
      },
    });
  }

  await setProgress(100);

  return {
    seriesId: series.id,
    title: outline.title,
    episodes: outline.episodes.length,
    characters: people.length,
    tokensPerSec: Number(result.tokensPerSec.toFixed(1)),
  };
};
