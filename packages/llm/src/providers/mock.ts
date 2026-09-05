import { z } from "zod";
import type { GenerateOptions, GenerateResult, LlmProvider } from "../provider";

/**
 * Provider giả lập.
 *
 * Mục đích: chạy trọn pipeline — dàn ý → cảnh → kịch bản → block — mà chưa cần
 * GPU hay model. Nhờ vậy dựng và kiểm thử Studio/worker được ngay, việc thử
 * model thật để sau.
 *
 * Nó KHÔNG viết văn hay. Đầu ra là văn bản giữ chỗ có hình dạng đúng, đủ để
 * kiểm chứng đường đi dữ liệu. Đừng đánh giá chất lượng sản phẩm qua nó.
 */
export class MockProvider implements LlmProvider {
  readonly name = "mock";

  constructor(private readonly tokensPerSec = 40) {}

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const targetWords = extractTargetWords(opts.prompt) ?? 300;
    const text = vietnameseFiller(targetWords, opts.prompt);
    return this.#emit(text, opts);
  }

  async generateJson<T>(
    opts: GenerateOptions & { schema: z.ZodType<T> },
  ): Promise<GenerateResult & { data: T }> {
    // Đọc số tập từ prompt để sinh đúng số lượng — cần cho việc kiểm chứng
    // tính nhất quán xuyên tập ở truyện dài.
    const episodeCount = Number(opts.prompt.match(/Số tập:\s*(\d+)/)?.[1] ?? 1);
    const data = fakeFromSchema(opts.schema, "", 0, 0, { episodeCount }) as T;
    const text = JSON.stringify(data, null, 2);
    const result = await this.#emit(text, opts);
    return { ...result, data };
  }

  /** Mô phỏng tốc độ sinh chữ để Studio thấy được luồng stream thật. */
  async #emit(text: string, opts: GenerateOptions): Promise<GenerateResult> {
    const started = Date.now();
    const outputTokens = Math.ceil(text.length / 3);

    if (opts.onToken) {
      const chunks = text.match(/.{1,24}/gs) ?? [text];
      const perChunkMs = Math.max(1, Math.round((24 / 3 / this.tokensPerSec) * 1000));
      for (const chunk of chunks) {
        if (opts.signal?.aborted) throw new Error("Đã huỷ");
        await sleep(perChunkMs);
        opts.onToken(chunk);
      }
    } else {
      await sleep(Math.round((outputTokens / this.tokensPerSec) * 1000));
    }

    const durationMs = Date.now() - started;
    return {
      text,
      model: "mock",
      inputTokens: Math.ceil((opts.prompt.length + (opts.system?.length ?? 0)) / 3),
      outputTokens,
      durationMs,
      tokensPerSec: durationMs > 0 ? outputTokens / (durationMs / 1000) : this.tokensPerSec,
    };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extractTargetWords(prompt: string): number | undefined {
  const m = prompt.match(/khoảng\s+(\d+)\s+từ/i);
  return m?.[1] ? Number(m[1]) : undefined;
}

const SENTENCES = [
  "Đêm xuống, con đường vắng chỉ còn tiếng gió lùa qua hàng cây.",
  "Ông đưa tay lau vệt sương đọng trên kính, cố nhìn cho rõ phía trước.",
  "Có gì đó không đúng, nhưng ông chưa gọi được tên nó ra.",
  "Tiếng động cơ đều đều, át đi mọi âm thanh khác trong khoang xe.",
  "Người khách ngồi im, mặt quay về phía cửa sổ tối đen.",
  "Đồng hồ trên bảng táp-lô nhảy sang con số tiếp theo.",
  "Ông nhớ lại lời dặn của người gác cổng chiều hôm ấy.",
  "Mưa bắt đầu rơi, thoạt đầu nhẹ, rồi nặng hạt dần.",
];

/** Sinh văn bản giữ chỗ có độ dài xấp xỉ yêu cầu. */
function vietnameseFiller(targetWords: number, seed: string): string {
  const rng = seededRandom(seed);
  const out: string[] = ["[VĂN BẢN GIẢ LẬP — đổi LLM_PROVIDER=ollama để dùng model thật]", ""];
  let words = 0;
  let paragraph: string[] = [];

  while (words < targetWords) {
    const s = SENTENCES[Math.floor(rng() * SENTENCES.length)]!;
    paragraph.push(s);
    words += s.split(/\s+/).length;
    if (paragraph.length >= 4) {
      out.push(paragraph.join(" "));
      out.push("");
      paragraph = [];
    }
  }
  if (paragraph.length) out.push(paragraph.join(" "));
  return out.join("\n");
}

/** Ngẫu nhiên có hạt giống — cùng prompt cho ra cùng kết quả, dễ kiểm thử. */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

