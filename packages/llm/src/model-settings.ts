import { loadEnv } from "@audio/config";
import { prisma } from "@audio/database";
import { isProviderName, type ProviderName } from "./providers/active";

/**
 * Model nào cho việc gì.
 *
 * Ba tầng, cụ thể hơn thì thắng:
 *
 *   1. Model chọn cho LẦN CHẠY này  — "viết tập này bằng model to xem sao"
 *   2. Model của PROMPT              — bước này luôn dùng model nhỏ hơn
 *   3. Model MẶC ĐỊNH                — bảng Setting, lùi về .env nếu chưa đặt
 *
 * Tầng mặc định nằm trong DB chứ không chỉ trong `.env` vì đổi model mặc định
 * là việc làm thường xuyên lúc đang thử; sửa `.env` thì phải khởi động lại
 * worker.
 */
export type ModelKind = "write" | "utility" | "embed";

const PROVIDER_KEY = "llm.provider";

/**
 * Khoá lưu model mặc định — TÁCH THEO PROVIDER.
 *
 * Nếu dùng chung một khoá thì đổi sang OpenRouter, chọn claude-sonnet, rồi đổi
 * về Ollama là mọi job đi hỏi Ollama một model tên "anthropic/claude-sonnet-4.5"
 * và chết. Mà đổi qua đổi lại chính là việc người ta sẽ làm.
 *
 * Nhúng vector không tách: nó luôn chạy tại chỗ.
 */
function settingKey(kind: ModelKind, provider: ProviderName): string {
  return kind === "embed" ? "model.embed" : `model.${storageProvider(provider)}.${kind}`;
}

/**
 * Provider nào dùng chung ô lưu model mặc định.
 *
 * `mock` dùng chung với `ollama`: nó vốn là bản đứng thay cho model chạy tại
 * chỗ và nhận cùng kiểu tên model. Tách ra thì cấu hình đặt lúc đang chạy giả
 * lập — tức là lúc phần lớn người ta dựng máy — biến mất ngay khi chuyển sang
 * Ollama thật, mà chẳng có gì báo.
 */
function storageProvider(provider: ProviderName): "ollama" | "openrouter" {
  return provider === "openrouter" ? "openrouter" : "ollama";
}

/**
 * Provider đang bật. Một tại một thời điểm.
 *
 * `.env` là giá trị khởi đầu; đổi trên giao diện thì ghi vào `Setting` và ăn
 * ngay, không phải khởi động lại worker.
 */
export async function getActiveProvider(): Promise<ProviderName> {
  const row = await prisma.setting.findUnique({ where: { key: PROVIDER_KEY } });
  const stored = row?.value?.trim();
  if (stored && isProviderName(stored)) return stored;
  return loadEnv().LLM_PROVIDER;
}

/** Đổi provider. Chuỗi rỗng = xoá, quay về giá trị trong `.env`. */
export async function setActiveProvider(value: string): Promise<void> {
  const v = value.trim();
  if (!v) {
    await prisma.setting.deleteMany({ where: { key: PROVIDER_KEY } });
    return;
  }
  if (!isProviderName(v)) throw new Error(`Provider không hợp lệ: "${v}"`);
  await prisma.setting.upsert({
    where: { key: PROVIDER_KEY },
    create: { key: PROVIDER_KEY, value: v },
    update: { value: v },
  });
}

/**
 * Giá trị trong `.env` — dùng khi chưa ai đặt gì ở giao diện.
 *
 * Theo provider đang bật: trả về "qwen3:14b" khi đang chạy OpenRouter thì nhận
 * 404 không có model, và lỗi đó chẳng chỉ về đúng nguyên nhân.
 *
 * Embedding luôn chạy tại chỗ nên không đi theo — nhúng một câu tốn vài ms,
 * trả tiền cho đám mây để làm việc đó là vô lý.
 */
export function envDefaultModel(kind: ModelKind, provider: ProviderName): string {
  const env = loadEnv();
  if (kind === "embed") return env.EMBED_MODEL;

  if (storageProvider(provider) === "openrouter") {
    return kind === "write" ? env.OPENROUTER_MODEL_WRITE : env.OPENROUTER_MODEL_UTILITY;
  }
  return kind === "write" ? env.OLLAMA_MODEL_WRITE : env.OLLAMA_MODEL_UTILITY;
}

export async function getDefaultModel(kind: ModelKind): Promise<string> {
  const provider = await getActiveProvider();
  const row = await prisma.setting.findUnique({ where: { key: settingKey(kind, provider) } });
  return row?.value?.trim() || envDefaultModel(kind, provider);
}

export async function getDefaultModels(): Promise<
  Record<ModelKind, { value: string; fromEnv: boolean; envValue: string }>
> {
  const provider = await getActiveProvider();
  const kinds: ModelKind[] = ["write", "utility", "embed"];
  const keys = kinds.map((k) => settingKey(k, provider));

  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value.trim()]));

  const out = {} as Record<ModelKind, { value: string; fromEnv: boolean; envValue: string }>;
  for (const kind of kinds) {
    const stored = byKey.get(settingKey(kind, provider));
    // `envValue` đi kèm luôn: giao diện cần nói rõ "bỏ trống thì rơi về đâu",
    // mà `value` lúc đã đặt tay thì không còn là giá trị của `.env` nữa.
    const envValue = envDefaultModel(kind, provider);
    out[kind] = stored ? { value: stored, fromEnv: false, envValue } : { value: envValue, fromEnv: true, envValue };
  }
  return out;
}

/** Đặt model mặc định cho provider đang bật. Chuỗi rỗng = quay về `.env`. */
export async function setDefaultModel(kind: ModelKind, value: string): Promise<void> {
  const provider = await getActiveProvider();
  const key = settingKey(kind, provider);
  const v = value.trim();

  if (!v) {
    await prisma.setting.deleteMany({ where: { key } });
    return;
  }
  await prisma.setting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
}

/**
 * Chọn model cho một lần gọi.
 *
 * Chuỗi rỗng ở tầng trên coi như KHÔNG đặt — form gửi lên `model=""` khi người
 * dùng để trống, mà coi chuỗi rỗng là một lựa chọn thì provider nhận model tên
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
 */
export async function needsLocalGpu(): Promise<boolean> {
  return (await getActiveProvider()) === "ollama";
}
