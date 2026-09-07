export interface ByteRange {
  /** First byte index, zero-based. */
  start: number;
  /** Last byte index, INCLUSIVE (RFC 9110 uses closed ranges). */
  end: number;
}

/**
 * Parse the `Range` header for a file of `size` bytes.
 *
 * Returns:
 * - `null` — no Range, or a form we do not understand → serve the whole file
 *   (200). RFC 9110 allows ignoring a Range we cannot parse, and doing so is
 *   safer than erroring.
 * - `"unsatisfiable"` — a valid Range that falls outside the file → 416.
 * - `ByteRange` — the range to serve, already clamped to [0, size-1].
 *
 * Supports ONE range only. Multiple ranges (`bytes=0-99,200-299`) would need a
 * multipart/byteranges response — no audio client has asked, so they degrade
 * to 200.
 */
export function parseRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
  if (!header) return null;

  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;

  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;

  // Empty file: every range is unsatisfiable.
  if (size === 0) return "unsatisfiable";

  let start: number;
  let end: number;

  if (rawStart === "") {
    // "bytes=-500" means the LAST 500 bytes, not 0 through 500.
    const suffix = Number(rawEnd);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    if (start >= size) return "unsatisfiable";
    // A missing end ("bytes=100-") means through to the end of the file.
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }

  if (end < start) return "unsatisfiable";
  return { start, end };
}
