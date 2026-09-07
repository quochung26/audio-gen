/**
 * Vietnamese slugs: "Chuyến xe cuối cùng" → "chuyen-xe-cuoi-cung".
 * Diacritics have to be stripped by hand because NFD does not decompose đ/Đ.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Add a suffix when the slug is already taken. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  const slug = slugify(base);
  if (!taken.has(slug)) return slug;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${slug}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${slug}-${Date.now()}`;
}
