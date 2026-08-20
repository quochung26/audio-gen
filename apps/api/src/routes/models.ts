import { Hono } from "hono";
import { loadEnv } from "@audio/config";
import { prisma } from "@audio/database";
import { getDefaultModels, parseModelRef, setDefaultModel, type ModelKind } from "@audio/llm";
import { describeConnectError } from "../lib/connect-error";
import { UserError, field } from "../lib/http";
import {
  averagePerEpisode,
  isValidOpenRouterModel,
  parseKeyStatus,
  parseModelList,
  type OpenRouterModel,
} from "../lib/openrouter";
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
    reason = describeConnectError(err, TIMEOUT_MS);
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

  /**
   * Model đã DÙNG THẬT gần đây.
   *
   * Nguồn cho ô chọn model từng lần chạy. OpenRouter có hơn 300 model, đổ hết
   * vào một ô select là không dùng được; còn danh sách này tự lớn lên theo thứ
   * mình thật sự chạy, nên gần như luôn là thứ muốn chọn lại.
   */
  const recentRuns = await prisma.llmRun.findMany({
    select: { model: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const recent: Array<{ model: string; provider: string }> = [];
  const seenRecent = new Set<string>();
  for (const r of recentRuns) {
    if (seenRecent.has(r.model) || recent.length >= 12) continue;
    seenRecent.add(r.model);
    recent.push({ model: r.model, provider: parseModelRef(r.model).provider ?? env.LLM_PROVIDER });
  }

  const defaults = await getDefaultModels();
  const configured = [
    { label: "Viết truyện", kind: "write" as ModelKind, ...defaults.write },
    { label: "Việc phụ — tóm tắt, metadata", kind: "utility" as ModelKind, ...defaults.utility },
    { label: "Nhúng vector", kind: "embed" as ModelKind, ...defaults.embed },
  ];

  const promptOverrides = promptModels.map((p) => ({
    label: `Prompt ${p.step}${p.genre === "*" ? "" : ` · ${p.genre}`}`,
    model: p.model!,
  }));

  const names = new Set(installed.map((m) => m.name));
  const defaultProvider = env.LLM_PROVIDER;

  /**
   * "Đã có sẵn chưa?" — nhưng câu hỏi này chỉ có nghĩa với model chạy tại chỗ.
   *
   * Model trên OpenRouter không tải về máy bao giờ, nên hỏi "đã tải chưa" là
   * sai; nếu vẫn đối chiếu với danh sách của Ollama thì mọi model đám mây đều
   * hiện cảnh báo "chưa tải" mà chẳng có gì để tải.
   */
  const describeModel = (m: string) => {
    const ref = parseModelRef(m);
    const provider = ref.provider ?? defaultProvider;
    return {
      model: m,
      provider,
      // Ollama coi "qwen3:14b" và "qwen3:14b:latest" là một; so cả hai dạng.
      installed:
        provider === "ollama" ? names.has(ref.model) || names.has(`${ref.model}:latest`) : true,
    };
  };

  return c.json({
    reachable,
    reason,
    version,
    url: env.OLLAMA_URL,
    llmProvider: env.LLM_PROVIDER,
    embedProvider: env.EMBED_PROVIDER,
    installed,
    recent,
    configured: configured.map((x) => ({ ...x, ...describeModel(x.value) })),
    promptOverrides: promptOverrides.map((x) => ({ ...x, ...describeModel(x.model) })),
    pull: withElapsed(pull),
  });
});

/** Đặt model mặc định cho một loại việc. Để trống = quay về giá trị trong .env. */
models.put("/default/:kind", async (c) => {
  const kind = c.req.param("kind") as ModelKind;
  if (!["write", "utility", "embed"].includes(kind)) throw new UserError("Loại không hợp lệ");

  const body = await c.req.parseBody();
  const model = field(body, "model");
  if (model && !isValidModelRef(model)) throw new UserError(`Tên model không hợp lệ: "${model}"`);

  await setDefaultModel(kind, model);
  return c.json({ ok: model ? `Mặc định giờ là ${model}` : "Đã bỏ, quay về giá trị trong .env" });
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

/* ─────────────────────────── OpenRouter ─────────────────────────── */

/**
 * Danh sách model, giữ trong bộ nhớ.
 *
 * OpenRouter có hơn 300 model và danh sách gần như không đổi trong ngày; gọi
 * lại mỗi lần mở trang là tải vài trăm KB không để làm gì.
 */
let modelCache: { at: number; models: OpenRouterModel[] } | null = null;
const MODEL_CACHE_MS = 10 * 60 * 1000;

function openRouterUrl(path: string): string {
  return `${loadEnv().OPENROUTER_URL.replace(/\/+$/, "")}${path}`;
}

/**
 * Trạng thái kết nối OpenRouter.
 *
 * KHÔNG trả về khoá API dưới bất kỳ dạng nào — kể cả cắt ngắn hay che bớt.
 * Thứ này đi thẳng ra trình duyệt.
 */
models.get("/openrouter", async (c) => {
  const env = loadEnv();
  const hasKey = env.OPENROUTER_API_KEY.length > 0;

  // Ước tính chi phí dựa trên các lượt chạy THẬT đã ghi lại, không đoán.
  const runs = await prisma.llmRun.findMany({
    where: { episodeId: { not: null } },
    select: { episodeId: true, inputTokens: true, outputTokens: true },
  });
  const usage = averagePerEpisode(runs);

  const base = {
    hasKey,
    url: env.OPENROUTER_URL,
    active: env.LLM_PROVIDER === "openrouter",
    usage,
  };

  if (!hasKey) {
    return c.json({
      ...base,
      reachable: false,
      reason: "Chưa đặt OPENROUTER_API_KEY trong .env",
      key: null,
    });
  }

  try {
    const res = await fetch(openRouterUrl("/key"), {
      headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 401) {
      return c.json({
        ...base,
        reachable: false,
        reason: "OpenRouter từ chối khoá này (401). Kiểm tra lại OPENROUTER_API_KEY.",
        key: null,
      });
    }
    if (!res.ok) {
      return c.json({ ...base, reachable: false, reason: `OpenRouter trả HTTP ${res.status}`, key: null });
    }

    return c.json({ ...base, reachable: true, reason: null, key: parseKeyStatus(await res.json()) });
  } catch (err) {
    return c.json({ ...base, reachable: false, reason: describeConnectError(err, TIMEOUT_MS), key: null });
  }
});

/** Danh sách model đang có trên OpenRouter, kèm giá. */
models.get("/openrouter/models", async (c) => {
  if (modelCache && Date.now() - modelCache.at < MODEL_CACHE_MS) {
    return c.json({ models: modelCache.models, cached: true });
  }

  const env = loadEnv();
  try {
    const res = await fetch(openRouterUrl("/models"), {
      // Danh sách model là công khai, nhưng gửi kèm khoá thì OpenRouter lọc
      // theo quyền của tài khoản — sát với thứ thật sự gọi được hơn.
      headers: env.OPENROUTER_API_KEY
        ? { authorization: `Bearer ${env.OPENROUTER_API_KEY}` }
        : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new UserError(`OpenRouter trả HTTP ${res.status}`);

    const list = parseModelList(await res.json());
    modelCache = { at: Date.now(), models: list };
    return c.json({ models: list, cached: false });
  } catch (err) {
    if (err instanceof UserError) throw err;
    throw new UserError(`Không lấy được danh sách model: ${describeConnectError(err, TIMEOUT_MS)}`);
  }
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
 * Tên model hợp lệ ở tầng mặc định — chấp nhận cả hai provider.
 *
 * Cùng một ô nhập giờ nhận "qwen3:14b" lẫn "openrouter:anthropic/claude-...",
 * nên phải bóc tiền tố trước rồi mới kiểm theo luật của đúng provider đó.
 */
function isValidModelRef(ref: string): boolean {
  const { provider, model } = parseModelRef(ref);
  if (provider === "openrouter") return isValidOpenRouterModel(model);
  return isValidModelTag(model);
}
