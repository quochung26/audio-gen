import { loadEnv } from "@audio/config";
import { prisma } from "@audio/database";
import { parseModelRef, type ProviderName } from "./providers/routing";

/**
 * Model nào cho việc gì.
 *
 * Ba tầng, cụ thể hơn thì thắng:
 *
 *   1. Model chọn cho LẦN CHẠY này  — "viết tập này bằng qwen3:32b xem sao"
 *   2. Model của PROMPT              — bước này luôn dùng model nhỏ hơn
 *   3. Model MẶC ĐỊNH                — bảng Setting, lùi về .env nếu chưa đặt
 *
 * Tầng 3 nằm trong DB chứ không chỉ trong `.env` vì đổi model mặc định là việc
 * làm thường xuyên lúc đang thử; sửa `.env` thì phải khởi động lại worker.
 */
export type ModelKind = "write" | "utility" | "embed";

const KEYS: Record<ModelKind, string> = {
  write: "model.write",
  utility: "model.utility",
  embed: "model.embed",
};

/**
 * Giá trị trong `.env` — dùng khi chưa ai đặt gì ở giao diện.
 *
 * Theo provider đang bật: chuyển `LLM_PROVIDER` sang openrouter mà vẫn trả về
 * "qwen3:14b" thì OpenRouter báo 404 không có model, và lỗi đó chẳng chỉ về
 * đúng nguyên nhân.
 *
 * Embedding luôn chạy tại chỗ nên không đi theo — nhúng một câu tốn vài ms,
 * trả tiền cho đám mây để làm việc đó là vô lý.
 */
export function envDefaultModel(kind: ModelKind): string {
  const env = loadEnv();
  if (kind === "embed") return env.EMBED_MODEL;

  if (env.LLM_PROVIDER === "openrouter") {
    return kind === "write" ? env.OPENROUTER_MODEL_WRITE : env.OPENROUTER_MODEL_UTILITY;
  }
  return kind === "write" ? env.OLLAMA_MODEL_WRITE : env.OLLAMA_MODEL_UTILITY;
}

export async function getDefaultModel(kind: ModelKind): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: KEYS[kind] } });
  return row?.value?.trim() || envDefaultModel(kind);
}

export async function getDefaultModels(): Promise<
  Record<ModelKind, { value: string; fromEnv: boolean }>
> {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value.trim()]));

  const out = {} as Record<ModelKind, { value: string; fromEnv: boolean }>;
  for (const kind of Object.keys(KEYS) as ModelKind[]) {
    const stored = byKey.get(KEYS[kind]);
    out[kind] = stored
      ? { value: stored, fromEnv: false }
      : { value: envDefaultModel(kind), fromEnv: true };
  }
  return out;
}

/** Đặt model mặc định. Chuỗi rỗng = xoá, quay về giá trị trong `.env`. */
export async function setDefaultModel(kind: ModelKind, value: string): Promise<void> {
  const v = value.trim();
  if (!v) {
    await prisma.setting.deleteMany({ where: { key: KEYS[kind] } });
    return;
  }
  await prisma.setting.upsert({
    where: { key: KEYS[kind] },
    create: { key: KEYS[kind], value: v },
    update: { value: v },
  });
}

/**
 * Chọn model cho một lần gọi, theo đúng ba tầng ưu tiên.
 *
 * Chuỗi rỗng ở tầng trên coi như KHÔNG đặt — form gửi lên `model=""` khi người
 * dùng để trống, mà coi chuỗi rỗng là một lựa chọn thì Ollama nhận model tên
 * rỗng và báo lỗi khó hiểu.
 */
export async function resolveModel(input: {
  requested?: string | null;
  prompt?: string | null;
  kind: ModelKind;
}): Promise<string> {
  const requested = input.requested?.trim();
  if (requested) return requested;

  const fromPrompt = input.prompt?.trim();
  if (fromPrompt) return fromPrompt;

  return getDefaultModel(input.kind);
}

/**
 * Lượt chạy này có cần GPU ở máy không.
 *
 * Job LLM giữ chỗ `VRAM_LLM_MB` (mặc định 12 GB) suốt thời gian chạy. Gọi lên
 * OpenRouter thì không dùng một MB VRAM nào, mà một lượt gọi mạng kéo dài hàng
 * chục giây — giữ chỗ trong lúc đó là chặn đứng clone giọng và mọi việc GPU
 * khác mà chẳng để làm gì.
 *
 * KHÔNG tra model của prompt ở đây: lúc xếp hàng chưa biết thể loại nên chưa
 * chọn được prompt. Nghi ngờ thì cứ giữ chỗ — mất chút song song còn hơn để
 * hai model cùng nhảy vào 16 GB VRAM rồi cả hai cùng chết.
 */
export async function needsLocalGpu(input: {
  requested?: string | null;
  kind: ModelKind;
}): Promise<boolean> {
  const requested = input.requested?.trim();
  const model = requested || (await getDefaultModel(input.kind));
  const provider: ProviderName = parseModelRef(model).provider ?? loadEnv().LLM_PROVIDER;
  return provider === "ollama";
}
