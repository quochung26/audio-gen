import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  isLanguage,
  languageDirective,
  languageLabel,
  planDraft,
  toLanguage,
  withLanguage,
} from "./language";

describe("isLanguage", () => {
  it("accepts real codes", () => {
    expect(isLanguage("vi")).toBe(true);
    expect(isLanguage("en")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isLanguage("fr")).toBe(false);
    expect(isLanguage("")).toBe(false);
    expect(isLanguage(null)).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
    expect(isLanguage(123)).toBe(false);
  });
});

describe("toLanguage", () => {
  it("keeps a valid code", () => {
    expect(toLanguage("en")).toBe("en");
  });

  it("junk data falls back to the default rather than killing a job", () => {
    // The `language` column can be hand-edited in the DB, or be an old row.
    expect(toLanguage("klingon")).toBe(DEFAULT_LANGUAGE);
    expect(toLanguage(null)).toBe("vi");
    expect(toLanguage(undefined)).toBe("vi");
  });

  it("accepts a custom default", () => {
    expect(toLanguage("junk", "en")).toBe("en");
  });
});

describe("languageLabel", () => {
  it("returns the display name", () => {
    expect(languageLabel("vi")).toBe("Vietnamese");
    expect(languageLabel("en")).toBe("English");
  });

  it("every language in the table has a label", () => {
    for (const l of LANGUAGES) expect(languageLabel(l.code)).not.toBe(l.code);
  });
});

describe("languageDirective", () => {
  it("Vietnamese: says the INSTRUCTIONS are English but the OUTPUT must be Vietnamese", () => {
    // Prompts in the DB are written in English even when the story is Vietnamese.
    // Without separating the two, the model writes English prose.
    const d = languageDirective("vi");
    expect(d).toContain("Vietnamese");
    expect(d).toMatch(/instructions .* English/i);
    expect(d).toMatch(/NOT the language/i);
  });

  it("an English story gets NO separating sentence — instructions and output share a language", () => {
    // Saying "English is NOT the language to write in" while English is exactly what
    // to write is self-contradictory, and the model follows the wrong half.
    const d = languageDirective("en");
    expect(d).toContain("English");
    expect(d).not.toMatch(/NOT the language/i);
  });

  it("calls out names and dialogue — where models slip most", () => {
    expect(languageDirective("en")).toMatch(/names.*dialogue/i);
    expect(languageDirective("vi")).toMatch(/names.*dialogue/i);
  });

  it("every language is named correctly in the directive", () => {
    // The directive is built from the LANGUAGES table, so adding a language is a
    // line of data rather than a change to the function.
    for (const l of LANGUAGES) {
      expect(languageDirective(l.code)).toContain(l.endonym);
    }
  });
});

describe("withLanguage", () => {
  it("puts the directive BEFORE the system prompt", () => {
    // The Story Bible runs to thousands of words; a directive underneath drowns.
    const out = withLanguage("en", "Story Bible: a post-apocalyptic world…");
    expect(out.indexOf("English")).toBeLessThan(out.indexOf("Story Bible"));
  });

  it("leaves the system prompt after it untouched", () => {
    expect(withLanguage("vi", "BIBLE")).toContain("BIBLE");
  });

  it("with no system prompt it is just the directive, with no stray blank line", () => {
    expect(withLanguage("vi")).toBe(languageDirective("vi"));
    expect(withLanguage("vi", "")).toBe(languageDirective("vi"));
    expect(withLanguage("vi", "   ")).toBe(languageDirective("vi"));
  });
});

describe("planDraft", () => {
  it("no draft language set means write directly", () => {
    expect(planDraft("vi", "")).toEqual({ draft: "vi", output: "vi", translate: false });
  });

  it("a different one drafts in that language then rewrites", () => {
    expect(planDraft("vi", "en")).toEqual({ draft: "en", output: "vi", translate: true });
  });

  it("set to the SAME language as the output builds NO rewrite step", () => {
    // Translating a language into itself is a model call that damages the prose for
    // nothing.
    expect(planDraft("en", "en").translate).toBe(false);
  });

  it("a junk code falls back to writing directly rather than killing a job", () => {
    // The `draftLanguage` column is hand-editable in the DB, and old rows do not
    // have it at all. The default has to be the old chain.
    expect(planDraft("vi", "klingon").translate).toBe(false);
    expect(planDraft("vi", null).translate).toBe(false);
    expect(planDraft("vi", undefined).translate).toBe(false);
  });

  it("a junk output language still falls back to the default", () => {
    expect(planDraft("junk", "en")).toEqual({ draft: "en", output: "vi", translate: true });
  });
});
