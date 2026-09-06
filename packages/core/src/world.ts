import { renderTags } from "./tags";
import { z } from "zod";
import type { Outline } from "./types";

/**
 * Thiết lập thế giới — phần NGƯỜI VIẾT đặt ra, không phải AI nghĩ ra.
 *
 * Vì sao tách khỏi `Outline`: dàn ý là thứ AI sinh và bạn có thể cho sinh lại;
 * thiết lập thế giới là thứ bạn quyết định và phải giữ nguyên suốt bộ truyện.
 * Trộn chung thì mỗi lần sinh lại dàn ý sẽ xoá mất luật thế giới bạn đã viết.
 *
 * Toàn bộ nội dung này nạp vào `system` prompt mỗi lần viết cảnh, nên nó là
 * thứ giữ cho tập 30 vẫn đúng luật đã đặt ở tập 1.
 */
export const worldSetupSchema = z.object({
  /** Thời gian, địa điểm, không khí. VD: "Quốc lộ miền Trung, thập niên 1970, những chuyến xe đêm." */
  setting: z.string().default(""),

  /**
   * Luật thế giới — những điều LUÔN đúng trong truyện này.
   * VD: "Ma chỉ xuất hiện sau nửa đêm", "Không ai trong làng dám gọi tên người chết".
   */
  rules: z.array(z.string()).default([]),

  /** Giọng văn mong muốn. VD: "chậm rãi, nhiều khoảng lặng, không giật gân." */
  tone: z.string().default(""),

  /**
   * Điều cấm — những thứ KHÔNG được xuất hiện.
   * VD: "không mô tả bạo lực với trẻ em", "không kết thúc bằng giấc mơ".
   */
  constraints: z.array(z.string()).default([]),

  /**
   * Thuật ngữ riêng: tên địa danh, cách xưng hô, vật phẩm.
   * Giữ cho AI không đổi cách gọi giữa các tập.
   */
  glossary: z.array(z.object({ term: z.string(), meaning: z.string() })).default([]),
});

export type WorldSetup = z.infer<typeof worldSetupSchema>;

export const EMPTY_WORLD: WorldSetup = {
  setting: "",
  rules: [],
  tone: "",
  constraints: [],
  glossary: [],
};

/** Cấu trúc lưu trong cột `Series.storyBible`. */
export interface StoryBibleRecord {
  /** Dàn ý do AI sinh — có thể sinh lại. */
  raw?: Outline;
  /** Thiết lập thế giới do người viết đặt — KHÔNG bị ghi đè khi sinh lại dàn ý. */
  world?: WorldSetup;
  /** Bản render sẵn để nạp vào system prompt. Dựng lại mỗi khi raw hoặc world đổi. */
  bible?: string;
}

export function parseWorld(value: unknown): WorldSetup {
  const parsed = worldSetupSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...EMPTY_WORLD };
}

export function isWorldEmpty(w: WorldSetup): boolean {
  return (
    !w.setting.trim() &&
    !w.tone.trim() &&
    w.rules.length === 0 &&
    w.constraints.length === 0 &&
    w.glossary.length === 0
  );
}

/**
 * Render Story Bible đầy đủ để nạp vào system prompt.
 *
 * Thứ tự có chủ đích: thiết lập thế giới đặt TRƯỚC dàn ý. Model đọc tuần tự,
 * và luật thế giới là ràng buộc phải áp cho mọi thứ đọc sau nó.
 */
