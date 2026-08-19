/**
 * Khoá cache cho một file audio.
 *
 * Bỏ mọi tham số trừ `key`/`path`: trình duyệt gửi kèm `Range` và đôi khi thêm
 * tham số khi tua, nên lấy nguyên URL làm khoá thì lần tua thứ hai coi như chưa
 * tải về.
 *
 * ⚠️ `public/sw.js` có bản sao của hàm này (`audioKey`) vì service worker không
 * import được module của app. Sửa một bên PHẢI sửa bên kia — lệch nhau thì tải
 * xong vẫn báo chưa tải, và không có gì báo lỗi.
 */
export function audioCacheKey(src: string, origin: string): string {
  const url = new URL(src, origin);
  const clean = new URL(url.origin + url.pathname);
  const ref = url.searchParams.get("key") ?? url.searchParams.get("path");
  if (ref) clean.searchParams.set("key", ref);
  return clean.toString();
}
