import { describe, expect, it } from "vitest";
import { planChapters, suggestChapterCount, suggestSceneCount } from "./scene-planner";

const ch = (title: string, n: number) => ({
  title,
  beats: Array.from({ length: n }, (_, i) => `${title} nhịp ${i + 1}`),
});

describe("planChapters", () => {
  it("giữ nguyên thứ tự chương và cảnh", () => {
    const out = planChapters([ch("Đêm đầu", 2), ch("Bến cũ", 2)]);
    expect(out.map((c) => c.order)).toEqual([1, 2]);
    expect(out[0]!.scenes.map((s) => s.order)).toEqual([1, 2]);
  });

  it("cảnh đánh số TRONG PHẠM VI chương, không chạy suốt tập", () => {
    // `(chapterId, order)` là ràng buộc duy nhất, và "cảnh 2 của chương 3" là
    // cách người viết nói. Đánh số suốt tập thì cảnh đầu chương 2 mang số 3.
    const out = planChapters([ch("A", 2), ch("B", 2)]);
    expect(out[1]!.scenes.map((s) => s.order)).toEqual([1, 2]);
  });

  it("chia số từ theo TỔNG số nhịp cả tập, không theo từng chương", () => {
    // Chương ba nhịp và chương một nhịp thì mỗi nhịp vẫn nên dài như nhau, chứ
    // không phải nhịp lẻ loi kia phải gánh cả chương.
    const out = planChapters([ch("A", 3), ch("B", 1)], 3000);
    const all = out.flatMap((c) => c.scenes.map((s) => s.targetWords));
    expect(new Set(all).size).toBe(1);
  });

  it("kẹp số từ mỗi cảnh trong khoảng model chịu được", () => {
    // Model 14B mất mạch sau ~1.500 token liên tục — trần này không phải tuỳ ý.
    const tiny = planChapters([ch("A", 1)], 100);
    const huge = planChapters([ch("A", 1)], 100000);
    expect(tiny[0]!.scenes[0]!.targetWords).toBe(600);
    expect(huge[0]!.scenes[0]!.targetWords).toBe(900);
  });

  it("bỏ chương không có nhịp nào", () => {
    // Model thỉnh thoảng trả về một chương rỗng. Tạo hàng cho nó thì trang tập
    // hiện một chương không bao giờ viết được.
    const out = planChapters([ch("A", 2), { title: "Rỗng", beats: [] }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.order).toBe(1);
  });

  it("không có chương nào thì trả về rỗng, không ném", () => {
    expect(planChapters([])).toEqual([]);
    expect(planChapters([{ title: "x", beats: [] }])).toEqual([]);
  });

  it("tên chương bỏ trống thành null chứ không phải chuỗi rỗng", () => {
    expect(planChapters([{ title: "  ", beats: ["a"] }])[0]!.title).toBeNull();
  });
});

describe("gợi ý số lượng", () => {
  it("số cảnh cả tập = số chương × số cảnh mỗi chương", () => {
    expect(suggestSceneCount()).toBe(suggestChapterCount() * 2);
  });

  it("tập ngắn tới đâu cũng còn ít nhất một chương", () => {
    expect(suggestChapterCount(10)).toBe(1);
  });
});
