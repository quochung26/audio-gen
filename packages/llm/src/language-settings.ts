import { loadEnv } from "@audio/config";
import { prisma } from "@audio/database";
import { isLanguage, type LanguageCode } from "@audio/core";

/**
 * The default language for NEW stories.
 *
 * Only the starting value at creation: once created, the language lives in
 * `Series.language`, and changing this default leaves existing stories alone —
 * changing the language of a story already underway is another matter entirely, and
 * means rewriting from scratch.
 */
const KEY = "content.language";

export async function getDefaultLanguage(): Promise<LanguageCode> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const stored = row?.value?.trim();
  if (stored && isLanguage(stored)) return stored;
  return loadEnv().CONTENT_LANGUAGE;
}

/** An empty string clears it, back to the `.env` value. */
export async function setDefaultLanguage(value: string): Promise<void> {
  const v = value.trim();
  if (!v) {
    await prisma.setting.deleteMany({ where: { key: KEY } });
    return;
  }
  if (!isLanguage(v)) throw new Error(`Invalid language: "${v}"`);
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: v }, update: { value: v } });
}

/** Whether the default currently comes from `.env` or from a choice made in the UI. */
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
