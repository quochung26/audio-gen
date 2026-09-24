import { z } from "zod";

import { findPassage } from "./passage";

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
        what: z
          .string()
          .min(1)
          .describe("What is wrong, in ONE sentence of at most thirty words. Not an essay"),
        evidence: z
          .string()
          .min(1)
          .describe("A SHORT quote from the draft, or the exact numbers, showing it"),
        /**
         * What to do about it — ainovel-cli's `Suggestion`, and the field this review
         * was missing.
         *
         * `what` and `evidence` between them say where the fault is; neither says what
         * a fix would look like. A rewrite of the whole scene can work that out, having
         * the beat and the Bible in front of it. Revising ONE PASSAGE cannot: that step
         * is given a fragment and an instruction, and without this the instruction had
         * to be typed by hand every time.
         */
        suggestion: z
          .string()
          .describe(
            "What to do about it, in one short sentence addressed to the writer. Not a " +
              "restatement of the fault. Empty when there is nothing useful to say",
          ),
        requiresChange: z
          .boolean()
          .describe(
            "Whether this has to be fixed before the episode is approved. Not everything " +
              "worth reporting is worth work: a thing the writer should know is not the " +
              "same as a thing the writer must do",
          ),
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
});

// No `scenes` field. Which scenes need work is not a separate judgement to be asked for
// and then trusted — it is the list of scenes with a finding that says it needs work, and
// `settleReview` derives it. Asked for, it can disagree with the findings underneath it,
// and then one of the two is wrong with nothing to say which.

export type Review = z.infer<typeof reviewSchema>;

/** One thing a review found wrong, as stored. */
export type ReviewIssue = Review["issues"][number];

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

/** A review once its own findings have been taken at their word. */
export interface SettledReview {
  verdict: Review["verdict"];
  /** The scenes with a finding that says they need work. Derived, never asked for. */
  scenes: number[];
  /**
   * Set when the model's verdict disagreed with its own findings, saying what was done
   * about it. Recorded rather than hidden: a corrected answer that says nothing about
   * having been corrected is indistinguishable from one that was right.
   */
  correction: string | null;
}

/**
 * Settle a review against itself.
 *
 * Two things a model says separately can contradict each other: a list of findings, each
 * declaring whether it must be fixed, and a one-word verdict. ainovel-cli refuses the
 * whole review when they disagree — `accept` carrying an issue marked
 * `requires_change`, or `rewrite` carrying none — and makes the model answer again.
 *
 * That works there because the tool result goes straight back to a model mid-loop. Here
 * a review is a single six-minute call, so refusing costs the answer entirely. The
 * findings win instead: they are specific and carry quotes, while the verdict is one word
 * about all of them, and between a claim with evidence and a label without, the evidence
 * is the better bet.
 */
export function settleReview(review: Review): SettledReview {
  const needed = new Set<number>();
  for (const i of review.issues) if (i.requiresChange && i.scene > 0) needed.add(i.scene);
  // A broken contract always counts. The beat said not to and the scene did — there is
  // nothing to weigh.
  for (const b of review.contractBreaks) needed.add(b.scene);
  const scenes = [...needed].sort((a, b) => a - b);

  if (scenes.length === 0 && review.verdict !== "accept") {
    return {
      verdict: "accept",
      scenes,
      correction:
        `It said "${review.verdict}" while marking nothing as needing a change. Taken as ` +
        `accept — there is no work here to do.`,
    };
  }
  if (scenes.length > 0 && review.verdict === "accept") {
    return {
      verdict: "polish",
      scenes,
      correction:
        `It said "accept" while marking ${scenes.length} scene` +
        `${scenes.length === 1 ? "" : "s"} as needing a change. Taken as polish.`,
    };
  }
  return { verdict: review.verdict, scenes, correction: null };
}

/**
 * What a review found about ONE scene, for the write that replaces it.
 *
 * A review names problems and then nothing acts on them: the lessons go forward to the
 * NEXT episode, and the episode that was criticised is rewritten scene by scene with the
 * criticism nowhere in the prompt. So the model writes the scene again from the same
 * beat, knowing nothing about what was wrong with the last one, and can reproduce it
 * exactly.
 *
 * ainovel-cli hit this and wrote the fix, with a comment naming the gap outright: its
 * recall covers chapters N-1 to N-3, "which misses exactly this chapter itself, and the
 * writer has no tool to read a review". This is the same hole and the same patch.
 *
 * Filtered to the scene, and capped. The whole review is a dozen findings about a dozen
 * scenes, and handing all of them to one write buries the two that are about it — the
 * first real review produced TEN for one scene, each a paragraph, which is more
 * criticism than the scene is prose. A list of symptoms long enough to drown the
 * assignment stops being direction, which is the failure ainovel-cli named
 * `architect_directive_unclear` and called the worst thing in its rewrite queue.
 *
 * Ordered by how little argument there is about them: a broken contract first, because
 * the beat said not to and the scene did, then by severity. Every line keeps its quote —
 * that is what makes a finding something to act on rather than an opinion.
 */
