/**
 * A URL the browser can play.
 *
 * The DB stores the store KEY, not an absolute path — so renaming the project directory or
 * moving machines breaks no reference.
 *
 * - `http(s)://…` → an external source (R2), used as is
 * - `file:///…`   → old data; goes through the route with a `path` parameter.
 *                   Run `pnpm fix:storage-refs` to clean it up.
 * - anything else → a store key, going through the route with a `key` parameter
 *
 * IDEMPOTENT. A reference is often prepared on the server and then handed to a component
 * that prepares it again — the mini player's cover is exactly that — and running it twice
 * used to encode the route into its own query string, producing a 404 that looked like
 * missing artwork rather than a bug.
 *
 * A PURE function that imports nothing from Node — a client component can call it.
 * The storage root lives in `storage-root.ts`, server-side only.
 */
export function playableUrl(ref: string): string {
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
  if (ref.startsWith(`${ROUTE}?`)) return ref;
  const param = ref.startsWith("file://")
    ? `path=${encodeURIComponent(ref.slice("file://".length))}`
    : `key=${encodeURIComponent(ref)}`;
  return `${ROUTE}?${param}`;
}

const ROUTE = "/api/audio";
