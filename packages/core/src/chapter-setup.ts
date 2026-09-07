import { z } from "zod";

/**
 * An override for one character, scoped tighter than the Story Bible.
 *
 * The Bible describes them IN GENERAL — what holds for the whole story. But some
 * things are only true for one chapter: what they are wearing today, the bandaged
 * hand, the false identity. Putting those in the Bible pins them across 40
 * episodes; leaving them out entirely makes the model invent them per scene.
 */
export const characterOverrideSchema = z.object({
  /** Matches `Character.name`. Compared case-insensitively. */
  name: z.string(),
  /** What they are wearing. The most frequently changed thing, hence its own field. */
  outfit: z.string().default(""),
  /** Everything else: injured, in disguise, just had a row. */
  note: z.string().default(""),
});

export type CharacterOverride = z.infer<typeof characterOverrideSchema>;

/**
 * Setup for ONE chapter — the middle tier between `WorldSetup` and `Scene.beat`.
 *
 * Before it existed this tier was simply missing: a story had world setup, a scene
 * had a beat, and a chapter could carry nothing. Wanting a whole chapter to slow
 * down, or to converge on one question, meant copying that sentence into each beat.
 */
export const chapterSetupSchema = z.object({
  /** What this chapter is driving at — the question it has to answer. */
  focus: z.string().default(""),
  /** This chapter's own voice, over the top of the story's. */
  tone: z.string().default(""),
  /** What has to happen in the chapter. */
  mustHappen: z.array(z.string()).default([]),
  /** What is forbidden in this chapter. */
  constraints: z.array(z.string()).default([]),
  characters: z.array(characterOverrideSchema).default([]),
});

export type ChapterSetup = z.infer<typeof chapterSetupSchema>;

/** Setup for one SCENE. Tighter than a chapter, and it overrides the chapter. */
export const sceneSetupSchema = z.object({
  /** Notes for this scene alone. */
  note: z.string().default(""),
  characters: z.array(characterOverrideSchema).default([]),
});

export type SceneSetup = z.infer<typeof sceneSetupSchema>;

export const EMPTY_CHAPTER_SETUP: ChapterSetup = {
  focus: "",
  tone: "",
  mustHappen: [],
  constraints: [],
  characters: [],
};

export const EMPTY_SCENE_SETUP: SceneSetup = { note: "", characters: [] };

export function parseChapterSetup(value: unknown): ChapterSetup {
  const parsed = chapterSetupSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...EMPTY_CHAPTER_SETUP };
}

export function parseSceneSetup(value: unknown): SceneSetup {
  const parsed = sceneSetupSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...EMPTY_SCENE_SETUP };
}

export function isChapterSetupEmpty(s: ChapterSetup): boolean {
  return (
    !s.focus.trim() &&
    !s.tone.trim() &&
    s.mustHappen.length === 0 &&
    s.constraints.length === 0 &&
    s.characters.length === 0
  );
}

/**
 * Merge chapter overrides with scene overrides — the scene wins, FIELD BY FIELD.
 *
 * Field by field rather than replacing the whole person: if the scene only says
 * "Tài has changed into a raincoat", the chapter's "left hand bandaged" note must
 * survive. Replacing wholesale would mean copying every other line each time you
 * change a shirt, and one forgotten line heals the character mid-chapter.
 */
export function mergeOverrides(
  chapter: readonly CharacterOverride[],
  scene: readonly CharacterOverride[],
): CharacterOverride[] {
  const out = new Map<string, CharacterOverride>();

  for (const c of [...chapter, ...scene]) {
    const name = c.name.trim().replace(/\s+/g, " ");
    if (!name) continue;

    const key = name.toLowerCase();
    const prev = out.get(key);
    out.set(key, {
      // Keep the FIRST spelling seen: the chapter typing "ông Bảy" and the scene
      // "Ông bảy" is still one person, and the name handed to the model has to match
      // the character list.
      name: prev?.name ?? name,
      outfit: c.outfit.trim() || prev?.outfit || "",
      note: c.note.trim() || prev?.note || "",
    });
  }

  return [...out.values()].filter((c) => c.outfit || c.note);
}

/** The chapter's instruction block, loaded into the context of every scene in it. */
export function renderChapterSetup(setup: ChapterSetup): string {
  const parts: string[] = [];

  if (setup.focus.trim()) parts.push(`What this chapter is driving at: ${setup.focus.trim()}`);
  if (setup.tone.trim()) {
    parts.push(`Tone for this chapter, on top of the tone of the series: ${setup.tone.trim()}`);
  }
  if (setup.mustHappen.length > 0) {
    parts.push("It must happen in this chapter:", ...setup.mustHappen.map((m) => `- ${m}`));
  }
  if (setup.constraints.length > 0) {
    parts.push("Not in this chapter:", ...setup.constraints.map((c) => `- ${c}`));
  }

  return parts.length > 0 ? `## This chapter\n${parts.join("\n")}` : "";
}

/**
 * The character override block, loaded IMMEDIATELY BEFORE the scene to write.
 *
 * It states outright that it overrides the Story Bible: unsaid, the model meets two
 * different descriptions of one person and picks one, usually the one it read first
 * — the Bible — which is exactly the thing just overridden.
 */
export function renderOverrides(overrides: readonly CharacterOverride[]): string {
  if (overrides.length === 0) return "";

  const lines = overrides.map((c) => {
    const bits = [c.outfit ? `wearing ${c.outfit}` : "", c.note].filter(Boolean);
    return `- ${c.name}: ${bits.join("; ")}`;
  });

  return [
    "## The characters right now",
    "This is true for this scene and overrides what the Story Bible says about them. Anything not mentioned here still follows the Bible.",
    ...lines,
  ].join("\n");
}
