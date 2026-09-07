/**
 * The language of the content — what the story is written in.
 *
 * This is NOT the Studio interface language. A story is written in one language
 * end to end, so language belongs to the story (`Series.language`) rather than to
 * each episode: mixing languages between episodes wrecks the arc summary, the
 * character names and the voices alike.
 */
export const LANGUAGES = [
  { code: "vi", label: "Vietnamese", endonym: "Vietnamese", native: "Tiếng Việt" },
  { code: "en", label: "English", endonym: "English", native: "English" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "vi";

/**
 * The language of INSTRUCTIONS — every prompt in `prompts/` and every context
 * block built in @audio/core is English, whatever the story is written in.
 *
 * One instruction language, rather than duplicating prompts per content language.
 */
const INSTRUCTION_LANGUAGE: LanguageCode = "en";

export function isLanguage(v: unknown): v is LanguageCode {
  return typeof v === "string" && LANGUAGES.some((l) => l.code === v);
}

/** Coerce to a valid code. Old data or hand edits in the DB must not kill a job. */
export function toLanguage(v: unknown, fallback: LanguageCode = DEFAULT_LANGUAGE): LanguageCode {
  return isLanguage(v) ? v : fallback;
}

/** The display name for the UI. */
export function languageLabel(code: LanguageCode): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/** The language's name in the language the model understands — for writing directives. */
export function languageEndonym(code: LanguageCode): string {
  return LANGUAGES.find((l) => l.code === code)?.endonym ?? code;
}

/**
 * The language's name IN ITSELF — "Tiếng Việt", not "Vietnamese".
 *
 * Separate from `endonym` despite the name: that one is what the MODEL is told to write in,
 * and it is English on purpose because instructions are English. This one is for a reader
 * choosing a language, where a list written in a language they cannot read is no help to
 * someone who landed in the wrong one.
 */
export function languageNativeName(code: LanguageCode): string {
  return LANGUAGES.find((l) => l.code === code)?.native ?? code;
}

/**
 * The language directive injected into the system prompt.
 *
 * Instructions are in English, the output is in the story's language. The second
 * sentence separates the two: left unsaid, the model takes the instruction language
 * for the target language and returns English prose for an entirely Vietnamese
 * story. English stories need no such sentence — instructions and output share a
 * language, and saying "this is NOT the language to write in" only confuses it.
 *
 * Names and dialogue are called out because that is where models slip most: prose
 * in the right language, but character names and lines left in the instructions'.
 */
export function languageDirective(code: LanguageCode): string {
  const endonym = languageEndonym(code);
  const parts = [`Write ALL output in ${endonym}.`];

  if (code !== INSTRUCTION_LANGUAGE) {
    parts.push(
      "The instructions below are written in English — that is the language of the instructions, NOT the language you must write in.",
    );
  }

  parts.push(`Character names, dialogue and narration must all be in ${endonym}.`);
  return parts.join(" ");
}

export interface DraftPlan {
  /** Write the draft in this language. */
  draft: LanguageCode;
  /** The output language — what the listener receives. */
  output: LanguageCode;
  /** Whether a rewrite step has to run after writing. */
  translate: boolean;
}

/**
 * What language this story drafts in, and whether it needs a rewrite.
 *
 * This exists because the model that writes best cannot always write the output
 * language: a creative-writing finetune on Mistral Small writes very decent
 * English and near-unusable Vietnamese. Drafting in its strong language and then
 * rewriting into the output language beats forcing it to write directly.
 *
 * A PURE function that defaults to NO rewrite: a `draftLanguage` that is blank, an
 * invalid code, or the same as the output language all give `translate: false`. A
 * spurious step in the middle of the chain damages prose for nothing.
 */
export function planDraft(language: unknown, draftLanguage: unknown): DraftPlan {
  const output = toLanguage(language);
  const draft = isLanguage(draftLanguage) ? draftLanguage : output;
  return { draft, output, translate: draft !== output };
}

/**
 * Prepend the language directive to an existing system prompt.
 *
 * The directive goes FIRST: the Story Bible runs to thousands of words, and a
 * directive tucked underneath drowns in it.
 */
export function withLanguage(code: LanguageCode, system?: string | null): string {
  const directive = languageDirective(code);
  const rest = system?.trim();
  return rest ? `${directive}\n\n${rest}` : directive;
}
