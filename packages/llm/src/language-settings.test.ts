import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ngôn ngữ mặc định cho truyện mới — cùng lối như model mặc định: `.env` là giá
 * trị khởi đầu, lựa chọn trên giao diện ghi vào `Setting` và đè lên.
 */
const settings = new Map<string, string>();

vi.mock("@audio/database", () => ({
  prisma: {
    setting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        settings.has(where.key) ? { key: where.key, value: settings.get(where.key) } : null,
      upsert: async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
        settings.set(where.key, create.value);
      },
      deleteMany: async ({ where }: { where: { key: string } }) => {
        settings.delete(where.key);
      },
    },
  },
}));

const env = { language: "vi" as "vi" | "en" };
vi.mock("@audio/config", () => ({ loadEnv: () => ({ CONTENT_LANGUAGE: env.language }) }));

const { getDefaultLanguage, getDefaultLanguageSource, setDefaultLanguage } = await import(
  "./language-settings"
);

beforeEach(() => {
  settings.clear();
  env.language = "vi";
});

describe("ngôn ngữ mặc định", () => {
  it("chưa đặt gì thì lấy từ .env", async () => {
    env.language = "en";
    expect(await getDefaultLanguage()).toBe("en");
  });

  it("đặt trên giao diện thì đè lên .env", async () => {
    await setDefaultLanguage("en");
    expect(await getDefaultLanguage()).toBe("en");
  });

  it("xoá thì quay về .env", async () => {
    await setDefaultLanguage("en");
    await setDefaultLanguage("");
    expect(await getDefaultLanguage()).toBe("vi");
  });

  it("từ chối mã lạ", async () => {
    await expect(setDefaultLanguage("fr")).rejects.toThrow(/fr/);
  });

  it("giá trị rác trong DB lùi về .env chứ không làm chết job", async () => {
    settings.set("content.language", "klingon");
    expect(await getDefaultLanguage()).toBe("vi");
  });

  it("nói rõ đang lấy từ đâu", async () => {
    expect(await getDefaultLanguageSource()).toEqual({ value: "vi", fromEnv: true });
    await setDefaultLanguage("en");
    expect(await getDefaultLanguageSource()).toEqual({ value: "en", fromEnv: false });
  });
});
