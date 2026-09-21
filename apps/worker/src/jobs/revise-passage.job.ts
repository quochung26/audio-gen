import { findPassage, splicePassage, toLanguage, withLanguage } from "@audio/core";
import { EpisodeStatus, prisma, syncEpisodeDraft, buildSeriesBible } from "@audio/database";
import { getLlm, loadPrompt, recordFailure, recordRun, renderTemplate, resolveModel } from "@audio/llm";
import type { JobHandler } from "../lanes/create-lane";

import { enqueue } from "../services/queue";
import { streamProgress } from "../lib/progress";
import { logger } from "../lib/logger";

/** The marks around the selection. Chosen to be text no prose would contain. */
const OPEN = "⟦REPLACE THIS⟧";
const CLOSE = "⟦END⟧";

/**
 * Rewrite ONE selected passage of a scene, leaving the rest byte for byte.
 *
 * The gap between the two things that existed. "Rewrite" throws the whole scene away
 * and rolls again, so a model that got 900 words right and one paragraph wrong costs
 * you the 900; editing by hand keeps them but means writing the paragraph yourself.
 *
 * The splice is by exact TEXT, not by offset. Offsets are taken in the browser and the
 * job runs later, so any edit in between silently moves them and the replacement lands
 * mid-sentence somewhere else. The offset is still used as a hint — it disambiguates a
 * passage that appears twice — but the text has to match at it, or the job stops.
 *
 * Refuses when the passage is no longer there at all rather than guessing. A wrong
 * splice is unrecoverable without the revision history, and only a published episode
 * has that.
 */
export const revisePassageJob: JobHandler = async ({ job, setProgress }) => {
  const sceneId = String(job.data.sceneId ?? "");
  const passage = String(job.data.passage ?? "");
  const note = String(job.data.note ?? "").trim();
  const at = Number(job.data.at ?? -1);
  if (!sceneId || !passage) throw new Error("sceneId and passage are required");
  if (!note) throw new Error("A note is required — it says what to change.");

  const scene = await prisma.scene.findUniqueOrThrow({
    where: { id: sceneId },
    include: {
      chapter: {
        include: {
          episode: { include: { series: { select: { id: true, genre: true, language: true } } } },
        },
      },
    },
  });
  const { episode } = scene.chapter;
  const text = scene.text ?? "";

  // `findPassage` rather than indexOf: the selection arrives through multipart, which
  // normalises newlines to CRLF, so anything crossing a paragraph break stopped matching
  // the stored text while every single-line selection worked. It also tolerates a
  // browser handing back a paragraph gap as one newline, and uses `at` only to tell two
  // identical passages apart.
  const range = findPassage(text, passage, at);
  if (!range) {
    throw new Error(
      "That passage could not be found in the scene — it was rewritten or edited since " +
        "it was selected, or it appears more than once. Select it again.",
    );
  }

  await setProgress(10);
  const bible = await buildSeriesBible(episode.series.id);

  const prompt = await loadPrompt("REVISE_PASSAGE", episode.series.genre);
  const ctx = {
    step: "REVISE_PASSAGE" as const,
    episodeId: episode.id,
    sceneId,
    promptId: prompt.id,
    params: prompt.params,
  };

  let replacement: string;
  try {
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "write",
    });

    // PLAIN TEXT, not generateJson. Forcing the reply through a JSON string is what
    // flattened the prose: a model writing `{"passage": "..."}` avoids newlines to keep
    // the JSON valid, so a four-paragraph selection came back as 259 words in one block
    // with paragraph breaks rendered as two spaces. The schema bought a guaranteed-clean
    // string and cost the structure the splice exists to preserve.
    //
    // The preamble it was guarding against is handled the way WRITE_SCENE and TRANSLATE
    // handle it — by saying so in the prompt — plus the strip below.
    const result = await getLlm().generate({
      model,
      system: withLanguage(toLanguage(episode.series.language)),
      prompt: renderTemplate(prompt.content, {
        bible,
        // The whole scene with the selection marked, so the model can see what it has
        // to join onto at both ends.
        scene:
          text.slice(0, range.start) + OPEN + text.slice(range.start, range.end) + CLOSE +
          text.slice(range.end),
        // What is ACTUALLY being replaced, read back out of the scene — not the string
        // that arrived, whose whitespace may differ from the stored text's.
        passage: text.slice(range.start, range.end),
        note,
      }),
      onToken: streamProgress({
        setProgress,
        from: 20,
        to: 85,
        maxTokens: Number(prompt.params.maxTokens) || undefined,
      }),
      ...(prompt.params as object),
    });
    await recordRun(ctx, result);
    replacement = result.text.trim();
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  if (!replacement) throw new Error("The model returned an empty passage");

  // It is told not to, and it sometimes does anyway: a reply that still carries the
  // marks would splice them into the story.
  let clean = replacement.split(OPEN).join("").split(CLOSE).join("").trim();

  // A leading "Here is the revised passage:" would be spliced into the middle of a
  // sentence. Only a FIRST line is considered, and only one that announces itself and
  // is followed by a blank line — prose does not open that way, and a real first
  // sentence never ends in a colon.
  const firstBreak = clean.indexOf("\n\n");
  if (firstBreak > 0 && firstBreak < 120) {
    const head = clean.slice(0, firstBreak).trim();
    if (/^(here|sure|certainly|okay|revised|rewritten)\b/i.test(head) && head.endsWith(":")) {
      clean = clean.slice(firstBreak + 2).trim();
    }
  }

  // Keep what the scene said before, but only once the episode is published — the same
  // rule the hand-editing route follows, and for the same reason.
  if (episode.status === EpisodeStatus.PUBLISHED) {
    await prisma.sceneRevision.create({ data: { sceneId, text } });
  }

  const next = splicePassage(text, range, clean);
  await prisma.scene.update({ where: { id: sceneId }, data: { text: next } });
  await syncEpisodeDraft(episode.id);

  // The running summary was folded from the text this just replaced, so it now
  // describes prose that is gone — and `Scene.storySoFar` is a CHAIN, so every
  // paragraph after it inherits the mismatch.
  //
  // This is not hypothetical. Scene 6.1 was revised three times after its fold, and the
  // summary went on asserting a thread the prose never contained; NEXT_SCENE read that
  // as history and built the next beat on it, bringing a character into a chapter she
  // was never in. Two presses of "another beat" could not escape it, because the
  // summary was in the context every time.
  //
  // From THIS scene, not the next: unlike a delete, the revised scene's own paragraph
  // is one of the wrong ones.
  await enqueue({
    type: "REFOLD_SUMMARY",
    episodeId: episode.id,
    payload: { seriesId: episode.series.id, fromSceneId: sceneId },
  });

  logger.info(
    `[revise-passage] chapter ${scene.chapter.order} scene ${scene.order} — ` +
      `${text.slice(range.start, range.end).split(/\s+/).length} words → ${clean.split(/\s+/).length}`,
  );

  await setProgress(100);
  return {
    episodeId: episode.id,
    sceneId,
    before: text.slice(range.start, range.end).split(/\s+/).length,
    after: clean.split(/\s+/).length,
  };
};
