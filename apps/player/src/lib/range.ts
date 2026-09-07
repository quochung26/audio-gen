export interface ByteRange {
  /** The first byte index, counting from 0. */
  start: number;
  /** The last byte index, INCLUSIVE (RFC 9110 uses closed ranges). */
  end: number;
}

/**
 * Parse the `Range` header for a file of `size` bytes.
 *
 * Returns:
 * - `null` — no Range, or an unparseable one → serve the whole file (200).
 *   RFC 9110 allows ignoring a Range it does not understand, and doing so is safer than
 *   raising an error.
 * - `"unsatisfiable"` — a valid Range that falls outside the file → 416.
 * - `ByteRange` — the range to return, clamped into [0, size-1].
 *
 * Supports ONE range only. Multiple ranges (`bytes=0-99,200-299`) would require
 * multipart/byteranges — no audio client needs it, so those fall through to 200.
 */
export function parseRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
  if (!header) return null;

  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;

  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;

  // An empty file: every range is unsatisfiable.
  if (size === 0) return "unsatisfiable";

  let start: number;
  let end: number;

  if (rawStart === "") {
    // "bytes=-500" = the LAST 500 bytes, not 0 through 500.
    const suffix = Number(rawEnd);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    if (start >= size) return "unsatisfiable";
    // A missing end ("bytes=100-") means to the end of the file.
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }

  if (end < start) return "unsatisfiable";
  return { start, end };
}
