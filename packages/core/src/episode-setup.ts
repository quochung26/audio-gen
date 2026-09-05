import { z } from "zod";

/**
 * Ghi đè một nhân vật cho phạm vi hẹp hơn Story Bible.
 *
 * Bible tả người đó NÓI CHUNG — thứ đúng suốt cả bộ. Nhưng có những thứ chỉ
 * đúng ở một chương: hôm nay mặc gì, đang băng tay, đang giả danh người khác.
 * Nhét chúng vào Bible là ghim cứng cho cả 40 tập; bỏ hẳn thì model tự bịa mỗi
 * cảnh một kiểu.
 */
export const characterOverrideSchema = z.object({
  /** Khớp với `Character.name`. So không phân biệt hoa thường. */
  name: z.string(),
  /** Mặc gì. Đây là thứ đổi thường xuyên nhất, nên có ô riêng. */
  outfit: z.string().default(""),
  /** Mọi thứ khác: đang bị thương, đang giả danh, vừa cãi nhau xong. */
  note: z.string().default(""),
});

export type CharacterOverride = z.infer<typeof characterOverrideSchema>;

/**
 * Thiết lập riêng của MỘT chương — tầng giữa giữa `WorldSetup` và `Scene.beat`.
 *
 * Trước khi có nó, tầng này hổng hẳn: bộ có thiết lập thế giới, cảnh có beat,
 * còn chương thì không mang được gì. Muốn cả chương chậm lại, hay muốn nó dồn
 * về một câu hỏi, chỉ còn cách chép câu đó vào từng beat.
 */
export const episodeSetupSchema = z.object({
  /** Chương này hướng về điều gì — câu hỏi nó phải trả lời. */
  focus: z.string().default(""),
  /** Giọng riêng chương này, đè lên giọng của bộ. */
  tone: z.string().default(""),
  /** Việc bắt buộc xảy ra trong chương. */
  mustHappen: z.array(z.string()).default([]),
  /** Điều cấm riêng chương này. */
  constraints: z.array(z.string()).default([]),
  characters: z.array(characterOverrideSchema).default([]),
});

export type EpisodeSetup = z.infer<typeof episodeSetupSchema>;

/** Thiết lập riêng của một CẢNH. Hẹp hơn chương, và đè lên chương. */
export const sceneSetupSchema = z.object({
  /** Ghi chú cho riêng cảnh này. */
  note: z.string().default(""),
  characters: z.array(characterOverrideSchema).default([]),
});

export type SceneSetup = z.infer<typeof sceneSetupSchema>;

export const EMPTY_EPISODE_SETUP: EpisodeSetup = {
  focus: "",
  tone: "",
  mustHappen: [],
  constraints: [],
  characters: [],
};

export const EMPTY_SCENE_SETUP: SceneSetup = { note: "", characters: [] };

export function parseEpisodeSetup(value: unknown): EpisodeSetup {
  const parsed = episodeSetupSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...EMPTY_EPISODE_SETUP };
}

export function parseSceneSetup(value: unknown): SceneSetup {
  const parsed = sceneSetupSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...EMPTY_SCENE_SETUP };
}

export function isEpisodeSetupEmpty(s: EpisodeSetup): boolean {
  return (
    !s.focus.trim() &&
    !s.tone.trim() &&
    s.mustHappen.length === 0 &&
    s.constraints.length === 0 &&
    s.characters.length === 0
  );
}

/**
 * Gộp ghi đè của chương với ghi đè của cảnh — cảnh thắng, THEO TỪNG Ô.
 *
 * Theo từng ô chứ không thay cả người: cảnh chỉ nói "Tài đã thay áo mưa" thì
 * ghi chú "đang băng tay trái" của chương phải còn nguyên. Thay cả người thì
 * mỗi lần muốn đổi áo lại phải chép lại mọi thứ khác, mà quên một dòng là nhân
 * vật lành lặn trở lại giữa chương.
 */
export function mergeOverrides(
  chapter: readonly CharacterOverride[],
  scene: readonly CharacterOverride[],
): CharacterOverride[] {
  const out = new Map<string, CharacterOverride>();

  for (const c of [...chapter, ...scene]) {
    const name = c.name.trim().replace(/\s+/g, " ");
    if (!name) continue;

    const key = name.toLowerCase();
    const prev = out.get(key);
    out.set(key, {
      // Giữ dạng gõ của lần ĐẦU: chương gõ "ông Bảy", cảnh gõ "Ông bảy" thì
      // vẫn là một người, và tên đưa cho model phải khớp danh sách nhân vật.
      name: prev?.name ?? name,
      outfit: c.outfit.trim() || prev?.outfit || "",
      note: c.note.trim() || prev?.note || "",
    });
  }

  return [...out.values()].filter((c) => c.outfit || c.note);
}

/** Khối chỉ dẫn riêng của chương, nạp vào ngữ cảnh mọi cảnh thuộc chương. */
export function renderEpisodeSetup(setup: EpisodeSetup): string {
  const parts: string[] = [];

  if (setup.focus.trim()) parts.push(`What this chapter is driving at: ${setup.focus.trim()}`);
  if (setup.tone.trim()) {
    parts.push(`Tone for this chapter, on top of the tone of the series: ${setup.tone.trim()}`);
  }
  if (setup.mustHappen.length > 0) {
    parts.push("It must happen in this chapter:", ...setup.mustHappen.map((m) => `- ${m}`));
  }
  if (setup.constraints.length > 0) {
    parts.push("Not in this chapter:", ...setup.constraints.map((c) => `- ${c}`));
  }

  return parts.length > 0 ? `## This chapter\n${parts.join("\n")}` : "";
}

/**
 * Khối ghi đè nhân vật, nạp NGAY TRƯỚC cảnh cần viết.
 *
 * Nói thẳng là nó đè lên Story Bible: không nói thì model gặp hai mô tả khác
 * nhau về cùng một người và tự chọn, thường là chọn cái đọc trước — tức là
 * Bible, tức là bỏ qua đúng thứ vừa đặt.
 */
export function renderOverrides(overrides: readonly CharacterOverride[]): string {
  if (overrides.length === 0) return "";

  const lines = overrides.map((c) => {
    const bits = [c.outfit ? `wearing ${c.outfit}` : "", c.note].filter(Boolean);
    return `- ${c.name}: ${bits.join("; ")}`;
  });

  return [
    "## The characters right now",
    "This is true for this scene and overrides what the Story Bible says about them. Anything not mentioned here still follows the Bible.",
    ...lines,
  ].join("\n");
}
