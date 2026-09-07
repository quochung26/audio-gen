import type { JobType } from "@audio/database";

/**
 * Decide the next step for an episode in a batch run.
 *
 * Split out as a PURE function that never touches the DB: it is the easiest place in the
 * whole feature to get wrong (miss one condition and the run stalls or loops forever) and
 * also the hardest to set up situations for if it had to go through a real DB.
 *
 * Judged on the DATA that exists rather than on `Episode.status`: status can drift when
 * the user clicks something in Studio mid-run, while "are there blocks" is always true.
 */

export interface EpisodeProgress {
  humanReviewed: boolean;
  /** Whether the scenes have been written. */
  hasDraft: boolean;
  /** The story has a rewrite step AND this episode still has scenes not rewritten. */
  needsTranslate: boolean;
  /** Whether the audio script has been split into blocks. */
  blocksTotal: number;
  /** How many blocks already have an audio file. */
  blocksWithAudio: number;
  hasSummary: boolean;
  hasMp3: boolean;
}

export interface BatchOptions {
  autoApprove: boolean;
  withAudio: boolean;
}

export type BatchStep =
  /** Queue this job. */
  | { kind: "job"; type: JobType }
  /** Auto-approve and recompute (only with autoApprove). */
  | { kind: "approve" }
  /** Stop and wait for a person to approve the draft. */
  | { kind: "wait-review" }
  /** This episode is done. */
  | { kind: "done" };

export function nextStep(ep: EpisodeProgress, opts: BatchOptions): BatchStep {
  if (!ep.hasDraft) return { kind: "job", type: "WRITE_SCENE" };

  // The rewrite comes BEFORE the approval gate. Approving a draft in a language that never
  // reaches the speakers makes the gate meaningless: what the reader nodded at and what the
  // listener receives are two different texts.
  if (ep.needsTranslate) return { kind: "job", type: "TRANSLATE" };

  // The gate: a raw draft must not go further without a person reading it.
  // A batch run is NOT allowed to slip past this — `autoApprove` is the user's deliberate
  // choice, never a default.
  if (!ep.humanReviewed) {
    return opts.autoApprove ? { kind: "approve" } : { kind: "wait-review" };
  }

  if (ep.blocksTotal === 0) return { kind: "job", type: "AUDIO_EDIT" };
  if (!ep.hasSummary) return { kind: "job", type: "SUMMARIZE" };

  // Stop after the script: for when you want to reread the whole draft before spending
  // TTS time on the entire story.
  if (!opts.withAudio) return { kind: "done" };

  if (ep.blocksWithAudio < ep.blocksTotal) return { kind: "job", type: "TTS" };
  if (!ep.hasMp3) return { kind: "job", type: "MIX" };

  return { kind: "done" };
}

/** Whether the episode has been through the whole chain (per the run's options). */
export function isEpisodeComplete(ep: EpisodeProgress, opts: BatchOptions): boolean {
  return nextStep(ep, opts).kind === "done";
}
