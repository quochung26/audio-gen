/**
 * Client Ollama cho trang cài đặt model.
 *
 * Tách khỏi `@audio/llm` có chủ đích: gói kia lo việc SINH CHỮ, gói này lo việc
 * quản lý model (xem có gì, tải về, xoá đi). Trộn vào nhau thì worker phải mang
 * theo cả code quản lý mà nó không bao giờ dùng.
 */

export interface OllamaModel {
  name: string;
  sizeBytes: number;
  parameterSize: string | null;
  quantization: string | null;
  modifiedAt: string | null;
}

export interface PullProgress {
  /** Model đang tải, ví dụ "qwen3:14b-q4_K_M". */
  model: string;
  /** Ollama đang làm gì: "pulling manifest", "downloading …", "success"… */
  status: string;
  completedBytes: number;
  totalBytes: number;
  done: boolean;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

/** Một dòng NDJSON mà `/api/pull` trả về. */
export interface PullChunk {
  status?: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

/**
 * Gộp một dòng tiến độ vào trạng thái đang có.
 *
 * Ollama trả tiến độ theo TỪNG LỚP ảnh, mỗi lớp có `digest` riêng và `completed`
 * đếm lại từ 0. Cộng dồn thẳng `completed` là thanh tiến độ nhảy lùi mỗi khi
 * sang lớp mới. Nên phải cộng theo digest.
 */
export function reducePull(
  prev: PullProgress,
  chunk: PullChunk,
  layers: Map<string, { completed: number; total: number }>,
): PullProgress {
  if (chunk.error) {
    return { ...prev, error: chunk.error, done: true, finishedAt: Date.now() };
  }

  if (chunk.digest && typeof chunk.total === "number") {
    layers.set(chunk.digest, {
      completed: chunk.completed ?? 0,
      total: chunk.total,
    });
  }

  let completedBytes = 0;
  let totalBytes = 0;
  for (const l of layers.values()) {
    completedBytes += l.completed;
    totalBytes += l.total;
  }

  // "success" là dòng cuối cùng Ollama gửi khi tải xong.
  const done = chunk.status === "success";

  return {
    ...prev,
    status: chunk.status ?? prev.status,
    completedBytes,
    totalBytes,
    done,
    finishedAt: done ? Date.now() : prev.finishedAt,
  };
}

/**
 * Tách các dòng NDJSON hoàn chỉnh khỏi bộ đệm.
 *
 * Trả về cả phần dư: một khối dữ liệu từ mạng có thể cắt ngang giữa dòng JSON,
 * parse ngay là lỗi cú pháp. Phần dư đợi khối sau nối vào.
 */
export function takeLines(buffer: string): { chunks: PullChunk[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  const chunks: PullChunk[] = [];

  for (const line of parts) {
    const t = line.trim();
    if (!t) continue;
    try {
      chunks.push(JSON.parse(t) as PullChunk);
    } catch {
      // Dòng hỏng thì bỏ qua — mất một mốc tiến độ còn hơn chết cả lượt tải.
    }
  }
  return { chunks, rest };
}

export function newPullProgress(model: string): PullProgress {
  return {
    model,
    status: "đang bắt đầu",
    completedBytes: 0,
    totalBytes: 0,
    done: false,
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
}

/** Tag model hợp lệ: `tên[:thẻ]`, chỉ chữ số và vài ký tự Ollama cho phép. */
export function isValidModelTag(tag: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._/-]*(:[a-zA-Z0-9._-]+)?$/.test(tag) && tag.length <= 128;
}
