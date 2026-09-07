import { describe, expect, it } from "vitest";
import { stripJsonFence } from "./openrouter";

describe("stripJsonFence", () => {
  it("strips a ```json fence", () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("strips a ``` fence with no language", () => {
    expect(stripJsonFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("leaves bare JSON alone", () => {
    expect(stripJsonFence('{"a":1}')).toBe('{"a":1}');
  });

  it("leaves fence characters INSIDE a JSON string alone", () => {
    // A story can contain a code block; stripping it would corrupt the data.
    const s = '{"text":"đoạn ```mã trong truyện"}';
    expect(stripJsonFence(s)).toBe(s);
  });

  it("multi-line JSON inside a fence", () => {
    expect(stripJsonFence('```json\n{\n  "a": 1\n}\n```')).toBe('{\n  "a": 1\n}');
  });

  it("stray whitespace at either end does not break it", () => {
    expect(stripJsonFence('  \n```json\n{"a":1}\n```  \n')).toBe('{"a":1}');
  });

  it("an opening fence with no closing one is left alone, never cut blindly", () => {
    expect(stripJsonFence('```json\n{"a":1}')).toBe('```json\n{"a":1}');
  });
});
