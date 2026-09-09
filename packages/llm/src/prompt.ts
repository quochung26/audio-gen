import { prisma, type PromptStep } from "@audio/database";
import { SCENE_MAX_WORDS } from "@audio/config";
import { LlmError } from "./provider";

/** Vietnamese runs about 1.8 tokens to the word — the figure the context budget uses. */
const TOKENS_PER_WORD = 1.8;

/**
 * Room for the longest scene the rules allow, and half again.
 *
 * A scene stopping mid-sentence is worse than a short one, so the ceiling has to sit
 * well clear of the longest legal scene rather than near it. DERIVED, because the two
 * numbers drifted apart every single time the scene size was retuned: the word count
 * lives in code and the token ceiling lived in a JSON column, and nothing made them
 * agree. A `pnpm db:seed` missed after changing the scene size left the model cut off
 * mid-sentence, with nothing to say why.
 */
const SCENE_CEILING = Math.ceil((SCENE_MAX_WORDS * TOKENS_PER_WORD * 1.6) / 100) * 100;

/**
 * How much room each step gets — a CAPACITY, not a setting.
 *
 * These used to sit in `Prompt.params` beside temperature, and they do not belong
 * there. Temperature is taste: you turn it up because the prose reads flat, and it can
 * reasonably differ per genre. `numCtx` and `maxTokens` are consequences — of what has
 * to fit in the prompt, and of how long the answer is allowed to be. Nobody prefers
 * 2,600; it is what a 900-word scene needs.
 *
 * Editable, they were a knob in the UI that should not be touched, a second copy of a
 * number that lives in code, and a value `db:seed` could quietly overwrite or fail to.
 */
export const GEN_LIMITS: Record<PromptStep, { numCtx: number; maxTokens: number }> = {
  // The whole cast, the world setup and one episode of chapters.
  OUTLINE: { numCtx: 8192, maxTokens: 2500 },
  NEXT_EPISODE: { numCtx: 16384, maxTokens: 1200 },
  // One chapter out; the Story Bible and the chapters so far in.
  NEXT_CHAPTER: { numCtx: 16384, maxTokens: 600 },
  // A sentence or two out. Everything else here is context.
  SCENE_BEAT: { numCtx: 16384, maxTokens: 250 },
  CHARACTER: { numCtx: 16384, maxTokens: 700 },
  WRITE_SCENE: { numCtx: 16384, maxTokens: SCENE_CEILING },
  // Rewrites one scene, so it needs exactly what writing one needs.
  TRANSLATE: { numCtx: 16384, maxTokens: SCENE_CEILING },
  // Reads a whole scene and answers in one paragraph.
  STORY_SO_FAR: { numCtx: 8192, maxTokens: 1000 },
  // The only step whose OUTPUT is long: a whole episode, split into speakable blocks.
  AUDIO_EDIT: { numCtx: 16384, maxTokens: 4000 },
  SUMMARIZE: { numCtx: 16384, maxTokens: 900 },
  METADATA: { numCtx: 8192, maxTokens: 600 },
};

/** Replace {{var}} with a value. A missing variable is an error, never a silent blank. */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  const missing: string[] = [];
  const out = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    if (v === undefined) {
      missing.push(key);
      return "";
    }
    return String(v);
  });
  if (missing.length > 0) {
    throw new LlmError(`Prompt is missing variables: ${missing.join(", ")}`);
  }
  return out;
}

/**
 * The variables each step PASSES INTO its prompt.
 *
 * Must match the object handed to `renderTemplate` in the corresponding job. One
 * wrong name kills the job mid-run — `renderTemplate` throws deliberately rather
 * than blanking silently, because a prompt missing a context block still gets
 * normal-looking prose back, and the mistake only shows up as quality.
 *
 * Studio uses this table to block at save time rather than waiting for a run.
 */
