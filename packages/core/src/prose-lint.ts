/**
 * Mechanical checks on a written scene.
 *
 * Facts, not verdicts: every rule returns what it found and how much of it, and nothing
 * here blocks a job, changes a status or rewrites prose. A person reads them on the
 * episode page and decides. Deciding whether a scene is GOOD is not mechanical and is
 * not attempted — these are the defects a regex can prove.
 *
 * Every rule below comes from a defect seen in real generated prose. The thresholds are
 * the ones ainovel-cli measured over a 22-chapter run (`internal/rules/lint.go`), where
 * 19 of 22 chapters scored 0.0% on both duplication rules and the three that failed
 * scored 43.5%, 32.2% and 12.9% — the signal is binary, with no grey band, so 10% leaves
 * room for a deliberately repeated refrain.
 */

export type ViolationSeverity = "error" | "warning";

export type ViolationRule =
  | "english_residue"
  | "self_duplication"
  | "copied_previous_scene"
  | "broken_word"
  | "markdown_residue"
  | "invisible_characters";

/**
 * A type alias rather than an interface, deliberately: an interface has no implicit index
 * signature, so Prisma will not accept one as a `Json` column value, and these are stored
 * on `Scene.lintViolations`.
 */
export type Violation = {
  rule: ViolationRule;
  /** What was found — a few examples, or the worst offender. */
  target: string;
  /** How much of it: a count, or a percentage. */
  actual: string;
  /** What would have been acceptable. Absent when the rule is "any at all". */
  limit?: string;
  severity: ViolationSeverity;
};

/**
 * Check one scene.
 *
 * `previous` is the scene before this one in reading order, for the copy check — the one
 * defect a scene cannot see in itself.
 */
export function lintProse(
  text: string,
  opts: { language: string; previous?: string | null },
): Violation[] {
  return [
    ...invisibleCharacters(text),
    ...markdownResidue(text),
    ...brokenWords(text),
    ...selfDuplication(text),
    ...copiedFromPrevious(text, opts.previous ?? null),
    ...englishResidue(text, opts.language),
  ];
}

/**
 * Characters that are in the text without being on the page.
 *
 * Zero-width spaces and joiners, the byte-order mark, and the directional marks. None of
 * them belong in prose in any language this writes, and a scene carrying them looks
 * perfectly clean in Studio while being a different string from what it appears to be:
 * a search for a phrase containing one fails, the pronunciation dictionary misses the
 * word it splits, and TTS reads around it or chokes on it.
 *
 * Found by a real episode, whose every scene came back with a pair of them in it — and
 * the way it was found is the argument for the rule. A review quoted a sentence
 * verbatim, and the quote could not be located in the scene it came from, because the
 * two strings differed by characters nobody could see in either.
 *
 * `error`, not `warning`: unlike a habitual tense or a repeated phrase, there is no
 * reading of this on which it is fine.
 */
function invisibleCharacters(text: string): Violation[] {
  const matches = text.match(/[\u200b-\u200f\u2028\u2029\u202a-\u202e\ufeff]/g);
  if (!matches) return [];

  // Named rather than printed: printing them prints nothing, and "found 4 of" followed
  // by a blank is a worse report than no report.
  const NAMES: Record<string, string> = {
    "\u200b": "zero-width space",
    "\u200c": "zero-width non-joiner",
    "\u200d": "zero-width joiner",
    "\ufeff": "byte-order mark",
  };
  const kinds = [...new Set(matches.map((c) => NAMES[c] ?? `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`))];

  return [
    {
      rule: "invisible_characters",
      target: kinds.join(", "),
      actual: String(matches.length),
      severity: "error",
    },
  ];
}

/**
 * Markdown that leaked into the prose.
 *
 * A scene is plain prose. Asterisks survive into the audio script and get read out as
 * "sao sao" or swallowed mid-sentence, and a heading line halfway through a scene means
 * the model started formatting a document instead of writing one.
 */
function markdownResidue(text: string): Violation[] {
  const out: Violation[] = [];

  const bold = text.split("**").length - 1;
  if (bold > 0) {
    out.push({ rule: "markdown_residue", target: "**", actual: String(bold), severity: "warning" });
  }

  // The FIRST non-blank line may be a heading — that is how a scene titles itself, and
  // pinning it to line 1 rather than "any `#`" tolerates leading blank lines.
  let seenContent = false;
  let headings = 0;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t === "") continue;
    const first = !seenContent;
    seenContent = true;
    if (!first && t.startsWith("#")) headings++;
  }
  if (headings > 0) {
    out.push({
      rule: "markdown_residue",
      target: "#",
      actual: String(headings),
      severity: "warning",
    });
  }
  return out;
}

/**
 * A word cut in half by a paragraph break.
 *
 * A line ending in a letter, a blank line, then a line starting with a lowercase letter.
 * No legitimate prose has that shape — in a Latin script a word does not cross a
 * paragraph. Seen in real output as "n Tông, Ng" / blank / "ọc Lâm dừng bước": the name
 * Ngọc split down the middle.
 */
const BROKEN_WORD = /\p{L}\n\s*\n[^\S\n]*\p{Ll}/gu;

