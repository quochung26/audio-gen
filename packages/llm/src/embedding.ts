import { loadEnv } from "@audio/config";
import { LlmError } from "./provider";

/**
 * Số chiều của vector. Phải khớp `vector(1024)` trong sql/001-vector.sql.
 * Đổi model embedding thì phải đổi cả hai và tạo lại toàn bộ embedding.
 */
export const EMBED_DIM = 1024;

export interface EmbeddingProvider {
  readonly name: string;
  readonly dim: number;
  /** Nhúng nhiều đoạn một lượt — embedding rẻ, gọi theo lô hiệu quả hơn nhiều. */
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Ollama embedding.
 *
 * bge-m3 mạnh với tiếng Việt và trả 1024 chiều. **Chạy CPU là đủ** — nhúng một
 * câu tốn vài mili-giây, không đáng để chiếm VRAM của model viết truyện. Cùng
 * lý do đã đặt Kokoro lên CPU (PLAN.md mục 6.1).
 */
class OllamaEmbedding implements EmbeddingProvider {
  readonly name = "ollama";
  readonly dim = EMBED_DIM;

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/embed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.model, input: texts }),
      });
    } catch (err) {
      throw new LlmError(`Không kết nối được Ollama ở ${this.baseUrl} để nhúng vector.`, err);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Lỗi hay gặp nhất: chưa `ollama pull bge-m3`.
      throw new LlmError(
        `Ollama trả lỗi ${res.status} khi nhúng vector: ${body}\n` +
          `Đã chạy \`ollama pull ${this.model}\` chưa?`,
      );
    }

    const data = (await res.json()) as { embeddings?: number[][] };
    if (!data.embeddings || data.embeddings.length !== texts.length) {
      throw new LlmError(
        `Ollama trả ${data.embeddings?.length ?? 0} vector cho ${texts.length} đoạn văn.`,
      );
    }

    for (const v of data.embeddings) {
      if (v.length !== this.dim) {
        throw new LlmError(
          `Model "${this.model}" trả vector ${v.length} chiều, nhưng cột DB là ${this.dim}. ` +
            `Sửa EMBED_DIM và sql/001-vector.sql, rồi tạo lại toàn bộ embedding.`,
        );
      }
    }
    return data.embeddings;
  }
}

/**
 * Embedding giả lập — băm nội dung thành vector đơn vị tất định.
 *
 * KHÔNG mang ngữ nghĩa: hai câu cùng chủ đề sẽ không gần nhau. Nó chỉ để kiểm
 * chứng đường đi dữ liệu (lưu, truy vấn, xếp hạng) mà chưa cần tải model. Đừng
 * đánh giá chất lượng truy hồi qua nó.
 */
class MockEmbedding implements EmbeddingProvider {
  readonly name = "mock";
  readonly dim = EMBED_DIM;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => hashVector(t, this.dim));
  }
}

function hashVector(text: string, dim: number): number[] {
  // Băm từng từ vào các chiều — cùng từ thì cùng chiều, nên câu chia sẻ nhiều
  // từ sẽ gần nhau. Đủ để kiểm chứng xếp hạng, không phải ngữ nghĩa thật.
  const v = new Array<number>(dim).fill(0);
  for (const word of text.toLowerCase().split(/\s+/).filter(Boolean)) {
    let h = 2166136261;
    for (let i = 0; i < word.length; i++) {
      h ^= word.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const slot = Math.abs(h) % dim;
    v[slot] = (v[slot] ?? 0) + 1;
  }
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

let cached: EmbeddingProvider | undefined;

/**
 * Provider nhúng vector.
 *
 * Model KHÔNG lấy từ `.env` nữa mà từ cấu hình ở trang Model (hoặc model đã tải
 * hợp việc nhúng). Vì thế hàm này async — provider phải biết model trước khi
 * dựng, chứ không thể để trống rồi gửi tên rỗng lên Ollama.
 */
export async function getEmbedding(): Promise<EmbeddingProvider> {
  if (cached) return cached;
  const env = loadEnv();
  if (env.EMBED_PROVIDER !== "ollama") {
    cached = new MockEmbedding();
    return cached;
  }

  const { resolveModel } = await import("./model-settings");
  cached = new OllamaEmbedding(env.OLLAMA_URL, await resolveModel({ kind: "embed" }));
  return cached;
}

/** Quên provider đang nhớ — gọi khi đổi model nhúng. */
export function forgetEmbedding(): void {
  cached = undefined;
}

/** Định dạng vector cho pgvector: '[0.1,0.2,...]' */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
