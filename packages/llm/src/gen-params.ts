/**
 * Tham số sinh — những nút vặn quyết định model viết ra thứ gì.
 *
 * Trước đây sửa bằng cách gõ JSON tay ở trang Prompt: gõ sai tên khoá thì không
 * có gì báo, tham số lặng lẽ bị bỏ qua và văn vẫn ra — chỉ là ra bằng giá trị
 * mặc định. Khai báo tập trung ở đây để giao diện dựng ô nhập, và để giá trị
 * ngoài khoảng bị chặn ngay lúc lưu.
 */
export interface GenParamSpec {
  key: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  /** Bước nhảy của ô nhập. Số nguyên thì để 1. */
  step: number;
  /** Provider dùng gì khi không ai đặt — hiện làm gợi ý trong ô trống. */
  fallback: number;
}

export const GEN_PARAMS: GenParamSpec[] = [
  {
    key: "temperature",
    label: "temperature",
    hint: "Cao thì văn biến hoá hơn nhưng dễ lạc đề. Bước biên tập và tóm tắt nên để thấp.",
    min: 0,
    // Trên 1.5 thì phần lớn model bắt đầu nói lảm nhảm; chặn ở đây để khỏi phải
    // đi tìm nguyên nhân một tập hỏng.
    max: 1.5,
    step: 0.05,
    fallback: 0.9,
  },
  {
    key: "topP",
    label: "topP",
    hint: "Chỉ lấy trong nhóm từ chiếm ngần này xác suất. Hạ xuống là văn an toàn hơn, nhạt hơn.",
    min: 0.1,
    max: 1,
    step: 0.01,
    fallback: 0.92,
  },
  {
    key: "repeatPenalty",
    label: "repeatPenalty",
    hint: "Phạt lặp cụm từ — bệnh kinh niên của model nhỏ. Quá cao thì câu cụt và gượng.",
    min: 1,
    max: 1.5,
    step: 0.01,
    fallback: 1.1,
  },
  {
    key: "numCtx",
    label: "numCtx",
    hint: "Trần ngữ cảnh. Hạ xuống là cắt mất phần đầu prompt — mất luôn Story Bible mà không báo gì.",
    min: 2048,
    max: 131072,
    step: 1024,
    fallback: 16384,
  },
  {
    key: "maxTokens",
    label: "maxTokens",
    hint: "Trần độ dài câu trả lời. Đặt thấp là cảnh cụt giữa câu.",
    min: 128,
    max: 32768,
    step: 128,
    fallback: 1500,
  },
];

const BY_KEY = new Map(GEN_PARAMS.map((p) => [p.key, p]));

export interface ParsedGenParams {
  params: Record<string, number>;
  /** Ô nào sai và sai thế nào — trả về chứ không ném, để form hiện tại chỗ. */
  errors: string[];
}

/**
 * Đọc tham số từ form.
 *
 * Ô để trống nghĩa là KHÔNG đặt, khác hẳn với đặt bằng 0: bỏ trống thì rơi về
 * mặc định của provider, còn `temperature: 0` là một lựa chọn thật (văn lặp
 * đi lặp lại nhưng tất định).
 */
export function parseGenParams(input: Record<string, unknown>): ParsedGenParams {
  const params: Record<string, number> = {};
  const errors: string[] = [];

  for (const spec of GEN_PARAMS) {
    const raw = input[spec.key];
    if (raw === undefined || raw === null || String(raw).trim() === "") continue;

    const n = Number(String(raw).trim());
    if (!Number.isFinite(n)) {
      errors.push(`${spec.label}: "${String(raw)}" không phải số`);
      continue;
    }
    if (n < spec.min || n > spec.max) {
      errors.push(`${spec.label}: phải trong khoảng ${spec.min}–${spec.max}, đang là ${n}`);
      continue;
    }
    params[spec.key] = spec.step >= 1 ? Math.round(n) : n;
  }
  return { params, errors };
}

/**
 * Lọc tham số đã lưu trong DB về những khoá THẬT SỰ có tác dụng.
 *
 * Provider chỉ đọc các khoá đã biết, nên khoá lạ trong `Prompt.params` xưa nay
 * bị bỏ qua âm thầm. Lọc ở đây để giao diện hiện đúng thứ đang có hiệu lực.
 */
export function knownGenParams(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;

  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const spec = BY_KEY.get(k);
    if (!spec) continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/** Khoá có trong dữ liệu cũ nhưng không provider nào đọc tới. */
export function unknownGenParamKeys(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  return Object.keys(raw as Record<string, unknown>).filter((k) => !BY_KEY.has(k));
}