export function sceneFindings(review: Review, sceneNumber: number, take = 4): string[] {
  // Scene 0 is the review's way of saying "the episode as a whole", and an episode-wide
  // finding belongs to no single rewrite — handed to one scene it reads as that scene's
  // fault. Guarded here rather than left to callers: scene numbers are 1-based, so a 0
  // arriving means something upstream miscounted, and answering it would hide that.
  if (sceneNumber < 1) return [];

  const out: string[] = [];
  for (const b of review.contractBreaks) {
    if (b.scene === sceneNumber) {
      out.push(`went past what the beat forbade — ${b.broke}: "${b.evidence}"`);
    }
  }

  const rank: Record<IssueSeverity, number> = { critical: 0, error: 1, warning: 2 };
  const mine = review.issues
    .filter((i) => i.scene === sceneNumber)
    // What must change before the rest: with only four places, a note the writer should
    // know must not take one from a thing the writer has to do.
    .sort(
      (a, b) =>
        Number(b.requiresChange) - Number(a.requiresChange) ||
        rank[a.severity] - rank[b.severity],
    );
  // The suggestion goes with it where there is one. ainovel-cli hands its writer the
  // description and the suggestion and drops the quote entirely, which is coherent for
  // it — the writer has the whole chapter in front of it, so a quote locates nothing it
  // cannot already see. The same is true here, and the quote is kept anyway because it
  // is the one part of a finding that can be checked against the draft.
  for (const i of mine) {
    const fix = i.suggestion.trim();
    out.push(`${i.dimension}: ${i.what}${fix ? ` — ${fix}` : ""} — "${i.evidence}"`);
  }

  return out.slice(0, take);
}

/**
 * The findings as they reach the write that replaces the scene.
 *
 * The last line matters as much as the list. Told only what was wrong, a model writes a
 * scene ABOUT not being those things — it defends itself in the prose, and the defence is
 * worse than the fault.
 */
export function renderSceneFindings(findings: string[]): string {
  if (findings.length === 0) return "";
  return (
    `A reader read the version of this scene you are replacing, and found:\n` +
    findings.map((f) => `- ${f}`).join("\n") +
    `\nWrite a different scene from the same beat. Do not answer any of this in the prose.`
  );
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

/** One passage of a scene, with the instruction the review gave for it. */
export interface PassageFix {
  /** The text to replace, exactly as it appears in the scene. */
  passage: string;
  /** Where it starts, to tell two identical passages apart. */
  at: number;
  /** What to do about it, built from the findings against this passage. */
  note: string;
  /** The findings this passage answers, for saying what is about to happen. */
  dimensions: string[];
}

/**
 * Every passage of one scene that the review gave a reason to change, ready to queue.
 *
 * Findings are grouped by the passage they quote before anything else, because one
 * passage usually breaks several things at once and each of them is not a separate
 * repair. A group's instruction is its suggestions where it has any, and its faults
 * where it has none — worse direction, and better than an empty note.
 *
 * Two kinds are dropped, and both matter:
 *
 *   - A quote that is not in the scene. It cannot be located, so the job would refuse
 *     it anyway; better not to spend the call finding that out.
 *   - A quote that OVERLAPS one already taken. Splicing the first changes the text the
 *     second was measured against, and while the job refuses rather than guessing, a
 *     run that queues work it knows will fail is a run that reports failures it caused.
 *
 * Offsets go stale as earlier passages are spliced, and that is fine: `findPassage`
 * ignores the hint entirely when the passage occurs once, which is the ordinary case.
 * The hint only decides between two identical passages, and two identical passages in
 * one scene is the case this drops as overlapping anyway.
 */
export function passageFixes(review: Review, sceneNumber: number, sceneText: string): PassageFix[] {
  if (sceneNumber < 1 || !sceneText.trim()) return [];

  const groups = new Map<string, { items: ReviewIssue[]; breaks: string[] }>();
  const add = (evidence: string, issue?: ReviewIssue, broke?: string) => {
    const key = evidence.trim();
    if (!key) return;
    const g = groups.get(key) ?? { items: [], breaks: [] };
    if (issue) g.items.push(issue);
    if (broke) g.breaks.push(broke);
    groups.set(key, g);
  };
  for (const b of review.contractBreaks) {
    if (b.scene === sceneNumber) add(b.evidence, undefined, b.broke);
  }
  for (const i of review.issues) {
    if (i.scene === sceneNumber) add(i.evidence, i);
  }

  const out: PassageFix[] = [];
  const taken: Array<{ start: number; end: number }> = [];

  for (const [evidence, g] of groups) {
    const range = findPassage(sceneText, evidence);
    if (!range) continue;
    if (taken.some((t) => range.start < t.end && t.start < range.end)) continue;

    const fixes = g.items.map((i) => i.suggestion.trim()).filter(Boolean);
    const note = [
      ...g.breaks.map((b) => `Do not go past what the beat forbade: ${b}.`),
      ...(fixes.length > 0 ? fixes : g.items.map((i) => i.what)),
    ]
      .filter(Boolean)
      .join(" ");
    if (!note) continue;

    taken.push(range);
    out.push({
      passage: sceneText.slice(range.start, range.end),
      at: range.start,
      note,
      dimensions: [...g.breaks.map(() => "contract"), ...g.items.map((i) => i.dimension)],
    });
  }

  // In the order they appear in the scene, so a person reading the confirmation reads
  // down the prose rather than down the review.
  return out.sort((a, b) => a.at - b.at);
}
