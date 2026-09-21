/**
 * What the prose of a story has actually been doing, in numbers.
 *
 * `write-scene.md` asks for a great deal — vary sentence length, mostly write long, a
 * paragraph is usually more than one sentence, end on a turn — and nothing has ever
 * checked whether any of it happened. A scene is judged by reading it, and the defects
 * that matter most are invisible that way: a tic appearing in every scene looks normal
 * in each one, and only a count over thirty of them shows it as a tic.
 *
 * Counted here, judged by the model. Every number below is derived from the prose and
 * none of them is compared against a threshold — "seven scenes in a row opened with
 * `Đêm`" is a fact, and whether that is a rhythm or a rut depends on the story.
 *
 * Deliberately NOT a port of ainovel-cli's regex tic list. Those patterns were measured
 * on Chinese web-novel prose; guessing at Vietnamese equivalents would be inventing
 * thresholds nobody here has measured. The phrase miner below finds whatever THIS story
 * has fallen into instead, which is the question that was being asked anyway.
 */

/** A phrase the story keeps reaching for. */
export interface PhraseCount {
  text: string;
  /** How many times in the window. */
  count: number;
  /** How many different scenes it appears in — one scene repeating itself is another rule. */
  scenes: number;
}

export interface StyleStats {
  /** How many scenes the numbers were taken from. */
  scenes: number;
  sentences: {
    median: number;
    mean: number;
    /** Share of sentences under 8 words — `write-scene.md` calls a page of these a telegram. */
    shortRatio: number;
    /** Share over 25 words. Both ends matter: all-long is as monotonous as all-short. */
    longRatio: number;
  };
  /** Phrases the story reaches for, commonest first. Character names excluded. */
  phrases: PhraseCount[];
  /** Whole sentences appearing word for word in more than one scene. */
  repeated: PhraseCount[];
  /** The word scenes most often open on, and how many of them do. */
  opening: { word: string; scenes: number } | null;
  /** The last sentence of each scene: how long it is, and how often it is a short one. */
  ending: { medianWords: number; shortRatio: number };
}

/** Sentences under this are "short". From `write-scene.md`'s own diagnosis. */
const SHORT_SENTENCE_WORDS = 8;
/** And over this are "long" — where a clause stops being speakable in one breath. */
const LONG_SENTENCE_WORDS = 25;

/**
 * Fewer scenes than this and the numbers say nothing.
 *
 * Eight is about an episode and a half. Below it a phrase appearing twice is a
 * coincidence, and a "median sentence length" is a description of one scene.
 */
export const MIN_SCENES_FOR_STATS = 8;

/** Phrase lengths mined, in words. Three is where a phrase starts being a habit. */
const PHRASE_MIN_WORDS = 3;
const PHRASE_MAX_WORDS = 5;

/**
 * Compute the numbers, or null when there is not enough prose for them to mean anything.
 *
 * `names` are the cast: a character's name is the most repeated phrase in any story and
 * saying so is useless. Any phrase containing one is skipped.
 */
export function computeStyleStats(input: {
  scenes: string[];
  names?: string[];
}): StyleStats | null {
  const scenes = input.scenes.map((s) => s.trim()).filter(Boolean);
  if (scenes.length < MIN_SCENES_FOR_STATS) return null;

  const names = (input.names ?? [])
    .map((n) => n.trim().toLowerCase())
    .filter((n) => n.length >= 2);

  const perScene = scenes.map(splitSentences);
  const all = perScene.flat();
  if (all.length === 0) return null;

  const lengths = all.map((s) => words(s).length).sort((a, b) => a - b);
  const endings = perScene
    .map((s) => s[s.length - 1])
    .filter((s): s is string => Boolean(s))
    .map((s) => words(s).length)
    .sort((a, b) => a - b);

  return {
    scenes: scenes.length,
    sentences: {
      median: median(lengths),
      mean: round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
      shortRatio: round(lengths.filter((n) => n < SHORT_SENTENCE_WORDS).length / lengths.length),
      longRatio: round(lengths.filter((n) => n > LONG_SENTENCE_WORDS).length / lengths.length),
    },
    phrases: minePhrases(perScene, names),
    repeated: repeatedSentences(perScene),
    opening: commonestOpening(perScene),
    ending: {
      medianWords: median(endings),
      shortRatio:
        endings.length === 0
          ? 0
          : round(endings.filter((n) => n < SHORT_SENTENCE_WORDS).length / endings.length),
    },
  };
}

/**
 * Phrases of 3–5 words that keep coming back.
 *
 * Counted across scenes rather than within one: a phrase repeated inside a single scene
 * is the duplication rule's business (see prose-lint), and this one is about a habit
 * settling in across the story. Hence the "appears in at least three scenes" floor.
 */
