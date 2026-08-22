import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Chọn giọng đọc — và quan trọng nhất là KHÔNG chọn giọng sai tiếng.
 *
 * Giọng tiếng Việt đọc văn tiếng Anh ra thứ không ai nghe được, mà hỏng kiểu đó
 * không báo lỗi: nó chỉ lộ ra khi ngồi nghe lại cả tập.
 */
interface Row {
  id: string;
  engine: string;
  externalVoiceId: string;
  name: string;
  language: string;
  enabled: boolean;
  commercialOk: boolean;
  createdAt: Date;
}

let rows: Row[] = [];

vi.mock("@audio/database", () => ({
  prisma: {
    voice: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.find((r) => r.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { engine: string; language: string } }) =>
        rows.find(
          (r) => r.engine === where.engine && r.enabled && r.language === where.language,
        ) ?? null,
      count: async ({ where }: { where: { engine: string } }) =>
        rows.filter((r) => r.engine === where.engine && r.enabled).length,
    },
  },
}));

vi.mock("@audio/config", () => ({ loadEnv: () => ({ TTS_PROVIDER: "mock" }) }));

const { resolveVoice } = await import("./voice-resolver");

function voice(over: Partial<Row> & { id: string }): Row {
  return {
    engine: "MOCK",
    externalVoiceId: `ext-${over.id}`,
    name: over.id,
    language: "vi",
    enabled: true,
    commercialOk: true,
    createdAt: new Date("2026-01-01"),
    ...over,
  };
}

beforeEach(() => {
  rows = [voice({ id: "vi-1" }), voice({ id: "vi-2" }), voice({ id: "en-1", language: "en" })];
});

describe("resolveVoice", () => {
  it("casting của nhân vật thắng giọng mặc định của bộ", async () => {
    const r = await resolveVoice({
      characterVoiceId: "vi-2",
      seriesDefaultVoiceId: "vi-1",
      language: "vi",
    });
    expect(r.externalVoiceId).toBe("ext-vi-2");
  });

  it("không casting riêng thì lấy giọng mặc định của bộ", async () => {
    const r = await resolveVoice({ seriesDefaultVoiceId: "vi-1", language: "vi" });
    expect(r.externalVoiceId).toBe("ext-vi-1");
  });

  it("chưa casting gì thì lấy giọng đầu tiên ĐÚNG TIẾNG", async () => {
    expect((await resolveVoice({ language: "en" })).externalVoiceId).toBe("ext-en-1");
    expect((await resolveVoice({ language: "vi" })).externalVoiceId).toBe("ext-vi-1");
  });

  it("BỎ QUA casting sai tiếng, kể cả khi người viết đặt tay", async () => {
    // Giọng tiếng Việt đọc văn tiếng Anh là hỏng âm thầm — thà bỏ qua lựa chọn
    // của người viết còn hơn xuất ra một tập không nghe được.
    const r = await resolveVoice({ characterVoiceId: "vi-1", language: "en" });
    expect(r.externalVoiceId).toBe("ext-en-1");
  });

  it("giọng bị tắt thì không dùng", async () => {
    rows = [voice({ id: "vi-1", enabled: false }), voice({ id: "vi-2" })];
    expect((await resolveVoice({ characterVoiceId: "vi-1", language: "vi" })).externalVoiceId).toBe(
      "ext-vi-2",
    );
  });

  it("không có giọng nào đúng tiếng thì DỪNG, và nói rõ tiếng nào thiếu", async () => {
    rows = [voice({ id: "vi-1" })];
    await expect(resolveVoice({ language: "en" })).rejects.toThrow(/"en"/);
  });

  it("báo luôn là có giọng khác tiếng, để khỏi tưởng bảng Voice rỗng", async () => {
    rows = [voice({ id: "vi-1" }), voice({ id: "vi-2" })];
    await expect(resolveVoice({ language: "en" })).rejects.toThrow(/2 giọng khác tiếng/);
  });

  it("bảng Voice rỗng thì chỉ nhắc chạy seed, không nói câu thừa", async () => {
    rows = [];
    await expect(resolveVoice({ language: "vi" })).rejects.toThrow(/db:seed/);
    await expect(resolveVoice({ language: "vi" })).rejects.not.toThrow(/giọng khác tiếng/);
  });

  it("engine lấy từ bản ghi Voice, không hardcode", async () => {
    rows = [voice({ id: "k-1", engine: "KOKORO", language: "en" })];
    // Không có giọng MOCK nào cho "en" nên phải lỗi, chứ không được lặng lẽ
    // dùng giọng của engine khác.
    await expect(resolveVoice({ language: "en" })).rejects.toThrow();
  });
});
