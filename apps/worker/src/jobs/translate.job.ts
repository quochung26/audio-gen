import { planDraft, withLanguage } from "@audio/core";
import { prisma } from "@audio/database";
import { getLlm, loadPrompt, recordFailure, recordRun, renderTemplate, resolveModel } from "@audio/llm";
import type { JobHandler } from "../lanes/create-lane";
import { logger } from "../lib/logger";
import { syncEpisodeDraft } from "../services/episode-draft";
import { openSceneStream } from "../services/stream";
import { buildSeriesBible } from "../services/story-context";

/**
 * Viết lại bản thảo sang ngôn ngữ đầu ra của bộ.
 *
 * Chỉ chạy khi `Series.draftLanguage` khác `Series.language`. Lý do bước này
 * tồn tại: model viết văn hay nhất không phải lúc nào cũng viết được thứ tiếng
 * đầu ra — một finetune sáng tác dựng trên Mistral Small viết tiếng Anh rất khá
 * và tiếng Việt gần như không dùng được. Viết nháp bằng tiếng nó mạnh rồi viết
 * lại cho kết quả tốt hơn là ép nó viết thẳng.
 *
 * Chạy TRƯỚC chốt duyệt (xem batch-plan.ts): duyệt bản thảo ở thứ tiếng không
 * phát ra loa thì chỗ chốt chặn không còn chặn được gì.
 *
 * Đơn vị là CẢNH chứ không phải cả tập, cùng lý do với bước viết: một tập là
 * vài nghìn từ, viết lại một lượt thì model bỏ đoạn giữa mà không báo.
 */
export const translateJob: JobHandler = async ({ job, setProgress }) => {
  const episodeId = String(job.data.episodeId ?? "");
  if (!episodeId) throw new Error("Thiếu episodeId");

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: { series: true },
  });
  const { series } = episode;
  const plan = planDraft(series.language, series.draftLanguage);

  if (!plan.translate) {
    throw new Error(
      `Bộ "${series.title}" viết thẳng bằng "${plan.output}", không có bước chuyển ngữ. ` +
        "Đặt ngôn ngữ bản thảo ở trang bộ truyện nếu muốn viết nháp bằng tiếng khác.",
    );
  }

  // Chạy lại có `force` thì dịch lại từ bản gốc đã giữ, không chồng lên bản đã
  // dịch — dịch bản dịch là mỗi lượt lại trôi xa bản thảo thêm một quãng.
  const force = job.data.force === true;

  const scenes = await prisma.scene.findMany({
    // `sourceText` null nghĩa là cảnh chưa qua chuyển ngữ. Nhờ vậy chạy lại job
    // trên tập đã dịch xong là không có gì để làm, thay vì dịch lại lần nữa.
    where: { chapter: { episodeId }, text: { not: null }, ...(force ? {} : { sourceText: null }) },
    orderBy: [{ chapter: { order: "asc" } }, { order: "asc" }],
  });

  if (scenes.length === 0) {
    logger.info(`[translate] tập ${episode.number}: không còn cảnh nào cần chuyển ngữ`);
    return { episodeId, scenesTranslated: 0 };
  }

  const bible = await buildSeriesBible(series.id);
  const prompt = await loadPrompt("TRANSLATE", series.genre);
  const llm = getLlm();

  for (const [index, scene] of scenes.entries()) {
    const source = (force ? scene.sourceText : null) ?? scene.text!;
    const ctx = {
      step: "TRANSLATE" as const,
      episodeId,
      sceneId: scene.id,
      promptId: prompt.id,
      params: prompt.params,
    };

    const stream = openSceneStream({ episodeId, sceneId: scene.id, order: scene.order });

    let result;
    try {
      // Model của bước này thường KHÁC model viết: thứ viết tiếng Anh hay nhất
      // là thứ viết tiếng Việt dở nhất. Đặt ở `Prompt.model` của bước TRANSLATE.
      const model = await resolveModel({
        requested: typeof job.data.model === "string" ? job.data.model : null,
        prompt: prompt.model,
        kind: "write",
      });

      result = await llm.generate({
        model,
        system: withLanguage(plan.output),
        prompt: renderTemplate(prompt.content, { bible, text: source }),
        ...(prompt.params as object),
        onToken: (chunk) => stream.push(chunk),
      });
    } catch (err) {
      await stream.finish();
      await recordFailure(ctx, (err as Error).message);
      throw err;
    }

    await stream.finish();

    await recordRun(ctx, result);

    // Ghi bản gốc VÀ bản mới trong một lần: đứt giữa hai lệnh ghi thì cảnh mất
    // bản thảo gốc mà vẫn mang dấu đã dịch, và không cách nào dựng lại.
    await prisma.scene.update({
      where: { id: scene.id },
      data: { text: result.text.trim(), sourceText: source },
    });

    logger.info(
      `[translate] cảnh ${scene.order}: ${plan.draft} → ${plan.output}, ` +
        `${result.tokensPerSec.toFixed(1)} tok/s`,
    );
    await setProgress(Math.round(((index + 1) / scenes.length) * 90));
  }

  const { words } = await syncEpisodeDraft(episodeId);
  await setProgress(100);

  return { episodeId, scenesTranslated: scenes.length, totalWords: words };
};
