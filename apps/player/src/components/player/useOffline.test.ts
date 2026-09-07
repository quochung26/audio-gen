import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOffline } from "./useOffline";

/**
 * The offline-download state machine.
 *
 * It cannot be checked by opening the page: the cache state is only knowable in the
 * browser, so the server-rendered HTML never has the button. This is the only place it can
 * be tested.
 */

const SRC = "/api/audio?key=series%2Fa%2Fb.mp3";
const KEY = "http://localhost:3000/api/audio?key=series%2Fa%2Fb.mp3";

let cacheHas: boolean;
let posted: Array<{ type: string; url: string }>;
let listeners: Array<(e: MessageEvent) => void>;

function stubBrowser(withServiceWorker = true) {
  posted = [];
  listeners = [];
  const active = { postMessage: (m: { type: string; url: string }) => posted.push(m) };

  if (!withServiceWorker) {
    vi.stubGlobal("navigator", {});
    return;
  }
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn(() => Promise.resolve()),
      ready: Promise.resolve({ active }),
      addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
      removeEventListener: (_: string, fn: (e: MessageEvent) => void) => {
        listeners = listeners.filter((f) => f !== fn);
      },
    },
  });
  vi.stubGlobal("caches", {
    open: vi.fn(() =>
      Promise.resolve({ match: vi.fn(() => Promise.resolve(cacheHas ? {} : undefined)) }),
    ),
  });
}

const fromWorker = (data: unknown) => act(() => listeners.forEach((fn) => fn({ data } as MessageEvent)));

beforeEach(() => {
  cacheHas = false;
  stubBrowser();
});
afterEach(() => vi.unstubAllGlobals());

describe("useOffline", () => {
  it("not downloaded reports absent", async () => {
    const { result } = renderHook(() => useOffline(SRC));
    await waitFor(() => expect(result.current.state).toBe("absent"));
  });

  it("already cached reports ready immediately", async () => {
    cacheHas = true;
    const { result } = renderHook(() => useOffline(SRC));
    await waitFor(() => expect(result.current.state).toBe("ready"));
  });

  it("a device without service workers reports no-support, never hanging on unknown", async () => {
    stubBrowser(false);
    const { result } = renderHook(() => useOffline(SRC));
    await waitFor(() => expect(result.current.state).toBe("no-support"));
  });

  it("downloading sends the RIGHT key to the service worker", async () => {
    const { result } = renderHook(() => useOffline(SRC));
    await waitFor(() => expect(result.current.state).toBe("absent"));

    act(() => result.current.download());
    expect(result.current.state).toBe("downloading");
    // The key has to match how the service worker normalises it; out of sync, a completed
    // download still reports as not downloaded.
    await waitFor(() => expect(posted).toEqual([{ type: "download", url: KEY }]));
  });

  it("the service worker reporting done moves it to ready", async () => {
    const { result } = renderHook(() => useOffline(SRC));
    await waitFor(() => expect(result.current.state).toBe("absent"));
    act(() => result.current.download());

    await fromWorker({ type: "downloaded", url: KEY });
    expect(result.current.state).toBe("ready");
  });

  it("a failed download reports why and does NOT stick on downloading", async () => {
    const { result } = renderHook(() => useOffline(SRC));
    await waitFor(() => expect(result.current.state).toBe("absent"));
    act(() => result.current.download());

    await fromWorker({ type: "download-failed", url: KEY, error: "mất mạng" });
    expect(result.current.state).toBe("failed");
    expect(result.current.error).toBe("mất mạng");
  });

  it("IGNORES messages about another episode", async () => {
    // With several tabs open the service worker broadcasts to all of them.
    const { result } = renderHook(() => useOffline(SRC));
    await waitFor(() => expect(result.current.state).toBe("absent"));
    act(() => result.current.download());

    await fromWorker({ type: "downloaded", url: "http://localhost:3000/api/audio?key=khac.mp3" });
    expect(result.current.state).toBe("downloading");
  });

  it("removing sends the remove command and returns to absent", async () => {
    cacheHas = true;
    const { result } = renderHook(() => useOffline(SRC));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    act(() => result.current.remove());
    await waitFor(() => expect(posted).toEqual([{ type: "remove", url: KEY }]));

    await fromWorker({ type: "removed", url: KEY });
    expect(result.current.state).toBe("absent");
  });
});
