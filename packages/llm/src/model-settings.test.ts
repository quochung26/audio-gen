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
    OLLAMA_MODEL_WRITE: "env-write:14b",
    OLLAMA_MODEL_UTILITY: "env-utility:8b",
    OPENROUTER_MODEL_WRITE: "anthropic/claude-sonnet-4.5",
    OPENROUTER_MODEL_UTILITY: "anthropic/claude-haiku-4.5",
    EMBED_MODEL: "env-embed",
  }),
}));

const {
  envDefaultModel,
  getDefaultModel,
  getDefaultModels,
  needsLocalGpu,
  resolveModel,
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

  it("getDefaultModels nói rõ cái nào đến từ .env", async () => {
    await setDefaultModel("write", "qwen3:32b");
    const all = await getDefaultModels();
    expect(all.write).toEqual({ value: "qwen3:32b", fromEnv: false });
    expect(all.utility).toEqual({ value: "env-utility:8b", fromEnv: true });
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

describe("envDefaultModel", () => {
  it("trả đúng biến cho từng loại", () => {
    expect(envDefaultModel("write")).toBe("env-write:14b");
    expect(envDefaultModel("utility")).toBe("env-utility:8b");
    expect(envDefaultModel("embed")).toBe("env-embed");
  });
});

describe("mặc định theo provider đang bật", () => {
  it("openrouter thì lấy model của openrouter, không phải của ollama", () => {
    // Trả về "qwen3:14b" khi đang chạy OpenRouter thì nhận 404 không có model,
    // và lỗi đó chẳng chỉ về đúng nguyên nhân.
    env.provider = "openrouter";
    expect(envDefaultModel("write")).toBe("anthropic/claude-sonnet-4.5");
    expect(envDefaultModel("utility")).toBe("anthropic/claude-haiku-4.5");
  });

  it("nhúng vector KHÔNG đi theo provider — luôn chạy tại chỗ", () => {
    // Nhúng một câu tốn vài ms; trả tiền cho đám mây để làm việc đó là vô lý.
    env.provider = "openrouter";
    expect(envDefaultModel("embed")).toBe("env-embed");
  });

  it("mock và ollama đều dùng model của ollama", () => {
    env.provider = "mock";
    expect(envDefaultModel("write")).toBe("env-write:14b");
  });
});

describe("needsLocalGpu", () => {
  it("model có tiền tố openrouter thì KHÔNG giữ chỗ VRAM", async () => {
    expect(await needsLocalGpu({ requested: "openrouter:openai/gpt-5", kind: "write" })).toBe(false);
  });

  it("model Ollama thì vẫn giữ chỗ", async () => {
    expect(await needsLocalGpu({ requested: "qwen3:14b", kind: "write" })).toBe(true);
  });

  it("không chọn model thì xét model MẶC ĐỊNH", async () => {
    await setDefaultModel("write", "openrouter:anthropic/claude-sonnet-4.5");
    expect(await needsLocalGpu({ requested: null, kind: "write" })).toBe(false);
    // Loại việc khác vẫn chạy Ollama nên vẫn cần GPU.
    expect(await needsLocalGpu({ requested: null, kind: "utility" })).toBe(true);
  });

  it("chuỗi rỗng coi như không chọn", async () => {
    // Form gửi model="" khi người dùng để trống.
    await setDefaultModel("write", "openrouter:openai/gpt-5");
    expect(await needsLocalGpu({ requested: "   ", kind: "write" })).toBe(false);
  });

  it("provider mặc định là openrouter thì không job nào giữ chỗ", async () => {
    env.provider = "openrouter";
    expect(await needsLocalGpu({ requested: null, kind: "write" })).toBe(false);
  });

  it("provider mock cũng không cần GPU", async () => {
    env.provider = "mock";
    expect(await needsLocalGpu({ requested: null, kind: "write" })).toBe(false);
  });
});
