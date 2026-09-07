/**
 * Service worker cho nghe offline.
 *
 * Two separate stores, deliberately:
 * - SHELL: the app shell (HTML, JS, CSS). Freely disposable, a reload brings it back.
 * - AUDIO: MP3 files the user DELIBERATELY downloaded. NEVER swept — someone downloads
 *   before a night bus, and losing it loses that journey.
 *
 * Playback never caches audio on its own: a 20-minute episode is ~25 MB, and quietly
 * caching a whole story would eat the device's storage without the user knowing.
 */
const SHELL = "audio-truyen-shell-v1";
const AUDIO = "audio-truyen-audio-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      // Sweep old shell versions, KEEPING the audio store.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("audio-truyen-shell-") && k !== SHELL).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Audio files: served from cache only when the user downloaded them. Otherwise it goes
  // to the network as normal and does NOT cache the result.
  if (url.pathname === "/api/audio") {
    e.respondWith(
      (async () => {
        const cached = await caches.match(audioKey(url));
        return cached ?? fetch(req);
      })(),
    );
    return;
  }

  // The app shell: network first so new episodes always show, falling back to cache offline.
  e.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res.ok && res.status === 200) {
          const cache = await caches.open(SHELL);
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        throw err;
      }
    })(),
  );
});

/**
 * The cache key drops every parameter but `key`/`path`.
 *
 * The browser sends `Range` along and sometimes adds parameters when seeking, so using the
 * whole URL as the key makes the second seek look like nothing was downloaded.
 */
function audioKey(url) {
  const clean = new URL(url.origin + url.pathname);
  const ref = url.searchParams.get("key") ?? url.searchParams.get("path");
  if (ref) clean.searchParams.set("key", ref);
  return clean.toString();
}

// The page calls down here to download an episode; progress is reported back up.
self.addEventListener("message", (e) => {
  const { type, url } = e.data ?? {};
  if (type === "download") e.waitUntil(download(url, e.source));
  if (type === "remove") e.waitUntil(remove(url, e.source));
});

async function download(url, client) {
  const cache = await caches.open(AUDIO);
  const key = audioKey(new URL(url, self.location.origin));
  try {
    // Not `cache.add`: progress reporting needs to read chunk by chunk, and it has to be
    // certain the WHOLE file is downloaded rather than a byte range.
    const res = await fetch(key);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await cache.put(key, res.clone());
    client?.postMessage({ type: "downloaded", url: key });
  } catch (err) {
    client?.postMessage({ type: "download-failed", url: key, error: String(err) });
  }
}

async function remove(url, client) {
  const cache = await caches.open(AUDIO);
  const key = audioKey(new URL(url, self.location.origin));
  await cache.delete(key);
  client?.postMessage({ type: "removed", url: key });
}
