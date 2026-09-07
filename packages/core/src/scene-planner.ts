import {
  CHAPTERS_PER_EPISODE,
  EPISODE_TARGET_WORDS,
  SCENES_PER_CHAPTER,
  SCENE_MAX_WORDS,
  SCENE_MIN_WORDS,
} from "@audio/config";

export interface ScenePlan {
  order: number;
  beat: string;
  targetWords: number;
}

export interface ChapterPlan {
  order: number;
  title: string | null;
  scenes: ScenePlan[];
}

/** Một chương như dàn ý mô tả: có tên, và các nhịp sẽ thành cảnh. */
export interface ChapterOutline {
  title?: string | null;
  beats: string[];
}

/**
 * Chia một tập thành chương, mỗi chương thành cảnh.
 *
 * Vì sao không sinh cả tập một lần: chất lượng model 14B tụt rõ sau khoảng
 * 1.500 token liên tục, và sinh theo cảnh cho phép render lại từng phần thay
 * vì bỏ cả tập. Xem PLAN.md bước 0b.
 *
 * Số từ mỗi cảnh chia đều theo TỔNG số nhịp của cả tập, không chia theo từng
 * chương: chương ba nhịp và chương một nhịp thì mỗi nhịp vẫn nên dài như nhau,
 * chứ không phải nhịp lẻ loi kia phải gánh cả chương.
 */
export function planChapters(
  chapters: readonly ChapterOutline[],
  targetWords = EPISODE_TARGET_WORDS,
): ChapterPlan[] {
  const usable = chapters.filter((c) => c.beats.length > 0);
  if (usable.length === 0) return [];

  const totalBeats = usable.reduce((n, c) => n + c.beats.length, 0);
  const perScene = Math.round(targetWords / totalBeats);
  const clamped = Math.min(SCENE_MAX_WORDS, Math.max(SCENE_MIN_WORDS, perScene));

  return usable.map((chapter, ci) => ({
    order: ci + 1,
    title: chapter.title?.trim() || null,
    // Cảnh đánh số trong PHẠM VI chương: `(chapterId, order)` là ràng buộc duy
    // nhất, và "cảnh 2 của chương 3" là cách người viết nói.
    scenes: chapter.beats.map((beat, si) => ({
      order: si + 1,
      beat,
      targetWords: clamped,
    })),
  }));
}

/** Số chương nên có cho một độ dài tập. Dùng khi dàn ý chưa chia sẵn. */
export function suggestChapterCount(targetWords = EPISODE_TARGET_WORDS): number {
  const perChapter = SCENES_PER_CHAPTER * ((SCENE_MIN_WORDS + SCENE_MAX_WORDS) / 2);
  return Math.max(1, Math.round(targetWords / perChapter));
}

/** Số cảnh mỗi chương nên có. Hằng số, nhưng để hàm cho khớp cặp với hàm trên. */
export function suggestScenesPerChapter(): number {
  return SCENES_PER_CHAPTER;
}

/** Tổng số cảnh của một tập — dùng để nói với model nó phải chia bao nhiêu nhịp. */
export function suggestSceneCount(targetWords = EPISODE_TARGET_WORDS): number {
  return suggestChapterCount(targetWords) * SCENES_PER_CHAPTER;
}

export { CHAPTERS_PER_EPISODE, SCENES_PER_CHAPTER };
