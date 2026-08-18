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
  logline?: string;
  world: WorldSetup;
  characters: Array<{
    name: string;
    role?: string | null;
    description?: string | null;
    isNarrator: boolean;
  }>;
  episodes?: Array<{ number: number; title: string; beats: string[] }>;
}): string {
  const parts: string[] = [`# ${input.title}`, ``, `Thể loại: ${input.genre}`];

  if (input.logline) parts.push(`Tóm tắt: ${input.logline}`);

  const w = input.world;

  if (w.setting.trim()) {
    parts.push(``, `## Bối cảnh`, w.setting.trim());
  }

  if (w.rules.length > 0) {
    parts.push(
      ``,
      `## Luật thế giới`,
      `Những điều sau LUÔN đúng trong truyện này. Không được viết trái với chúng:`,
      ...w.rules.map((r) => `- ${r}`),
    );
  }

  if (w.tone.trim()) {
    parts.push(``, `## Giọng văn`, w.tone.trim());
  }

  if (w.constraints.length > 0) {
    parts.push(``, `## Điều cấm`, ...w.constraints.map((c) => `- ${c}`));
  }

  if (w.glossary.length > 0) {
    parts.push(
      ``,
      `## Thuật ngữ`,
      `Dùng đúng các cách gọi sau, không tự đổi:`,
      ...w.glossary.map((g) => `- ${g.term}: ${g.meaning}`),
    );
  }

  parts.push(``, `## Nhân vật`);
  for (const c of input.characters) {
    parts.push(`- ${c.name}${c.isNarrator ? " (người dẫn truyện)" : ""}: ${c.role ?? ""}`);
    // Mô tả tính cách và cách nói đặt thụt vào — đây là thứ giữ cho lời thoại
    // của một nhân vật nghe giống nhau qua hàng chục tập.
    if (c.description?.trim()) parts.push(`  ${c.description.trim()}`);
  }

  if (input.episodes && input.episodes.length > 0) {
    parts.push(
      ``,
      `## Dàn ý các tập`,
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

  const parts: string[] = ["## Thiết lập thế giới đã có — BẮT BUỘC bám theo"];

  if (w.setting.trim()) parts.push(`Bối cảnh: ${w.setting.trim()}`);
  if (w.tone.trim()) parts.push(`Giọng văn: ${w.tone.trim()}`);
  if (w.rules.length > 0) parts.push(`Luật thế giới:`, ...w.rules.map((r) => `- ${r}`));
  if (w.constraints.length > 0) parts.push(`Điều cấm:`, ...w.constraints.map((c) => `- ${c}`));
  if (w.glossary.length > 0) {
    parts.push(`Thuật ngữ phải dùng đúng:`, ...w.glossary.map((g) => `- ${g.term}: ${g.meaning}`));
  }

  parts.push(
    "",
    "Không đặt lại bối cảnh khác. Trường `setting` trong kết quả phải khớp với bối cảnh trên.",
  );

  return parts.join("\n");
}
