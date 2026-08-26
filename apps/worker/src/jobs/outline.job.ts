import {
  buildBible,
  toLanguage,
  withLanguage,
  outlineSchema,
  planScenes,
  parseWorld,
  renderWorldForOutline,
  slugify,
  suggestSceneCount,
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
import type { JobHandler } from "../lanes/create-lane";
import { logger } from "../lib/logger";

/**
 * Bước 0a — từ một dòng ý tưởng dựng dàn ý, rồi tạo sẵn Series, Character,
 * Episode và Scene (mới có `beat`, chưa có nội dung).
 *
 * Ép JSON theo schema ở tầng API chứ không nhắc bằng lời: model 14B trả JSON
 * hỏng khá thường xuyên nếu chỉ được dặn trong prompt.
 */
export const outlineJob: JobHandler = async ({ job, setProgress }) => {
  const idea = String(job.data.idea ?? "");
  const genre = String(job.data.genre ?? "kinh dị");
  const episodeCount = Number(job.data.episodeCount ?? 1);
  // Thiết lập thế giới do người viết đặt TRƯỚC — nếu có, AI phải bám theo
  // thay vì tự nghĩ ra bối cảnh riêng.
  const world = parseWorld(job.data.world);

  if (!idea.trim()) throw new Error("Thiếu ý tưởng (payload.idea)");

  // Ngôn ngữ chọn lúc tạo bộ; không chọn thì lấy mặc định ở trang Model.
  const language = toLanguage(job.data.language, await getDefaultLanguage());

  const sceneCount = suggestSceneCount(EPISODE_TARGET_WORDS);
  const prompt = await loadPrompt("OUTLINE", genre);
  const params = prompt.params;

  await setProgress(10);

  const llm = getLlm();
  const ctx = { step: "OUTLINE" as const, promptId: prompt.id, params };

  let result;
  try {
    // Ba tầng: model chọn cho lần chạy này → model của prompt → mặc định.
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
      prompt: renderTemplate(prompt.content, {
        idea,
        genre,
        episodeCount,
        sceneCount,
        sceneWords: Math.round((SCENE_MIN_WORDS + SCENE_MAX_WORDS) / 2),
        world: renderWorldForOutline(world),
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
  logger.info(`[outline] "${outline.title}" — ${outline.episodes.length} tập`);

  // Truyện ngắn cũng thuộc một Series (xem docs/database.md mục 2.1)
  const kind = outline.episodes.length > 1 ? SeriesKind.LONG : SeriesKind.SHORT;

  const series = await prisma.series.create({
    data: {
      kind,
      title: outline.title,
      slug: await freeSlug(outline.title),
      description: outline.logline,
      genre: outline.genre,
      language,
      status: SeriesStatus.DRAFT,
      storyBible: {
        raw: outline,
        // Người viết chưa đặt bối cảnh thì lấy phần AI sinh làm điểm khởi đầu,
        // để trang Story Bible có sẵn nội dung mà sửa.
        world: { ...world, setting: world.setting.trim() || outline.setting },
        bible: buildBible(outline, world),
      },
      characters: {
        // Khử trùng tên: ràng buộc (seriesId, name) là duy nhất, và model —
        // cả thật lẫn giả lập — thỉnh thoảng trả về hai nhân vật cùng tên.
        create: dedupeByName(outline.characters).map((c) => ({
          name: c.name,
          role: c.role,
          voiceHint: c.voiceHint,
          isNarrator: c.isNarrator,
        })),
      },
    },
  });

  await setProgress(80);

  for (const plan of outline.episodes) {
    const scenes = planScenes(plan.beats);
    await prisma.episode.create({
      data: {
        seriesId: series.id,
        number: plan.number,
        title: plan.title,
        slug: await freeSlug(`${outline.title} tap ${plan.number}`),
        status: EpisodeStatus.OUTLINED,
        outline: plan,
        scenes: {
          create: scenes.map((s) => ({ order: s.order, beat: s.beat })),
        },
      },
    });
  }

  await setProgress(100);

  return {
    seriesId: series.id,
    title: outline.title,
    episodes: outline.episodes.length,
    characters: outline.characters.length,
    tokensPerSec: Number(result.tokensPerSec.toFixed(1)),
  };
};

/**
 * Giữ lại bản ghi đầu tiên cho mỗi tên, và đảm bảo đúng một người dẫn truyện.
 */
function dedupeByName<T extends { name: string; isNarrator: boolean }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  // Không có người dẫn truyện thì lấy người đầu tiên; có nhiều thì giữ người đầu.
  let narratorSeen = false;
  for (const item of out) {
    if (item.isNarrator && !narratorSeen) narratorSeen = true;
    else if (item.isNarrator) item.isNarrator = false;
  }
  if (!narratorSeen && out[0]) out[0].isNarrator = true;
  return out;
}

