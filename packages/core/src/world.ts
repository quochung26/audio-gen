import { renderTags } from "./tags";
import { z } from "zod";
import type { Outline } from "./types";

/**
 * World setup — what the WRITER lays down, not what the AI invents.
 *
 * Why it is separate from `Outline`: the outline is AI-generated and you can
 * regenerate it; the world setup is your decision and has to hold for the whole
 * story. Merged, every outline regeneration would wipe the rules you wrote.
 *
 * All of this loads into the `system` prompt on every scene, so it is what keeps
 * episode 30 obeying the rules laid down in episode 1.
 */
export const worldSetupSchema = z.object({
  /** Time, place, atmosphere. E.g. "Central Vietnam highway, 1970s, night buses." */
  setting: z.string().default(""),

  /**
   * World rules — the things that are ALWAYS true in this story.
   * E.g. "Ghosts only appear after midnight", "Nobody in the village says a dead person's name".
   */
  rules: z.array(z.string()).default([]),

  /** The prose voice you want. E.g. "unhurried, plenty of silence, never lurid." */
  tone: z.string().default(""),

  /**
   * Forbidden — what must NEVER appear.
   * E.g. "no violence against children", "never end on a dream".
   */
  constraints: z.array(z.string()).default([]),

  /**
   * The story's own terms: place names, forms of address, objects.
   * Keeps the AI from renaming things between episodes.
   */
  glossary: z.array(z.object({ term: z.string(), meaning: z.string() })).default([]),
});

export type WorldSetup = z.infer<typeof worldSetupSchema>;

export const EMPTY_WORLD: WorldSetup = {
  setting: "",
  rules: [],
  tone: "",
  constraints: [],
  glossary: [],
};

/** The shape stored in the `Series.storyBible` column. */
export interface StoryBibleRecord {
  /** The AI-generated outline — regenerable. */
  raw?: Outline;
  /** The writer's world setup — NOT overwritten when the outline is regenerated. */
  world?: WorldSetup;
  /** Pre-rendered for the system prompt. Rebuilt whenever raw or world changes. */
  bible?: string;
}

export function parseWorld(value: unknown): WorldSetup {
  const parsed = worldSetupSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...EMPTY_WORLD };
}

export function isWorldEmpty(w: WorldSetup): boolean {
  return (
    !w.setting.trim() &&
    !w.tone.trim() &&
    w.rules.length === 0 &&
    w.constraints.length === 0 &&
    w.glossary.length === 0
  );
}

/**
 * Render the full Story Bible for the system prompt.
 *
 * The order is deliberate: world setup comes BEFORE the outline. The model reads
 * in sequence, and world rules constrain everything read after them.
 */
