/**
 * Service worker cho nghe offline.
 *
 * Hai kho tách nhau, có chủ đích:
 * - SHELL: vỏ app (HTML, JS, CSS). Xoá được thoải mái, tải lại là có.
 * - AUDIO: file MP3 người dùng CHỦ ĐỘNG tải về. KHÔNG bao giờ tự dọn — người
 *   ta tải trước chuyến xe đêm, mất là mất chuyến đó.
 *
 * Không tự cache audio khi phát: một tập 20 phút là ~25 MB, cache lén cả bộ là
 * ăn hết dung lượng máy mà người dùng không hề biết.
 */
const SHELL = "audio-truyen-shell-v1";
const AUDIO = "audio-truyen-audio-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      // Dọn phiên bản shell cũ, GIỮ kho audio.
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

  // File audio: chỉ trả từ cache nếu người dùng đã tải về. Không có thì đi mạng
  // như bình thường và KHÔNG cache lại.
  if (url.pathname === "/api/audio") {
    e.respondWith(
      (async () => {
        const cached = await caches.match(audioKey(url));
        return cached ?? fetch(req);
      })(),
    );
    return;
  }

  // Vỏ app: ưu tiên mạng để luôn thấy tập mới, mất mạng thì rơi về cache.
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
 * Khoá cache bỏ mọi tham số trừ `key`/`path`.
 *
 * Trình duyệt gửi kèm `Range` và đôi khi thêm tham số khi tua, nên nếu lấy
 * nguyên URL làm khoá thì lần tua thứ hai coi như chưa tải.
 */
function audioKey(url) {
  const clean = new URL(url.origin + url.pathname);
  const ref = url.searchParams.get("key") ?? url.searchParams.get("path");
  if (ref) clean.searchParams.set("key", ref);
  return clean.toString();
}

// Trang gọi xuống để tải một tập về; trả tiến độ ngược lên.
self.addEventListener("message", (e) => {
  const { type, url } = e.data ?? {};
  if (type === "download") e.waitUntil(download(url, e.source));
  if (type === "remove") e.waitUntil(remove(url, e.source));
});

async function download(url, client) {
  const cache = await caches.open(AUDIO);
  const key = audioKey(new URL(url, self.location.origin));
  try {
    // Không dùng `cache.add`: cần đọc từng phần để báo tiến độ, và cần chắc
    // chắn tải TRỌN file chứ không phải một khoảng byte.
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