export function renderBible(input: {
  title: string;
  genre: string;
  /** Thể loại phụ — "tình cảm", "hành động"… Xem packages/core/src/tags.ts. */
  tags?: string[];
  /**
   * Mô tả từng thể loại, để model hiểu chúng theo nghĩa người viết định.
   *
   * `promptName` là tên đưa cho model đọc thay cho `name` — `name` là nhãn
   * người nghe nhìn thấy, `promptName` là nhãn model có liên tưởng dày hơn.
   * Rỗng thì dùng luôn `name`.
   */
  genreNotes?: Array<{ name: string; promptName?: string; description: string }>;
  logline?: string;
  world: WorldSetup;
  characters: Array<{
    name: string;
    role?: string | null;
    description?: string | null;
    speech?: string | null;
    appearance?: string | null;
    isNarrator: boolean;
  }>;
  episodes?: Array<{ number: number; title: string; beats: string[] }>;
  /**
   * Tên những người CÓ MẶT trong cảnh sắp viết.
   *
   * Rỗng = chưa biết, và khi đó mọi người đều được tả đầy đủ. Có danh sách thì
   * người ngoài danh sách chỉ còn tên và vai: ngữ cảnh không phình theo cỡ dàn,
   * mà model vẫn biết họ tồn tại nên không đẻ ra một người trùng tên.
   */
  spotlight?: string[];
}): string {
  // Tên dành cho model, tra theo nhãn hiển thị. Không có thẻ thể loại nào khớp
  // thì giữ nguyên thứ người viết gõ — thể loại dùng được mà không cần có trong
  // danh mục, và bỏ nó đi thì dòng thể loại trống trơn.
  const forModel = new Map(
    (input.genreNotes ?? [])
      .filter((g) => g.promptName?.trim())
      .map((g) => [g.name.trim().toLowerCase(), g.promptName!.trim()]),
  );
  const modelName = (label: string) => forModel.get(label.trim().toLowerCase()) ?? label;

  const parts: string[] = [`# ${input.title}`, ``, `Genre: ${modelName(input.genre)}`];

  // Ngay dưới thể loại: đây là thứ lái giọng văn, phải nằm chỗ model đọc trước.
  const tagLine = renderTags((input.tags ?? []).map(modelName));
  if (tagLine) parts.push(tagLine);

  if (input.logline) parts.push(`Logline: ${input.logline}`);

  // Ngay sau dòng thể loại, trước bối cảnh: model phải biết "kinh dị" ở đây
  // nghĩa là gì trước khi đọc bất cứ thứ gì khác.
  const notes = (input.genreNotes ?? []).filter((g) => g.description.trim());
  if (notes.length > 0) {
    parts.push(
      ``,
      `## What these genres mean here`,
      ...notes.map((g) => `- **${modelName(g.name)}**: ${g.description.trim()}`),
    );
  }

  const w = input.world;

  if (w.setting.trim()) {
    parts.push(``, `## Setting`, w.setting.trim());
  }

  if (w.rules.length > 0) {
    parts.push(
      ``,
      `## World rules`,
      `The following are ALWAYS true in this story. Do not write anything that contradicts them:`,
      ...w.rules.map((r) => `- ${r}`),
    );
  }

  if (w.tone.trim()) {
    parts.push(``, `## Tone`, w.tone.trim());
  }

  if (w.constraints.length > 0) {
    parts.push(``, `## Forbidden`, ...w.constraints.map((c) => `- ${c}`));
  }

  if (w.glossary.length > 0) {
    parts.push(
      ``,
      `## Glossary`,
      `Use these exact terms; do not rename them:`,
      ...w.glossary.map((g) => `- ${g.term}: ${g.meaning}`),
    );
  }

  const spotlight = new Set(
    (input.spotlight ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean),
  );

  parts.push(``, `## Characters`);
  if (spotlight.size > 0) {
    parts.push(
      `Full detail is given only for the characters in the scene you are about to write. The rest are listed by name so you do not invent someone new with the same name.`,
    );
  }

  for (const c of input.characters) {
    parts.push(`- ${c.name}${c.isNarrator ? " (narrator)" : ""}: ${c.role ?? ""}`);

    // Ngoài danh sách thì dừng ở tên và vai — bỏ luôn phần dài nhất.
    if (spotlight.size > 0 && !spotlight.has(c.name.trim().toLowerCase())) continue;

    // Mô tả tính cách và cách nói đặt thụt vào — đây là thứ giữ cho lời thoại
    // của một nhân vật nghe giống nhau qua hàng chục tập.
    if (c.description?.trim()) parts.push(`  ${c.description.trim()}`);
    // Cách nói tách riêng khỏi tính cách: model bám vào đây khi viết LỜI THOẠI,
    // còn dòng trên lái hành động và lựa chọn.
    if (c.speech?.trim()) parts.push(`  Speech: ${c.speech.trim()}`);
    // Ngoại hình có nhãn riêng, không gộp vào dòng trên: nó lái phần TẢ, còn
    // dòng trên lái LỜI THOẠI. Gộp chung thì model tả quần áo giữa một đoạn
    // đang cần giọng nói.
    if (c.appearance?.trim()) parts.push(`  Appearance: ${c.appearance.trim()}`);
  }

  if (input.episodes && input.episodes.length > 0) {
    parts.push(
      ``,
      `## Episode outline`,
      ...input.episodes.map((e) => `${e.number}. ${e.title} — ${e.beats.join(" / ")}`),
    );
  }

  return parts.join("\n");
}

/**
 * Render phần thiết lập thế giới thành đoạn đưa vào prompt DÀN Ý.
 * Khi người viết đã đặt trước bối cảnh, AI phải dựng dàn ý bám theo nó
 * thay vì tự nghĩ ra thế giới của riêng mình.
 */
export function renderWorldForOutline(w: WorldSetup): string {
  if (isWorldEmpty(w)) return "";

  const parts: string[] = ["## The world is already set — you MUST follow it"];

  if (w.setting.trim()) parts.push(`Setting: ${w.setting.trim()}`);
  if (w.tone.trim()) parts.push(`Tone: ${w.tone.trim()}`);
  if (w.rules.length > 0) parts.push(`World rules:`, ...w.rules.map((r) => `- ${r}`));
  if (w.constraints.length > 0) parts.push(`Forbidden:`, ...w.constraints.map((c) => `- ${c}`));
  if (w.glossary.length > 0) {
    parts.push(`Use these exact terms:`, ...w.glossary.map((g) => `- ${g.term}: ${g.meaning}`));
  }

  parts.push(
    "",
    "Do not invent a different setting. The `setting` field you return must match the setting above.",
  );

  return parts.join("\n");
}
