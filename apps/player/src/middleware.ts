import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALES, localeFromAcceptLanguage } from "@/lib/i18n";
import { renamedPath, renamedQuery } from "@/lib/legacy-paths";

/**
 * Puts a locale on every request, without putting one on every URL.
 *
 * The route tree lives under `app/[locale]/`, but the default locale carries no prefix in
 * public URLs, so an un-prefixed path is REWRITTEN to `/vi/...`: the address bar is
 * untouched while the router still sees a locale segment.
 *
 * Two headers ride along:
 * - `x-locale`   — for server actions, which get no route params and so cannot read
 *                  `[locale]` themselves.
 * - `x-pathname` — the PUBLIC path, before the rewrite. The language switcher needs it to
 *                  build the same page in the other language, and after a rewrite there is
 *                  no other reliable way to recover it.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // `/vi/x` would serve the same page as `/x` at a second URL — split search ranking, and
  // a switcher able to build a URL it cannot parse back. Redirect rather than rewrite so
  // there is exactly one address for each page.
  if (pathname === `/${DEFAULT_LOCALE}` || pathname.startsWith(`/${DEFAULT_LOCALE}/`)) {
    const rest = pathname.slice(`/${DEFAULT_LOCALE}`.length) || "/";
    return NextResponse.redirect(new URL(`${rest}${search}`, req.url));
  }

  // The old Vietnamese vocabulary, moved permanently. Done before the locale is worked out
  // so the prefix survives: `/en/truyen/x` lands on `/en/story/x`, not on `/story/x`.
  const localePrefix = LOCALES.find((l) => l !== DEFAULT_LOCALE && isPrefix(pathname, l));
  const prefixLen = localePrefix ? `/${localePrefix}`.length : 0;
  const movedTo = renamedPath(pathname.slice(prefixLen) || "/");
  const movedQuery = renamedQuery(search);

  if (movedTo || movedQuery !== null) {
    const target = pathname.slice(0, prefixLen) + (movedTo ?? pathname.slice(prefixLen));
    const qs = movedQuery ?? search.replace(/^\?/, "");
    // 308 rather than 307: the move is permanent, and a search engine that keeps following
    // a temporary redirect never transfers the ranking to the new address.
    return NextResponse.redirect(new URL(`${target}${qs ? `?${qs}` : ""}`, req.url), 308);
  }

  const prefix = LOCALES.find((l) => l !== DEFAULT_LOCALE && isPrefix(pathname, l));
  const locale = prefix ?? DEFAULT_LOCALE;

  const headers = new Headers(req.headers);
  headers.set("x-locale", locale);
  headers.set("x-pathname", prefix ? pathname.slice(`/${prefix}`.length) || "/" : pathname);

  // A first visit with no prefix and a browser asking for another language: send them to
  // that language's URL rather than rewriting in place, so the address bar matches what
  // they are reading and the link they copy carries the language.
  if (!prefix && pathname === "/") {
    const wanted = localeFromAcceptLanguage(req.headers.get("accept-language"));
    if (wanted !== DEFAULT_LOCALE) {
      return NextResponse.redirect(new URL(`/${wanted}${search}`, req.url));
    }
  }

  if (prefix) return NextResponse.next({ request: { headers } });

  return NextResponse.rewrite(new URL(`/${DEFAULT_LOCALE}${pathname}${search}`, req.url), {
    request: { headers },
  });
}

function isPrefix(pathname: string, locale: string): boolean {
  return pathname === `/${locale}` || pathname.startsWith(`/${locale}/`);
}

export const config = {
  /**
   * Everything except the paths that must never gain a locale segment:
   * `/api` (audio streaming and Auth.js callbacks — a rewrite would 404 the callback URL
   * registered with Google), Next's own assets, and the files a PWA fetches by exact path.
   */
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/).*)"],
};
