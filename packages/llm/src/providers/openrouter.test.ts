import { describe, expect, it } from "vitest";
import { stripJsonFence } from "./openrouter";

describe("stripJsonFence", () => {
  it("lột rào ```json", () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("lột rào ``` không ghi ngôn ngữ", () => {
    expect(stripJsonFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("JSON trần thì để nguyên", () => {
    expect(stripJsonFence('{"a":1}')).toBe('{"a":1}');
  });

  it("giữ nguyên dấu rào NẰM TRONG chuỗi JSON", () => {
    // Truyện có thể chứa khối mã; lột nhầm là hỏng dữ liệu.
    const s = '{"text":"đoạn ```mã trong truyện"}';
    expect(stripJsonFence(s)).toBe(s);
  });

  it("JSON nhiều dòng trong rào", () => {
    expect(stripJsonFence('```json\n{\n  "a": 1\n}\n```')).toBe('{\n  "a": 1\n}');
  });

  it("khoảng trắng thừa hai đầu không làm hỏng", () => {
    expect(stripJsonFence('  \n```json\n{"a":1}\n```  \n')).toBe('{"a":1}');
  });

  it("rào mở mà không đóng thì để nguyên, không cắt bừa", () => {
    expect(stripJsonFence('```json\n{"a":1}')).toBe('```json\n{"a":1}');
  });
});
