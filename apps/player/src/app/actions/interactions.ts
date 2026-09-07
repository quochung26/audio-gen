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
  if (!userId) return { error: "Đăng nhập để lưu truyện yêu thích." };
  if (!(await assertPublished(episodeId))) return { error: "Không tìm thấy tập này." };

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
  return { ok: existing ? "Đã bỏ khỏi yêu thích." : "Đã lưu vào yêu thích." };
}

export async function rateEpisode(
  episodeId: string,
  _prev: InteractionState,
  formData: FormData,
): Promise<InteractionState> {
  const userId = await currentUserId();
  if (!userId) return { error: "Đăng nhập để đánh giá." };

  const score = Number(formData.get("score"));
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return { error: "Điểm phải từ 1 tới 5 sao." };
  }
  if (!(await assertPublished(episodeId))) return { error: "Không tìm thấy tập này." };

  // Upsert: rating again OVERWRITES the old score rather than adding a second vote.
  await prismaPlayer.rating.upsert({
    where: { userId_episodeId: { userId, episodeId } },
    create: { userId, episodeId, score },
    update: { score },
  });

  revalidatePath(`/nghe/${episodeId}`);
  return { ok: `Đã chấm ${score} sao.` };
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
  if (!userId) return { error: "Đăng nhập để bình luận." };

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < COMMENT_MIN_LENGTH) return { error: "Bình luận quá ngắn." };
  if (body.length > COMMENT_MAX_LENGTH) {
    return { error: `Bình luận tối đa ${COMMENT_MAX_LENGTH} ký tự.` };
  }
  if (!(await assertPublished(episodeId))) return { error: "Không tìm thấy tập này." };

  // Rate-limits posting. Without it one person could drop hundreds of comments into the
  // queue and a moderator would have to clear each by hand.
  const last = await prismaPlayer.comment.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (last && Date.now() - last.createdAt.getTime() < COMMENT_COOLDOWN_MS) {
    return { error: "Gửi hơi nhanh. Đợi nửa phút rồi gửi tiếp." };
  }

  const rawTs = Number(formData.get("timestampMs"));
  const timestampMs = Number.isFinite(rawTs) && rawTs > 0 ? Math.round(rawTs) : null;

  await prismaPlayer.comment.create({
    data: { userId, episodeId, body, timestampMs },
  });

  revalidatePath(`/nghe/${episodeId}`);
  return { ok: "Đã gửi. Bình luận sẽ hiện sau khi được duyệt." };
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
