/**
 * The locale and public path of the current request, read from the headers middleware set.
 *
 * SERVER ONLY. Pages get `locale` from their route params and should use that; this exists
 * for the two places that have no params:
 *
 * - Server actions, which are POSTs with no route segment of their own. Their messages are
 *   rendered straight into the page, so they have to match the language around them.
 * - The language switcher, which needs the PUBLIC path. After the middleware rewrite the
 *   router sees `/vi/truyen/x` while the address bar says `/truyen/x`, so the original has
 *   to be carried across explicitly rather than recovered.
 *
 * Both fall back to the default rather than throwing: a request that somehow skipped the
 * middleware should render in Vietnamese, not 500.
 */
import { headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n";

export async function currentLocale(): Promise<Locale> {
  const value = (await headers()).get("x-locale");
  return LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE;
}

export async function currentPath(): Promise<string> {
  return (await headers()).get("x-pathname") || "/";
}
