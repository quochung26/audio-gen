/**
 * The cast the writer picks BEFORE the outline is built.
 *
 * The same role as `WorldSetup`: the writer's decision, which the AI has to
 * follow rather than invent around. It differs in not being stored in
 * `Series.storyBible` — once the outline is built each member becomes a real
 * `Character` row, because from then on they carry state along the story's arc.
 */
export interface CastMember {
  name: string;
  /** The character card used, if any. Carried only to record where they came from. */
  cardId?: string | null;
  role?: string | null;
  description?: string | null;
  /** Speech: rhythm, verbal habits, forms of address. Steers dialogue. */
  speech?: string | null;
  /** Their usual outfit. A default — chapter and scene can override it. */
  outfit?: string | null;
  /** Appearance: build, apparent age, how they dress. */
  appearance?: string | null;
  /** A voice hint for casting. */
  voiceHint?: string | null;
  isNarrator?: boolean;
}

/** Drop empty entries and de-duplicate names — the name is the `(seriesId, name)` key. */
export function normalizeCast(cast: readonly CastMember[]): CastMember[] {
  const seen = new Set<string>();
  const out: CastMember[] = [];

  for (const c of cast) {
    const name = (c.name ?? "").trim().replace(/\s+/g, " ");
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      name,
      cardId: c.cardId ?? null,
      role: c.role?.trim() || null,
      description: c.description?.trim() || null,
      speech: c.speech?.trim() || null,
      outfit: c.outfit?.trim() || null,
      appearance: c.appearance?.trim() || null,
      voiceHint: c.voiceHint?.trim() || null,
      // Exactly ONE narrator: the first one flagged wins, the rest are cleared. With
      // two, the audio edit step can assign narration blocks to either, and the
      // voice changes mid-story with nothing to say so.
      isNarrator: Boolean(c.isNarrator) && !out.some((p) => p.isNarrator),
    });
  }

  return out;
}

/**
 * Render the cast as a passage for the OUTLINE prompt.
 *
 * Empty returns an empty string, exactly like `renderWorldForOutline`: the prompt
 * stays valid and the model invents characters as it used to.
 */
export function renderCastForOutline(cast: readonly CastMember[]): string {
  const people = normalizeCast(cast);
  if (people.length === 0) return "";

  const parts: string[] = [
    "## The cast is already chosen — you MUST use these characters",
    "Use them exactly as given: same names, same roles, same personalities. Do not rename them, do not merge two of them, do not swap who is who.",
    "",
  ];

  for (const c of people) {
    parts.push(`- ${c.name}${c.role ? ` — ${c.role}` : ""}`);
    if (c.description) parts.push(`  ${c.description}`);
    if (c.speech) parts.push(`  Speech: ${c.speech}`);
    if (c.appearance) parts.push(`  Appearance: ${c.appearance}`);
    if (c.outfit) parts.push(`  Usually wears: ${c.outfit}`);
    if (c.voiceHint) parts.push(`  Voice: ${c.voiceHint}`);
  }

  parts.push(
    "",
    "Return every character above in `characters`, with these exact names, and NOBODY ELSE.",
    "The list is complete. A beat may still need a bus conductor or a passer-by — leave them nameless in the beat and out of `characters`.",
  );

  return parts.join("\n");
}

/**
 * Merge the writer's cast with the one the model returns.
 *
 * The writer WINS: the model is told to keep names and roles as given, and it
 * changes them anyway, and what the writer typed is what is right. Only the fields
 * the writer LEFT BLANK take the model's suggestion — pick a card with just a name
 * and you still get a role and a voice hint, instead of blanks to fill in by hand.
 *
 * Characters the model adds on top are DROPPED. Having configured the cast, the
 * writer has said who is in the story; every extra the model returns is one more
 * `Character` row to delete by hand, and it goes into the Story Bible, so the next
 * scene write treats it as part of the story. Choosing nobody is unchanged — the
 * model's cast is then the whole cast.
 *
 * Does NOT assign a narrator. The narrator is a casting slot for the audio step —
 * which voice reads the narration — not an outlining decision, and the audio step
 * may never run at all. With nobody flagged, there is no narrator, and narration
 * is read in the story's default voice.
 *
 * An earlier version just picked the first one. Who comes first depends on the
 * order the model returned, so a whole story could end up narrated by a young
 * woman's voice without anyone deciding that. The prose is third person too, so
 * calling a character "the narrator" also pushes the model toward them telling it.
 */
export function mergeCast(
  chosen: readonly CastMember[],
  generated: readonly CastMember[],
): CastMember[] {
  const extra = normalizeCast(generated);
  const byName = new Map(extra.map((c) => [c.name.toLowerCase(), c]));

  // Normalized FIRST, so "nobody chosen" means what it says: a cast of nothing but
  // blank names is nobody, and the model's cast has to stand in for it.
  const picked = normalizeCast(chosen);

  const filled = picked.map((c) => {
    const g = byName.get(c.name.toLowerCase());
    if (!g) return c;
    return {
      ...c,
      role: c.role?.trim() || g.role,
      speech: c.speech?.trim() || g.speech,
      outfit: c.outfit?.trim() || g.outfit,
      appearance: c.appearance?.trim() || g.appearance,
      voiceHint: c.voiceHint?.trim() || g.voiceHint,
    };
  });

  // Nobody chosen — the model invented the cast and it is the whole cast.
  if (filled.length === 0) return extra;

  // Chosen — the list is closed, whatever the model returned on top.
  return filled;
}

/**
 * Work out which characters a beat mentions.
 *
 * Used to guess who is present in a scene, rather than making the writer tick
 * boxes per scene. Guessing SHORT is fine — an empty `Scene.characterIds` means
 * "not known" and the Bible loads in full as before. Guessing LONG is the risk, so
 * it only matches a name appearing whole, never trimmed.
 *
 * Longer names are tested first: with "ông Bảy" in the cast, a beat mentioning
 * "ông Bảy" has to resolve to them and not to some other "Bảy".
 */
export function namesMentionedIn(text: string, names: readonly string[]): string[] {
  const haystack = text.toLowerCase();
  return [...names]
    .sort((a, b) => b.length - a.length)
    .filter((n) => {
      const needle = n.trim().toLowerCase();
      return needle.length > 0 && haystack.includes(needle);
    });
}
