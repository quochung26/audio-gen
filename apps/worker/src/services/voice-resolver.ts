import { loadEnv } from "@audio/config";
import { prisma, type TtsEngine, type Voice } from "@audio/database";

export interface ResolvedVoice {
  /** Engine THẬT sẽ đọc — lấy từ bản ghi Voice, không hardcode. */
  engine: TtsEngine;
  /** ID mà engine hiểu (vd "vi_female_1") — KHÔNG phải cuid của bảng Voice. */
  externalVoiceId: string;
  name: string;
  commercialOk: boolean;
}

/**
 * Quyết định giọng cho một block.
 *
 * Hai lỗi mà hàm này tồn tại để chặn:
 *
 *  1. Trước đây `ttsEngine` bị hardcode `MOCK`. Đổi TTS_PROVIDER sang kokoro
 *     thì block vẫn ghi MOCK, job TTS gọi lại provider mock, và ra file giả lập
 *     mà KHÔNG báo lỗi gì. Giờ engine luôn lấy từ bản ghi Voice.
 *
 *  2. `Character.voiceId` là cuid của bảng Voice, nhưng engine cần
 *     `externalVoiceId`. Mock bỏ qua nội dung voiceId nên test vẫn "chạy";
 *     engine thật thì báo không tìm thấy giọng.
 *
 * Thứ tự ưu tiên: casting riêng của nhân vật → giọng mặc định của bộ →
 * giọng đầu tiên khớp engine đang cấu hình.
 */
export async function resolveVoice(input: {
  seriesDefaultVoiceId?: string | null;
  characterVoiceId?: string | null;
}): Promise<ResolvedVoice> {
  const ids = [input.characterVoiceId, input.seriesDefaultVoiceId].filter(
    (v): v is string => Boolean(v),
  );

  for (const id of ids) {
    const v = await prisma.voice.findUnique({ where: { id } });
    if (v?.enabled) return toResolved(v);
  }

  // Chưa casting gì: lấy giọng đầu tiên của engine đang cấu hình.
  const engine = loadEnv().TTS_PROVIDER.toUpperCase() as TtsEngine;
  const fallback = await prisma.voice.findFirst({
    where: { engine, enabled: true },
    orderBy: { createdAt: "asc" },
  });

  if (!fallback) {
    throw new Error(
      `Không có giọng nào cho engine "${engine}". ` +
        `Chạy \`pnpm db:seed\` (giọng giả lập), hoặc thêm giọng thật vào bảng Voice ` +
        `rồi gán ở trang Nhân vật của bộ truyện.`,
    );
  }
  return toResolved(fallback);
}

function toResolved(v: Voice): ResolvedVoice {
  return {
    engine: v.engine,
    externalVoiceId: v.externalVoiceId,
    name: v.name,
    commercialOk: v.commercialOk,
  };
}
