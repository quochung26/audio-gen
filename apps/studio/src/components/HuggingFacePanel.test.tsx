import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HuggingFacePanel } from "./HuggingFacePanel";

const VARIANTS = {
  repo: "bartowski/Qwen2.5-7B-Instruct-GGUF",
  variants: [
    { quant: "Q4_K_M", sizeBytes: 4_680_000_000, parts: 1, tag: "hf.co/bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M" },
    { quant: "Q8_0", sizeBytes: 8_100_000_000, parts: 3, tag: "hf.co/bartowski/Qwen2.5-7B-Instruct-GGUF:Q8_0" },
  ],
};

let calls: string[] = [];

function mount(opts: { busy?: boolean; fail?: string } = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      calls.push(String(input));
      if (opts.fail) {
        return Promise.resolve(new Response(JSON.stringify({ error: opts.fail }), { status: 400 }));
      }
      return Promise.resolve(new Response(JSON.stringify(VARIANTS), { status: 200 }));
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <HuggingFacePanel busy={opts.busy ?? false} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function scan(url = "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF") {
  fireEvent.change(screen.getByLabelText("Đường dẫn kho Hugging Face"), { target: { value: url } });
  fireEvent.click(screen.getByRole("button", { name: "Quét kho" }));
}

describe("HuggingFacePanel", () => {
  it("KHÔNG gọi API cho tới khi bấm quét", () => {
    mount();
    expect(calls).toHaveLength(0);
  });

  it("quét xong thì liệt kê từng bản kèm dung lượng", async () => {
    const { container } = mount();
    scan();
    await waitFor(() => expect(container.textContent).toContain("Q4_K_M"));
    expect(container.textContent).toContain("4.7 GB");
    expect(container.textContent).toContain("Q8_0");
    expect(container.textContent).toContain("2 bản");
  });

  it("chỉ rõ bản bị chia nhiều phần", async () => {
    // Dung lượng đã cộng cả ba phần; không nói thì tưởng tải một file.
    const { container } = mount();
    scan();
    await waitFor(() => expect(container.textContent).toContain("Q8_0"));
    expect(container.textContent).toContain("3 phần");
    expect(container.textContent).toContain("chia nhiều phần");
  });

  it("bấm tải là gửi ĐÚNG tên hf.co mà ollama hiểu", async () => {
    // Gửi thiếu tiền tố hf.co là Ollama đi tìm trong thư viện của nó và báo
    // không có model.
    mount();
    scan();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "tải bản này" }).length).toBe(2));
    fireEvent.click(screen.getAllByRole("button", { name: "tải bản này" })[0]!);

    await waitFor(() => {
      const call = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(
        (c) => String(c[0]) === "/api/models/pull",
      );
      expect(call).toBeTruthy();
      expect((call![1] as { body: FormData }).body.get("model")).toBe(
        "hf.co/bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M",
      );
    });
  });

  it("đang tải model khác thì không cho bấm tải tiếp", async () => {
    // Hai model 9 GB song song trên một đường mạng thì cả hai đều chậm.
    const { container } = mount({ busy: true });
    scan();
    await waitFor(() => expect(container.textContent).toContain("Q4_K_M"));
    expect(screen.queryByRole("button", { name: "tải bản này" })).toBeNull();
    expect(container.textContent).toContain("đang tải model khác");
  });

  it("kho hỏng thì hiện nguyên văn lý do từ API", async () => {
    const { container } = mount({ fail: 'Kho "a/b" không có file GGUF nào.' });
    scan();
    await waitFor(() => expect(container.textContent).toContain("không có file GGUF nào"));
  });

  it("ô rỗng thì không quét được", () => {
    mount();
    expect(screen.getByRole("button", { name: "Quét kho" })).toHaveProperty("disabled", true);
  });
});