function minePhrases(perScene: string[][], names: string[]): PhraseCount[] {
  const total = new Map<string, number>();
  const inScenes = new Map<string, Set<number>>();

  for (const [i, sentences] of perScene.entries()) {
    for (const sentence of sentences) {
      const w = words(sentence).map((x) => x.toLowerCase());
      for (let n = PHRASE_MIN_WORDS; n <= PHRASE_MAX_WORDS; n++) {
        for (let start = 0; start + n <= w.length; start++) {
          const slice = w.slice(start, start + n);
          if (slice.some((x) => names.includes(x))) continue;
          const phrase = slice.join(" ");
          total.set(phrase, (total.get(phrase) ?? 0) + 1);
          const seen = inScenes.get(phrase) ?? new Set<number>();
          seen.add(i);
          inScenes.set(phrase, seen);
        }
      }
    }
  }

  const kept = [...total.entries()]
    .map(([text, count]) => ({ text, count, scenes: inScenes.get(text)?.size ?? 0 }))
    .filter((p) => p.count >= 4 && p.scenes >= 3);

  // A five-word phrase drags its own three-word halves in with it at the same count.
  // Only the longest form of each is worth reporting.
  const longestFirst = kept.sort((a, b) => b.text.length - a.text.length);
  const out: PhraseCount[] = [];
  for (const p of longestFirst) {
    if (out.some((k) => k.text.includes(p.text) && k.count === p.count)) continue;
    out.push(p);
  }

  return out.sort((a, b) => b.count - a.count || (a.text < b.text ? -1 : 1)).slice(0, 8);
}

/** Whole sentences reappearing word for word in a different scene. */
function repeatedSentences(perScene: string[][]): PhraseCount[] {
  const total = new Map<string, number>();
  const inScenes = new Map<string, Set<number>>();

  for (const [i, sentences] of perScene.entries()) {
    for (const sentence of sentences) {
      // Short sentences repeat for honest reasons — a name, an answer, a refusal.
      if (words(sentence).length < SHORT_SENTENCE_WORDS) continue;
      const key = sentence.toLowerCase();
      total.set(key, (total.get(key) ?? 0) + 1);
      const seen = inScenes.get(key) ?? new Set<number>();
      seen.add(i);
      inScenes.set(key, seen);
    }
  }

  return [...total.entries()]
    .map(([text, count]) => ({ text, count, scenes: inScenes.get(text)?.size ?? 0 }))
    .filter((s) => s.scenes >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

/**
 * The word the most scenes open on.
 *
 * Found rather than looked up: a list of time words would only catch the tic someone
 * predicted. Thirty scenes opening on the same word is the same defect whatever the word
 * turns out to be.
 */
function commonestOpening(perScene: string[][]): { word: string; scenes: number } | null {
  const counts = new Map<string, number>();
  for (const sentences of perScene) {
    const first = words(sentences[0] ?? "")[0];
    if (!first) continue;
    const word = first.toLowerCase().replace(/^[^\p{L}]+/u, "");
    if (word.length < 2) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  // One scene opening on a word is not a pattern, it is a scene.
  return best && best[1] >= 2 ? { word: best[0], scenes: best[1] } : null;
}

/**
 * Render the numbers for the writer.
 *
 * Facts and nothing else. No "avoid", no "vary it" — `write-scene.md` already says how to
 * write, and repeating the instruction next to the evidence would only teach the model to
 * treat the evidence as more instruction. Returns "" when there is nothing worth saying.
 */
export function renderStyleStats(stats: StyleStats | null): string {
  if (!stats) return "";
  const lines: string[] = [];
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  lines.push(
    `Across the last ${stats.scenes} scenes: sentences run ${stats.sentences.median} words ` +
      `in the middle, ${pct(stats.sentences.shortRatio)} under ${SHORT_SENTENCE_WORDS} and ` +
      `${pct(stats.sentences.longRatio)} over ${LONG_SENTENCE_WORDS}.`,
  );
  lines.push(
    `Scenes end on a sentence of ${stats.ending.medianWords} words in the middle; ` +
      `${pct(stats.ending.shortRatio)} of them end short.`,
  );
  if (stats.opening) {
    lines.push(
      `${stats.opening.scenes} of them open on the word "${stats.opening.word}".`,
    );
  }
  if (stats.phrases.length > 0) {
    lines.push(
      `Phrases this story keeps reaching for: ` +
        stats.phrases.map((p) => `"${p.text}" ×${p.count}`).join(", ") + `.`,
    );
  }
  if (stats.repeated.length > 0) {
    lines.push(
      `Whole sentences reused across scenes: ` +
        stats.repeated.map((s) => `"${truncate(s.text, 50)}" ×${s.count}`).join("; ") + `.`,
    );
  }

  return `## What this story's prose has been doing\n${lines.join("\n")}`;
}

/**
 * Split prose into sentences.
 *
 * Vietnamese ends sentences the same way English does, so the terminators are shared. A
 * line break counts too: dialogue is one turn per line and often carries no full stop.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim().replace(/^[“"'—–-]\s*/, ""))
    .filter((s) => words(s).length > 0);
}

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

function round(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function truncate(s: string, max: number): string {
  const chars = [...s];
  return chars.length <= max ? s : `${chars.slice(0, max).join("")}…`;
}
