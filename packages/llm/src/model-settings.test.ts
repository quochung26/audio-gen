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
  }),
}));

const {
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
  it("provider giả lập vẫn chạy được khi máy chưa có model nào", async () => {
    // Cả lý do "mock" tồn tại là dựng được Studio/worker trước khi có model.
    await setActiveProvider("mock");
    expect(await getDefaultModel("write")).toBe("mock");
    await expect(resolveModel({ kind: "write" })).resolves.toBe("mock");
  });

  it("chưa đặt gì và chưa tải model nào thì KHÔNG chọn gì", async () => {
    await setActiveProvider("ollama");
    // Không bịa ra một tên: bịa thì job chết giữa chừng với "không tìm thấy
    // model", thay vì báo ngay lúc mở Studio.
    expect(await getDefaultModel("write")).toBe("");
    expect(await getDefaultModel("utility")).toBe("");
    expect(await getDefaultModel("embed")).toBe("");
  });

  it("đặt ở giao diện thì thắng mặc định tự chọn", async () => {
    await setActiveProvider("ollama");
    await setDefaultModel("write", "qwen3:32b");
    expect(await getDefaultModel("write")).toBe("qwen3:32b");
    // Không đụng tới loại khác.
    expect(await getDefaultModel("utility")).toBe("");
  });

  it("xoá thì quay về mặc định tự chọn", async () => {
    await setActiveProvider("ollama");
    await setDefaultModel("write", "qwen3:32b");
    await setDefaultModel("write", "");
    expect(await getDefaultModel("write")).toBe("");
  });

  it("cắt khoảng trắng thừa; toàn khoảng trắng coi như xoá", async () => {
    await setActiveProvider("ollama");
    await setDefaultModel("write", "  qwen3:32b  ");
    expect(await getDefaultModel("write")).toBe("qwen3:32b");
    await setDefaultModel("write", "   ");
    expect(await getDefaultModel("write")).toBe("");
  });

  it("getDefaultModels nói rõ giá trị đến TỪ ĐÂU", async () => {
    await setActiveProvider("ollama");
    // Ba nguồn khác nhau, và giao diện phải phân biệt được: người dùng cần biết
    // khi nào mình đang xem lựa chọn của chính mình, khi nào là máy tự suy ra.
    await setDefaultModel("write", "qwen3:32b");
    const all = await getDefaultModels();
    expect(all.write).toMatchObject({ value: "qwen3:32b", source: "setting" });
    // Ollama không chạy trong test nên danh sách rỗng → không có gì để chọn.
    expect(all.utility).toMatchObject({ value: "", source: "none" });
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
    await expect(resolveModel({ requested: "  ", prompt: "", kind: "write" })).rejects.toThrow(
      /Chưa có model/,
    );
  });

  it("hết đường thì DỪNG với lời chỉ rõ chỗ sửa", async () => {
    // Gửi tên model rỗng đi thì provider báo một lỗi khó hiểu.
    await expect(resolveModel({ requested: null, prompt: null, kind: "utility" })).rejects.toThrow(
      /trang Model/,
    );
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

  it("OpenRouter chưa chọn gì thì cũng KHÔNG có mặc định", async () => {
    // Không có khái niệm "đã tải" nên phải chọn tay ở trang Model.
    await setActiveProvider("openrouter");
    expect(await getDefaultModel("write")).toBe("");
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
