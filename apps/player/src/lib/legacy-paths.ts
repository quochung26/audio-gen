/**
 * The Vietnamese URL vocabulary the player shipped with, and what replaced it.
 *
 * These have to keep resolving FOREVER, not for a deprecation window: podcast apps store
 * the feed URL they were handed and re-fetch it for years, listeners bookmark episodes, and
 * neither can be reached to update. A permanent redirect is the only thing that moves them
 * across — most podcast clients follow it and rewrite what they have stored.
 *
 * Split out of the middleware so it can be tested: matching URL prefixes is exactly the
 * kind of code that looks obviously right and eats a story slug called `truyen-ma`.
 */

/** Ordered longest-first, so a shorter entry cannot swallow a longer one. */
const RENAMED_PATHS: ReadonlyArray<readonly [string, string]> = [
  ["/yeu-thich", "/favourites"],
  ["/dang-nhap", "/sign-in"],
  ["/dang-ky", "/sign-up"],
  ["/truyen", "/story"],
  ["/nghe", "/listen"],
];

/** Query parameters renamed alongside the paths. Shared links carry these. */
export const RENAMED_PARAMS: ReadonlyArray<readonly [string, string]> = [
  ["the-loai", "genre"],
  ["tieng", "lang"],
];

/**
 * The new address for an old path, or null when nothing needs moving.
 *
 * Matches on WHOLE SEGMENTS: `/truyen` and `/truyen/x` move, `/truyen-ma` does not. A story
 * slugged `truyen-ma` is a perfectly ordinary thing to publish, and a prefix match would
 * quietly redirect it to `/story-ma`, which exists nowhere.
 */
export function renamedPath(pathname: string): string | null {
  for (const [from, to] of RENAMED_PATHS) {
    if (pathname === from || pathname.startsWith(`${from}/`)) {
      return to + pathname.slice(from.length);
    }
  }
  return null;
}

/**
 * Rename any old parameters in a query string.
 *
 * Returns null when there was nothing to rename, so the caller can tell "no change" from
 * "changed to an empty query" without comparing strings.
 */
export function renamedQuery(search: string): string | null {
  const params = new URLSearchParams(search);
  const found = RENAMED_PARAMS.filter(([from]) => params.has(from));
  if (found.length === 0) return null;

  for (const [from, to] of found) {
    params.set(to, params.get(from)!);
    params.delete(from);
  }
  return params.toString();
}
