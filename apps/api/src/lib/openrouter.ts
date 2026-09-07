/** One OpenRouter model, trimmed to what the UI needs. */
export interface OpenRouterModel {
  id: string;
  name: string;
  contextLength: number;
  /** USD per million tokens. `null` = OpenRouter publishes no price. */
  promptPerMTok: number | null;
  completionPerMTok: number | null;
  /** Entirely free — OpenRouter carries a few models priced at 0. */
  free: boolean;
}

interface RawModel {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
}

/**
 * Convert an OpenRouter price to USD per million tokens.
 *
 * OpenRouter quotes USD PER TOKEN, as a string: "0.000003". Showing that number
 * raw tells nobody what anything costs; scaling to a million gives a figure you
 * can compare across models.
 */
export function pricePerMTok(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n * 1_000_000;
}

export function toModelInfo(raw: RawModel): OpenRouterModel | null {
  if (!raw.id) return null;
  const prompt = pricePerMTok(raw.pricing?.prompt);
  const completion = pricePerMTok(raw.pricing?.completion);
  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    contextLength: raw.context_length ?? 0,
    promptPerMTok: prompt,
    completionPerMTok: completion,
    // Free only when BOTH ends are 0. Input-only-free still costs on generation.
    free: prompt === 0 && completion === 0,
  };
}

export function parseModelList(body: unknown): OpenRouterModel[] {
  const data = (body as { data?: RawModel[] })?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map(toModelInfo)
    .filter((m): m is OpenRouterModel => m !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** API key status and remaining credit. */
export interface KeyStatus {
  /** Spent, USD. */
  usage: number;
  /** Limit, USD. `null` = unlimited (a prepaid account). */
  limit: number | null;
  remaining: number | null;
  freeTier: boolean;
}

export function parseKeyStatus(body: unknown): KeyStatus {
  const d = (body as {
    data?: {
      usage?: number;
      limit?: number | null;
      limit_remaining?: number | null;
      is_free_tier?: boolean;
    };
  })?.data;

  const usage = typeof d?.usage === "number" ? d.usage : 0;
  const limit = typeof d?.limit === "number" ? d.limit : null;
  // OpenRouter only returns `limit_remaining` when the key has a limit; on a
  // prepaid account the field is absent, and computing `limit - usage` gives NaN.
  const remaining =
    typeof d?.limit_remaining === "number"
      ? d.limit_remaining
      : limit !== null
        ? limit - usage
        : null;

  return { usage, limit, remaining, freeTier: d?.is_free_tier === true };
}

/**
 * A valid OpenRouter model name: "provider/model", with an optional suffix.
 *
 * Validated here because the name goes straight into a URL and a request body.
 * The allowed set is slightly narrower than reality — better to reject one odd
 * name than to let a slash or a space through into somewhere unexpected.
 */
export function isValidOpenRouterModel(name: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(name) && name.length <= 120;
}

/** Average tokens an episode burns — the basis for a cost estimate. */
export interface EpisodeUsage {
  episodes: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Average tokens per episode, from the runs on record.
 *
 * This is why it sums PER EPISODE first and averages after: one episode calls the
 * model a dozen times (once per scene, plus summaries, plus metadata). Averaging
 * over individual calls gives a scene's figure, many times smaller than what an
 * episode really costs — and underestimating cost is the worst way to be wrong
 * here.
 */
export function averagePerEpisode(
  rows: Array<{ episodeId: string | null; inputTokens: number; outputTokens: number }>,
): EpisodeUsage | null {
  const byEpisode = new Map<string, { input: number; output: number }>();
  for (const r of rows) {
    if (!r.episodeId) continue;
    const cur = byEpisode.get(r.episodeId) ?? { input: 0, output: 0 };
    cur.input += r.inputTokens;
    cur.output += r.outputTokens;
    byEpisode.set(r.episodeId, cur);
  }
  if (byEpisode.size === 0) return null;

  let input = 0;
  let output = 0;
  for (const v of byEpisode.values()) {
    input += v.input;
    output += v.output;
  }
  return {
    episodes: byEpisode.size,
    inputTokens: Math.round(input / byEpisode.size),
    outputTokens: Math.round(output / byEpisode.size),
  };
}
