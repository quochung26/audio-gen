import { countWords, estimateDurationMs } from "@audio/core";
import { EpisodeStatus, prisma } from "@audio/database";

export interface DraftSync {
  /** Mọi cảnh đã có nội dung. */
  complete: boolean;
  words: number;
}

/**
 * Ghép các cảnh thành bản thảo tập, rồi cập nhật số từ và thời lượng ước tính.
 *
 * HAI bước ghi `Scene.text` — viết cảnh và chuyển ngữ — và cả hai đều phải dựng
 * lại `Episode.draftText`. Để mỗi bước tự ghép thì bước sau quên cập nhật số từ
 * là tập mang thời lượng của bản thảo cũ, mà chẳng có gì báo: `draftText` vẫn
 * có nội dung, chỉ là nội dung của bản trước.
 */
export async function syncEpisodeDraft(episodeId: string): Promise<DraftSync> {
  const scenes = await prisma.scene.findMany({
    where: { episodeId },
    orderBy: { order: "asc" },
    select: { text: true },
  });

  const complete = scenes.every((s) => s.text);
  const draftText = scenes.map((s) => s.text ?? "").join("\n\n");
  const words = countWords(draftText);

  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      draftText,
      wordCount: words,
      durationMs: estimateDurationMs(words),
      // Chỉ chuyển sang DRAFTED khi mọi cảnh đã có nội dung — còn thiếu thì
      // vẫn là DRAFTING để Studio biết công việc chưa xong.
      status: complete ? EpisodeStatus.DRAFTED : EpisodeStatus.DRAFTING,
    },
  });

  return { complete, words };
}
