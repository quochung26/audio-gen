import { join } from "node:path";
import { Hono } from "hono";
import { AudioTrackKind, LicenseType, prisma } from "@audio/database";
import { ffprobe } from "@audio/audio";
import { loadEnv } from "@audio/config";
import { putLocal, safeFileName, storageRoot } from "../lib/storage";
import { field, UserError } from "../lib/http";

export const tracks = new Hono();

tracks.get("/", async (c) => {
  const rows = await prisma.audioTrack.findMany({
    orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { episodesAsBgm: true } } },
  });
  return c.json({ tracks: rows, storageDriver: loadEnv().STORAGE_DRIVER });
});

/**
 * Thêm nhạc nền / hiệu ứng vào thư viện.
 *
 * Hai đường vào, vì hai driver lưu trữ khác nhau: `local` thì tải file lên và
 * API tự ghi vào kho; `r2` thì không có credential nên dán URL công khai.
 *
 * `licenseType` được phép là UNKNOWN — không chặn ở đây mà chặn ở bước xuất bản.
 * Chặn sớm thì không nghe thử được trước khi đi tìm giấy phép; chặn muộn thì
 * không tập nào lọt ra ngoài kèm nhạc mập mờ.
 */
tracks.post("/", async (c) => {
  const body = await c.req.parseBody();
  const title = field(body, "title");
  const kind = field(body, "kind") as AudioTrackKind;
  const licenseType = (field(body, "licenseType") || "UNKNOWN") as LicenseType;

  if (!title) throw new UserError("Thiếu tên track");
  if (!Object.values(AudioTrackKind).includes(kind)) throw new UserError("Loại track không hợp lệ");
  if (!Object.values(LicenseType).includes(licenseType)) throw new UserError("Giấy phép không hợp lệ");

  // Cột `url` giữ KHOÁ trong kho khi tự tải lên, hoặc URL công khai khi dán —
  // hai dạng phân biệt được vì khoá không bao giờ bắt đầu bằng "http".
  const file = body.file;
  const pastedUrl = field(body, "url");
  let url: string;
  let localFile: string | null = null;

  if (file instanceof File && file.size > 0) {
    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      url = await putLocal(`library/${kind.toLowerCase()}/${safeFileName(file.name)}`, bytes);
    } catch (err) {
      throw new UserError((err as Error).message);
    }
    localFile = join(storageRoot(), url);
  } else if (pastedUrl) {
    url = pastedUrl;
  } else {
    throw new UserError("Chọn file để tải lên, hoặc dán URL");
  }

  // Độ dài cần thật: Studio dựa vào nó để báo nhạc sẽ lặp mấy vòng.
  // ffprobe chỉ đọc được file cục bộ nên URL từ xa đành để 0.
  const durationMs = localFile ? (await ffprobe(localFile)).durationMs : 0;

  await prisma.audioTrack.create({
    data: {
      title,
      kind,
      url,
      durationMs,
      mood: field(body, "mood") || null,
      tags: field(body, "tags")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      licenseType,
      licenseNote: field(body, "licenseNote") || null,
      attribution: field(body, "attribution") || null,
    },
  });
  return c.json({ ok: `Đã thêm "${title}"` });
});

/**
 * Xoá track khỏi thư viện.
 *
 * File trên đĩa GIỮ NGUYÊN — tập đã xuất bản có thể đang chứa tiếng nhạc này,
 * và xoá bản gốc thì không dựng lại được tập nữa.
 */
tracks.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const used = await prisma.episode.count({ where: { bgmTrackId: id } });
  if (used > 0) {
    throw new UserError(`Còn ${used} tập đang dùng track này. Gỡ khỏi các tập đó trước.`);
  }
  await prisma.audioTrack.delete({ where: { id } });
  return c.json({ ok: true });
});
