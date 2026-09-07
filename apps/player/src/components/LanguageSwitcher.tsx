import Link from "next/link";
import { languageNativeName } from "@audio/core/language";
import { LOCALES, localeHref, type Locale } from "@/lib/i18n";

/**
 * Switches language while staying on the same page.
 *
 * `path` is the PUBLIC path, handed down from the layout — see lib/request-locale.ts for
 * why it cannot be read here.
 *
 * Each language is named in ITS OWN language ("Tiếng Việt", not "Vietnamese"): someone who
 * has landed in a language they cannot read has to be able to find their way out, and a
 * list written in the language they are stuck in does not help them.
 *
 * Plain links rather than a select: a link is shareable, works with no JavaScript, and
 * gives the crawler both language versions to follow.
 */
export function LanguageSwitcher({ locale, path }: { locale: Locale; path: string }) {
  return (
    <nav className="flex items-center gap-1 text-xs" aria-label="Language">
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={localeHref(l, path)}
          hrefLang={l}
          aria-current={l === locale ? "true" : undefined}
          className={`rounded px-1.5 py-0.5 ${
            l === locale ? "bg-neutral-800 text-neutral-200" : "text-neutral-500"
          }`}
        >
          {languageNativeName(l)}
        </Link>
      ))}
    </nav>
  );
}
