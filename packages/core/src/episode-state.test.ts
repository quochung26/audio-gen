import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, TransitionError } from "./episode-state";

const reviewed = { humanReviewed: true };
const unreviewed = { humanReviewed: false };

describe("chốt chặn: bản thảo phải được duyệt", () => {
  it("chặn DRAFTED → SCRIPTED khi chưa duyệt", () => {
    expect(() => assertTransition("DRAFTED", "SCRIPTED", unreviewed)).toThrow(TransitionError);
  });

  it("cho qua khi đã duyệt", () => {
    expect(() => assertTransition("DRAFTED", "SCRIPTED", reviewed)).not.toThrow();
  });

  it("chỉ chặn đúng bước DRAFTED → SCRIPTED, không chặn bước khác", () => {
    // Quay lại sửa bản thảo thì không cần duyệt — nếu chặn ở đây thì người viết
    // bị kẹt: muốn sửa phải duyệt, mà duyệt xong mới thấy cần sửa.
    expect(() => assertTransition("DRAFTED", "DRAFTING", unreviewed)).not.toThrow();
  });
});

describe("chốt chặn: giấy phép asset", () => {
  it("chặn xuất bản khi còn asset UNKNOWN", () => {
    expect(() =>
      assertTransition("READY", "PUBLISHED", { ...reviewed, assetLicenses: ["CC0", "UNKNOWN"] }),
    ).toThrow(/chưa xác minh giấy phép/);
  });

  it("báo đúng số asset còn thiếu giấy phép", () => {
    const r = canTransition("READY", "PUBLISHED", {
      ...reviewed,
      assetLicenses: ["UNKNOWN", "CC0", "UNKNOWN"],
    });
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.reason).toContain("2");
  });

  it("cho qua khi mọi asset đã rõ giấy phép", () => {
    expect(() =>
      assertTransition("READY", "PUBLISHED", {
        ...reviewed,
        assetLicenses: ["CC0", "PURCHASED", "SELF_MADE"],
      }),
    ).not.toThrow();
  });

  it("cho qua khi tập không dùng asset nào", () => {
    expect(() => assertTransition("READY", "PUBLISHED", reviewed)).not.toThrow();
    expect(() =>
      assertTransition("READY", "PUBLISHED", { ...reviewed, assetLicenses: [] }),
    ).not.toThrow();
  });
});

describe("bước chuyển hợp lệ", () => {
  it("không cho nhảy cóc từ IDEA thẳng sang PUBLISHED", () => {
    expect(() => assertTransition("IDEA", "PUBLISHED", reviewed)).toThrow(/Không thể chuyển/);
  });

  it("gỡ xuất bản được: PUBLISHED → READY", () => {
    expect(() => assertTransition("PUBLISHED", "READY", reviewed)).not.toThrow();
  });

  it("PUBLISHED không đi thẳng sang trạng thái nào khác ngoài READY", () => {
    for (const to of ["RENDERING", "FAILED", "DRAFTING"] as const) {
      expect(() => assertTransition("PUBLISHED", to, reviewed)).toThrow(TransitionError);
    }
  });

  it("job hỏng rồi chạy lại được: FAILED quay về các bước trước", () => {
    for (const to of ["IDEA", "OUTLINED", "DRAFTING", "SCRIPTED", "RENDERING"] as const) {
      expect(() => assertTransition("FAILED", to, reviewed)).not.toThrow();
    }
  });

  it("bước đang chạy tự lặp được (job retry): DRAFTING → DRAFTING", () => {
    expect(() => assertTransition("DRAFTING", "DRAFTING", reviewed)).not.toThrow();
    expect(() => assertTransition("RENDERING", "RENDERING", reviewed)).not.toThrow();
  });
});

describe("canTransition", () => {
  it("trả kết quả thay vì ném lỗi", () => {
    expect(canTransition("DRAFTED", "SCRIPTED", reviewed)).toEqual({ ok: true });
    const bad = canTransition("DRAFTED", "SCRIPTED", unreviewed);
    expect(bad.ok).toBe(false);
    expect(bad.ok === false && bad.reason).toMatch(/chưa được duyệt/);
  });
});
