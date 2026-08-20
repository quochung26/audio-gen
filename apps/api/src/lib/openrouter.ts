/** Một model trên OpenRouter, đã rút gọn còn những gì giao diện cần. */
export interface OpenRouterModel {
  id: string;
  name: string;
  contextLength: number;
  /** USD cho 1 triệu token. `null` = OpenRouter không công bố giá. */
  promptPerMTok: number | null;
  completionPerMTok: number | null;
  /** Miễn phí hoàn toàn — OpenRouter có vài model giá 0. */
  free: boolean;
}

interface RawModel {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
}

/**
 * Đổi giá của OpenRouter sang USD/1 triệu token.
 *
 * OpenRouter báo giá theo USD MỖI TOKEN, dạng chuỗi: "0.000003". Hiện thẳng số
 * đó thì không ai ước lượng nổi tốn bao nhiêu; nhân lên 1 triệu mới ra con số
 * so sánh được giữa các model.
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
    // Cả hai đầu đều 0 mới là miễn phí. Chỉ đầu vào 0 thì vẫn mất tiền khi sinh.
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

/** Tình trạng khoá API và số tín dụng còn lại. */
export interface KeyStatus {
  /** Đã tiêu, USD. */
  usage: number;
  /** Hạn mức, USD. `null` = không giới hạn (tài khoản trả trước). */
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
  // OpenRouter chỉ trả `limit_remaining` khi khoá có hạn mức; tài khoản trả
  // trước thì trường này vắng mặt, và tự tính `limit - usage` sẽ ra NaN.
  const remaining =
    typeof d?.limit_remaining === "number"
      ? d.limit_remaining
      : limit !== null
        ? limit - usage
        : null;

  return { usage, limit, remaining, freeTier: d?.is_free_tier === true };
}

/**
 * Tên model OpenRouter hợp lệ: "nhà-cung-cấp/tên-model", kèm hậu tố tuỳ chọn.
 *
 * Chặn ở đây vì tên này đi thẳng vào URL và vào thân request. Danh sách ký tự
 * cho phép hẹp hơn thực tế một chút — thà từ chối một tên lạ còn hơn để lọt
 * dấu gạch chéo hay khoảng trắng vào chỗ không ngờ.
 */
export function isValidOpenRouterModel(name: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(name) && name.length <= 120;
}

/** Số token trung bình một tập tiêu tốn — nền để ước tính tiền. */
export interface EpisodeUsage {
  episodes: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Trung bình token mỗi tập, tính từ các lượt chạy đã ghi lại.
 *
 * Đây là lý do phải cộng theo TẬP trước rồi mới lấy trung bình: một tập gọi
 * model chục lần (mỗi cảnh một lần, cộng tóm tắt, cộng metadata). Lấy trung
 * bình trên từng lượt gọi sẽ ra con số của một cảnh, nhỏ hơn giá thật của một
 * tập nhiều lần — và ước tính chi phí thấp hơn thực tế là kiểu sai tệ nhất ở
 * đây.
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
