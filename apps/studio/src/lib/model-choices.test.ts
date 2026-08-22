import { describe, expect, it } from "vitest";
import { modelChoices } from "./model-choices";

const installed = [
  { name: "qwen3:14b", parameterSize: "14B", quantization: "Q4_K_M" },
  { name: "bge-m3", parameterSize: null, quantization: null },
];
const recent = ["anthropic/claude-sonnet-4.5", "openai/gpt-5"];
const url = "http://localhost:11434";

describe("modelChoices", () => {
  it("chạy Ollama thì liệt kê model đã tải, kèm cỡ và mức lượng tử hoá", () => {
    const r = modelChoices({ provider: "ollama", reachable: true, installed, recent, url });
    expect(r.choices).toEqual([
      { value: "qwen3:14b", label: "qwen3:14b · 14B · Q4_K_M" },
      { value: "bge-m3", label: "bge-m3" },
    ]);
    expect(r.reason).toBeNull();
  });

  it("chạy giả lập VẪN liệt kê model của Ollama", () => {
    // Provider mock dùng tên model kiểu Ollama. Trước đây nó rơi vào nhánh
    // "đã dùng gần đây" và bảng chọn hiện toàn tên cũ trong lịch sử.
    const r = modelChoices({ provider: "mock", reachable: true, installed, recent, url });
    expect(r.choices.map((c) => c.value)).toEqual(["qwen3:14b", "bge-m3"]);
  });

  it("chỉ OpenRouter mới đổi sang danh sách đã dùng gần đây", () => {
    const r = modelChoices({ provider: "openrouter", reachable: true, installed, recent, url });
    expect(r.choices.map((c) => c.value)).toEqual(recent);
  });

  it("Ollama chưa chạy: rỗng, và NÓI RÕ vì sao kèm địa chỉ", () => {
    // Không nói thì nhìn vào chỉ thấy "không có chỗ chọn model".
    const r = modelChoices({ provider: "ollama", reachable: false, installed, recent, url });
    expect(r.choices).toEqual([]);
    expect(r.reason).toContain("Không kết nối được Ollama");
    expect(r.reason).toContain(url);
    expect(r.reason).toContain("ollama serve");
  });

  it("chạy giả lập mà Ollama chưa chạy cũng nói lý do đó", () => {
    expect(modelChoices({ provider: "mock", reachable: false, installed, recent, url }).reason).toContain(
      "Không kết nối được Ollama",
    );
  });

  it("Ollama chạy nhưng chưa tải model nào — lý do KHÁC hẳn", () => {
    const r = modelChoices({ provider: "ollama", reachable: true, installed: [], recent, url });
    expect(r.choices).toEqual([]);
    expect(r.reason).toContain("chưa tải model nào");
    expect(r.reason).not.toContain("Không kết nối được");
  });

  it("OpenRouter chưa dùng model nào cũng có lý do riêng", () => {
    const r = modelChoices({ provider: "openrouter", reachable: false, installed: [], recent: [] });
    expect(r.choices).toEqual([]);
    expect(r.reason).toContain("OpenRouter");
    // Không đổ lỗi cho Ollama khi đang chạy đám mây.
    expect(r.reason).not.toContain("ollama serve");
  });

  it("OpenRouter không phụ thuộc Ollama có chạy hay không", () => {
    const r = modelChoices({ provider: "openrouter", reachable: false, installed: [], recent });
    expect(r.choices).toHaveLength(2);
    expect(r.reason).toBeNull();
  });
});
