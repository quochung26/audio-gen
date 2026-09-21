/**
 * When a story is finished.
 *
 * `SeriesStatus.COMPLETED` has been in the schema since the beginning and nothing has
 * ever set it — every story in the database sits at DRAFT from the day it was created.
 * That is not an oversight anyone forgot to fix. It is that in this system there is no
 * such thing as finished: the next episode is always one button away, so "no more
 * episodes are coming" is not a fact any code can read off the data.
 *
 * So it has to be SAID. A story closes in two moves, which is ainovel-cli's shape for
 * the same problem:
 *
 *   1. A person declares that the story is closing, from a given episode on. This is the
 *      only part a machine cannot do, and the whole reason the status never moved.
 *   2. Code checks the mechanical facts and moves the status when they line up. No
 *      judgement, no model call, nothing to get wrong.
 *
 * And it comes undone the same way: clear the declaration and the story is open again.
 * There is no separate "reopen" — the state is always derivable from the declaration
 * plus the episodes, which is what stops it drifting out of step with them.
 */

/** The mechanical facts a story's ending is decided on. Nothing here is a judgement. */
export interface EndingFacts {
  episodes: number;
  /** Episodes written but not yet approved by a person. */
  unapproved: number;
  /** Episodes with no draft at all. */
  unwritten: number;
  /** Debts the story has taken on and not paid — unresolved open threads. */
  openThreads: number;
  /** The episode the story starts closing from. Null = nobody has said it is closing. */
  finaleFrom: number | null;
}

export type EndingVerdict =
  /** Nothing written yet. */
  | { kind: "empty" }
  /** Running, and nobody has said it is closing. */
  | { kind: "open" }
  /** Closing, but something mechanical is still in the way. */
  | { kind: "closing"; blocking: string[] }
  /** Everything lines up. The status can move to COMPLETED. */
  | { kind: "finished"; warnings: string[] };

/**
 * Decide, from facts alone. Pure, so the rule can be tested without a story.
 *
 * "Every episode approved" is the bar, and audio deliberately is not part of it: a story
 * is a writing artefact and the MP3 is production. A story whose every episode has been
 * written and read and approved is finished, whether or not anybody has spoken it yet.
 *
 * Unresolved open threads BLOCK a story that has not declared its ending and only WARN
 * about one that has. Taken from ainovel-cli, which learned it the expensive way: a book
 * whose finale was declared and which missed one foreshadow was locked out of its
 * terminal state forever, and the run burned through a hundred and forty chapters trying
 * to satisfy a gate it could no longer reach. Declaring the ending is a person saying
 * they know what is still open and are ending anyway, and the system has no business
 * arguing.
 */
export function storyEnding(facts: EndingFacts): EndingVerdict {
  if (facts.episodes === 0) return { kind: "empty" };
  if (facts.finaleFrom === null) return { kind: "open" };

  const blocking: string[] = [];
  if (facts.unwritten > 0) {
    blocking.push(
      `${facts.unwritten} episode${facts.unwritten === 1 ? "" : "s"} still ` +
        `${facts.unwritten === 1 ? "has" : "have"} no draft`,
    );
  }
  if (facts.unapproved > 0) {
    blocking.push(
      `${facts.unapproved} draft${facts.unapproved === 1 ? "" : "s"} nobody has approved yet`,
    );
  }
  if (blocking.length > 0) return { kind: "closing", blocking };

  const warnings: string[] = [];
  if (facts.openThreads > 0) {
    warnings.push(
      `${facts.openThreads} open thread${facts.openThreads === 1 ? "" : "s"} ` +
        `${facts.openThreads === 1 ? "was" : "were"} never resolved`,
    );
  }
  return { kind: "finished", warnings };
}

/**
 * What to tell a person who has NOT declared an ending yet.
 *
 * Separate from the verdict because it is advice rather than a fact: these are the things
 * that would be in the way if they declared one now, and knowing them is the difference
 * between declaring and then finding out.
 */
export function wouldBlock(facts: EndingFacts): string[] {
  const verdict = storyEnding({ ...facts, finaleFrom: facts.finaleFrom ?? facts.episodes });
  return verdict.kind === "closing" ? verdict.blocking : [];
}
