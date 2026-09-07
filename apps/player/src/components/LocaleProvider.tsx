"use client";

import { createContext, useContext, useMemo } from "react";
import { dict, localeHref, type Dict, type Locale } from "@/lib/i18n";

/**
 * The locale for client components.
 *
 * Server components read `params.locale` directly and never need this. Client components
 * cannot: the twelve of them sit at various depths under the layout, and threading both a
 * locale and a dictionary through every intermediate component as props means a new prop on
 * a whole chain each time one of them needs one more string.
 *
 * Exposes `href` as well as `t`, because every link a client component builds has to carry
 * the locale — a hardcoded `/nghe/x` inside the English tree silently drops the reader back
 * into Vietnamese, and nothing about the page would look wrong until they read it.
 */
interface LocaleValue {
  locale: Locale;
  t: Dict;
  href: (path: string) => string;
}

const Ctx = createContext<LocaleValue | null>(null);

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo<LocaleValue>(
    () => ({ locale, t: dict(locale), href: (path) => localeHref(locale, path) }),
    [locale],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleValue {
  const ctx = useContext(Ctx);
  // Falling back would hide the mistake until someone read a page in the wrong language.
  if (!ctx) throw new Error("useLocale must be inside LocaleProvider");
  return ctx;
}
