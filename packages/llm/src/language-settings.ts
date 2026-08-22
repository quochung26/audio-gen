import { loadEnv } from "@audio/config";
import { prisma } from "@audio/database";
import { isLanguage, type LanguageCode } from "@audio/core";

/**
 * Ngôn ngữ mặc định cho truyện MỚI.
 *
 * Chỉ là giá trị khởi đầu khi tạo bộ: tạo xong thì ngôn ngữ nằm ở
 * `Series.language`, và đổi mặc định ở đây không đụng tới bộ truyện đã có —
 * đổi ngôn ngữ một bộ đang viết dở là chuyện khác hẳn, phải viết lại từ đầu.
 */
const KEY = "content.language";

export async function getDefaultLanguage(): Promise<LanguageCode> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const stored = row?.value?.trim();
  if (stored && isLanguage(stored)) return stored;
  return loadEnv().CONTENT_LANGUAGE;
}

/** Chuỗi rỗng = xoá, quay về giá trị trong `.env`. */
export async function setDefaultLanguage(value: string): Promise<void> {
  const v = value.trim();
  if (!v) {
    await prisma.setting.deleteMany({ where: { key: KEY } });
    return;
  }
  if (!isLanguage(v)) throw new Error(`Ngôn ngữ không hợp lệ: "${v}"`);
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: v }, update: { value: v } });
}

/** Mặc định đang lấy từ `.env` hay từ lựa chọn trên giao diện. */
export async function getDefaultLanguageSource(): Promise<{
  value: LanguageCode;
  fromEnv: boolean;
}> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const stored = row?.value?.trim();
  return stored && isLanguage(stored)
    ? { value: stored, fromEnv: false }
    : { value: loadEnv().CONTENT_LANGUAGE, fromEnv: true };
}
