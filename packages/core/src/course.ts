import { z } from "zod";
import { DIRECTION_FIELDS } from "./world";

/**
 * Where the story has actually got to, against where it said it was going.
 *
 * `direction` is written once, at the outline, and then never moves. That is right for
 * the first ten episodes and wrong by the fortieth: either the story has drifted off the
 * destination, or the destination was the thing that changed and nobody wrote it down.
 * Both are fine. Neither being VISIBLE is not.
 *
 * Nothing else can answer this. The review reads one episode and cannot see a story
 * bending away over twelve of them; the running summary says what happened and never
 * what it was for; and `NEXT_EPISODE` reads the direction every time without ever being
 * asked whether the story is still heading there.
 *
 * Borrowed from ainovel-cli's compass, which the architect revisits at every volume
 * boundary. This codebase has no volumes, so it is asked for on demand and when enough
 * episodes have gone by — see `COURSE_CHECK_EVERY`.
 */
export const storyCourseSchema = z.object({
  onCourse: z
    .boolean()
    .describe("Whether the episodes written so far are still heading toward the ending"),
  where: z
    .string()
    .min(1)
    .describe(
      "Two or three sentences: where the story has got to in relation to its ending, in " +
        "theme rather than in plot",
    ),
  /**
   * Which parts of the direction the story has moved away from.
   *
   * Named rather than counted, and named as a DISAGREEMENT rather than a fault: the
   * story may be right and the direction out of date.
   */
  drifted: z
    .array(
      z.object({
        field: z
          .enum(["endingDirection", "centralQuestion", "corePromise", "escalation", "midpointTurn"])
          .describe("Which part of the direction"),
        how: z.string().min(1).describe("What the story is doing instead, in one sentence"),
      }),
    )
    .max(5)
    .describe("Where the story and its stated direction disagree. Empty is a real answer"),
  midpointReached: z
    .boolean()
    .describe("Whether the turn described in `midpointTurn` has actually happened yet"),
  /**
   * How much story is left, in words rather than in episodes.
   *
   * Deliberately not a number. ainovel-cli forbids summing its own arc estimates into a
   * total chapter count for the reason that applies here twice over: a number invites
   * padding toward it or stopping short of it, and this system grows one episode at a
   * time precisely so the length can be an outcome.
   */
  remaining: z
    .string()
    .min(1)
    .describe(
      "Roughly how much story is left before the ending lands — 'about a third of the " +
        "way', 'the last stretch'. NEVER a number of episodes",
    ),
  /** What the next few episodes should do about it. One sentence, and it may be "nothing". */
  next: z.string().min(1).describe("What the next episodes should do about all this"),
});

export type StoryCourse = z.infer<typeof storyCourseSchema>;

/** The label a drifted field is shown under — the same words the Bible and the form use. */
export function directionLabel(field: string): string {
  return DIRECTION_FIELDS.find((f) => f.key === field)?.label ?? field;
}

/**
 * The course as it reaches the step that outlines the next episode.
 *
 * This is the point of the whole thing. A check nobody reads is a page nobody opens; a
 * check the planner reads is the difference between an episode written because the story
 * needs it and an episode written because the last one ended.
 *
 * Renders the disagreements without resolving them. Whether the story or the direction is
 * the one that should change is a judgement, and it belongs to the person who can edit
 * both — which is why the block says where things stand and stops.
 */
export function renderCourse(course: StoryCourse | null, throughEpisode: number): string {
  if (!course) return "";
  const parts = [
    `## Where this story has got to`,
    `Checked after episode ${throughEpisode}. ${course.where}`,
    `Roughly how much is left: ${course.remaining}.`,
    course.midpointReached
      ? `The story has already made its mid-point turn.`
      : `The mid-point turn has NOT happened yet.`,
  ];

  if (course.drifted.length > 0) {
    parts.push(
      ``,
      `Where the story and its stated direction disagree — the story may be the one that ` +
        `is right, so do not force it back:`,
      ...course.drifted.map((d) => `- ${directionLabel(d.field)}: ${d.how}`),
    );
  }

  parts.push(``, `What the next episodes should do: ${course.next}`);
  return parts.join("\n");
}
