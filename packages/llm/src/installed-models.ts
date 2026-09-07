/**
 * Pick the default model from what is ACTUALLY downloaded.
 *
 * `.env` says "qwen3:14b", but if the machine only has "qwen3:8b" the job dies
 * mid-run with a model-not-found error — and that error appears while an episode is
 * half written, not when Studio opens.
 */

/**
 * A model whose name says it is for EMBEDDING rather than writing.
 *
 * A guess from the name, with no more reliable option: Ollama does not say what a
 * model is good for. But guessing wrong here is cheap — at worst one bad suggestion
 * before the user picks by hand — while not guessing lets the embedding step default
 * to a story-writing model, and the vectors come out meaningless with no error.
 */
const EMBED_HINTS = ["embed", "bge", "gte-", "minilm", "e5-"];

export function looksLikeEmbedding(name: string): boolean {
  const n = name.toLowerCase();
  return EMBED_HINTS.some((h) => n.includes(h));
}

export interface InstalledModel {
  name: string;
  modifiedAt?: string | null;
}

/**
 * The first downloaded model suited to a kind of work. An empty string means NONE.
 *
 * Returns empty rather than inventing a name: this used to fall back to the name in
 * `.env`, and that name became a lie the moment the machine did not have that model
 * — the job died mid-run with "model not found" instead of saying so when Studio opened.
 *
 * Sorted BY NAME for determinism. Relying on Ollama's ordering means the same
 * machine picks different models on two different launches.
 */
export function pickInstalledModel(input: {
  installed: InstalledModel[];
  wantEmbedding: boolean;
}): string {
  const names = input.installed.map((m) => m.name).sort((a, b) => a.localeCompare(b));
  const fit = names.filter((n) => looksLikeEmbedding(n) === input.wantEmbedding);
  return fit[0] ?? "";
}

/**
 * Ask Ollama which models are downloaded.
 *
 * Cached for 15 seconds: a batch run calls `getDefaultModel` dozens of times within
 * seconds, and the model list barely changes. Short enough that a finished
 * `ollama pull` shows up right away.
 *
 * NEVER throws: this only suggests defaults. With Ollama not running it falls back
 * to the `.env` value rather than killing the job.
 */
let cache: { at: number; models: InstalledModel[] } | null = null;
const CACHE_MS = 15_000;

export async function listInstalledModels(baseUrl: string): Promise<InstalledModel[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.models;

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/tags`, {
      // Short: this sits on EVERY job's path, and Ollama hanging must not take the
      // whole queue down with it.
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return [];

    const body = (await res.json()) as { models?: Array<{ name: string; modified_at?: string }> };
    const models = (body.models ?? []).map((m) => ({ name: m.name, modifiedAt: m.modified_at }));
    cache = { at: Date.now(), models };
    return models;
  } catch {
    return [];
  }
}

/** Forget the cached list — call after a pull finishes or a model is deleted. */
export function forgetInstalledModels(): void {
  cache = null;
}
