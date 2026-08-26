import { FACT_MIN_SIMILARITY, FACT_TOP_K, OPEN_THREAD_LIMIT } from "@audio/config";
import type { StoryFactInput } from "@audio/core";
import { prisma, type FactKind } from "@audio/database";
import { getEmbedding, toVectorLiteral } from "@audio/llm";
import { logger } from "../lib/logger";

export interface RetrievedFact {
  episodeNumber: number;
  kind: string;
  text: string;
  similarity: number;
}

/**
 * Lưu sự kiện của một tập kèm vector.
 *
 * Cột `embedding vector(1024)` không khai báo được trong Prisma nên phải dùng
 * `$executeRaw`. Đổi lại: pgvector nằm ngay trong Postgres đang có, không phải
 * dựng thêm service.
 */
export async function saveFacts(input: {
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  facts: StoryFactInput[];
}): Promise<number> {
  if (input.facts.length === 0) return 0;

  // Viết lại tập thì thay toàn bộ sự kiện của tập đó, không chồng lên bản cũ.
  await prisma.storyFact.deleteMany({
    where: { seriesId: input.seriesId, episodeNumber: input.episodeNumber, pinned: false },
  });

  const created = await prisma.storyFact.createManyAndReturn({
    data: input.facts.map((f) => ({
      seriesId: input.seriesId,
      episodeId: input.episodeId,
      episodeNumber: input.episodeNumber,
      kind: f.kind as FactKind,
      text: f.text.trim(),
    })),
    select: { id: true, text: true },
  });

  // Nhúng theo lô — embedding rẻ, gọi từng câu một là tự làm chậm mình.
  const vectors = await (await getEmbedding()).embed(created.map((c) => c.text));

  for (const [i, row] of created.entries()) {
    await prisma.$executeRaw`
      UPDATE "StoryFact" SET embedding = ${toVectorLiteral(vectors[i]!)}::vector
      WHERE id = ${row.id}
    `;
  }

  logger.info(`[facts] tập ${input.episodeNumber}: lưu ${created.length} sự kiện + vector`);
  return created.length;
}

/**
 * Truy hồi sự kiện liên quan tới beat của cảnh đang viết.
 *
 * KHÔNG lấy top-K vô điều kiện — có ngưỡng `FACT_MIN_SIMILARITY`. Cảnh mở đầu
 * một mạch mới thì đúng ra chẳng cần sự kiện cũ nào; lấy 6 sự kiện gần nhất
 * trong trường hợp đó chỉ làm model phân tán.
 *
 * Chỉ tìm trong các tập TRƯỚC tập đang viết — không để lộ tình tiết chưa xảy ra.
 */
export async function retrieveFacts(input: {
  seriesId: string;
  beforeEpisode: number;
  query: string;
}): Promise<RetrievedFact[]> {
  const [vector] = await (await getEmbedding()).embed([input.query]);
  if (!vector) return [];

  // `1 - (a <=> b)` đổi khoảng cách cosine thành độ tương đồng cho dễ đọc.
  const rows = await prisma.$queryRaw<
    Array<{ episodeNumber: number; kind: string; text: string; similarity: number }>
  >`
    SELECT "episodeNumber", kind::text AS kind, text,
           1 - (embedding <=> ${toVectorLiteral(vector)}::vector) AS similarity
    FROM "StoryFact"
    WHERE "seriesId" = ${input.seriesId}
      AND "episodeNumber" < ${input.beforeEpisode}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${toVectorLiteral(vector)}::vector
    LIMIT ${FACT_TOP_K}
  `;

  return rows.filter((r) => r.similarity >= FACT_MIN_SIMILARITY);
}

/**
 * Tình tiết bỏ ngỏ chưa có lời giải — nạp BẤT KỂ độ tương đồng.
 *
 * Vì sao không để vector search lo: đây là món nợ câu chuyện phải trả. Một tình
 * tiết bỏ ngỏ ở tập 3 vẫn cần nhắc ở tập 40 dù beat hiện tại chẳng liên quan gì
 * về mặt chủ đề. Tương đồng ngữ nghĩa không bắt được loại quan hệ đó.
 */
export async function openThreads(input: {
  seriesId: string;
  beforeEpisode: number;
}): Promise<Array<{ episodeNumber: number; text: string }>> {
  const rows = await prisma.storyFact.findMany({
    where: {
      seriesId: input.seriesId,
      kind: "OPEN_THREAD",
      resolved: false,
      episodeNumber: { lt: input.beforeEpisode },
    },
    orderBy: { episodeNumber: "asc" },
    take: OPEN_THREAD_LIMIT,
    select: { episodeNumber: true, text: true },
  });
  return rows;
}

/** Sự kiện người viết ghim — luôn nạp. */
export async function pinnedFacts(seriesId: string, beforeEpisode: number) {
  return prisma.storyFact.findMany({
    where: { seriesId, pinned: true, episodeNumber: { lt: beforeEpisode } },
    orderBy: { episodeNumber: "asc" },
    select: { episodeNumber: true, kind: true, text: true },
  });
}
