import { z } from "zod";
import type { GenerateOptions, GenerateResult, LlmProvider } from "../provider";

/**
 * The mock provider.
 *
 * Its purpose: run the whole pipeline — outline → scene → script → blocks —
 * without a GPU or any model. That makes Studio and the worker buildable and
 * testable straight away, leaving real models for later.
 *
 * It does NOT write well. The output is placeholder text of the right shape,
 * enough to verify the data path. Do not judge the product's quality by it.
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
    // Read the episode count out of the prompt so the right number is generated —
    // needed to verify cross-episode consistency in a long story. Also accepts the
    // old Vietnamese label, for the same reason as `extractTargetWords`.
    const episodeCount = Number(
      opts.prompt.match(/(?:Episode count|Số tập):\s*(\d+)/i)?.[1] ?? 1,
    );
    const data = fakeFromSchema(opts.schema, "", 0, 0, { episodeCount }) as T;
    const text = JSON.stringify(data, null, 2);
    const result = await this.#emit(text, opts);
    return { ...result, data };
  }

  /** Simulate generation speed so Studio sees a realistic stream. */
  async #emit(text: string, opts: GenerateOptions): Promise<GenerateResult> {
    const started = Date.now();
    const outputTokens = Math.ceil(text.length / 3);

    if (opts.onToken) {
      const chunks = text.match(/.{1,24}/gs) ?? [text];
      const perChunkMs = Math.max(1, Math.round((24 / 3 / this.tokensPerSec) * 1000));
      for (const chunk of chunks) {
        if (opts.signal?.aborted) throw new Error("Cancelled");
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

/**
 * The target word count, read back out of the prompt.
 *
 * Accepts BOTH languages. The shipped prompts are English now, but the `Prompt`
 * table in the DB may still hold the old Vietnamese ones until `pnpm db:seed` is
 * run again — and the context blocks used to be Vietnamese too. A missed match
 * says nothing: every mock scene quietly comes out at exactly 300 words, so a
 * whole story's word count and estimated duration are all equal but still look
 * plausible.
 */
function extractTargetWords(prompt: string): number | undefined {
  const m = prompt.match(/(?:about|khoảng)\s+(\d+)\s+(?:words|từ)/i);
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

/** Generate placeholder text of roughly the requested length. */
function vietnameseFiller(targetWords: number, seed: string): string {
  const rng = seededRandom(seed);
  const out: string[] = ["[MOCK TEXT — pick Ollama on the Models page to use a real model]", ""];
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

/** Seeded randomness — the same prompt gives the same result, which is testable. */
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
 * Generate fake data matching any Zod schema.
 * Uses each field's `.description` to pick content that fits the context.
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
        // Pass the element index down to child fields so each character gets a name.
        Object.entries(shape).map(([k, v]) => [k, fakeFromSchema(v, k, depth + 1, index, opts)]),
      );
    }
    case z.ZodFirstPartyTypeKind.ZodArray: {
      const inner = (schema as z.ZodArray<z.ZodTypeAny>).element;
      const count = FAKE_COUNT[key] ?? (key === "episodes" ? (opts.episodeCount ?? 1) : 2);
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

/** How many elements for each array in the schema. Anything unlisted defaults to 2. */
const FAKE_COUNT: Record<string, number> = {
  facts: 7,
  chapters: 3,
  beats: 2,
  blocks: 4,
};

const NAMES = ["Tài", "Cô gái áo trắng", "Ông Bảy", "Hạnh", "Lâm"];

function fakeString(base: string, desc: string, index: number): string {
  // Even blocks are narration, odd ones dialogue — to verify speaker mapping.
  if (base === "speaker") return index % 2 === 0 ? "narrator" : NAMES[1]!;
  if (base === "name") return NAMES[index % NAMES.length]!;
  if (base === "title") return index === 0 ? "Chuyến xe cuối cùng" : `Tập ${index + 1}: Đường về`;
  if (base === "chapters") return `Chương ${index + 1} (mock)`;
  if (base === "logline") return "Một tài xế xe khách đêm nhận ra hành khách cuối cùng đã chết.";
  if (base === "genre") return "kinh dị";
  if (base === "setting") return "Quốc lộ miền Trung, thập niên 1970, những chuyến xe đêm.";
  if (base === "role") return index === 0 ? "tài xế xe khách, 45 tuổi" : "hành khách bí ẩn";
  if (base === "speech") {
    return ["Cộc lốc, hay bỏ lửng câu.", "Nói chậm, kéo dài cuối câu.", "Xưng \"tui\", gọi ai cũng là \"cô chú\"."][
      index % 3
    ]!;
  }
  if (base === "outfit") {
    return ["Áo sơ mi bạc màu xắn tay, dép nhựa.", "Áo dài trắng đã ngả vàng.", "Áo bà ba nâu, khăn rằn."][
      index % 3
    ]!;
  }
  if (base === "appearance") {
    return ["Gầy, da sạm, tóc muối tiêu.", "Nhỏ người, tóc dài phủ kín mặt.", "Lưng còng, tay run."][
      index % 3
    ]!;
  }
  if (base === "voiceHint" || desc.includes("vocal quality")) {
    return ["nam trung niên, giọng khàn", "nữ trẻ, giọng nhẹ và xa xăm", "nam già, giọng chậm"][
      index % 3
    ]!;
  }
  if (base === "beats") return `Beat ${index + 1} (mock) — what happens in this scene.`;
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
  if (base === "description") return "Mock description, for testing.";
  if (base === "coverPrompt") return "Chiếc xe khách cũ dưới ánh đèn đường vàng, sương mù.";
  if (base === "hashtags") return "#truyenma";
  return `[mock ${base}]`;
}
