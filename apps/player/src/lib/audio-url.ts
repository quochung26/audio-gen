/**
 * URL phát được trong trình duyệt.
 *
 * Driver lưu trữ local trả `file://` — trình duyệt không phát được, nên đi qua
 * route phục vụ file. Driver R2 trả URL công khai thì dùng thẳng.
 */
export function playableUrl(url: string): string {
  if (url.startsWith("file://")) {
    return `/api/audio?path=${encodeURIComponent(url.slice("file://".length))}`;
  }
  return url;
}
