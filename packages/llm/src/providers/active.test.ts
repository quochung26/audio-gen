import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { GenerateResult, LlmProvider } from "../provider";
import { ActiveProvider, isProviderName, type ProviderName } from "./active";

describe("isProviderName", () => {
  it("nhận đúng ba tên", () => {
    expect(isProviderName("ollama")).toBe(true);
    expect(isProviderName("openrouter")).toBe(true);
    expect(isProviderName("mock")).toBe(true);
  });

  it("từ chối thứ khác", () => {
    expect(isProviderName("openai")).toBe(false);
    expect(isProviderName("")).toBe(false);
  });
});

function fake(name: string) {
  const result: GenerateResult = {
    text: name,
    model: name,
    inputTokens: 1,
    outputTokens: 1,
    durationMs: 1,
    tokensPerSec: 1,
  };
  const p = {
    name,
    generate: vi.fn(async () => result),
    generateJson: vi.fn(async () => ({ ...result, data: {} })),
  };
  // `generateJson` có kiểu generic; hàm giả không khớp được nên ép kiểu tại đây
  // để vẫn giữ `vi.fn` cho phần khẳng định.
  return { ...p, as: () => p as unknown as LlmProvider };
}

function setup(active: ProviderName) {
  const ollama = fake("ollama");
  const openrouter = fake("openrouter");
  const mock = fake("mock");
  const state = { active };
  const made: string[] = [];

  const provider = new ActiveProvider(
    {
      mock: () => (made.push("mock"), mock.as()),
      ollama: () => (made.push("ollama"), ollama.as()),
      openrouter: () => (made.push("openrouter"), openrouter.as()),
    },
    async () => state.active,
  );
  return { provider, ollama, openrouter, mock, state, made };
}

describe("ActiveProvider", () => {
  it("gọi provider đang bật", async () => {
    const { provider, ollama, openrouter } = setup("ollama");
    await provider.generate({ prompt: "p" });
    expect(ollama.generate).toHaveBeenCalled();
    expect(openrouter.generate).not.toHaveBeenCalled();
  });

  it("generateJson đi cùng provider", async () => {
    const { provider, openrouter } = setup("openrouter");
    await provider.generateJson({ prompt: "p", schema: z.object({}) });
    expect(openrouter.generateJson).toHaveBeenCalled();
  });

  it("ĐỔI provider giữa chừng thì lượt sau đi đường mới, không phải khởi động lại", async () => {
    // Đây là lý do phải hỏi lại mỗi lượt: worker chạy dài, nhớ sẵn thì đổi trên
    // giao diện xong vẫn phải khởi động lại worker mới ăn.
    const { provider, ollama, openrouter, state } = setup("ollama");
    await provider.generate({ prompt: "p" });
    expect(ollama.generate).toHaveBeenCalledTimes(1);

    state.active = "openrouter";
    await provider.generate({ prompt: "p" });
    expect(openrouter.generate).toHaveBeenCalledTimes(1);
    expect(ollama.generate).toHaveBeenCalledTimes(1);
  });

  it("chỉ dựng provider khi thật sự cần", async () => {
    // Dựng OpenRouterProvider khi chưa có khoá API là nổ ngay lúc khởi động
    // worker, dù cả pipeline chạy Ollama.
    const { provider, made } = setup("ollama");
    await provider.generate({ prompt: "p" });
    expect(made).toEqual(["ollama"]);
  });

  it("dựng một lần rồi dùng lại", async () => {
    const { provider, made } = setup("ollama");
    await provider.generate({ prompt: "p" });
    await provider.generate({ prompt: "p" });
    expect(made).toEqual(["ollama"]);
  });
});
