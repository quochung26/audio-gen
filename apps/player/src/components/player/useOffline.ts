"use client";

import { useCallback, useEffect, useState } from "react";
import { audioCacheKey } from "@/lib/cache-key";

export type OfflineState = "unknown" | "no-support" | "absent" | "downloading" | "ready" | "failed";

/**
 * Tải một tập về máy để nghe khi mất mạng.
 *
 * Việc tải do service worker làm chứ không phải tab này: đóng tab giữa chừng
 * thì file tải dở vẫn hoàn tất, và cache là của service worker nên trang nào
 * mở sau cũng thấy.
 *
 * `absent` khác `no-support`: máy không hỗ trợ thì ẩn nút đi cho đỡ rối, chưa
 * tải thì hiện nút.
 */
export function useOffline(src: string) {
  const [state, setState] = useState<OfflineState>("unknown");
  const [error, setError] = useState<string | null>(null);

  const key = normalize(src);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !("caches" in window)) {
      setState("no-support");
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => setState("no-support"));

    let alive = true;
    void caches.open("audio-truyen-audio-v1").then(async (cache) => {
      const hit = await cache.match(key);
      if (alive) setState(hit ? "ready" : "absent");
    });

    function onMessage(e: MessageEvent) {
      const d = e.data ?? {};
      if (d.url !== key) return;
      if (d.type === "downloaded") setState("ready");
      if (d.type === "removed") setState("absent");
      if (d.type === "download-failed") {
        setState("failed");
        setError(String(d.error ?? "không rõ"));
      }
    }
    navigator.serviceWorker.addEventListener("message", onMessage);

    return () => {
      alive = false;
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [key]);

  const send = useCallback(
    async (type: "download" | "remove") => {
      const reg = await navigator.serviceWorker.ready;
      // `reg.active` chứ không phải `controller`: lần đầu đăng ký thì tab hiện
      // tại chưa bị service worker kiểm soát, `controller` còn null.
      reg.active?.postMessage({ type, url: key });
    },
    [key],
  );

  return {
    state,
    error,
    download: () => {
      setError(null);
      setState("downloading");
      void send("download");
    },
    remove: () => void send("remove"),
  };
}

function normalize(src: string): string {
  if (typeof window === "undefined") return src;
  return audioCacheKey(src, window.location.origin);
}
