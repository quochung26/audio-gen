/**
 * Pull GGUF models straight from Hugging Face.
 *
 * Ollama can pull from HF given a name shaped `hf.co/{user}/{repo}:{QUANT}`, so
 * the work here is only: peel the repo out of whatever URL the user pasted, list
 * the quantisations the repo holds, then reassemble a name Ollama understands.
 */

/**
 * Peel "user/repo" out of whatever the user pasted.
 *
 * Accepts both a full URL and the short form, because a paste from the address
 * bar usually carries `/tree/main` and a query string.
 */
export function parseHfRepo(input: string): string | null {
  let text = input.trim();
  if (!text) return null;

  // Drop the protocol and host if present.
  text = text.replace(/^https?:\/\//i, "");
  text = text.replace(/^(?:www\.)?(?:huggingface\.co|hf\.co)\//i, "");
  // Drop the query string and fragment.
  text = text.split(/[?#]/)[0]!;
  // Drop in-repo navigation: /tree/main, /blob/main/abc.gguf, /resolve/…
  text = text.replace(/\/(tree|blob|resolve|raw)\/.*$/i, "");
  text = text.replace(/\/+$/, "");

  const parts = text.split("/").filter(Boolean);
  if (parts.length !== 2) return null;

  const [user, repo] = parts as [string, string];
  const ok = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  if (!ok.test(user) || !ok.test(repo)) return null;
  if (text.length > 120) return null;

  return `${user}/${repo}`;
}

/**
 * Read the quantisation out of a file name.
 *
 * GGUF file names on HF follow no standard: some repos write `Q4_K_M`, some
 * `q4_k_m`, some separate with dots instead of dashes. So match a pattern
 * anywhere in the name rather than slicing by position.
 *
 * Matching a pattern is also why split files need no special handling
 * ("…-Q4_K_M-00001-of-00009.gguf"): the part numbers do not match the pattern so
 * they are ignored, and the parts group themselves under one quantisation.
 */
export function quantFromFilename(filename: string): string | null {
  const base = filename.split("/").pop() ?? filename;
  if (!/\.gguf$/i.test(base)) return null;

  const m = /(?:^|[-_.])((?:IQ|Q)\d+(?:_[A-Za-z0-9]+)*|BF16|F16|F32)(?=[-_.]|$)/i.exec(
    base.replace(/\.gguf$/i, ""),
  );
  return m?.[1] ?? null;
}

export interface HfFile {
  path: string;
  size?: number;
  lfs?: { size?: number };
}

export interface QuantVariant {
  /** Exactly the string in the file name — Ollama matches against it. */
  quant: string;
  /** Total size, summed across the parts when the file is split. */
  sizeBytes: number;
  /** File count — more than 1 means this one is split into parts. */
  parts: number;
}

/**
 * Group a repo's GGUF files into a list of quantisations.
 *
 * Sizes are summed per quantisation rather than per file: large models are often
 * split into a dozen parts, and showing each part's size tells nobody how much
 * they are about to download.
 */
export function collectQuantVariants(files: HfFile[]): QuantVariant[] {
  const byQuant = new Map<string, QuantVariant>();

  for (const f of files) {
    const quant = quantFromFilename(f.path);
    if (!quant) continue;

    const key = quant.toUpperCase();
    const size = f.lfs?.size ?? f.size ?? 0;
    const cur = byQuant.get(key);
    if (cur) {
      cur.sizeBytes += size;
      cur.parts += 1;
    } else {
      byQuant.set(key, { quant, sizeBytes: size, parts: 1 });
    }
  }

  // Smallest first: the lightest build is usually the one people try first.
  return [...byQuant.values()].sort((a, b) => a.sizeBytes - b.sizeBytes);
}

/** The name `ollama pull` understands. */
export function hfPullTag(repo: string, quant: string): string {
  return `hf.co/${repo}:${quant}`;
}