function brokenWords(text: string): Violation[] {
  const matches = text.match(BROKEN_WORD);
  if (!matches) return [];
  return [
    {
      rule: "broken_word",
      target: matches[0].split(/\s+/).filter(Boolean).join("⏎"),
      actual: String(matches.length),
      severity: "warning",
    },
  ];
}

/** Paragraphs long enough to be worth comparing. Headings are skipped. */
const PARAGRAPH_MIN_CHARS = 20;

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== "" && !p.startsWith("#") && [...p].length >= PARAGRAPH_MIN_CHARS);
}

const DUPLICATION_THRESHOLD = 0.1;

/**
 * The same paragraph, more than once, inside one scene.
 *
 * Short lines repeat naturally — "Hắn gật đầu.", a shouted name — so only paragraphs of
 * some length count. What this catches is the model looping: one paragraph generated
 * five times over.
 */
function selfDuplication(text: string): Violation[] {
  const paras = paragraphs(text);
  if (paras.length === 0) return [];

  const count = new Map<string, number>();
  let total = 0;
  for (const p of paras) {
    count.set(p, (count.get(p) ?? 0) + 1);
    total += [...p].length;
  }

  let duplicated = 0;
  let worst = "";
  let worstCount = 0;
  for (const [p, n] of count) {
    if (n <= 1) continue;
    duplicated += [...p].length * (n - 1);
    if (n > worstCount) {
      worst = p;
      worstCount = n;
    }
  }

  const ratio = total === 0 ? 0 : duplicated / total;
  if (ratio < DUPLICATION_THRESHOLD) return [];
  return [
    {
      rule: "self_duplication",
      target: `×${worstCount} ${truncate(worst, 50)}`,
      actual: percent(ratio),
      limit: percent(DUPLICATION_THRESHOLD),
      severity: "error",
    },
  ];
}

/**
 * A scene that is partly a copy of the one before it.
 *
 * The previous scene is handed to the model IN FULL — that is what keeps the prose
 * joining up, and it is also the whole text sitting there to be copied. `self_duplication`
 * cannot see this: a scene copied wholesale is perfectly clean within itself.
 */
function copiedFromPrevious(text: string, previous: string | null): Violation[] {
  if (!previous) return [];
  const current = [...new Set(paragraphs(text))];
  const before = new Set(paragraphs(previous));
  if (current.length === 0 || before.size === 0) return [];

  let copied = 0;
  let total = 0;
  let sample = "";
  for (const p of current) {
    const size = [...p].length;
    total += size;
    if (before.has(p)) {
      copied += size;
      if (sample === "") sample = p;
    }
  }

  const ratio = total === 0 ? 0 : copied / total;
  if (ratio < DUPLICATION_THRESHOLD) return [];
  return [
    {
      rule: "copied_previous_scene",
      target: truncate(sample, 60),
      actual: percent(ratio),
      limit: percent(DUPLICATION_THRESHOLD),
      severity: "error",
    },
  ];
}

/**
 * English function words left in Vietnamese prose.
 *
 * Only FUNCTION words. A content word — "flow", "lesson", "email" — can be a legitimate
 * borrowing in a modern setting, while "the" and "not" never enter a Vietnamese sentence
 * as loanwords. Anything built around one is caught anyway: "the flow" hits on `the`.
 *
 * Seen in real output as "Lá cây bắt đầu chuyển động—not nhanh chóng mà nhẹ nhàng", 27
 * times in one chapter. A story that drafts in English and is rewritten into Vietnamese
 * is exactly the machine for producing it.
 *
 * Only Vietnamese prose is checked. There is no mirror rule for Vietnamese words in
 * English prose: this codebase deliberately writes English drafts around Vietnamese
 * names, so every proper noun would be a false positive.
 */
const ENGLISH_FUNCTION_WORDS =
  /\b(not|the|and|but|for|from|with|they|this|that|just|one|was|were|have|when|which|while|into|over)\b/gi;

/**
 * Letters only Vietnamese uses: the seven base letters, plus Latin Extended Additional,
 * which is where nearly every Vietnamese tone-marked letter lives.
 */
const VIETNAMESE_MARKS = /[ăâđêôơưĂÂĐÊÔƠƯẠ-ỹ]/g;

/**
 * How many of those a text needs before it counts as Vietnamese.
 *
 * A real scene has hundreds. The floor exists only to keep the rule silent on an English
 * story, where every word would match — and on a Vietnamese scene so short it is one
 * line of dialogue.
 */
const VIETNAMESE_MARK_FLOOR = 12;

function englishResidue(text: string, language: string): Violation[] {
  if (language !== "vi") return [];
  if ((text.match(VIETNAMESE_MARKS) ?? []).length < VIETNAMESE_MARK_FLOOR) return [];

  const matches = text.match(ENGLISH_FUNCTION_WORDS);
  if (!matches) return [];

  const seen = new Set<string>();
  const examples: string[] = [];
  for (const m of matches) {
    const low = m.toLowerCase();
    if (seen.has(low)) continue;
    seen.add(low);
    if (examples.length < 4) examples.push(low);
  }

  return [
    {
      rule: "english_residue",
      target: examples.join(", "),
      actual: String(matches.length),
      severity: "error",
    },
  ];
}

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function truncate(s: string, max: number): string {
  const chars = [...s];
  return chars.length <= max ? s : `${chars.slice(0, max).join("")}…`;
}
