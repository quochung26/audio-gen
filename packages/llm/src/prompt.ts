import { prisma, type PromptStep } from "@audio/database";
import { LlmError } from "./provider";

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
  OUTLINE: ["idea", "genre", "tags", "episodeCount", "chapterCount", "scenesPerChapter", "sceneWords", "world", "cast"],
  // Two blocks, both built by the job: `context` is the story (its Bible when it
  // exists, the half-filled form when it does not), `brief` is what the writer had
  // already typed about this one person. See renderKnownCast / renderCharacterBrief.
  CHARACTER: ["context", "brief"],
  // Continuing needs no original idea — it needs to know what has happened.
  NEXT_EPISODE: ["bible", "context", "episodeNumber", "chapterCount", "scenesPerChapter", "sceneWords"],
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
  ARC_SUMMARY: ["maxWords", "previousArc", "summaries"],
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
    params: (chosen.params as Record<string, unknown>) ?? {},
  };
}
