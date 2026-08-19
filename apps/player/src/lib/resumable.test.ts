import { describe, expect, it } from "vitest";
import {
  MAX_ITEMS,
  MIN_PROGRESS_MS,
  NEAR_END_MS,
  pickResumable,
  remaining,
  type ResumableEpisode,
} from "./resumable";

const ep = (id: string, durationMs: number | null = 1_200_000): ResumableEpisode => ({
  id,
  title: `Tập ${id}`,
  number: 1,
  durationMs,
  seriesTitle: "Đường về",
  coverUrl: null,
});

describe("pickResumable", () => {
  it("chưa nghe gì thì không hiện gì", () => {
    expect(pickResumable([ep("a"), ep("b")], {})).toEqual([]);
  });

  it("bấm vào rồi thoát ngay KHÔNG tính là đang nghe dở", () => {
    expect(pickResumable([ep("a")], { a: MIN_PROGRESS_MS - 1 })).toEqual([]);
    expect(pickResumable([ep("a")], { a: MIN_PROGRESS_MS })).toHaveLength(1);
  });

  it("nghe gần hết thì thôi hiện lại", () => {
    const d = 1_200_000;
    expect(pickResumable([ep("a", d)], { a: d - NEAR_END_MS + 1 })).toEqual([]);
    expect(pickResumable([ep("a", d)], { a: d - NEAR_END_MS - 1 })).toHaveLength(1);
  });

  it("tập chưa biết độ dài thì vẫn hiện", () => {
    // durationMs null nghĩa là chưa ghép xong; không có căn cứ nói đã nghe hết.
    expect(pickResumable([ep("a", null)], { a: 60_000 })).toHaveLength(1);
  });

  it("nghe sâu hơn thì lên trước", () => {
    const r = pickResumable([ep("a"), ep("b"), ep("c")], { a: 100_000, b: 500_000, c: 300_000 });
    expect(r.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it(`giới hạn ${MAX_ITEMS} mục`, () => {
    const eps = Array.from({ length: 20 }, (_, i) => ep(String(i)));
    const pos = Object.fromEntries(eps.map((e, i) => [e.id, 100_000 + i]));
    expect(pickResumable(eps, pos)).toHaveLength(MAX_ITEMS);
  });

  it("bỏ qua vị trí của tập không còn trong danh sách", () => {
    // Tập bị gỡ xuất bản thì localStorage vẫn giữ vị trí cũ — không được vì thế
    // mà sinh ra mục trỏ tới trang 404.
    expect(pickResumable([ep("a")], { a: 100_000, "da-go": 500_000 })).toHaveLength(1);
  });

  it("giữ nguyên dữ liệu tập, chỉ thêm positionMs", () => {
    const [r] = pickResumable([ep("a")], { a: 100_000 });
    expect(r).toMatchObject({ id: "a", title: "Tập a", seriesTitle: "Đường về", positionMs: 100_000 });
  });
});

describe("remaining", () => {
  it("làm tròn theo phút", () => {
    expect(remaining(1_200_000, 0)).toBe("20 phút");
    expect(remaining(1_200_000, 600_000)).toBe("10 phút");
  });

  it("dưới một phút thì nói bằng lời", () => {
    expect(remaining(1_200_000, 1_180_000)).toBe("dưới 1 phút");
  });

  it("không biết độ dài thì không bịa", () => {
    expect(remaining(null, 100_000)).toBe("—");
  });

  it("vị trí vượt quá độ dài cũng không ra số âm", () => {
    expect(remaining(100_000, 200_000)).toBe("dưới 1 phút");
  });
});