export function renderBible(input: {
  title: string;
  genre: string;
  /** Sub-genre tags — "tình cảm", "hành động"… See packages/core/src/tags.ts. */
  tags?: string[];
  /**
   * A description per genre, so the model reads them the way the writer means.
   *
   * `promptName` is the name handed to the model instead of `name` — `name` is the
   * label listeners see, `promptName` is the label the model has richer
   * associations for. Blank falls back to `name`.
   */
  genreNotes?: Array<{ name: string; promptName?: string; description: string }>;
  logline?: string;
  world: WorldSetup;
  characters: Array<{
    name: string;
    role?: string | null;
    description?: string | null;
    speech?: string | null;
    outfit?: string | null;
    appearance?: string | null;
    /** Nobody cast as narrator yet means blank — the Bible prints nothing. */
    isNarrator?: boolean;
  }>;
  episodes?: Array<{ number: number; title: string; chapters: Array<{ title: string; beats: string[] }> }>;
  /**
   * The names of everyone PRESENT in the scene about to be written.
   *
   * Empty = not known, and then everyone is described in full. Given a list,
   * anyone outside it keeps only name and role: context does not grow with the
   * cast, while the model still knows they exist and will not invent a duplicate.
   */
  spotlight?: string[];
}): string {
  // The name for the model, looked up by display label. No genre tag matching
  // means keep whatever the writer typed — a genre works without being in the
  // catalogue, and dropping it would leave the genre line blank.
  const forModel = new Map(
    (input.genreNotes ?? [])
      .filter((g) => g.promptName?.trim())
      .map((g) => [g.name.trim().toLowerCase(), g.promptName!.trim()]),
  );
  const modelName = (label: string) => forModel.get(label.trim().toLowerCase()) ?? label;

  const parts: string[] = [`# ${input.title}`, ``, `Genre: ${modelName(input.genre)}`];

  // Right under the genre: this steers the prose, so it must sit where the model reads first.
  const tagLine = renderTags((input.tags ?? []).map(modelName));
  if (tagLine) parts.push(tagLine);

  if (input.logline) parts.push(`Logline: ${input.logline}`);

  // Right after the genre line, before the setting: the model has to know what
  // "kinh dị" means here before it reads anything else.
  const notes = (input.genreNotes ?? []).filter((g) => g.description.trim());
  if (notes.length > 0) {
    parts.push(
      ``,
      `## What these genres mean here`,
      ...notes.map((g) => `- **${modelName(g.name)}**: ${g.description.trim()}`),
    );
  }

  const w = input.world;

  if (w.setting.trim()) {
    parts.push(``, `## Setting`, w.setting.trim());
  }

  if (w.rules.length > 0) {
    parts.push(
      ``,
      `## World rules`,
      `The following are ALWAYS true in this story. Do not write anything that contradicts them:`,
      ...w.rules.map((r) => `- ${r}`),
    );
  }

  if (w.tone.trim()) {
    parts.push(``, `## Tone`, w.tone.trim());
  }

  if (w.constraints.length > 0) {
    parts.push(``, `## Forbidden`, ...w.constraints.map((c) => `- ${c}`));
  }

  if (w.glossary.length > 0) {
    parts.push(
      ``,
      `## Glossary`,
      `Use these exact terms; do not rename them:`,
      ...w.glossary.map((g) => `- ${g.term}: ${g.meaning}`),
    );
  }

  const spotlight = new Set(
    (input.spotlight ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean),
  );

  parts.push(``, `## Characters`);
  if (spotlight.size > 0) {
    parts.push(
      `Full detail is given only for the characters in the scene you are about to write. The rest are listed by name so you do not invent someone new with the same name.`,
    );
  }

  for (const c of input.characters) {
    parts.push(`- ${c.name}${c.isNarrator ? " (narrator)" : ""}: ${c.role ?? ""}`);

    // Outside the list, stop at name and role — dropping the longest part.
    if (spotlight.size > 0 && !spotlight.has(c.name.trim().toLowerCase())) continue;

    // Personality and speech are indented — this is what keeps one character's
    // dialogue sounding like itself across dozens of episodes.
    if (c.description?.trim()) parts.push(`  ${c.description.trim()}`);
    // Speech is separate from personality: the model leans on this when writing
    // DIALOGUE, while the line above steers action and choices.
    if (c.speech?.trim()) parts.push(`  Speech: ${c.speech.trim()}`);
    // Appearance gets its own label rather than being folded into the line above:
    // it steers DESCRIPTION, the line above steers DIALOGUE. Merged, the model
    // describes clothing in the middle of a passage that needed a voice.
    if (c.appearance?.trim()) parts.push(`  Appearance: ${c.appearance.trim()}`);
    // The DEFAULT outfit. Chapter and scene setup can override it — the override
    // block says so outright, so a conflict does not leave the model guessing.
    if (c.outfit?.trim()) parts.push(`  Usually wears: ${c.outfit.trim()}`);
  }

  if (input.episodes && input.episodes.length > 0) {
    parts.push(
      ``,
      `## Episode outline`,
      // Every chapter's beats folded into one line: this is an index so the model
      // remembers what happened where, not a place to rebuild chapter structure.
      ...input.episodes.map(
        (e) => `${e.number}. ${e.title} — ${e.chapters.flatMap((c) => c.beats).join(" / ")}`,
      ),
    );
  }

  return parts.join("\n");
}

/**
 * Render the world setup as a passage for the OUTLINE prompt.
 * When the writer has fixed the setting up front, the AI has to build the outline
 * around it rather than inventing a world of its own.
 */
export function renderWorldForOutline(w: WorldSetup): string {
  if (isWorldEmpty(w)) return "";

  const parts: string[] = ["## The world is already set — you MUST follow it"];

  if (w.setting.trim()) parts.push(`Setting: ${w.setting.trim()}`);
  if (w.tone.trim()) parts.push(`Tone: ${w.tone.trim()}`);
  if (w.rules.length > 0) parts.push(`World rules:`, ...w.rules.map((r) => `- ${r}`));
  if (w.constraints.length > 0) parts.push(`Forbidden:`, ...w.constraints.map((c) => `- ${c}`));
  if (w.glossary.length > 0) {
    parts.push(`Use these exact terms:`, ...w.glossary.map((g) => `- ${g.term}: ${g.meaning}`));
  }

  parts.push(
    "",
    "Do not invent a different setting. The `setting` field you return must match the setting above.",
  );

  return parts.join("\n");
}
