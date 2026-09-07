export interface PronunciationRule {
  term: string;
  replacement: string;
  isRegex: boolean;
}

/**
 * Apply the pronunciation dictionary BEFORE handing text to the engine.
 *
 * Needed because local engines' Vietnamese G2P routinely mishandles proper nouns, numbers
 * and loanwords. Done at this layer rather than by patching the engine, so the engine can
 * change without losing the dictionary.
 *
 * Longer rules apply before shorter ones — otherwise the "Bến" rule eats half of
 * "Bến Cũ".
 */
export function applyPronunciation(text: string, rules: PronunciationRule[]): string {
  const sorted = [...rules].sort((a, b) => b.term.length - a.term.length);
  let out = text;

  for (const rule of sorted) {
    if (!rule.term) continue;
    if (rule.isRegex) {
      try {
        out = out.replace(new RegExp(rule.term, "gi"), rule.replacement);
      } catch {
        // A regex the user mistyped must not break the whole render job.
      }
    } else {
      out = out.replace(new RegExp(escapeRegex(rule.term), "gi"), rule.replacement);
    }
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalise text for TTS: strip characters that only mean something on the page.
 * Keeps dialogue quotation marks — many engines use them for intonation.
 */
export function normalizeForTts(text: string): string {
  return text
    .replace(/[*_#`]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/…/g, "...")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
