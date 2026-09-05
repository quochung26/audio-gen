import { countWords, planDraft, renderContext, withLanguage } from "@audio/core";
import { EpisodeStatus, prisma } from "@audio/database";
import { getLlm, loadPrompt, recordFailure, recordRun, renderTemplate, resolveModel } from "@audio/llm";
import { SCENE_MAX_WORDS } from "@audio/config";
import type { JobHandler } from "../lanes/create-lane";
import { logger } from "../lib/logger";
import { syncEpisodeDraft } from "../services/episode-draft";
import { buildSceneContext } from "../services/story-context";

/**
 * Bước 0b — viết một cảnh.
 *
 * Đơn vị sinh là CẢNH chứ không phải cả tập: chất lượng model 14B tụt rõ sau
 * khoảng 1.500 token liên tục, và viết theo cảnh cho phép sinh lại từng phần
 * thay vì bỏ cả tập. Xem PLAN.md bước 0b.
 *
 * Job nhận `sceneId` để viết một cảnh, hoặc `episodeId` để viết mọi cảnh chưa có.
 */
export const writeSceneJob: JobHandler = async ({ job, setProgress }) => {
  const sceneId = job.data.sceneId ? String(job.data.sceneId) : undefined;
  const episodeId = job.data.episodeId ? String(job.data.episodeId) : undefined;

  const scenes = sceneId
    ? await prisma.scene.findMany({ where: { id: sceneId } })
    : await prisma.scene.findMany({
        where: { episodeId, text: null },
        orderBy: { order: "asc" },
      });

  if (scenes.length === 0) throw new Error("Không tìm thấy cảnh nào cần viết");

  const targetEpisodeId = scenes[0]!.episodeId;
  await prisma.episode.update({
    where: { id: targetEpisodeId },
    data: { status: EpisodeStatus.DRAFTING },
  });

  const llm = getLlm();
  const written: string[] = [];

  for (const [index, scene] of scenes.entries()) {
    const context = await buildSceneContext(scene.id);
    const prompt = await loadPrompt("WRITE_SCENE", context.genre);
    const ctx = {
      step: "WRITE_SCENE" as const,
      episodeId: scene.episodeId,
      sceneId: scene.id,
      promptId: prompt.id,
      params: prompt.params,
    };

    let result;
    try {
      // Ba tầng: model chọn cho lần chạy này → model của prompt → mặc định.
      // Xem packages/llm/src/model-settings.ts.
      const model = await resolveModel({
        requested: typeof job.data.model === "string" ? job.data.model : null,
        prompt: prompt.model,
        kind: "write",
      });

      result = await llm.generate({
        model,
        // Ngôn ngữ BẢN THẢO, không phải ngôn ngữ đầu ra: bộ nào viết nháp bằng
        // tiếng khác thì bước TRANSLATE mới đưa về tiếng đầu ra. Dàn ý vẫn dựng
        // bằng tiếng đầu ra, nên Bible đã sẵn tên riêng đúng tiếng — model viết
        // văn tiếng Anh với tên Việt, thay vì đẻ ra Sarah rồi dịch mãi không hết.
        system: withLanguage(planDraft(context.language, context.draftLanguage).draft, context.bible),
        prompt: renderTemplate(prompt.content, {
          context: renderContext({
            bible: context.bible,
            arcSummary: context.arcSummary,
            arcThroughEpisode: context.arcThroughEpisode,
            episodeIndex: context.episodeIndex,
            previousSummaries: context.previousSummaries,
            facts: context.facts,
            openThreads: context.openThreads,
            previousScene: context.previousScene ?? "",
            beat: scene.beat,
            targetWords: Math.min(SCENE_MAX_WORDS, context.targetWords),
          }),
        }),
        ...(prompt.params as object),
        // Streaming: cảnh 800 từ mất 40–70 giây trên GPU thật; không stream thì
        // vừa dễ timeout HTTP vừa để người dùng nhìn màn hình trắng.
        onToken: () => {},
      });
    } catch (err) {
      await recordFailure(ctx, (err as Error).message);
      throw err;
    }

    await recordRun(ctx, result);

    const text = result.text.trim();
    // `sourceText` về null: cảnh vừa được viết lại nên bản chuyển ngữ cũ (nếu
    // có) không còn ứng với nội dung nào cả, và null cũng là dấu để bước
    // TRANSLATE biết cảnh này phải làm lại.
    await prisma.scene.update({ where: { id: scene.id }, data: { text, sourceText: null } });
    written.push(text);

    logger.info(
      `[write-scene] cảnh ${scene.order} — ${countWords(text)} từ, ` +
        `${result.tokensPerSec.toFixed(1)} tok/s`,
    );
    await setProgress(Math.round(((index + 1) / scenes.length) * 90));
  }

  const { complete, words } = await syncEpisodeDraft(targetEpisodeId);

  await setProgress(100);

  return {
    episodeId: targetEpisodeId,
    scenesWritten: written.length,
    totalWords: words,
    complete,
  };
};
