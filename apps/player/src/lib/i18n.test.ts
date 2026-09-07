import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALES,
  dict,
  localeFromAcceptLanguage,
  localeHref,
  splitLocale,
  catalogueLanguage,
  localeAlternates,
  type Dict,
} from "./i18n";

describe("dictionaries", () => {
  it("every locale has every key", () => {
    // The whole point of typing `en` as `Dict`: a key added to one dictionary and forgotten
    // in the other is a build error. This test covers the case the type cannot — a locale
    // added to LOCALES with no dictionary behind it.
    const keys = Object.keys(dict(DEFAULT_LOCALE)) as (keyof Dict)[];
    for (const locale of LOCALES) {
      const d = dict(locale);
      for (const k of keys) expect(d[k], `${locale} is missing ${k}`).toBeDefined();
    }
  });

  it("no value is left as an empty string", () => {
    for (const locale of LOCALES) {
      for (const [k, v] of Object.entries(dict(locale))) {
        if (typeof v === "string") expect(v.trim(), `${locale}.${k}`).not.toBe("");
      }
    }
  });

  it("an unknown locale falls back to the default rather than throwing", () => {
    // The locale reaches this from a URL segment, so a hand-typed /fr/ must not 500.
    expect(dict("fr" as never)).toBe(dict(DEFAULT_LOCALE));
  });

  it("interpolating functions take the same arguments in both languages", () => {
    expect(dict("vi").episodeCount(3)).toContain("3");
    expect(dict("en").episodeCount(3)).toContain("3");
    expect(dict("vi").episodeTitle(2, "Bến cũ")).toContain("Bến cũ");
    expect(dict("en").episodeTitle(2, "Bến cũ")).toContain("Bến cũ");
  });

  it("English pluralises where Vietnamese does not need to", () => {
    // Vietnamese has no plural form, so a shared "{n} episodes" template would have been
    // wrong in one language whichever way it was written. Functions let each decide.
    expect(dict("en").episodeCount(1)).toBe("1 episode");
    expect(dict("en").episodeCount(2)).toBe("2 episodes");
    expect(dict("vi").episodeCount(1)).toBe("1 tập");
  });
});

describe("localeHref", () => {
  it("the default locale carries NO prefix", () => {
    // This is what keeps already-published RSS links alive.
    expect(localeHref("vi", "/story/abc")).toBe("/story/abc");
    expect(localeHref("vi", "/")).toBe("/");
  });

  it("other locales are prefixed", () => {
    expect(localeHref("en", "/story/abc")).toBe("/en/story/abc");
  });

  it("the home page does not end up as /en/", () => {
    expect(localeHref("en", "/")).toBe("/en");
  });

  it("tolerates a path with no leading slash", () => {
    expect(localeHref("en", "story/abc")).toBe("/en/story/abc");
  });

  it("keeps the query string", () => {
    expect(localeHref("en", "/?genre=kinh%20d%E1%BB%8B")).toBe("/en/?genre=kinh%20d%E1%BB%8B");
  });
});

describe("splitLocale", () => {
  it("reads a prefixed path", () => {
    expect(splitLocale("/en/story/abc")).toEqual({ locale: "en", rest: "/story/abc" });
  });

  it("an un-prefixed path is the default locale", () => {
    expect(splitLocale("/story/abc")).toEqual({ locale: "vi", rest: "/story/abc" });
  });

  it("/en alone is the English home page", () => {
    expect(splitLocale("/en")).toEqual({ locale: "en", rest: "/" });
  });

  it("does NOT treat /vi as a prefix — the default has none", () => {
    // Accepting both /vi/x and /x would serve one page at two URLs, which splits the search
    // ranking and makes the language switcher able to build a URL it cannot then parse back.
    expect(splitLocale("/vi/story/abc")).toEqual({ locale: "vi", rest: "/vi/story/abc" });
  });

  it("a story slug that looks like a locale is not eaten", () => {
    expect(splitLocale("/story/en")).toEqual({ locale: "vi", rest: "/story/en" });
  });

  it("round-trips with localeHref", () => {
    for (const locale of LOCALES) {
      for (const path of ["/", "/story/abc", "/listen/x", "/favourites"]) {
        expect(splitLocale(localeHref(locale, path))).toEqual({ locale, rest: path });
      }
    }
  });
});

describe("localeFromAcceptLanguage", () => {
  it("takes a supported language", () => {
    expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
  });

  it("matches the base tag, so en-GB is English", () => {
    expect(localeFromAcceptLanguage("en-GB")).toBe("en");
  });

  it("respects the quality order rather than the written order", () => {
    expect(localeFromAcceptLanguage("fr;q=0.9,en;q=0.8,vi;q=1.0")).toBe("vi");
  });

  it("skips languages we do not have and takes the next one", () => {
    expect(localeFromAcceptLanguage("fr-FR,fr;q=0.9,en;q=0.7")).toBe("en");
  });

  it("nothing supported falls back to the default", () => {
    expect(localeFromAcceptLanguage("fr-FR,de;q=0.9")).toBe(DEFAULT_LOCALE);
  });

  it("a missing or malformed header does not throw", () => {
    expect(localeFromAcceptLanguage(null)).toBe(DEFAULT_LOCALE);
    expect(localeFromAcceptLanguage("")).toBe(DEFAULT_LOCALE);
    expect(localeFromAcceptLanguage(";;;q=")).toBe(DEFAULT_LOCALE);
    expect(localeFromAcceptLanguage("en;q=abc")).toBe("en");
  });
});

describe("catalogueLanguage", () => {
  it("defaults to the language being read", () => {
    expect(catalogueLanguage(undefined, "en")).toBe("en");
    expect(catalogueLanguage(undefined, "vi")).toBe("vi");
  });

  it("'all' turns the filter off", () => {
    expect(catalogueLanguage("all", "en")).toBeNull();
  });

  it("an explicit language overrides the one being read", () => {
    // Reading in English while browsing the Vietnamese catalogue is a real thing to want.
    expect(catalogueLanguage("vi", "en")).toBe("vi");
  });

  it("junk falls back to the language being read, not to everything", () => {
    // A hand-edited or stale URL should show a sensible page, and showing MORE than asked
    // would be the wrong way to fail here.
    expect(catalogueLanguage("fr", "en")).toBe("en");
    expect(catalogueLanguage("", "vi")).toBe("vi");
  });
});

describe("localeAlternates", () => {
  it("names this page's address in every language", () => {
    expect(localeAlternates("/sign-in")).toEqual({
      languages: { vi: "/sign-in", en: "/en/sign-in" },
    });
  });

  it("follows the PATH given, never the home page", () => {
    // The bug this replaced: one declaration on the layout, built from a request path that
    // is empty at build time, told search engines every page's other-language version was
    // the home page.
    const { languages } = localeAlternates("/story/chuyen-xe-cuoi-cung");
    expect(languages.vi).toBe("/story/chuyen-xe-cuoi-cung");
    expect(languages.en).toBe("/en/story/chuyen-xe-cuoi-cung");
  });

  it("covers every locale, so none is left undeclared", () => {
    expect(Object.keys(localeAlternates("/")).length).toBe(1);
    expect(Object.keys(localeAlternates("/").languages).sort()).toEqual([...LOCALES].sort());
  });
});

