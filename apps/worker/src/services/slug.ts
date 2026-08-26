import { slugify } from "@audio/core";
import { prisma } from "@audio/database";

/**
 * Slug chưa ai dùng.
 *
 * Đối chiếu với CẢ Series lẫn Episode: hai bảng dùng chung không gian slug vì
 * Player phục vụ `/truyen/<slug>` và `/nghe/<slug>` từ cùng một gốc, và ràng
 * buộc duy nhất nằm riêng từng bảng nên trùng chéo không bị chặn ở tầng DB.
 */
export async function freeSlug(source: string): Promise<string> {
  const base = slugify(source);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const [s, e] = await Promise.all([
      prisma.series.findUnique({ where: { slug: candidate }, select: { id: true } }),
      prisma.episode.findUnique({ where: { slug: candidate }, select: { id: true } }),
    ]);
    if (!s && !e) return candidate;
  }
  return `${base}-${Date.now()}`;
}
