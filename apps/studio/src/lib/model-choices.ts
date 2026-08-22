export interface InstalledModel {
  name: string;
  parameterSize: string | null;
  quantization: string | null;
}

export interface ModelChoice {
  value: string;
  label: string;
}

/**
 * Model nào được liệt kê cho chọn.
 *
 * Chỉ OpenRouter mới đổi nguồn danh sách. Provider `mock` vẫn dùng tên model
 * kiểu Ollama — trước đây nó rơi vào nhánh "model đã dùng gần đây" và bảng chọn
 * hiện toàn tên cũ trong lịch sử, kể cả những tên không còn tải về nữa.
 *
 * Ollama chưa chạy thì trả rỗng chứ không đoán: chọn model chưa có là job chết
 * giữa chừng một tập đang viết dở.
 */
export function modelChoices(input: {
  provider: string;
  reachable: boolean;
  installed: InstalledModel[];
  recent: string[];
}): ModelChoice[] {
  if (input.provider === "openrouter") {
    return input.recent.map((m) => ({ value: m, label: m }));
  }
  if (!input.reachable) return [];

  return input.installed.map((m) => ({
    value: m.name,
    label:
      m.name +
      (m.parameterSize ? ` · ${m.parameterSize}` : "") +
      (m.quantization ? ` · ${m.quantization}` : ""),
  }));
}
