import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Luật chọn model — ba tầng, cụ thể hơn thì thắng.
 *
 * Giả lập `prisma` và `loadEnv` để test chạy không cần DB: thứ đáng kiểm ở đây
 * là THỨ TỰ ưu tiên, không phải Prisma có hoạt động không.
 */
const settings = new Map<string, string>();

vi.mock("@audio/database", () => ({
  prisma: {
    setting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        settings.has(where.key) ? { key: where.key, value: settings.get(where.key) } : null,
      findMany: async ({ where }: { where: { key: { in: string[] } } }) =>
        where.key.in
          .filter((k) => settings.has(k))
          .map((k) => ({ key: k, value: settings.get(k)! })),
      upsert: async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
        settings.set(where.key, create.value);
      },
      deleteMany: async ({ where }: { where: { key: string } }) => {
        settings.delete(where.key);
      },
    },
  },
}));

/** Provider mặc định — đổi được trong từng test. */
const env = { provider: "ollama" as "mock" | "ollama" | "openrouter" };

vi.mock("@audio/config", () => ({
  loadEnv: () => ({
    LLM_PROVIDER: env.provider,
    // Cổng không ai nghe: `listInstalledModels` phải nuốt lỗi và trả mảng rỗng,
    // chứ không được làm chết việc lấy model mặc định.
    OLLAMA_URL: "http://127.0.0.1:9",
    OLLAMA_MODEL_WRITE: "env-write:14b",
    OLLAMA_MODEL_UTILITY: "env-utility:8b",
    OPENROUTER_MODEL_WRITE: "anthropic/claude-sonnet-4.5",
    OPENROUTER_MODEL_UTILITY: "anthropic/claude-haiku-4.5",
    EMBED_MODEL: "env-embed",
  }),
}));

const {
  envDefaultModel,
  getActiveProvider,
  getDefaultModel,
  getDefaultModels,
  needsLocalGpu,
  resolveModel,
  setActiveProvider,
  setDefaultModel,
} = await import("./model-settings");

beforeEach(() => {
  settings.clear();
  env.provider = "ollama";
});

describe("mặc định", () => {
  it("chưa đặt gì thì lấy từ .env", async () => {
    expect(await getDefaultModel("write")).toBe("env-write:14b");
    expect(await getDefaultModel("utility")).toBe("env-utility:8b");
    expect(await getDefaultModel("embed")).toBe("env-embed");
  });

  it("đặt ở giao diện thì đè lên .env", async () => {
    await setDefaultModel("write", "qwen3:32b");
    expect(await getDefaultModel("write")).toBe("qwen3:32b");
    // Không đụng tới loại khác.
    expect(await getDefaultModel("utility")).toBe("env-utility:8b");
  });

  it("xoá thì quay về .env", async () => {
    await setDefaultModel("write", "qwen3:32b");
    await setDefaultModel("write", "");
    expect(await getDefaultModel("write")).toBe("env-write:14b");
  });

  it("cắt khoảng trắng thừa; toàn khoảng trắng coi như xoá", async () => {
    await setDefaultModel("write", "  qwen3:32b  ");
    expect(await getDefaultModel("write")).toBe("qwen3:32b");
    await setDefaultModel("write", "   ");
    expect(await getDefaultModel("write")).toBe("env-write:14b");
  });

  it("getDefaultModels nói rõ giá trị đến TỪ ĐÂU", async () => {
    // Ba nguồn khác nhau, và giao diện phải phân biệt được: người dùng cần biết
    // khi nào mình đang xem lựa chọn của chính mình, khi nào là máy tự suy ra.
    await setDefaultModel("write", "qwen3:32b");
    const all = await getDefaultModels();
    expect(all.write).toMatchObject({ value: "qwen3:32b", source: "setting" });
    // Ollama không chạy trong test nên danh sách rỗng → lùi về .env.
    expect(all.utility).toMatchObject({ value: "env-utility:8b", source: "env" });
  });

  it("kèm luôn giá trị .env, kể cả khi đã đặt tay", async () => {
    // Giao diện phải nói được "bỏ trống thì rơi về đâu" — mà `value` lúc đã đặt
    // tay thì không còn là giá trị của `.env` nữa.
    await setDefaultModel("write", "qwen3:32b");
    const all = await getDefaultModels();
    expect(all.write.envValue).toBe("env-write:14b");
    expect(all.utility.envValue).toBe("env-utility:8b");
  });
});

