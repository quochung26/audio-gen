import { describe, expect, it } from "vitest";
import { modelChoices } from "./model-choices";

const installed = [
  { name: "qwen3:14b", parameterSize: "14B", quantization: "Q4_K_M" },
  { name: "bge-m3", parameterSize: null, quantization: null },
];
const recent = ["anthropic/claude-sonnet-4.5", "openai/gpt-5"];

describe("modelChoices", () => {
  it("chạy Ollama thì liệt kê model đã tải, kèm cỡ và mức lượng tử hoá", () => {
    const r = modelChoices({ provider: "ollama", reachable: true, installed, recent });
    expect(r).toEqual([
      { value: "qwen3:14b", label: "qwen3:14b · 14B · Q4_K_M" },
      { value: "bge-m3", label: "bge-m3" },
    ]);
  });

  it("chạy giả lập VẪN liệt kê model của Ollama", () => {
    // Provider mock dùng tên model kiểu Ollama. Trước đây nó rơi vào nhánh
    // "đã dùng gần đây" và bảng chọn hiện toàn tên cũ trong lịch sử.
    const r = modelChoices({ provider: "mock", reachable: true, installed, recent });
    expect(r.map((c) => c.value)).toEqual(["qwen3:14b", "bge-m3"]);
  });

  it("chỉ OpenRouter mới đổi sang danh sách đã dùng gần đây", () => {
    const r = modelChoices({ provider: "openrouter", reachable: true, installed, recent });
    expect(r.map((c) => c.value)).toEqual(recent);
  });

  it("Ollama chưa chạy thì trả rỗng chứ không đoán", () => {
    // Chọn model chưa có là job chết giữa chừng một tập đang viết dở.
    expect(modelChoices({ provider: "ollama", reachable: false, installed, recent })).toEqual([]);
    expect(modelChoices({ provider: "mock", reachable: false, installed, recent })).toEqual([]);
  });

  it("OpenRouter không phụ thuộc Ollama có chạy hay không", () => {
    const r = modelChoices({ provider: "openrouter", reachable: false, installed: [], recent });
    expect(r).toHaveLength(2);
  });
});