export const PROMPT_VARIABLES: Record<PromptStep, readonly string[]> = {
  // `world` and `cast` are the two blocks the writer sets up front: empty means the
  // AI invents them, present means the AI follows them. See renderWorldForOutline /
  // renderCastForOutline.
  OUTLINE: ["idea", "genre", "tags", "episodeCount", "scenesPerChapter", "sceneWords", "world", "cast"],
  // Compression on compression: `previous` is the paragraph the last scene left
  // behind, `text` is the scene just written, and the answer replaces `previous`.
  // Nothing else goes in — asked to summarise with the whole story in front of it, a
  // model writes what the scene MEANT for the plot instead of what happened in it.
  STORY_SO_FAR: ["maxWords", "previous", "text"],
  // Two blocks, both built by the job: `context` is the story (its Bible when it
  // exists, the half-filled form when it does not), `brief` is what the writer had
  // already typed about this one person. See renderKnownCast / renderCharacterBrief.
  CHARACTER: ["context", "brief"],
  // Continuing needs no original idea — it needs to know what has happened. No
  // `chapterCount`: an episode opens with ONE chapter and grows a chapter at a time,
  // the same way the story grows an episode at a time.
  NEXT_EPISODE: ["bible", "context", "episodeNumber", "scenesPerChapter", "sceneWords"],
  // Replacing ONE beat. `soFar` is the whole chapter's beats with this one marked, so
  // the replacement still leads into the beat that follows it; `current` is what the
  // writer turned down, sent so the model does not offer it back in other words.
  SCENE_BEAT: ["bible", "context", "chapter", "soFar", "current"],
  // One chapter for an episode already under way. `soFar` is the chapters it already
  // has — the model has to carry on from them rather than restart the episode.
  NEXT_CHAPTER: ["bible", "context", "soFar", "chapterNumber", "scenesPerChapter", "sceneWords"],
  // The whole context folded into ONE variable: Story Bible, arc summary, retrieved
  // facts, previous scene, beat, target words — see `renderContext` in @audio/core.
  WRITE_SCENE: ["context"],
  // Only the Bible and the passage being rewritten: the rewrite step must NOT see
  // summaries or old facts. Giving it story context invites it to "retell this
  // better", when its job is to preserve every detail. The Bible goes in for proper
  // nouns, terminology and forms of address — exactly what it must not re-invent.
  TRANSLATE: ["bible", "text"],
  AUDIO_EDIT: ["characters", "draft"],
  SUMMARIZE: ["characters", "text"],
  METADATA: ["text"],
};

export interface PromptCheck {
  /** Variables the prompt uses but this step does not pass → the job will die. */
  unknown: string[];
  /** Variables this step passes but the prompt does not use → merely wasted context. */
  unused: string[];
  used: string[];
}

/** Check a prompt's variables against what the step actually passes in. */
export function checkPromptVariables(step: PromptStep, content: string): PromptCheck {
  const available = PROMPT_VARIABLES[step] ?? [];
  const used = [...new Set([...content.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!))];
  return {
    used,
    unknown: used.filter((v) => !available.includes(v)),
    unused: available.filter((v) => !used.includes(v)),
  };
}

export interface LoadedPrompt {
  id: string;
  content: string;
  model: string | null;
  params: Record<string, unknown>;
}

/**
 * Get the active prompt for a step.
 * Prefers the genre variant; without one, the default (genre = null).
 */
/**
 * Among the active ones, which is used for this genre.
 *
 * Kept separate so Studio can show the EXACT one that will run, rather than
 * re-deriving the rule — two places reasoning differently is the kind of bug nobody
 * spots until the prose comes out wrong.
 *
 * The rule: a genre variant beats the `*` default; within a genre, the higher
 * `version` wins.
 */
export function pickPrompt<T extends { genre: string; version: number }>(
  candidates: readonly T[],
  genre?: string,
): T | undefined {
  const byVersion = [...candidates].sort((a, b) => b.version - a.version);
  return (
    (genre ? byVersion.find((p) => p.genre === genre) : undefined) ??
    byVersion.find((p) => p.genre === "*")
  );
}

export async function loadPrompt(step: PromptStep, genre?: string): Promise<LoadedPrompt> {
  const candidates = await prisma.prompt.findMany({
    where: { step, active: true, genre: { in: genre ? [genre, "*"] : ["*"] } },
  });

  const chosen = pickPrompt(candidates, genre);

  if (!chosen) {
    throw new LlmError(
      `No prompt for step ${step}. Run \`pnpm db:seed\` to load the default prompt set.`,
    );
  }

  return {
    id: chosen.id,
    content: chosen.content,
    model: chosen.model,
    // Code LAST, so the capacity limits win over anything an old row still carries.
    // The row keeps only taste — temperature and the rest — and a `db:seed` clears
    // the stale keys, because the seed writes `params` whole.
    params: { ...((chosen.params as Record<string, unknown>) ?? {}), ...GEN_LIMITS[step] },
  };
}
