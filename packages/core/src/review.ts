import { z } from "zod";

/**
 * Reviewing a drafted episode before a person is asked to approve it.
 *
 * The approval gate has always been there and has always been blind: a person opens the
 * episode, reads four thousand words, and decides. Reading is the only way to judge prose
 * and that is not going to change — but arriving at those four thousand words already
 * knowing where to look is a different job from arriving cold.
 *
 * So this does NOT decide anything. It does not queue a rewrite, does not change a
 * status, does not approve. It reports, the person reads, the person decides. The
 * rewrite button was already next to every scene.
 *
 * The seven dimensions are ainovel-cli's, mapped onto what this codebase actually holds:
 * `foreshadow` becomes `threads` because that is the table here, and `aesthetic` becomes
 * `prose` and is tied to the numbers `computeStyleStats` produces, so that dimension has
 * evidence instead of taste.
 */
export const REVIEW_DIMENSIONS = [
  "consistency",
  "character",
  "pacing",
  "continuity",
  "threads",
  "hook",
  "prose",
] as const;

export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];

/** What each dimension is asking, for the prompt and for the page. */
export const DIMENSION_QUESTION: Record<ReviewDimension, string> = {
  consistency: "Does anything contradict the Story Bible, the world rules or an earlier fact?",
  character: "Do these people act like themselves, and could you tell who is speaking?",
  pacing: "Does it move — is anything padded out, and is anything rushed past?",
  continuity: "Does it follow on, and does one thing cause the next?",
  threads: "Does it push an open thread forward, or leave every debt where it was?",
  hook: "Does the ending make you want the next episode?",
  prose: "Sentence variety, concrete detail, no habitual tense, dialogue worth hearing.",
};

const severity = z.enum(["critical", "error", "warning"]);

export type IssueSeverity = z.infer<typeof severity>;

export const reviewSchema = z.object({
  scores: z
    .object(
      Object.fromEntries(
        REVIEW_DIMENSIONS.map((d) => [
          d,
          z.number().int().min(0).max(100).describe(DIMENSION_QUESTION[d]),
        ]),
      ) as Record<ReviewDimension, z.ZodNumber>,
    )
    .describe("0-100 per dimension"),
  issues: z
    .array(
      z.object({
        dimension: z.enum(REVIEW_DIMENSIONS),
        severity,
        /** Which scene it is in. 0 = the episode as a whole. */
        scene: z.number().int().min(0).describe("Scene number it is in, or 0 for the episode"),
        what: z.string().min(1).describe("What is wrong, in one sentence"),
        evidence: z
          .string()
          .min(1)
          .describe("A SHORT quote from the draft, or the exact numbers, showing it"),
      }),
    )
    .max(12)
    .describe("Problems found. Empty is a real answer"),
  /** Whether the scenes did what their beats forbade them from doing. */
  contractBreaks: z
    .array(
      z.object({
        scene: z.number().int().min(1),
        broke: z.string().min(1).describe("Which forbidden line the scene went past"),
        evidence: z.string().min(1).describe("A SHORT quote from the draft showing it"),
      }),
    )
    .max(8)
    .describe("Scenes that did what their beat said not to. Empty is a real answer"),
  verdict: z
    .enum(["accept", "polish", "rewrite"])
    .describe(
      "accept: ready for a person to approve | polish: worth fixing but not worth " +
        "rewriting | rewrite: at least one scene should be written again",
    ),
  summary: z.string().min(1).describe("Two or three sentences: what to look at first"),
  /** Which scenes to look at. Required when the verdict is not `accept`. */
  scenes: z.array(z.number().int().min(1)).max(12).describe("Scene numbers worth rereading"),
});

export type Review = z.infer<typeof reviewSchema>;

/**
 * Every issue carries an `evidence` string, and the requirement is the point.
 *
 * A review that says "the pacing drags" is an opinion with the same shape as a finding
 * and none of the use: nobody can act on it and nobody can check it. Asking for the
 * quote makes the model go and find one, and where it cannot the issue usually was not
 * there.
 */
export function issuesBySeverity(review: Review): Record<IssueSeverity, number> {
  const out: Record<IssueSeverity, number> = { critical: 0, error: 0, warning: 0 };
  for (const i of review.issues) out[i.severity]++;
  return out;
}

/** The weakest dimensions first — where to start reading. */
export function weakestDimensions(review: Review, take = 3): Array<[ReviewDimension, number]> {
  return (Object.entries(review.scores) as Array<[ReviewDimension, number]>)
    .sort((a, b) => a[1] - b[1])
    .slice(0, take);
}

/**
 * What the last review found, for the scenes written next.
 *
 * The one part of a review that reaches the model rather than the person: a problem
 * named in episode 7 that nobody feeds forward is a problem episode 8 repeats. Capped
 * hard at three — this rides along in every scene write, and a list of twelve would
 * crowd out the story it is supposed to be about.
 *
 * Only `critical` and `error`. A warning is worth a person's attention and is not worth
 * the tokens in front of every scene.
 */
export function reviewLessons(review: Review | null, take = 3): string[] {
  if (!review) return [];
  const lessons = review.issues
    .filter((i) => i.severity !== "warning")
    .map((i) => `${i.what} (${i.dimension})`);
  for (const c of review.contractBreaks) {
    lessons.push(`a scene did what its beat forbade: ${c.broke}`);
  }
  return lessons.slice(0, take);
}

/** The lessons as they reach the writer. Empty when the last episode came back clean. */
export function renderReviewLessons(lessons: string[]): string {
  if (lessons.length === 0) return "";
  return (
    `## What the last review found\n` +
    `Problems a reader found in the episode before this one. Do not repeat them here:\n` +
    lessons.map((l) => `- ${l}`).join("\n")
  );
}
