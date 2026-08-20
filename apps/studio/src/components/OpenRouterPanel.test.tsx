import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterPanel, type Status } from "./OpenRouterPanel";

const STATUS: Status = {
  hasKey: true,
  reachable: true,
  reason: null,
  key: { usage: 2.5, limit: 10, remaining: 7.5, freeTier: false },
  url: "https://openrouter.ai/api/v1",
  active: false,
  usage: { episodes: 20, inputTokens: 3820, outputTokens: 1718 },
};

const MODELS = {
  cached: false,
  models: [
    {
      id: "anthropic/claude-sonnet-4.5",
      name: "Claude Sonnet 4.5",
      contextLength: 200000,
      promptPerMTok: 3,
      completionPerMTok: 15,
      free: false,
    },
    {
      id: "meta-llama/llama-3.3-70b-instruct:free",
      name: "Llama 3.3 70B",
      contextLength: 131072,
      promptPerMTok: 0,
      completionPerMTok: 0,
      free: true,
    },
  ],
};

let calls: string[] = [];

function mount(status: Partial<typeof STATUS> = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const path = String(input).split("?")[0]!;
      calls.push(path);
      const body =
        path === "/api/models/openrouter"
          ? { ...STATUS, ...status }
          : path === "/api/models/openrouter/models"
            ? MODELS
            : null;
      return Promise.resolve(
        new Response(JSON.stringify(body ?? { error: "thiếu fixture" }), {
          status: body ? 200 : 404,
        }),
      );
    }),
  );

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OpenRouterPanel />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OpenRouterPanel", () => {
  it("hiện tín dụng còn lại khi đã kết nối", async () => {
    const { container } = mount();
    await waitFor(() => expect(container.textContent).toContain("Đã kết nối"));
    expect(container.textContent).toContain("$2.50");
    expect(container.textContent).toContain("$7.50");
  });

  it("LUÔN cảnh báo dữ liệu rời khỏi máy khi có khoá", async () => {
    // Cả kiến trúc hai DB dựng lên để bản thảo không rời khỏi máy. Cảnh báo này
    // là thứ duy nhất cho người dùng biết họ đang mở ngoại lệ đó.
    const { container } = mount();
    await waitFor(() => expect(container.textContent).toMatch(/rời khỏi máy này/));
    expect(container.textContent).toMatch(/Story Bible/);
  });

  it("chưa có khoá thì không doạ người dùng, mà chỉ dẫn cách bật", async () => {
    const { container } = mount({ hasKey: false, reachable: false, key: null, reason: "Chưa đặt OPENROUTER_API_KEY trong .env" });
    await waitFor(() => expect(container.textContent).toContain("Chưa bật OpenRouter"));
    expect(container.textContent).toContain("openrouter.ai/keys");
    expect(container.textContent).not.toMatch(/rời khỏi máy này/);
  });

  it("khoá sai thì nói rõ lý do", async () => {
    const { container } = mount({
      reachable: false,
      key: null,
      reason: "OpenRouter từ chối khoá này (401). Kiểm tra lại OPENROUTER_API_KEY.",
    });
    await waitFor(() => expect(container.textContent).toContain("401"));
  });

  it("KHÔNG tải danh sách model cho tới khi người dùng bấm mở", async () => {
    // Hơn 300 model, vài trăm KB. Tải sẵn mỗi lần mở trang là lãng phí.
    const { container } = mount();
    await waitFor(() => expect(container.textContent).toContain("Đã kết nối"));
    expect(calls).not.toContain("/api/models/openrouter/models");

    fireEvent.click(screen.getByRole("button", { name: /Xem model có sẵn/ }));
    await waitFor(() => expect(calls).toContain("/api/models/openrouter/models"));
  });

  it("tính tiền mỗi tập từ số token đo được, không đoán", async () => {
    const { container } = mount();
    await waitFor(() => expect(container.textContent).toContain("Đã kết nối"));
    fireEvent.click(screen.getByRole("button", { name: /Xem model có sẵn/ }));

    // 3820 token vào × $3/1M + 1718 token ra × $15/1M = $0.0115 + $0.0258 ≈ $0.037
    await waitFor(() => expect(container.textContent).toContain("anthropic/claude-sonnet-4.5"));
    expect(container.textContent).toContain("~$0.037");
    expect(container.textContent).toContain("20 tập đã chạy");
  });

  it("model miễn phí có huy hiệu và không hiện tiền mỗi tập", async () => {
    const { container } = mount();
    await waitFor(() => expect(container.textContent).toContain("Đã kết nối"));
    fireEvent.click(screen.getByRole("button", { name: /Xem model có sẵn/ }));
    await waitFor(() => expect(container.textContent).toContain("llama-3.3-70b"));
    expect(container.textContent).toContain("miễn phí");
  });

  it("lọc theo từ khoá", async () => {
    const { container } = mount();
    await waitFor(() => expect(container.textContent).toContain("Đã kết nối"));
    fireEvent.click(screen.getByRole("button", { name: /Xem model có sẵn/ }));
    await waitFor(() => expect(container.textContent).toContain("llama-3.3-70b"));

    fireEvent.change(screen.getByLabelText("Tìm model"), { target: { value: "claude" } });
    await waitFor(() => expect(container.textContent).not.toContain("llama-3.3-70b"));
    expect(container.textContent).toContain("anthropic/claude-sonnet-4.5");
  });

  it("nút đặt model gửi tên KÈM tiền tố openrouter", async () => {
    // Thiếu tiền tố thì lần chạy đó đi Ollama và chết vì không có model.
    const { container } = mount();
    await waitFor(() => expect(container.textContent).toContain("Đã kết nối"));
    fireEvent.click(screen.getByRole("button", { name: /Xem model có sẵn/ }));
    await waitFor(() => expect(container.textContent).toContain("anthropic/claude-sonnet-4.5"));

    fireEvent.click(screen.getAllByRole("button", { name: "đặt làm model viết" })[0]!);

    await waitFor(() => {
      const call = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(
        (c) => String(c[0]) === "/api/models/default/write",
      );
      expect(call).toBeTruthy();
      const body = (call![1] as { body: FormData }).body;
      expect(body.get("model")).toBe("openrouter:anthropic/claude-sonnet-4.5");
    });
  });
});
