import {
  DIRECTION_FIELDS,
  missingDirection,
  renderOpenThread,
  storyCourseSchema,
  toLanguage,
  withLanguage,
  type StoryBibleRecord,
} from "@audio/core";
import { COURSE_MIN_EPISODES } from "@audio/config";
import { prisma } from "@audio/database";
import {
  getLlm,
  loadPrompt,
  recordFailure,
  recordRun,
  renderTemplate,
  resolveModel,
} from "@audio/llm";
import type { JobHandler } from "../lanes/create-lane";
import { openThreads } from "../services/fact-store";
import { logger } from "../lib/logger";
import { streamProgress } from "../lib/progress";

/**
 * Ask where the whole story has got to, against the destination it was given.
 *
 * `direction` is written once at the outline and then never moves — right for the first
 * ten episodes and wrong by the fortieth. Either the story has drifted off the ending, or
 * the ending was the thing that changed and nobody edited the paragraph. Both are fine;
 * neither being visible is not.
 *
 * Reports only, like the review: it writes one record and stops. Nothing here rewrites
 * the direction, because which of the two should change — the story or the paragraph —
 * is exactly the judgement a person is better at, and the page puts both in front of
 * them.
 */
export const courseJob: JobHandler = async ({ job, setProgress }) => {
  const seriesId = String(job.data.seriesId ?? "");
  if (!seriesId) throw new Error("seriesId is required");

  const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
  const stored = (series.storyBible ?? {}) as StoryBibleRecord;
  const direction = stored.direction ?? null;

  // Nothing to check the story against. Said plainly rather than answered anyway: a
  // course report against a destination nobody set is the model inventing both halves.
  if (!direction || missingDirection(direction).length === DIRECTION_FIELDS.length) {
    throw new Error(
      "This story has no direction to check it against. Write one on the Story Bible page first.",
    );
  }

  const written = await prisma.episode.findMany({
    where: { seriesId, gist: { not: null } },
    orderBy: { number: "asc" },
    select: { number: true, title: true, gist: true },
  });
  // Below the floor the honest answer to every question is "it has only just started",
  // and the model does not give that answer — it reports the whole direction as drifted.
  // See COURSE_MIN_EPISODES.
  if (written.length < COURSE_MIN_EPISODES) {
    throw new Error(
      `Only ${written.length} episode${written.length === 1 ? " has" : "s have"} been ` +
        `summarised. Under ${COURSE_MIN_EPISODES} there is no shape yet to compare against ` +
        `a destination — everything reads as "not there yet", which is what a beginning is.`,
    );
  }

  const throughEpisode = written[written.length - 1]!.number;
  const threads = await openThreads({ seriesId, beforeEpisode: throughEpisode + 1 });

  await setProgress(20);

  const prompt = await loadPrompt("COURSE", series.genre);
  const ctx = { step: "COURSE" as const, promptId: prompt.id, params: prompt.params };

  let result;
  try {
    // UTILITY: reading what exists and comparing it with a paragraph is not creative work.
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "utility",
    });

    result = await getLlm().generateJson({
      model,
      system: withLanguage(toLanguage(series.language)),
      schema: storyCourseSchema,
      prompt: renderTemplate(prompt.content, {
        direction: DIRECTION_FIELDS.map(
          (f) => `- ${f.label}: ${String(direction[f.key] ?? "").trim() || "(not said)"}`,
        ).join("\n"),
        // The gist line per episode, not the summaries: this is a question about the
        // SHAPE of the whole story, and forty full summaries would bury it.
        written: written.map((e) => `${e.number}. ${e.title} — ${e.gist}`).join("\n"),
        threads:
          threads.length > 0
            ? threads.map(renderOpenThread).join("\n")
            : "None — the story owes nothing.",
      }),
      onToken: streamProgress({
        setProgress,
        from: 20,
        to: 90,
        maxTokens: Number(prompt.params.maxTokens) || undefined,
      }),
      ...(prompt.params as object),
    });
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  await recordRun(ctx, result);

  const course = result.data;
  await prisma.series.update({
    where: { id: seriesId },
    data: {
      storyBible: {
        ...stored,
        course: { course, throughEpisode, checkedAt: new Date().toISOString() },
      },
    },
  });

  logger.info(
    `[course] "${series.title}" through episode ${throughEpisode}: ` +
      `${course.onCourse ? "on course" : "drifted"}, ${course.drifted.length} disagreement` +
      `${course.drifted.length === 1 ? "" : "s"}, midpoint ${course.midpointReached ? "passed" : "ahead"}`,
  );

  await setProgress(100);
  return { seriesId, throughEpisode, onCourse: course.onCourse, drifted: course.drifted.length };
};
