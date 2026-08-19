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

/** Ai đang đăng nhập. Null nghĩa là chưa — mọi thao tác dưới đây đều cần. */
async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * Chỉ cho thao tác trên tập ĐÃ XUẤT BẢN.
 *
 * Không kiểm thì người ta gửi id bất kỳ và tạo được yêu thích/đánh giá cho tập
 * chưa phát hành — vừa lộ có tập đó tồn tại, vừa làm bẩn số liệu.
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

  // Upsert: đánh giá lại thì ĐÈ lên điểm cũ, không cộng thêm một phiếu.
  await prismaPlayer.rating.upsert({
    where: { userId_episodeId: { userId, episodeId } },
    create: { userId, episodeId, score },
    update: { score },
  });

  revalidatePath(`/nghe/${episodeId}`);
  return { ok: `Đã chấm ${score} sao.` };
}

/**
 * Gửi bình luận.
 *
 * Vào hàng CHỜ DUYỆT, không hiện ngay. Đây là lựa chọn có ý thức: trang này
 * chưa có ai trực để dọn spam theo giờ, mà bình luận hiện ngay trên một trang
 * công khai là mời spam và nội dung bẩn. Duyệt ở Studio.
 *
 * `timestampMs` để bình luận neo vào một mốc trong tập — "đoạn 12:30 nghe rợn".
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

  // Chặn gửi liên tiếp. Không có thì một người dán được hàng trăm bình luận
  // vào hàng chờ và người duyệt phải dọn tay từng cái.
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
 * Lưu vị trí nghe lên máy chủ — đây là lý do chính để đăng nhập.
 *
 * Chưa đăng nhập thì bỏ qua lặng lẽ, KHÔNG báo lỗi: hàm này chạy nền mỗi 15
 * giây, báo lỗi thì người chưa đăng nhập bị làm phiền vì một thứ họ không yêu cầu.
 *
 * Không `revalidatePath`: nó chạy trong lúc đang phát, làm mới trang là ngắt
 * tiếng.
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
