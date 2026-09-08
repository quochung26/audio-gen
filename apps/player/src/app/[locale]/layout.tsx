import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { AccountMenu } from "@/components/AccountMenu";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { LocaleProvider } from "@/components/LocaleProvider";
import { LOCALES, dict, localeHref, type Locale } from "@/lib/i18n";
import { currentPath } from "@/lib/request-locale";
import "../globals.css";

/**
 * The ROOT layout — it owns `<html>`, and it lives under `[locale]` so `lang` can follow
 * the locale. There is deliberately no `app/layout.tsx` above it: two root layouts would
 * mean two `<html>` elements, and `lang` would be stuck on whichever was outermost.
 */

/**
 * Dynamic, and deliberately NOT `generateStaticParams`.
 *
 * Prerendering the two locale segments looks free, but it runs `generateMetadata` with no
 * request behind it — and the hreflang alternates are built from the request path, so every
 * prerendered page would claim the home page as its other-language version. The catalogue
 * is already dynamic (it changes whenever an episode is published), so there was nothing to
 * gain in exchange.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = dict(locale as Locale);

  // No `alternates` here: a layout does not know which sub-page is rendering at metadata
  // time, and one declaration for the whole tree pointed every page at the home page. Each
  // page sets its own with `localeAlternates`.
  return {
    title: { default: "Audio Truyện", template: "%s · Audio Truyện" },
    description: t.siteDescription,
    manifest: "/manifest.json",
  };
}

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // A hand-typed `/fr/...` reaches here as a real segment. 404 rather than quietly serving
  // Vietnamese at a URL that claims to be French.
  if (!LOCALES.includes(locale as Locale)) notFound();

  const l = locale as Locale;

  return (
    <html lang={l}>
      <body className="min-h-screen bg-page text-neutral-100 antialiased">
        <LocaleProvider locale={l}>
          <PlayerProvider>
            {/* Sticky: the catalogue is a long scroll, and getting home used to mean
                scrolling all the way back up to reach the only link that does it. */}
            <header className="sticky top-0 z-40 border-b border-line bg-page/90 backdrop-blur-md">
              <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5">
                <Link
                  href={localeHref(l, "/")}
                  className="font-semibold tracking-tight transition hover:text-accent"
                >
                  Audio Truyện
                </Link>
                <div className="flex items-center gap-3">
                  <LanguageSwitcher locale={l} path={await currentPath()} />
                  <AccountMenu locale={l} />
                </div>
              </div>
            </header>

            {/* pb-28: leaves room for the mini player pinned to the bottom */}
            <main className="mx-auto max-w-3xl px-4 py-6 pb-28">{children}</main>

            <MiniPlayer />
          </PlayerProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
