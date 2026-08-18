import { SCENE_MAX_WORDS, SCENE_MIN_WORDS, EPISODE_TARGET_WORDS } from "@audio/config";

export interface ScenePlan {
  order: number;
  beat: string;
  targetWords: number;
}

/**
 * Chia một tập thành các cảnh.
 *
 * Vì sao không sinh cả tập một lần: chất lượng model 14B tụt rõ sau khoảng
 * 1.500 token liên tục, và sinh theo cảnh cho phép render lại từng phần thay
 * vì bỏ cả tập. Xem PLAN.md bước 0b.
 */
export function planScenes(beats: string[], targetWords = EPISODE_TARGET_WORDS): ScenePlan[] {
  if (beats.length === 0) return [];

  const perScene = Math.round(targetWords / beats.length);
  const clamped = Math.min(SCENE_MAX_WORDS, Math.max(SCENE_MIN_WORDS, perScene));

  return beats.map((beat, i) => ({ order: i + 1, beat, targetWords: clamped }));
}

/**
 * Số cảnh nên có cho một độ dài tập. Dùng khi dàn ý chưa chia nhịp sẵn.
 */
export function suggestSceneCount(targetWords = EPISODE_TARGET_WORDS): number {
  const mid = (SCENE_MIN_WORDS + SCENE_MAX_WORDS) / 2;
  return Math.max(1, Math.round(targetWords / mid));
}
