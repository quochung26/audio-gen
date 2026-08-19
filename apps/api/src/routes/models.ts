import { Hono } from "hono";
import { loadEnv } from "@audio/config";
import { prisma } from "@audio/database";
import { UserError, field } from "../lib/http";
import {
  isValidModelTag,
  newPullProgress,
  reducePull,
  takeLines,
  type OllamaModel,
  type PullProgress,
} from "../lib/ollama";

export const models = new Hono();

/**
 * Tiến độ tải, giữ trong BỘ NHỚ tiến trình API.
 *
 * Không lưu DB vì nó là trạng thái nhất thời — API khởi động lại thì Ollama VẪN
 * tải tiếp (việc tải chạy bên phía Ollama), chỉ là mất thanh tiến độ. Bấm tải
 * lại cùng model là Ollama nối tiếp phần đã có chứ không tải lại từ đầu.
 *
 * Mỗi lần một model: tải hai model 9 GB song song trên một đường mạng thì cả
 * hai đều chậm, và giao diện khó đọc.
 */
let pull: PullProgress | null = null;
let pullAbort: AbortController | null = null;

const TIMEOUT_MS = 5_000;

async function ollamaFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${loadEnv().OLLAMA_URL.replace(/\/+$/, "")}${path}`;
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** Trạng thái kết nối, model đã cài, và model mà hệ thống đang cấu hình dùng. */
models.get("/", async (c) => {
  const env = loadEnv();
  let reachable = false;
  let version: string | null = null;
  let installed: OllamaModel[] = [];
  let reason: string | null = null;

  try {
    const v = await ollamaFetch("/api/version");
    if (v.ok) {
      version = ((await v.json()) as { version?: string }).version ?? null;
      reachable = true;
    } else {
      reason = `Ollama trả HTTP ${v.status}`;
    }
  } catch (err) {
    reason = describeConnectError(err);
  }

  if (reachable) {
    const res = await ollamaFetch("/api/tags");
    const body = (await res.json()) as {
      models?: Array<{
        name: string;
        size: number;
        modified_at?: string;
        details?: { parameter_size?: string; quantization_level?: string };
      }>;
    };
    installed = (body.models ?? []).map((m) => ({
      name: m.name,
      sizeBytes: m.size,
      parameterSize: m.details?.parameter_size ?? null,
      quantization: m.details?.quantization_level ?? null,
      modifiedAt: m.modified_at ?? null,
    }));
  }

  // Model mà hệ thống sẽ dùng. Prompt có thể đè từng bước — lấy luôn để báo
  // model nào đang được nhắc tới mà chưa tải về.
  const promptModels = await prisma.prompt.findMany({
    where: { active: true, model: { not: null } },
    select: { step: true, genre: true, model: true },
  });

  const configured = [
    { label: "Viết truyện (OLLAMA_MODEL_WRITE)", model: env.OLLAMA_MODEL_WRITE },
    { label: "Việc phụ (OLLAMA_MODEL_UTILITY)", model: env.OLLAMA_MODEL_UTILITY },
    { label: "Nhúng vector (EMBED_MODEL)", model: env.EMBED_MODEL },
    ...promptModels.map((p) => ({
      label: `Prompt ${p.step}${p.genre === "*" ? "" : ` · ${p.genre}`}`,
      model: p.model!,
    })),
  ];

  const names = new Set(installed.map((m) => m.name));
  // Ollama coi "qwen3:14b" và "qwen3:14b:latest" là một; so cả hai dạng.
  const isInstalled = (m: string) => names.has(m) || names.has(`${m}:latest`);

  return c.json({
    reachable,
    reason,
    version,
    url: env.OLLAMA_URL,
    llmProvider: env.LLM_PROVIDER,
    embedProvider: env.EMBED_PROVIDER,
    installed,
    configured: configured.map((x) => ({ ...x, installed: isInstalled(x.model) })),
    pull: withElapsed(pull),
  });
});

models.get("/pull", (c) => c.json({ pull: withElapsed(pull) }));

/**
 * Tính thời gian đã chạy Ở SERVER.
 *
 * Không để trình duyệt tự trừ `Date.now() - startedAt`: đồng hồ hai máy lệch
 * nhau vài phút là chuyện thường, và lúc đó thanh tiến độ báo "đã -180 giây".
 */
function withElapsed(p: PullProgress | null) {
  if (!p) return null;
  return { ...p, elapsedMs: (p.finishedAt ?? Date.now()) - p.startedAt };
}

models.post("/pull", async (c) => {
  const body = await c.req.parseBody();
  const model = field(body, "model");

  if (!model) throw new UserError("Chưa chọn model");
  if (!isValidModelTag(model)) throw new UserError(`Tên model không hợp lệ: "${model}"`);
  if (pull && !pull.done) throw new UserError(`Đang tải "${pull.model}". Đợi xong hoặc dừng lại.`);

  pull = newPullProgress(model);
  pullAbort = new AbortController();
  void runPull(model, pullAbort.signal);

  return c.json({ ok: `Bắt đầu tải ${model}` });
});

models.delete("/pull", (c) => {
  pullAbort?.abort();
  if (pull && !pull.done) {
    pull = { ...pull, done: true, error: "Đã dừng theo yêu cầu", finishedAt: Date.now() };
  }
  return c.json({ ok: "Đã dừng tải." });
});

models.delete("/:name{.+}", async (c) => {
  const name = decodeURIComponent(c.req.param("name"));
  if (!isValidModelTag(name)) throw new UserError("Tên model không hợp lệ");

  const res = await ollamaFetch("/api/delete", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: name }),
  });
  if (!res.ok) throw new UserError(`Ollama không xoá được: HTTP ${res.status}`);
  return c.json({ ok: `Đã xoá ${name}` });
});

/**
 * Chạy nền, đọc luồng NDJSON của Ollama và cập nhật `pull`.
 *
 * KHÔNG dùng timeout của `ollamaFetch`: tải một model 9 GB mất hàng chục phút,
 * cắt sau 5 giây là hỏng ngay.
 */
async function runPull(model: string, signal: AbortSignal): Promise<void> {
  const layers = new Map<string, { completed: number; total: number }>();
  try {
    const url = `${loadEnv().OLLAMA_URL.replace(/\/+$/, "")}/api/pull`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
      signal,
    });

    if (!res.ok || !res.body) {
      pull = { ...pull!, done: true, error: `Ollama trả HTTP ${res.status}`, finishedAt: Date.now() };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { chunks, rest } = takeLines(buffer);
      buffer = rest;
      for (const ch of chunks) pull = reducePull(pull!, ch, layers);
      if (pull?.done) return;
    }

    // Hết luồng mà chưa thấy dòng "success" — coi như xong, nhưng nói rõ.
    if (pull && !pull.done) {
      pull = { ...pull, done: true, status: "kết thúc", finishedAt: Date.now() };
    }
  } catch (err) {
    const aborted = (err as Error).name === "AbortError";
    if (pull) {
      pull = {
        ...pull,
        done: true,
        error: aborted ? "Đã dừng theo yêu cầu" : (err as Error).message,
        finishedAt: Date.now(),
      };
    }
  }
}

/**
 * Đổi lỗi kết nối thành câu người đọc hiểu.
 *
 * `fetch` của Node trả đúng một chuỗi "fetch failed" cho mọi lỗi mạng và giấu
 * nguyên nhân thật trong `cause` — mà đây lại là đúng lúc người dùng cần biết
 * nhất: Ollama chưa chạy hay gõ sai địa chỉ?
 */
function describeConnectError(err: unknown): string {
  const e = err as Error & { cause?: { code?: string } };
  if (e.name === "TimeoutError") return `Không kết nối được trong ${TIMEOUT_MS / 1000} giây`;

  const code = e.cause?.code;
  if (code === "ECONNREFUSED") return "Không có gì đang lắng nghe ở địa chỉ này — Ollama đã chạy chưa?";
  if (code === "ENOTFOUND") return "Không phân giải được tên miền trong OLLAMA_URL";
  if (code === "ECONNRESET") return "Kết nối bị ngắt giữa chừng";
  return code ? `${e.message} (${code})` : e.message;
}
