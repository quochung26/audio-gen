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

/** Paste a repo link into the Model box — scanning is automatic, no separate button. */
function paste(url = `https://huggingface.co/${REPO}`) {
  fireEvent.change(screen.getByLabelText("Model"), { target: { value: url } });
}

/** Wait out the debounce, then the API round trip. */
const settle = { timeout: 3000 };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ModelDownload — Ollama library", () => {
  it("a plain model name does NOT scan Hugging Face", async () => {
    mount();
    await new Promise((r) => setTimeout(r, 500));
    expect(calls.filter((c) => c.includes("/api/models/hf"))).toHaveLength(0);
  });

  it("appends the tag for the selected quantisation", () => {
    mount();
    expect(screen.getByRole("button", { name: "Pull qwen3:14b-q4_K_M" })).toBeTruthy();
  });
});

describe("ModelDownload — Hugging Face repo", () => {
  it("pasting a link scans, and only shows builds the repo really has", async () => {
    const { container } = mount();
    paste();
    await waitFor(() => expect(container.textContent).toContain("Q4_K_M"), settle);

    // Send exactly what was pasted; parsing the repo name is the API's job.
    expect(
      calls.some((c) =>
        c.includes(`repo=${encodeURIComponent(`https://huggingface.co/${REPO}`)}`),
      ),
    ).toBe(true);
    const opts = [...container.querySelectorAll("select option")].map((o) => o.textContent);
    expect(opts).toEqual(["Q4_K_M — 4.7 GB", "Q8_0 — 8.1 GB · 3 parts"]);
    expect(container.textContent).toContain("2 builds");
  });

  it("sends the exact hf.co name ollama understands for the chosen build", async () => {
    // Without the hf.co prefix, Ollama looks in its own library and reports no
    // such model.
    mount();
    paste();
    await waitFor(
      () => expect(screen.getByRole("button", { name: `Pull hf.co/${REPO}:Q4_K_M` })).toBeTruthy(),
      settle,
    );

    fireEvent.change(screen.getByLabelText("Quantisation"), { target: { value: "Q8_0" } });
    fireEvent.click(screen.getByRole("button", { name: `Pull hf.co/${REPO}:Q8_0` }));

    await waitFor(() => {
      const call = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(
        (c) => String(c[0]) === "/api/models/pull",
      );
      expect(call).toBeTruthy();
      expect((call![1] as { body: FormData }).body.get("model")).toBe(`hf.co/${REPO}:Q8_0`);
    });
  });

  it("says when a build is split into parts", async () => {
    // The size already covers all three parts; unsaid, it looks like one file.
    const { container } = mount();
    paste();
    await waitFor(() => expect(container.textContent).toContain("Q4_K_M"), settle);
    fireEvent.change(screen.getByLabelText("Quantisation"), { target: { value: "Q8_0" } });
    expect(container.textContent).toContain("split into parts");
  });

  it("a bad repo shows the API reason verbatim and blocks the pull", async () => {
    const { container } = mount({ fail: 'Repo "a/b" has no GGUF files.' });
    paste("https://huggingface.co/a/b");
    await waitFor(() => expect(container.textContent).toContain("has no GGUF files"), settle);
    expect(screen.getByRole("button", { name: "Pull" })).toHaveProperty("disabled", true);
  });

  it("blocks a second pull while one is running", async () => {
    // Two 9 GB pulls over one connection make both slow.
    const { container } = mount({ busy: true });
    paste();
    await waitFor(() => expect(container.textContent).toContain("Q4_K_M"), settle);
    expect(screen.getByRole("button", { name: `Pull hf.co/${REPO}:Q4_K_M` })).toHaveProperty(
      "disabled",
      true,
    );
    expect(container.textContent).toContain("Another pull is running");
  });
});
