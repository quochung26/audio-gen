import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { GenerateResult, LlmProvider } from "../provider";
import { formatModelRef, parseModelRef, RoutingProvider } from "./routing";

describe("parseModelRef", () => {
  it("không tiền tố thì để nguyên", () => {
    expect(parseModelRef("qwen3:14b")).toEqual({ provider: undefined, model: "qwen3:14b" });
  });

  it("KHÔNG cắt tên model Ollama ở dấu hai chấm", () => {
    // Đây là lý do tồn tại của danh sách provider đã biết: cắt bừa thì "qwen3"
    // thành provider, "14b" thành model, và mọi lần sinh đều hỏng.
    const r = parseModelRef("qwen3:14b");
    expect(r.model).toBe("qwen3:14b");
    expect(r.provider).toBeUndefined();
  });

  it("cắt tiền tố openrouter", () => {
    expect(parseModelRef("openrouter:anthropic/claude-sonnet-4.5")).toEqual({
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4.5",
    });
  });

  it("giữ nguyên dấu hai chấm còn lại sau khi cắt tiền tố ollama", () => {
    expect(parseModelRef("ollama:qwen3:14b")).toEqual({ provider: "ollama", model: "qwen3:14b" });
  });

  it("chuỗi rỗng và null không làm chết", () => {
    expect(parseModelRef(null)).toEqual({ provider: undefined, model: "" });
    expect(parseModelRef("")).toEqual({ provider: undefined, model: "" });
    expect(parseModelRef("   ")).toEqual({ provider: undefined, model: "" });
  });

  it("tiền tố mà không có tên model thì coi như không phải tiền tố", () => {
    expect(parseModelRef("openrouter:")).toEqual({ provider: undefined, model: "openrouter:" });
  });

  it("ghép ngược lại được", () => {
    expect(formatModelRef("openrouter", "openai/gpt-5")).toBe("openrouter:openai/gpt-5");
    expect(parseModelRef(formatModelRef("ollama", "qwen3:14b")).model).toBe("qwen3:14b");
  });
});

function fake(name: string) {
  const result: GenerateResult = {
    text: "x",
    model: name,
    inputTokens: 1,
    outputTokens: 1,
    durationMs: 1,
    tokensPerSec: 1,
  };
  const provider = {
    name,
    generate: vi.fn(async () => result),
    generateJson: vi.fn(async () => ({ ...result, data: {} })),
  };
  // `generateJson` có kiểu generic, hàm giả không thể khớp generic — ép kiểu ở
  // đây để giữ được `vi.fn` cho phần khẳng định bên dưới.
  return { ...provider, as: () => provider as unknown as LlmProvider };
}

describe("RoutingProvider", () => {
  it("không tiền tố thì đi provider mặc định", async () => {
    const ollama = fake("ollama");
    const or = fake("openrouter");
    const r = new RoutingProvider({ ollama: () => ollama.as(), openrouter: () => or.as() }, "ollama");

    await r.generate({ prompt: "p", model: "qwen3:14b" });
    expect(ollama.generate).toHaveBeenCalledWith(expect.objectContaining({ model: "qwen3:14b" }));
    expect(or.generate).not.toHaveBeenCalled();
  });

  it("có tiền tố thì đi provider được chỉ định, và tiền tố bị lột trước khi gửi", async () => {
    const ollama = fake("ollama");
    const or = fake("openrouter");
    const r = new RoutingProvider({ ollama: () => ollama.as(), openrouter: () => or.as() }, "ollama");

    await r.generate({ prompt: "p", model: "openrouter:anthropic/claude-sonnet-4.5" });
    expect(or.generate).toHaveBeenCalledWith(
      // Gửi kèm tiền tố là OpenRouter báo 404 không có model.
      expect.objectContaining({ model: "anthropic/claude-sonnet-4.5" }),
    );
    expect(ollama.generate).not.toHaveBeenCalled();
  });

  it("generateJson định tuyến giống hệt generate", async () => {
    const ollama = fake("ollama");
    const or = fake("openrouter");
    const r = new RoutingProvider({ ollama: () => ollama.as(), openrouter: () => or.as() }, "ollama");

    await r.generateJson({ prompt: "p", model: "openrouter:openai/gpt-5", schema: z.object({}) });
    expect(or.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({ model: "openai/gpt-5" }),
    );
  });

  it("không truyền model thì để provider tự dùng model mặc định của nó", async () => {
    const ollama = fake("ollama");
    const r = new RoutingProvider({ ollama: () => ollama.as() }, "ollama");

    await r.generate({ prompt: "p" });
    // undefined chứ KHÔNG phải chuỗi rỗng: chuỗi rỗng gửi lên là model tên rỗng.
    expect(ollama.generate).toHaveBeenCalledWith(expect.objectContaining({ model: undefined }));
  });

  it("chỉ dựng provider khi thật sự cần", async () => {
    const make = vi.fn(() => fake("openrouter").as());
    const r = new RoutingProvider({ ollama: () => fake("ollama").as(), openrouter: make }, "ollama");

    await r.generate({ prompt: "p", model: "qwen3:14b" });
    // Dựng OpenRouterProvider khi chưa có khoá API là nổ ngay lúc khởi động
    // worker, dù cả pipeline chạy Ollama.
    expect(make).not.toHaveBeenCalled();
  });

  it("gọi provider chưa cấu hình thì báo lỗi rõ ràng", () => {
    const r = new RoutingProvider({ ollama: () => fake("ollama").as() }, "ollama");
    expect(() => r.resolve("openrouter:x/y")).toThrow(/openrouter/);
  });
});
