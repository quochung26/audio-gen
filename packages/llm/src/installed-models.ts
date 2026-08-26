/**
 * Chọn model mặc định theo model THẬT SỰ đã tải.
 *
 * `.env` ghi sẵn "qwen3:14b", nhưng máy chỉ có "qwen3:8b" thì job chết giữa
 * chừng với lỗi không tìm thấy model — mà lỗi đó xuất hiện lúc đang viết dở một
 * tập, không phải lúc mở Studio.
 */

/**
 * Model nhìn tên là biết dùng để NHÚNG VECTOR chứ không phải để viết.
 *
 * Là phỏng đoán theo tên, không có cách nào chắc chắn hơn: Ollama không nói
 * model nào làm được việc gì. Nhưng đoán nhầm ở đây rẻ — cùng lắm là gợi ý sai
 * một lần rồi người dùng chọn tay — còn không đoán thì mặc định của bước nhúng
 * lại rơi vào một model viết truyện, và vector ra sẽ vô nghĩa mà không báo lỗi.
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
 * Model mặc định nên dùng, xét theo những gì đã tải.
 *
 * Thứ tự:
 *   1. Giá trị trong `.env` — NẾU model đó đã tải. Cấu hình đúng thì tôn trọng.
 *   2. Model đã tải đầu tiên hợp với loại việc.
 *   3. Vẫn là giá trị `.env` — khi Ollama chưa chạy hoặc chưa tải gì. Không có
 *      gì tốt hơn để trả về, và trả chuỗi rỗng thì lỗi còn khó hiểu hơn.
 *
 * Sắp theo TÊN cho tất định. Dựa vào thứ tự Ollama trả về thì cùng một máy, hai
 * lần mở cho ra hai model khác nhau.
 */
export function pickInstalledModel(input: {
  envValue: string;
  installed: InstalledModel[];
  wantEmbedding: boolean;
}): string {
  const names = input.installed.map((m) => m.name).sort((a, b) => a.localeCompare(b));

  // Ollama coi "qwen3:14b" và "qwen3:14b:latest" là một.
  const has = (want: string) =>
    names.some((n) => n === want || n === `${want}:latest` || `${n}:latest` === want);

  if (input.envValue && has(input.envValue)) return input.envValue;

  const fit = names.filter((n) => looksLikeEmbedding(n) === input.wantEmbedding);
  return fit[0] ?? input.envValue;
}

/**
 * Hỏi Ollama xem đã tải những model nào.
 *
 * Nhớ tạm 15 giây: một lượt chạy hàng loạt gọi `getDefaultModel` hàng chục lần
 * trong vài giây, mà danh sách model thì gần như không đổi. Đủ ngắn để vừa
 * `ollama pull` xong là thấy ngay.
 *
 * KHÔNG bao giờ ném lỗi: đây chỉ là bước gợi ý mặc định. Ollama chưa chạy thì
 * lùi về giá trị `.env`, chứ không làm chết cả job.
 */
let cache: { at: number; models: InstalledModel[] } | null = null;
const CACHE_MS = 15_000;

export async function listInstalledModels(baseUrl: string): Promise<InstalledModel[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.models;

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/tags`, {
      // Ngắn: đây nằm trên đường đi của MỌI job, Ollama treo thì không được kéo
      // theo cả hàng đợi.
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

/** Quên danh sách đang nhớ — gọi sau khi tải xong hoặc xoá một model. */
export function forgetInstalledModels(): void {
  cache = null;
}
