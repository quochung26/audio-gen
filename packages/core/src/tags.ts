/**
 * A story's sub-genres — "tình cảm", "hành động", "slow burn", "đô thị"…
 *
 * A story has several genres; they only differ in which is primary. The primary
 * one lives in `Series.genre` and is a SINGLE value because it keys prompt variant
 * selection. The rest live here: many values, no effect on prompts, going straight
 * into the Story Bible to steer the prose — and into the RSS keywords so listeners
 * can find the channel.
 */

/** More than this stops being direction and becomes keyword stuffing. */
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 40;

/**
 * Parse tags from a comma-separated string the user typed.
 *
 * De-duplicates CASE-INSENSITIVELY but keeps the first spelling: someone typing
 * "Romance" and "romance" means one thing, and putting both in the Bible makes the
 * model read two different directions.
 */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of input.split(",")) {
    // Collapse extra whitespace: "slow   burn" and "slow burn" are the same.
    const tag = raw.trim().replace(/\s+/g, " ");
    if (!tag) continue;
    if (tag.length > MAX_TAG_LENGTH) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** Validate before saving — returns problems rather than throwing, so the form can show them inline. */
export function checkTags(input: string): string[] {
  const errors: string[] = [];
  const pieces = input.split(",").map((p) => p.trim().replace(/\s+/g, " ")).filter(Boolean);

  const tooLong = pieces.filter((p) => p.length > MAX_TAG_LENGTH);
  if (tooLong.length > 0) {
    errors.push(`Tag too long (max ${MAX_TAG_LENGTH} characters): "${tooLong[0]!.slice(0, 50)}…"`);
  }

  // Counted over the tags that are STILL VALID. Counting the over-long ones too
  // would let one long tag also trigger "at most 12 tags" — two complaints for one
  // mistake, and the second one wrong.
  const unique = new Set(
    pieces.filter((p) => p.length <= MAX_TAG_LENGTH).map((p) => p.toLowerCase()),
  );
  if (unique.size > MAX_TAGS) errors.push(`At most ${MAX_TAGS} tags.`);
  return errors;
}

/**
 * The sub-genre line for the Story Bible.
 *
 * Says outright that these are to be FOLLOWED, not classification labels — listed
 * bare, the model treats them as metadata and ignores them, and the prose comes out
 * exactly as if nothing had been set.
 */
export function renderTags(tags: string[]): string | null {
  if (tags.length === 0) return null;
  return `Sub-genres: ${tags.join(", ")}. The tone and the events must follow these too, not only the main genre.`;
}
