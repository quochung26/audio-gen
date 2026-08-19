import { loadEnv } from "@audio/config";
import { prisma } from "@audio/database";

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

/** Giá trị trong `.env` — dùng khi chưa ai đặt gì ở giao diện. */
export function envDefaultModel(kind: ModelKind): string {
  const env = loadEnv();
  if (kind === "write") return env.OLLAMA_MODEL_WRITE;
  if (kind === "utility") return env.OLLAMA_MODEL_UTILITY;
  return env.EMBED_MODEL;
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
