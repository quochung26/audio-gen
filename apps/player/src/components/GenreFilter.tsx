"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { languageNativeName } from "@audio/core/language";
import { LOCALES } from "@/lib/i18n";
import { useLocale } from "./LocaleProvider";

/**
 * Filter by genre, and by the language a story is written in.
 *
 * Uses the query string rather than React state: sending someone the link after filtering
 * shows them what you were looking at, and the browser's Back button behaves the way people
 * expect.
 *
 * The language row only appears when there is actually something to choose between. On a
 * catalogue that is entirely Vietnamese it would be a row with one option and no purpose,
 * and it would draw attention to a filter that cannot change anything.
 */
export function GenreFilter({ genres, languages }: { genres: string[]; languages: string[] }) {
  const { t, href, locale } = useLocale();
  const params = useSearchParams();
  const genre = params.get("genre");
  const lang = params.get("lang");

  const withParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    return href(qs ? `/?${qs}` : "/");
  };

  if (genres.length < 2 && languages.length < 2) return null;

  return (
    <div className="space-y-2">
      {languages.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {/*
            "All languages" is the escape hatch, not the default: the default shows stories
            in the language being read, because a story you cannot understand is not a
            result. But hiding the rest outright would leave someone unable to find a story
            they know exists.
          */}
          <Chip href={withParam("lang", "all")} label={t.allLanguages} active={lang === "all"} />
          {LOCALES.filter((l) => languages.includes(l)).map((l) => (
            <Chip
              key={l}
              href={withParam("lang", l === locale ? null : l)}
              label={languageNativeName(l)}
              active={lang === l || (!lang && l === locale)}
            />
          ))}
        </div>
      )}

      {genres.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip href={withParam("genre", null)} label={t.allGenres} active={!genre} />
          {genres.map((g) => (
            <Chip key={g} href={withParam("genre", g)} label={g} active={genre === g} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs whitespace-nowrap transition ${
        active
          ? "bg-neutral-100 font-medium text-neutral-950"
          : "bg-surface text-neutral-400 hover:bg-raised hover:text-neutral-200"
      }`}
    >
      {label}
    </Link>
  );
}
