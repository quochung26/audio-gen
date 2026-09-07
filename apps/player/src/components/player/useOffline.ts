"use client";

import { useCallback, useEffect, useState } from "react";
import { audioCacheKey } from "@/lib/cache-key";

export type OfflineState = "unknown" | "no-support" | "absent" | "downloading" | "ready" | "failed";

/**
 * Download an episode to the device for offline listening.
 *
 * The download is done by the service worker rather than this tab: closing the tab midway
 * still completes the file, and the cache belongs to the service worker so any page opened
 * later sees it.
 *
 * `absent` differs from `no-support`: an unsupported device hides the button to reduce
 * clutter, while not-yet-downloaded shows it.
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
        setError(String(d.error ?? "unknown"));
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
      // `reg.active` rather than `controller`: on the first registration the current tab is
      // not yet controlled by the service worker and `controller` is still null.
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
