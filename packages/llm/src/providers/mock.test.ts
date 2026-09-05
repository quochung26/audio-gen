import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MockProvider } from "./mock";

// Tốc độ giả lập cao ngất để bỏ qua phần ngủ mô phỏng streaming — ở đây chỉ
// quan tâm nó đọc ra con số nào, không quan tâm nó chậm bao lâu.
const llm = new MockProvider(1e6);

/**
 * Provider giả lập đọc NGƯỢC ra vài con số từ prompt để pipeline chạy thật
 * giống. Nhãn trong prompt đổi mà đây không đổi thì không có gì báo — nó chỉ
 * lặng lẽ rơi về giá trị mặc định, và mọi tập trông vẫn hợp lý.
 */
describe("mock đọc số từ đích trong prompt", () => {
  const words = async (prompt: string) =>
    (await llm.generate({ model: "mock", prompt })).text.split(/\s+/).length;

  it("nhận nhãn tiếng Anh — bản prompt đang dùng", async () => {
    expect(await words("Target length: about 900 words.")).toBeGreaterThan(500);
  });

  it("vẫn nhận nhãn tiếng Việt — prompt cũ còn trong DB tới khi seed lại", async () => {
    expect(await words("Độ dài mục tiêu: khoảng 900 từ.")).toBeGreaterThan(500);
  });

  it("không có nhãn nào thì về mặc định, không ném", async () => {
    expect(await words("viết một cảnh")).toBeGreaterThan(0);
  });
});

describe("mock đọc số tập trong prompt dàn ý", () => {
  const schema = z.object({
    episodes: z.array(z.object({ number: z.number(), title: z.string() })).min(1),
  });
  const count = async (prompt: string) =>
    (await llm.generateJson({ model: "mock", prompt, schema })).data.episodes.length;

  it("nhận nhãn tiếng Anh", async () => {
    expect(await count("Episode count: 3")).toBe(3);
  });

  it("vẫn nhận nhãn tiếng Việt", async () => {
    expect(await count("Số tập: 3")).toBe(3);
  });
});
