import { describe, expect, it } from "vitest";
import { checkCover, COVER_MAX_BYTES } from "./cover";

const good = { codec: "mjpeg", width: 3000, height: 3000, sizeBytes: 1_000_000 };

describe("checkCover", () => {
  it("ảnh đạt chuẩn thì sạch cả lỗi lẫn cảnh báo", () => {
    expect(checkCover(good)).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it("png cũng đạt", () => {
    expect(checkCover({ ...good, codec: "png" }).warnings).toEqual([]);
  });

  it("không đọc được kích thước thì CHẶN — có thể không phải ảnh", () => {
    const r = checkCover({ ...good, width: 0, height: 0 });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/có phải ảnh không/);
  });

  it("nặng quá 5 MB thì chặn", () => {
    const r = checkCover({ ...good, sizeBytes: COVER_MAX_BYTES + 1 });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/tối đa 5 MB/);
  });

  it("ảnh nhỏ thì CẢNH BÁO chứ không chặn", () => {
    // Vẫn dùng được cho trang nghe; chỉ Apple Podcasts mới từ chối. Chặn hẳn
    // thì không ai đặt được bìa tạm trong lúc chờ ảnh thật.
    const r = checkCover({ ...good, width: 800, height: 800 });
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toMatch(/nhỏ hơn 1400×1400/);
  });

  it("ảnh không vuông thì cảnh báo", () => {
    expect(checkCover({ ...good, width: 3000, height: 2000 }).warnings.join()).toMatch(
      /không vuông/,
    );
  });

  it("định dạng lạ thì cảnh báo, không chặn", () => {
    const r = checkCover({ ...good, codec: "webp" });
    expect(r.ok).toBe(true);
    expect(r.warnings.join()).toMatch(/chỉ nhận JPEG hoặc PNG/);
  });

  it("ảnh quá lớn cũng cảnh báo", () => {
    expect(checkCover({ ...good, width: 4000, height: 4000 }).warnings.join()).toMatch(
      /lớn hơn 3000×3000/,
    );
  });

  it("gộp nhiều cảnh báo cùng lúc", () => {
    const r = checkCover({ codec: "webp", width: 500, height: 300, sizeBytes: 1000 });
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBe(3); // định dạng + không vuông + quá nhỏ
  });
});
