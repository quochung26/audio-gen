import { planDraft, storySoFarSchema, withLanguage } from "@audio/core";
import { getLlm, loadPrompt, recordRun, renderTemplate, resolveModel } from "@audio/llm";

/**
 * One paragraph, the same ceiling the arc summary used.
 *
 * It has to hold a whole story, so it cannot be short; it is loaded into every scene
 * write, so it cannot be long. 400 words ≈ 720 tokens, paid once per scene against a
 * 16K context.
 */
export const SO_FAR_MAX_WORDS = 400;

export interface FoldInput {
  sceneId: string;
  episodeId: string;
  genre: string;
  /** The story's output language. */
  language: string;
  /** Series.draftLanguage — blank when the draft is written directly. */
  draftLanguage: string;
  /** The running summary the PREVIOUS scene left behind. Empty starts the story. */
  previous: string;
  /** The scene's prose. */
  text: string;
}

/**
 * Fold one scene into the story's running summary and return the new paragraph.
 *
 * Compression on compression: what the previous scene left behind goes in WITH the new
 * scene, and the answer replaces it. So it stays one paragraph whether the story is
 * three scenes or three hundred.
 *
 * The STORY's, not the episode's — it carries across episode boundaries, so opening
 * episode 12 picks up where the last scene of episode 11 left off.
 *
 * Lives here rather than inside the scene writer because two callers now need exactly
 * this: WRITE_SCENE folds the scene it has just written, and REFOLD_SUMMARY walks the
 * chain rebuilding it. Duplicated, the two would drift on the one thing that must not
 * differ between them — the language the paragraph is written in.
 *
 * Does NOT persist, and does NOT swallow errors. What to do when a fold fails is the
 * caller's decision and the two callers answer differently: the scene writer has prose
 * in hand it refuses to lose, the refold job is doing nothing else.
 */
export async function foldScene(input: FoldInput): Promise<string> {
  const prompt = await loadPrompt("STORY_SO_FAR", input.genre);
  const ctx = {
    step: "STORY_SO_FAR" as const,
    episodeId: input.episodeId,
    sceneId: input.sceneId,
    promptId: prompt.id,
    params: prompt.params,
  };

  const model = await resolveModel({ prompt: prompt.model, kind: "utility" });

  const result = await getLlm().generateJson({
    model,
    // The DRAFT language, matching the scene it is reading: this paragraph is fed back
    // into later scene writes, which happen in that same language.
    system: withLanguage(planDraft(input.language, input.draftLanguage).draft),
    schema: storySoFarSchema,
    prompt: renderTemplate(prompt.content, {
      maxWords: SO_FAR_MAX_WORDS,
      text: input.text,
      // Empty for the very first scene of a story: there is nothing to fold into, and
      // the model then just summarises the one scene it was given.
      previous: input.previous
        ? `## The running summary so far\n${input.previous}\n\nFold what follows into it.`
        : "",
    }),
    ...(prompt.params as object),
  });

  await recordRun(ctx, result);
  return result.data.summary.trim();
}
