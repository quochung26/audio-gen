import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderSwitch } from "./ProviderSwitch";

function mount(props: { provider: string; openRouterReady?: boolean }) {
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
  it("marks the provider in use, and only the other one gets a switch button", () => {
    const { container } = mount({ provider: "ollama" });
    expect(container.textContent).toContain("in use");
    expect(screen.getByRole("button", { name: /switch to OpenRouter/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /switch to Ollama/ })).toBeNull();
  });

  it("on OpenRouter, the switch button sits on the Ollama side", () => {
    mount({ provider: "openrouter" });
    expect(screen.getByRole("button", { name: /switch to Ollama/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /switch to OpenRouter/ })).toBeNull();
  });

  it("switching to OpenRouter ASKS FIRST, because it costs money and sends content out", async () => {
    mount({ provider: "ollama" });
    fireEvent.click(screen.getByRole("button", { name: /switch to OpenRouter/ }));

    const confirmed = (globalThis.confirm as unknown as { mock: { calls: string[][] } }).mock
      .calls[0]?.[0];
    expect(confirmed).toMatch(/sent to a cloud service/);
    expect(confirmed).toMatch(/costs money/);

    await waitFor(() => {
      const call = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
      expect(String(call![0])).toBe("/api/models/provider");
      expect((call![1] as { body: FormData }).body.get("provider")).toBe("openrouter");
    });
  });

  it("going back to Ollama does NOT ask — nothing is at stake", async () => {
    mount({ provider: "openrouter" });
    fireEvent.click(screen.getByRole("button", { name: /switch to Ollama/ }));
    expect((globalThis.confirm as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
    await waitFor(() =>
      expect((globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(1),
    );
  });

  it("does not offer the switch while OpenRouter is unreachable", () => {
    // Switching without a key kills every job on its first model call.
    const { container } = mount({ provider: "ollama", openRouterReady: false });
    expect(screen.queryByRole("button", { name: /switch to OpenRouter/ })).toBeNull();
    expect(container.textContent).toContain("Not connected");
  });

  it("on the mock provider, says plainly that no model is writing", () => {
    const { container } = mount({ provider: "mock" });
    expect(container.textContent).toContain("mock");
    // Neither side is in use, so both get a switch button.
    expect(screen.getByRole("button", { name: /switch to Ollama/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /switch to OpenRouter/ })).toBeTruthy();
  });

  it("says this is the ONLY place the provider is set", () => {
    // It used to say ".env says X; the choice here overrides it", which invited the
    // reader to go and edit `.env`. There is nothing there any more.
    const { container } = mount({ provider: "openrouter" });
    expect(container.textContent).toContain("not in");
    expect(container.textContent).toContain(".env");
  });
});
