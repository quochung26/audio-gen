/**
 * The Episode state machine, plus two constraints Prisma cannot enforce.
 * See docs/database.md section 4.
 */

export type EpisodeStatusName =
  | "IDEA"
  | "OUTLINED"
  | "DRAFTING"
  | "DRAFTED"
  | "SCRIPTED"
  | "RENDERING"
  | "READY"
  | "PUBLISHED"
  | "FAILED";

const ALLOWED: Record<EpisodeStatusName, EpisodeStatusName[]> = {
  IDEA: ["OUTLINED", "FAILED"],
  OUTLINED: ["DRAFTING", "FAILED"],
  DRAFTING: ["DRAFTED", "DRAFTING", "FAILED"],
  DRAFTED: ["SCRIPTED", "DRAFTING", "FAILED"],
  SCRIPTED: ["RENDERING", "DRAFTED", "FAILED"],
  RENDERING: ["READY", "RENDERING", "FAILED"],
  READY: ["PUBLISHED", "RENDERING", "FAILED"],
  PUBLISHED: ["READY"],
  FAILED: ["IDEA", "OUTLINED", "DRAFTING", "SCRIPTED", "RENDERING"],
};

export interface TransitionGuardInput {
  humanReviewed: boolean;
  /** The licences of every music/SFX track used in the episode. */
  assetLicenses?: string[];
}

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

export function assertTransition(
  from: EpisodeStatusName,
  to: EpisodeStatusName,
  ctx: TransitionGuardInput,
): void {
  if (!ALLOWED[from].includes(to)) {
    throw new TransitionError(`Cannot move ${from} → ${to}.`);
  }

  // Gate 1: a raw draft must not slip through to the audio step.
  if (from === "DRAFTED" && to === "SCRIPTED" && !ctx.humanReviewed) {
    throw new TransitionError(
      "The draft is not approved. Read it and mark it approved before making audio.",
    );
  }

  // Gate 2: do not publish an episode whose draft is unapproved.
  //
  // Not redundant even though gate 1 blocks DRAFTED → SCRIPTED: `unapproveDraft`
  // can clear the approval on an episode ALREADY built, leaving the path
  // approve → build → unapprove → publish. Unapproving means "this needs work",
  // and what needs work must not go out.
  if (to === "PUBLISHED" && !ctx.humanReviewed) {
    throw new TransitionError(
      "The draft is not approved. Read it and mark it approved before publishing.",
    );
  }

  // Gate 3: do not publish while assets have unverified licences.
  if (to === "PUBLISHED") {
    const unknown = (ctx.assetLicenses ?? []).filter((l) => l === "UNKNOWN");
    if (unknown.length > 0) {
      throw new TransitionError(
        `${unknown.length} music/effect tracks have unverified licences. ` +
          "Verify them or swap in different assets before publishing.",
      );
    }
  }
}

export function canTransition(
  from: EpisodeStatusName,
  to: EpisodeStatusName,
  ctx: TransitionGuardInput,
): { ok: true } | { ok: false; reason: string } {
  try {
    assertTransition(from, to, ctx);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
