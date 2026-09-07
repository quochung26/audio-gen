/**
 * The cache key for one audio file.
 *
 * Drops every parameter but `key`/`path`: the browser sends `Range` along and sometimes
 * adds parameters when seeking, so using the whole URL as the key makes the second seek
 * look like nothing was downloaded.
 *
 * ⚠️ `public/sw.js` carries a copy of this function (`audioKey`) because a service worker
 * cannot import the app's modules. Change one and you MUST change the other — out of sync,
 * a completed download still reports as not downloaded, with no error to say so.
 */
export function audioCacheKey(src: string, origin: string): string {
  const url = new URL(src, origin);
  const clean = new URL(url.origin + url.pathname);
  const ref = url.searchParams.get("key") ?? url.searchParams.get("path");
  if (ref) clean.searchParams.set("key", ref);
  return clean.toString();
}