describe("resolveModel — ba tầng ưu tiên", () => {
  it("model của lần chạy thắng tất cả", async () => {
    await setDefaultModel("write", "mac-dinh");
    expect(await resolveModel({ requested: "chon-tay", prompt: "cua-prompt", kind: "write" })).toBe(
      "chon-tay",
    );
  });

  it("không chọn tay thì lấy của prompt", async () => {
    await setDefaultModel("write", "mac-dinh");
    expect(await resolveModel({ prompt: "cua-prompt", kind: "write" })).toBe("cua-prompt");
  });

  it("không có gì thì lấy mặc định", async () => {
    await setDefaultModel("write", "mac-dinh");
    expect(await resolveModel({ kind: "write" })).toBe("mac-dinh");
  });

  it("CHUỖI RỖNG coi như không đặt, không phải một lựa chọn", async () => {
    // Form gửi model="" khi người dùng để trống. Coi nó là lựa chọn thì Ollama
    // nhận model tên rỗng và báo lỗi khó hiểu.
    expect(await resolveModel({ requested: "", prompt: "cua-prompt", kind: "write" })).toBe(
      "cua-prompt",
    );
    expect(await resolveModel({ requested: "  ", prompt: "", kind: "write" })).toBe("env-write:14b");
  });

  it("null và undefined cũng vậy", async () => {
    expect(await resolveModel({ requested: null, prompt: null, kind: "utility" })).toBe(
      "env-utility:8b",
    );
    expect(await resolveModel({ kind: "utility" })).toBe("env-utility:8b");
  });

  it("cắt khoảng trắng quanh model chọn tay", async () => {
    expect(await resolveModel({ requested: "  qwen3:32b ", kind: "write" })).toBe("qwen3:32b");
  });
});

describe("provider đang bật — một trong hai", () => {
  it("chưa chọn gì thì lấy từ .env", async () => {
    env.provider = "openrouter";
    expect(await getActiveProvider()).toBe("openrouter");
  });

  it("chọn trên giao diện thì đè lên .env", async () => {
    env.provider = "ollama";
    await setActiveProvider("openrouter");
    expect(await getActiveProvider()).toBe("openrouter");
  });

  it("xoá thì quay về .env", async () => {
    env.provider = "ollama";
    await setActiveProvider("openrouter");
    await setActiveProvider("");
    expect(await getActiveProvider()).toBe("ollama");
  });

  it("từ chối tên provider lạ", async () => {
    await expect(setActiveProvider("openai")).rejects.toThrow(/openai/);
  });

  it("giá trị rác trong DB không làm chết — lùi về .env", async () => {
    // Sửa tay trong DB, hoặc dữ liệu cũ từ bản trước.
    settings.set("llm.provider", "khong-ton-tai");
    env.provider = "ollama";
    expect(await getActiveProvider()).toBe("ollama");
  });
});

describe("model mặc định tách theo provider", () => {
  it("mỗi provider nhớ model riêng, đổi qua đổi lại không mất", async () => {
    // Dùng chung một khoá thì đổi sang OpenRouter, chọn claude, rồi đổi về
    // Ollama là mọi job đi hỏi Ollama model tên "anthropic/..." và chết.
    await setActiveProvider("ollama");
    await setDefaultModel("write", "qwen3:32b");

    await setActiveProvider("openrouter");
    await setDefaultModel("write", "anthropic/claude-sonnet-4.5");
    expect(await getDefaultModel("write")).toBe("anthropic/claude-sonnet-4.5");

    await setActiveProvider("ollama");
    expect(await getDefaultModel("write")).toBe("qwen3:32b");
  });

  it("mock dùng CHUNG ô lưu với ollama", async () => {
    // Phần lớn thời gian dựng máy là chạy giả lập. Tách ra thì model đặt lúc đó
    // biến mất ngay khi chuyển sang Ollama thật, mà chẳng có gì báo.
    await setActiveProvider("mock");
    await setDefaultModel("write", "qwen3:32b");

    await setActiveProvider("ollama");
    expect(await getDefaultModel("write")).toBe("qwen3:32b");
  });

  it("nhúng vector KHÔNG tách — luôn chạy tại chỗ", async () => {
    await setActiveProvider("ollama");
    await setDefaultModel("embed", "bge-m3-custom");
    await setActiveProvider("openrouter");
    expect(await getDefaultModel("embed")).toBe("bge-m3-custom");
  });

  it("chưa đặt gì thì .env theo đúng provider đang bật", async () => {
    await setActiveProvider("openrouter");
    expect(await getDefaultModel("write")).toBe("anthropic/claude-sonnet-4.5");
    expect(await getDefaultModel("utility")).toBe("anthropic/claude-haiku-4.5");
    // Nhúng vector vẫn là model chạy tại chỗ.
    expect(await getDefaultModel("embed")).toBe("env-embed");
  });
});

describe("envDefaultModel", () => {
  it("trả model theo provider được hỏi", () => {
    expect(envDefaultModel("write", "ollama")).toBe("env-write:14b");
    expect(envDefaultModel("write", "openrouter")).toBe("anthropic/claude-sonnet-4.5");
  });

  it("mock dùng model của ollama", () => {
    expect(envDefaultModel("write", "mock")).toBe("env-write:14b");
  });

  it("nhúng vector không đổi theo provider", () => {
    expect(envDefaultModel("embed", "openrouter")).toBe("env-embed");
  });
});

describe("needsLocalGpu", () => {
  it("chạy Ollama thì giữ chỗ VRAM", async () => {
    await setActiveProvider("ollama");
    expect(await needsLocalGpu()).toBe(true);
  });

  it("chạy OpenRouter thì KHÔNG giữ chỗ", async () => {
    // Một lượt gọi mạng kéo dài hàng chục giây; giữ 12 GB trong lúc đó là chặn
    // đứng clone giọng mà chẳng để làm gì.
    await setActiveProvider("openrouter");
    expect(await needsLocalGpu()).toBe(false);
  });

  it("mock cũng không cần GPU", async () => {
    await setActiveProvider("mock");
    expect(await needsLocalGpu()).toBe(false);
  });
});
