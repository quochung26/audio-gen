import { describe, expect, it } from "vitest";
import {
  GEN_PARAMS,
  knownGenParams,
  parseGenParams,
  unknownGenParamKeys,
} from "./gen-params";

describe("bảng khai báo", () => {
  it("mọi tham số đều có khoảng hợp lệ và giá trị mặc định nằm trong khoảng", () => {
    for (const p of GEN_PARAMS) {
      expect(p.min).toBeLessThan(p.max);
      expect(p.fallback).toBeGreaterThanOrEqual(p.min);
      expect(p.fallback).toBeLessThanOrEqual(p.max);
      expect(p.hint.length).toBeGreaterThan(10);
    }
  });

  it("có đủ những nút vặn provider thật sự đọc", () => {
    expect(GEN_PARAMS.map((p) => p.key).sort()).toEqual(
      ["maxTokens", "numCtx", "repeatPenalty", "temperature", "topP"].sort(),
    );
  });
});

describe("parseGenParams", () => {
  it("đọc số bình thường", () => {
    const r = parseGenParams({ temperature: "0.85", numCtx: "16384" });
    expect(r.params).toEqual({ temperature: 0.85, numCtx: 16384 });
    expect(r.errors).toEqual([]);
  });

  it("ô TRỐNG nghĩa là không đặt, khác với đặt bằng 0", () => {
    // Bỏ trống thì rơi về mặc định của provider; temperature 0 là lựa chọn thật.
    expect(parseGenParams({ temperature: "" }).params).toEqual({});
    expect(parseGenParams({ temperature: "   " }).params).toEqual({});
    expect(parseGenParams({}).params).toEqual({});
    expect(parseGenParams({ temperature: "0" }).params).toEqual({ temperature: 0 });
  });

  it("chặn giá trị ngoài khoảng, nói rõ khoảng nào", () => {
    // temperature 3 thì model nói lảm nhảm; không chặn thì phải đi tìm nguyên
    // nhân một tập hỏng.
    const r = parseGenParams({ temperature: "3" });
    expect(r.params).toEqual({});
    expect(r.errors[0]).toMatch(/0–1.5/);
    expect(r.errors[0]).toMatch(/đang là 3/);
  });

  it("chặn numCtx quá nhỏ — thứ âm thầm cắt mất Story Bible", () => {
    expect(parseGenParams({ numCtx: "512" }).errors).toHaveLength(1);
  });

  it("chặn thứ không phải số", () => {
    const r = parseGenParams({ temperature: "cao" });
    expect(r.errors[0]).toMatch(/không phải số/);
    expect(r.params).toEqual({});
  });

  it("làm tròn tham số nguyên", () => {
    expect(parseGenParams({ numCtx: "16384.7" }).params.numCtx).toBe(16385);
    // Tham số thập phân thì giữ nguyên.
    expect(parseGenParams({ temperature: "0.85" }).params.temperature).toBe(0.85);
  });

  it("một ô sai không làm mất các ô đúng", () => {
    const r = parseGenParams({ temperature: "0.8", topP: "99" });
    expect(r.params).toEqual({ temperature: 0.8 });
    expect(r.errors).toHaveLength(1);
  });

  it("nhận cả biên", () => {
    const r = parseGenParams({ temperature: "1.5", topP: "0.1" });
    expect(r.errors).toEqual([]);
    expect(r.params).toEqual({ temperature: 1.5, topP: 0.1 });
  });
});

describe("knownGenParams", () => {
  it("giữ khoá provider đọc được", () => {
    expect(knownGenParams({ temperature: 0.9, numCtx: 8192 })).toEqual({
      temperature: 0.9,
      numCtx: 8192,
    });
  });

  it("bỏ khoá lạ — xưa nay chúng bị bỏ qua âm thầm", () => {
    expect(knownGenParams({ temperature: 0.9, top_k: 40, nonsense: 1 })).toEqual({
      temperature: 0.9,
    });
  });

  it("và chỉ ra chúng để người dùng biết mình gõ thừa", () => {
    expect(unknownGenParamKeys({ temperature: 0.9, top_k: 40 })).toEqual(["top_k"]);
    expect(unknownGenParamKeys({ temperature: 0.9 })).toEqual([]);
  });

  it("dữ liệu rác không làm chết", () => {
    expect(knownGenParams(null)).toEqual({});
    expect(knownGenParams("chuỗi")).toEqual({});
    expect(knownGenParams({ temperature: "không phải số" })).toEqual({});
    expect(unknownGenParamKeys(null)).toEqual([]);
  });
});
