export interface InstalledModel {
  name: string;
  parameterSize: string | null;
  quantization: string | null;
}

export interface ModelChoice {
  value: string;
  label: string;
}

export interface ModelChoices {
  choices: ModelChoice[];
  /**
   * Vì sao không có gì để chọn. `null` khi có.
   *
   * Luôn phải nói ra: trước đây danh sách rỗng thì giao diện lặng lẽ đổi sang ô
   * gõ tay, nhìn vào chỉ thấy "không có chỗ chọn model" mà không biết là do
   * Ollama chưa chạy, hay do chưa tải model nào, hay do đang chạy OpenRouter.
   */
  reason: string | null;
}

/**
 * Model nào được liệt kê cho chọn, và nếu không có thì vì sao.
 *
 * Chỉ OpenRouter mới đổi nguồn danh sách. Provider `mock` vẫn dùng tên model
 * kiểu Ollama — trước đây nó rơi vào nhánh "model đã dùng gần đây" và bảng chọn
 * hiện toàn tên cũ trong lịch sử.
 *
 * Ollama chưa chạy thì trả rỗng chứ không đoán: chọn model chưa có là job chết
 * giữa chừng một tập đang viết dở.
 */
export function modelChoices(input: {
  provider: string;
  reachable: boolean;
  installed: InstalledModel[];
  recent: string[];
  /** Địa chỉ Ollama — đưa vào lời giải thích cho khỏi phải đi tra `.env`. */
  url?: string;
}): ModelChoices {
  if (input.provider === "openrouter") {
    const choices = input.recent.map((m) => ({ value: m, label: m }));
    return {
      choices,
      reason: choices.length
        ? null
        : "Chưa dùng model OpenRouter nào. Chọn một model ở mục OpenRouter, hoặc gõ tên model.",
    };
  }

  if (!input.reachable) {
    return {
      choices: [],
      reason: `Không kết nối được Ollama${input.url ? ` ở ${input.url}` : ""} nên không lấy được danh sách model. Chạy \`ollama serve\` rồi tải lại trang.`,
    };
  }

  if (input.installed.length === 0) {
    return {
      choices: [],
      reason: "Ollama đang chạy nhưng chưa tải model nào. Tải ở mục “Tải model về” bên dưới.",
    };
  }

  return {
    choices: input.installed.map((m) => ({
      value: m.name,
      label:
        m.name +
        (m.parameterSize ? ` · ${m.parameterSize}` : "") +
        (m.quantization ? ` · ${m.quantization}` : ""),
    })),
    reason: null,
  };
}