/**
 * Sinh dữ liệu giả khớp một Zod schema bất kỳ.
 * Dùng `.description` của từng trường để chọn nội dung cho hợp cảnh.
 */
function fakeFromSchema(
  schema: z.ZodTypeAny,
  key = "",
  depth = 0,
  index = 0,
  opts: { episodeCount?: number } = {},
): unknown {
  if (depth > 6) return null;
  const def = schema._def as { typeName?: string; description?: string };
  const desc = (schema.description ?? "").toLowerCase();

  switch (def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodObject: {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      return Object.fromEntries(
        // Truyền chỉ số phần tử xuống các trường con để mỗi nhân vật một tên.
        Object.entries(shape).map(([k, v]) => [k, fakeFromSchema(v, k, depth + 1, index, opts)]),
      );
    }
    case z.ZodFirstPartyTypeKind.ZodArray: {
      const inner = (schema as z.ZodArray<z.ZodTypeAny>).element;
      const count =
        key === "facts"
          ? 7
          : key === "episodes"
          ? (opts.episodeCount ?? 1)
          : key === "beats"
            ? 3
            : key === "blocks"
              ? 4
              : 2;
      return Array.from({ length: count }, (_, i) =>
        fakeFromSchema(inner, key, depth + 1, i, opts),
      );
    }
    case z.ZodFirstPartyTypeKind.ZodString:
      return fakeString(key, desc, index);
    case z.ZodFirstPartyTypeKind.ZodNumber:
      return key === "pauseAfter" ? 400 : key === "number" ? index + 1 : 1;
    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return key === "isNarrator" && index === 0;
    case z.ZodFirstPartyTypeKind.ZodEnum: {
      const values = (schema as z.ZodEnum<[string, ...string[]]>).options;
      return values[index % values.length];
    }
    case z.ZodFirstPartyTypeKind.ZodNullable:
      return null;
    case z.ZodFirstPartyTypeKind.ZodOptional:
      return fakeFromSchema(
        (schema as z.ZodOptional<z.ZodTypeAny>).unwrap(),
        key,
        depth + 1,
        index,
        opts,
      );
    default:
      return null;
  }
}

const NAMES = ["Tài", "Cô gái áo trắng", "Ông Bảy", "Hạnh", "Lâm"];

function fakeString(base: string, desc: string, index: number): string {
  // Block chẵn là lời dẫn, block lẻ là thoại — để kiểm chứng ánh xạ người nói.
  if (base === "speaker") return index % 2 === 0 ? "narrator" : NAMES[1]!;
  if (base === "name") return NAMES[index % NAMES.length]!;
  if (base === "title") return index === 0 ? "Chuyến xe cuối cùng" : `Tập ${index + 1}: Đường về`;
  if (base === "logline") return "Một tài xế xe khách đêm nhận ra hành khách cuối cùng đã chết.";
  if (base === "genre") return "kinh dị";
  if (base === "setting") return "Quốc lộ miền Trung, thập niên 1970, những chuyến xe đêm.";
  if (base === "role") return index === 0 ? "tài xế xe khách, 45 tuổi" : "hành khách bí ẩn";
  if (base === "voiceHint" || desc.includes("vocal quality")) {
    return ["nam trung niên, giọng khàn", "nữ trẻ, giọng nhẹ và xa xăm", "nam già, giọng chậm"][
      index % 3
    ]!;
  }
  if (base === "beats") return `Nhịp ${index + 1} (giả lập) — việc xảy ra trong cảnh này.`;
  if (base === "hook") return "Ghế số 12 vẫn trống, nhưng cửa xe đã mở.";
  if (base === "gist") return "Tài chở người khách cuối cùng về Bến Cũ và phát hiện ghế trống.";
  if (base === "text" && desc.includes("ONE sentence")) {
    return [
      "Tài chở người khách cuối cùng về Bến Cũ lúc hai giờ sáng.",
      "Tài phát hiện ghế số mười hai chưa từng có ai ngồi.",
      "Tài thề không bao giờ quay lại Bến Cũ sau đêm mưa.",
      "Tài không còn tin lời ông Bảy gác bến.",
      "Chiếc vé xe cũ ghi ngày ba mươi tháng Chạp.",
      "Bến Cũ nằm ngoài rìa thị trấn, bỏ hoang từ sau cơn bão.",
      "Không ai biết ai đã mua vé ghế số mười hai.",
    ][index % 7]!;
  }
  if (base === "text") return "Đêm xuống, con đường vắng chỉ còn tiếng gió lùa qua hàng cây.";
  if (base === "description") return "Mô tả giả lập cho mục đích kiểm thử.";
  if (base === "coverPrompt") return "Chiếc xe khách cũ dưới ánh đèn đường vàng, sương mù.";
  if (base === "hashtags") return "#truyenma";
  return `[${base} giả lập]`;
}
