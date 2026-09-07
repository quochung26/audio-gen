"use server";

import { revalidatePath } from "next/cache";
import { prismaPlayer } from "@audio/database";
import { auth } from "@/auth";
import {
  COMMENT_COOLDOWN_MS,
  COMMENT_MAX_LENGTH,
  COMMENT_MIN_LENGTH,
} from "@/lib/comment-limits";

export interface InteractionState {
  error?: string;
  ok?: string;
}

/** Who is signed in. Null means nobody — every action below requires it. */
async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * Only allows actions on a PUBLISHED episode.
 *
 * Without the check, anyone could send an arbitrary id and create a favourite or rating for
 * an unreleased episode — revealing that it exists and polluting the numbers.
 */
async function assertPublished(episodeId: string): Promise<boolean> {
  const ep = await prismaPlayer.episode.findUnique({
    where: { id: episodeId },
    select: { status: true, publishedAt: true },
  });
  return ep?.status === "PUBLISHED" && ep.publishedAt !== null;
}

export async function toggleFavorite(
  episodeId: string,
  _prev: InteractionState,
): Promise<InteractionState> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in to save favourites." };
  if (!(await assertPublished(episodeId))) return { error: "Episode not found." };

  const existing = await prismaPlayer.favorite.findUnique({
    where: { userId_episodeId: { userId, episodeId } },
  });

  if (existing) {
    await prismaPlayer.favorite.delete({ where: { userId_episodeId: { userId, episodeId } } });
  } else {
    await prismaPlayer.favorite.create({ data: { userId, episodeId } });
  }

  revalidatePath(`/nghe/${episodeId}`);
  revalidatePath("/yeu-thich");
  return { ok: existing ? "Removed from favourites." : "Saved to favourites." };
}

export async function rateEpisode(
  episodeId: string,
  _prev: InteractionState,
  formData: FormData,
): Promise<InteractionState> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in to rate." };

  const score = Number(formData.get("score"));
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return { error: "The score has to be 1 to 5 stars." };
  }
  if (!(await assertPublished(episodeId))) return { error: "Episode not found." };

  // Upsert: rating again OVERWRITES the old score rather than adding a second vote.
  await prismaPlayer.rating.upsert({
    where: { userId_episodeId: { userId, episodeId } },
    create: { userId, episodeId, score },
    update: { score },
  });

  revalidatePath(`/nghe/${episodeId}`);
  return { ok: `Rated ${score} stars.` };
}

/**
 * Post a comment.
 *
 * It goes into a MODERATION queue rather than appearing immediately. A deliberate choice:
 * nobody is on duty to clear spam hourly, and comments appearing instantly on a public page
 * invite spam and abuse. Approved in Studio.
 *
 * `timestampMs` anchors a comment to a moment in the episode — "12:30 is chilling".
 */
export async function addComment(
  episodeId: string,
  _prev: InteractionState,
  formData: FormData,
): Promise<InteractionState> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in to comment." };

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < COMMENT_MIN_LENGTH) return { error: "That comment is too short." };
  if (body.length > COMMENT_MAX_LENGTH) {
    return { error: `A comment is at most ${COMMENT_MAX_LENGTH} characters.` };
  }
  if (!(await assertPublished(episodeId))) return { error: "Episode not found." };

  // Rate-limits posting. Without it one person could drop hundreds of comments into the
  // queue and a moderator would have to clear each by hand.
  const last = await prismaPlayer.comment.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (last && Date.now() - last.createdAt.getTime() < COMMENT_COOLDOWN_MS) {
    return { error: "That was quick. Wait half a minute before posting again." };
  }

  const rawTs = Number(formData.get("timestampMs"));
  const timestampMs = Number.isFinite(rawTs) && rawTs > 0 ? Math.round(rawTs) : null;

  await prismaPlayer.comment.create({
    data: { userId, episodeId, body, timestampMs },
  });

  revalidatePath(`/nghe/${episodeId}`);
  return { ok: "Posted. Your comment appears once it is approved." };
}

/**
 * Save the listening position to the server — the main reason to sign in.
 *
 * Signed out, it skips silently and does NOT raise an error: this runs in the background
 * every 15 seconds, and an error would pester a signed-out listener about something they
 * never asked for.
 *
 * No `revalidatePath`: it runs during playback, and refreshing the page cuts the audio.
 */
export async function saveProgress(episodeId: string, positionMs: number): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  if (!Number.isFinite(positionMs) || positionMs < 0) return;

  const position = Math.round(positionMs);
  await prismaPlayer.listenProgress.upsert({
    where: { userId_episodeId: { userId, episodeId } },
    create: { userId, episodeId, positionMs: position },
    update: { positionMs: position },
  });
}
