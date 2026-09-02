import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelDownload } from "./ModelDownload";

const REPO = "bartowski/Qwen2.5-7B-Instruct-GGUF";
const VARIANTS = {
  repo: REPO,
  variants: [
    { quant: "Q4_K_M", sizeBytes: 4_680_000_000, parts: 1, tag: `hf.co/${REPO}:Q4_K_M` },
    { quant: "Q8_0", sizeBytes: 8_100_000_000, parts: 3, tag: `hf.co/${REPO}:Q8_0` },
  ],
};

let calls: string[] = [];

function mount(opts: { busy?: boolean; fail?: string } = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      calls.push(String(input));
      if (opts.fail && String(input).includes("/api/models/hf")) {
        return Promise.resolve(new Response(JSON.stringify({ error: opts.fail }), { status: 400 }));
      }
      return Promise.resolve(new Response(JSON.stringify(VARIANTS), { status: 200 }));
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ModelDownload busy={opts.busy ?? false} />
    </QueryClientProvider>,
  );
}

/** Dán một đường dẫn kho vào ô Model — quét là tự động, không có nút riêng. */
function paste(url = `https://huggingface.co/${REPO}`) {
  fireEvent.change(screen.getByLabelText("Model"), { target: { value: url } });
}

/** Chờ hết debounce rồi tới lượt API trả về. */
const settle = { timeout: 3000 };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ModelDownload — thư viện Ollama", () => {
  it("tên model thường thì KHÔNG quét Hugging Face", async () => {
    mount();
    await new Promise((r) => setTimeout(r, 500));
    expect(calls.filter((c) => c.includes("/api/models/hf"))).toHaveLength(0);
  });

  it("ghép tag theo mức lượng tử hoá chọn sẵn", () => {
    mount();
    expect(screen.getByRole("button", { name: "Tải qwen3:14b-q4_K_M" })).toBeTruthy();
  });
});

describe("ModelDownload — kho Hugging Face", () => {
  it("dán link là tự quét, và chỉ hiện những bản kho đó thật sự có", async () => {
    const { container } = mount();
    paste();
    await waitFor(() => expect(container.textContent).toContain("Q4_K_M"), settle);

    // Gửi nguyên thứ người dùng dán; bóc tên kho là việc của API.
    expect(
      calls.some((c) =>
        c.includes(`repo=${encodeURIComponent(`https://huggingface.co/${REPO}`)}`),
      ),
    ).toBe(true);
    const opts = [...container.querySelectorAll("select option")].map((o) => o.textContent);
    expect(opts).toEqual(["Q4_K_M — 4.7 GB", "Q8_0 — 8.1 GB · 3 phần"]);
    expect(container.textContent).toContain("2 bản");
  });

  it("chọn bản nào thì gửi ĐÚNG tên hf.co mà ollama hiểu", async () => {
    // Gửi thiếu tiền tố hf.co là Ollama đi tìm trong thư viện của nó và báo
    // không có model.
    mount();
    paste();
    await waitFor(
      () => expect(screen.getByRole("button", { name: `Tải hf.co/${REPO}:Q4_K_M` })).toBeTruthy(),
      settle,
    );

    fireEvent.change(screen.getByLabelText("Mức lượng tử hoá"), { target: { value: "Q8_0" } });
    fireEvent.click(screen.getByRole("button", { name: `Tải hf.co/${REPO}:Q8_0` }));

    await waitFor(() => {
      const call = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(
        (c) => String(c[0]) === "/api/models/pull",
      );
      expect(call).toBeTruthy();
      expect((call![1] as { body: FormData }).body.get("model")).toBe(`hf.co/${REPO}:Q8_0`);
    });
  });

  it("nói rõ bản bị chia nhiều phần", async () => {
    // Dung lượng đã cộng cả ba phần; không nói thì tưởng tải một file.
    const { container } = mount();
    paste();
    await waitFor(() => expect(container.textContent).toContain("Q4_K_M"), settle);
    fireEvent.change(screen.getByLabelText("Mức lượng tử hoá"), { target: { value: "Q8_0" } });
    expect(container.textContent).toContain("chia nhiều phần");
  });

  it("kho hỏng thì hiện nguyên văn lý do từ API, và không cho bấm tải", async () => {
    const { container } = mount({ fail: 'Kho "a/b" không có file GGUF nào.' });
    paste("https://huggingface.co/a/b");
    await waitFor(() => expect(container.textContent).toContain("không có file GGUF nào"), settle);
    expect(screen.getByRole("button", { name: "Tải" })).toHaveProperty("disabled", true);
  });

  it("đang tải model khác thì không cho bấm tải tiếp", async () => {
    // Hai model 9 GB song song trên một đường mạng thì cả hai đều chậm.
    const { container } = mount({ busy: true });
    paste();
    await waitFor(() => expect(container.textContent).toContain("Q4_K_M"), settle);
    expect(screen.getByRole("button", { name: `Tải hf.co/${REPO}:Q4_K_M` })).toHaveProperty(
      "disabled",
      true,
    );
    expect(container.textContent).toContain("Đang tải model khác");
  });
});
