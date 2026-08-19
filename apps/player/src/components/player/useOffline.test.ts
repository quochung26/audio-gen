import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOffline } from "./useOffline";

/**
 * Máy trạng thái tải-về-nghe-offline.
 *
 * Không thể kiểm bằng cách mở trang: trạng thái cache chỉ biết được ở trình
 * duyệt, nên HTML render sẵn luôn không có nút. Đây là chỗ duy nhất kiểm được.
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
  it("chưa tải thì báo absent", async () => {
    const { result } = renderHook(() => useOffline(SRC));
    await waitFor(() => expect(result.current.state).toBe("absent"));
  });

  it("đã có trong cache thì báo ready ngay", async () => {
    cacheHas = true;
    const { result } = renderHook(() => useOffline(SRC));
    await waitFor(() => expect(result.current.state).toBe("ready"));
  });

  it("máy không hỗ trợ service worker thì báo no-support, KHÔNG treo ở unknown", async () => {
    stubBrowser(false);
    const { result } = renderHook(() => useOffline(SRC));
    await waitFor(() => expect(result.current.state).toBe("no-support"));
  });

  it("tải thì gửi ĐÚNG khoá cho service worker", async () => {
    const { result } = renderHook(() => useOffline(SRC));
    await waitFor(() => expect(result.current.state).toBe("absent"));

    act(() => result.current.download());
    expect(result.current.state).toBe("downloading");
    // Khoá phải trùng cách service worker chuẩn hoá, lệch là tải xong vẫn báo
    // chưa tải.
    await waitFor(() => expect(posted).toEqual([{ type: "download", url: KEY }]));
  });

  it("service worker báo xong thì sang ready", async () => {
    const { result } = renderHook(() => useOffline(SRC));
    await waitFor(() => expect(result.current.state).toBe("absent"));
    act(() => result.current.download());

    await fromWorker({ type: "downloaded", url: KEY });
    expect(result.current.state).toBe("ready");
  });

  it("tải hỏng thì báo lý do và KHÔNG kẹt ở downloading", async () => {
    const { result } = renderHook(() => useOffline(SRC));
    await waitFor(() => expect(result.current.state).toBe("absent"));
    act(() => result.current.download());

    await fromWorker({ type: "download-failed", url: KEY, error: "mất mạng" });
    expect(result.current.state).toBe("failed");
    expect(result.current.error).toBe("mất mạng");
  });

  it("BỎ QUA thông báo của tập khác", async () => {
    // Mở nhiều tab thì service worker phát cho mọi tab.
    const { result } = renderHook(() => useOffline(SRC));
    await waitFor(() => expect(result.current.state).toBe("absent"));
    act(() => result.current.download());

    await fromWorker({ type: "downloaded", url: "http://localhost:3000/api/audio?key=khac.mp3" });
    expect(result.current.state).toBe("downloading");
  });

  it("xoá thì gửi lệnh remove và quay về absent", async () => {
    cacheHas = true;
    const { result } = renderHook(() => useOffline(SRC));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    act(() => result.current.remove());
    await waitFor(() => expect(posted).toEqual([{ type: "remove", url: KEY }]));

    await fromWorker({ type: "removed", url: KEY });
    expect(result.current.state).toBe("absent");
  });
});
