import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("bỏ dấu tiếng Việt", () => {
    expect(slugify("Chuyến xe cuối cùng")).toBe("chuyen-xe-cuoi-cung");
    expect(slugify("Bến Cũ giữa đêm mưa")).toBe("ben-cu-giua-dem-mua");
  });

  it("xử lý được chữ đ/Đ — NFD KHÔNG tách được hai chữ này", () => {
    // Đây là lý do slugify phải thay tay thay vì chỉ dựa vào normalize("NFD").
    expect(slugify("đường về")).toBe("duong-ve");
    expect(slugify("Đêm Đông")).toBe("dem-dong");
  });

  it("gộp ký tự lạ thành một dấu gạch, không để gạch ở hai đầu", () => {
    expect(slugify("  Tập 1 — Mở đầu!!! ")).toBe("tap-1-mo-dau");
    expect(slugify("a/b\\c:d")).toBe("a-b-c-d");
  });

  it("cắt ở 80 ký tự", () => {
    expect(slugify("a".repeat(200))).toHaveLength(80);
  });

  it("chuỗi không có ký tự chữ số nào thì ra rỗng", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("giữ nguyên khi chưa bị chiếm", () => {
    expect(uniqueSlug("Đường về", new Set())).toBe("duong-ve");
  });

  it("thêm hậu tố bắt đầu từ 2 khi trùng", () => {
    expect(uniqueSlug("Đường về", new Set(["duong-ve"]))).toBe("duong-ve-2");
    expect(uniqueSlug("Đường về", new Set(["duong-ve", "duong-ve-2"]))).toBe("duong-ve-3");
  });

  it("nhảy qua khoảng trống trong dãy đã chiếm", () => {
    expect(uniqueSlug("x", new Set(["x", "x-2", "x-3", "x-4"]))).toBe("x-5");
  });
});
