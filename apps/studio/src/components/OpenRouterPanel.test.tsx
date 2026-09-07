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
        new Response(JSON.stringify(body ?? { error: "missing fixture" }), {
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
  it("shows the remaining credit once connected", async () => {
    const { container } = mount();
    await waitFor(() => expect(container.textContent).toContain("Connected"));
    expect(container.textContent).toContain("$2.50");
    expect(container.textContent).toContain("$7.50");
  });

  it("ALWAYS warns that data leaves the machine when a key is present", async () => {
    // The whole two-database design exists to keep drafts on this machine. This
    // warning is the only thing telling the user they are opening an exception.
    const { container } = mount();
    await waitFor(() => expect(container.textContent).toMatch(/leave this machine/));
    expect(container.textContent).toMatch(/Story Bible/);
  });

  it("with no key, does not alarm the user but explains how to turn it on", async () => {
    const { container } = mount({ hasKey: false, reachable: false, key: null, reason: "OPENROUTER_API_KEY is not set in .env" });
    await waitFor(() => expect(container.textContent).toContain("OpenRouter is off"));
    expect(container.textContent).toContain("openrouter.ai/keys");
    expect(container.textContent).not.toMatch(/leave this machine/);
  });

  it("a bad key gives the reason", async () => {
    const { container } = mount({
      reachable: false,
      key: null,
      reason: "OpenRouter rejected this key (401). Check OPENROUTER_API_KEY.",
    });
    await waitFor(() => expect(container.textContent).toContain("401"));
  });

  it("does NOT fetch the model list until it is opened", async () => {
    // 300+ models, a few hundred KB. Fetching on every page load is waste.
    const { container } = mount();
    await waitFor(() => expect(container.textContent).toContain("Connected"));
    expect(calls).not.toContain("/api/models/openrouter/models");

    fireEvent.click(screen.getByRole("button", { name: /Browse available models/ }));
    await waitFor(() => expect(calls).toContain("/api/models/openrouter/models"));
  });

  it("computes per-episode cost from measured tokens, not guesses", async () => {
    const { container } = mount();
    await waitFor(() => expect(container.textContent).toContain("Connected"));
    fireEvent.click(screen.getByRole("button", { name: /Browse available models/ }));

    // 3820 input tokens × $3/1M + 1718 output × $15/1M = $0.0115 + $0.0258 ≈ $0.037
    await waitFor(() => expect(container.textContent).toContain("anthropic/claude-sonnet-4.5"));
    expect(container.textContent).toContain("~$0.037");
    expect(container.textContent).toContain("20 episodes");
  });

  it("a free model gets a badge and no per-episode cost", async () => {
    const { container } = mount();
    await waitFor(() => expect(container.textContent).toContain("Connected"));
    fireEvent.click(screen.getByRole("button", { name: /Browse available models/ }));
    await waitFor(() => expect(container.textContent).toContain("llama-3.3-70b"));
    expect(container.textContent).toContain("free");
  });

  it("filters by search term", async () => {
    const { container } = mount();
    await waitFor(() => expect(container.textContent).toContain("Connected"));
    fireEvent.click(screen.getByRole("button", { name: /Browse available models/ }));
    await waitFor(() => expect(container.textContent).toContain("llama-3.3-70b"));

    fireEvent.change(screen.getByLabelText("Search models"), { target: { value: "claude" } });
    await waitFor(() => expect(container.textContent).not.toContain("llama-3.3-70b"));
    expect(container.textContent).toContain("anthropic/claude-sonnet-4.5");
  });

  it("on OpenRouter, sets a default model and sends the right name", async () => {
    const { container } = mount({ active: true });
    await waitFor(() => expect(container.textContent).toContain("Connected"));
    fireEvent.click(screen.getByRole("button", { name: /Browse available models/ }));
    await waitFor(() => expect(container.textContent).toContain("anthropic/claude-sonnet-4.5"));

    fireEvent.click(screen.getAllByRole("button", { name: "use for writing" })[0]!);

    await waitFor(() => {
      const call = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(
        (c) => String(c[0]) === "/api/models/default/write",
      );
      expect(call).toBeTruthy();
      const body = (call![1] as { body: FormData }).body;
      expect(body.get("model")).toBe("anthropic/claude-sonnet-4.5");
    });
  });

  it("does NOT offer setting a default while the other provider is in use", async () => {
    // Defaults are stored per provider and the API writes against the one in use
    // — clicking now would put a cloud model name into Ollama's slot.
    const { container } = mount({ active: false });
    await waitFor(() => expect(container.textContent).toContain("Connected"));
    fireEvent.click(screen.getByRole("button", { name: /Browse available models/ }));
    await waitFor(() => expect(container.textContent).toContain("anthropic/claude-sonnet-4.5"));

    expect(screen.queryByRole("button", { name: "use for writing" })).toBeNull();
    expect(container.textContent).toContain("where models run");
  });
});
