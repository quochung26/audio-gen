/**
 * Find a selected passage inside the text it was selected from.
 *
 * Harder than `indexOf`, for two reasons that only appear once a selection crosses a
 * paragraph break — which is why it worked in testing and failed in use.
 *
 * `multipart/form-data` NORMALISES newlines to CRLF. The browser measured the selection
 * against a string containing "\n"; what reaches the server contains "\r\n", so a
 * single-line passage matched and anything spanning a blank line did not.
 *
 * And `Selection.toString()` does not promise the source's whitespace back. Browsers
 * differ on what a paragraph gap becomes, so an exact match can fail on the gaps alone
 * while every word is right.
 */

export interface PassageRange {
  start: number;
  end: number;
}

/** CRLF and lone CR to LF. Everything below compares in this form. */
function normalise(s: string): string {
  return s.replace(/\r\n?/g, "\n");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Where the passage sits in the text, or null when it cannot be placed.
 *
 * `hint` is where the browser said the selection started. It only breaks ties: a short
 * passage can occur twice and the writer selected ONE of them. It is never trusted on
 * its own, because any edit between selecting and running moves it.
 *
 * Returns null rather than a guess when the passage appears more than once and the hint
 * does not pick one. A wrong splice cannot be undone.
 */
export function findPassage(text: string, passage: string, hint?: number): PassageRange | null {
  const t = normalise(text);
  const p = normalise(passage).trim();
  if (!p) return null;

  const exact = allIndexes(t, p);
  const chosen = pick(exact, p.length, hint);
  if (chosen) return chosen;

  // Nothing exact: try again treating every run of whitespace as interchangeable, which
  // is the one thing the browser is allowed to hand back differently.
  const loose = new RegExp(
    p.split(/\s+/).map(escapeRegExp).join("\\s+"),
    "g",
  );
  const found: Array<PassageRange> = [];
  for (const m of t.matchAll(loose)) {
    found.push({ start: m.index, end: m.index + m[0].length });
    if (found.length > 8) break; // too common to be a selection; let the caller fail
  }
  if (found.length === 1) return found[0]!;
  if (hint !== undefined && hint >= 0) {
    const near = found
      .map((r) => ({ r, d: Math.abs(r.start - hint) }))
      .sort((a, b) => a.d - b.d)[0];
    // Within a paragraph or so of where the browser said. Further than that and the
    // hint is describing different text.
    if (near && near.d <= 400) return near.r;
  }
  return null;
}

function allIndexes(text: string, needle: string): number[] {
  const out: number[] = [];
  for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) out.push(i);
  return out;
}

function pick(starts: number[], length: number, hint?: number): PassageRange | null {
  if (starts.length === 0) return null;
  if (starts.length === 1) return { start: starts[0]!, end: starts[0]! + length };
  if (hint === undefined || hint < 0) return null;
  const best = starts
    .map((s) => ({ s, d: Math.abs(s - hint) }))
    .sort((a, b) => a.d - b.d)[0]!;
  return { start: best.s, end: best.s + length };
}

/** Replace the passage, keeping everything else byte for byte. */
export function splicePassage(text: string, at: PassageRange, replacement: string): string {
  return normalise(text).slice(0, at.start) + replacement + normalise(text).slice(at.end);
}

/**
 * Every place a passage occurs, in order.
 *
 * `findPassage` answers "which one did the reader mean", and refuses when it cannot
 * tell — right for a selection made in a browser, where guessing lands the replacement
 * in the wrong paragraph. But a caller working down a list has no reader to have meant
 * anything: it wants the occurrences themselves, so it can take the first one nothing
 * else has claimed.
 *
 * Same two-pass matching as `findPassage` — exact first, then treating runs of
 * whitespace as interchangeable — so the two agree about what counts as an occurrence.
 */
export function passageOccurrences(text: string, passage: string): PassageRange[] {
  const t = normalise(text);
  const p = normalise(passage).trim();
  if (!p) return [];

  const exact = allIndexes(t, p).map((start) => ({ start, end: start + p.length }));
  if (exact.length > 0) return exact;

  const loose = new RegExp(p.split(/\s+/).map(escapeRegExp).join("\\s+"), "g");
  const found: PassageRange[] = [];
  for (const m of t.matchAll(loose)) {
    found.push({ start: m.index, end: m.index + m[0].length });
    if (found.length > 8) return []; // too common to be a passage
  }
  return found;
}
