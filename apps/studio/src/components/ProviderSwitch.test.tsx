import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderSwitch } from "./ProviderSwitch";

function mount(props: { provider: string; envProvider?: string; openRouterReady?: boolean }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: "xong" }), { status: 200 }))),
  );
  vi.stubGlobal("confirm", vi.fn(() => true));

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProviderSwitch
        provider={props.provider}
        envProvider={props.envProvider ?? "ollama"}
        openRouterReady={props.openRouterReady ?? true}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProviderSwitch", () => {
  it("đánh dấu bên đang chạy, và chỉ bên kia có nút chuyển", () => {
    const { container } = mount({ provider: "ollama" });
    expect(container.textContent).toContain("đang chạy");
    expect(screen.getByRole("button", { name: /chuyển sang OpenRouter/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /chuyển sang Ollama/ })).toBeNull();
  });

  it("chạy OpenRouter thì nút chuyển nằm ở bên Ollama", () => {
    mount({ provider: "openrouter" });
    expect(screen.getByRole("button", { name: /chuyển sang Ollama/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /chuyển sang OpenRouter/ })).toBeNull();
  });

  it("chuyển sang OpenRouter thì HỎI LẠI trước, vì mất tiền và lộ nội dung", async () => {
    mount({ provider: "ollama" });
    fireEvent.click(screen.getByRole("button", { name: /chuyển sang OpenRouter/ }));

    const confirmed = (globalThis.confirm as unknown as { mock: { calls: string[][] } }).mock
      .calls[0]?.[0];
    expect(confirmed).toMatch(/gửi lên/);
    expect(confirmed).toMatch(/tính tiền/);

    await waitFor(() => {
      const call = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
      expect(String(call![0])).toBe("/api/models/provider");
      expect((call![1] as { body: FormData }).body.get("provider")).toBe("openrouter");
    });
  });

  it("quay về Ollama thì KHÔNG hỏi lại — không mất gì cả", async () => {
    mount({ provider: "openrouter" });
    fireEvent.click(screen.getByRole("button", { name: /chuyển sang Ollama/ }));
    expect((globalThis.confirm as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
    await waitFor(() =>
      expect((globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(1),
    );
  });

  it("OpenRouter chưa kết nối được thì không cho chuyển sang", () => {
    // Chuyển sang lúc chưa có khoá là mọi job chết ngay ở lượt gọi model đầu.
    const { container } = mount({ provider: "ollama", openRouterReady: false });
    expect(screen.queryByRole("button", { name: /chuyển sang OpenRouter/ })).toBeNull();
    expect(container.textContent).toContain("Chưa kết nối được");
  });

  it("còn chạy giả lập thì nói thẳng là model không viết gì", () => {
    const { container } = mount({ provider: "mock" });
    expect(container.textContent).toContain("giả lập");
    // Cả hai bên đều chưa chạy nên đều có nút chuyển.
    expect(screen.getByRole("button", { name: /chuyển sang Ollama/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /chuyển sang OpenRouter/ })).toBeTruthy();
  });

  it("nói rõ lựa chọn ở đây đang đè lên .env", () => {
    const { container } = mount({ provider: "openrouter", envProvider: "ollama" });
    expect(container.textContent).toContain(".env");
    expect(container.textContent).toContain("ollama");
  });
});
