import { describe, expect, it } from "vitest";
import {
  isValidModelTag,
  newPullProgress,
  reducePull,
  takeLines,
  type PullChunk,
} from "./ollama";

describe("takeLines", () => {
  it("tách các dòng hoàn chỉnh", () => {
    const r = takeLines('{"status":"a"}\n{"status":"b"}\n');
    expect(r.chunks).toEqual([{ status: "a" }, { status: "b" }]);
    expect(r.rest).toBe("");
  });

  it("GIỮ dòng dở làm phần dư", () => {
    // Khối dữ liệu từ mạng cắt ngang giữa JSON là chuyện thường; parse ngay là lỗi.
    const r = takeLines('{"status":"a"}\n{"sta');
    expect(r.chunks).toEqual([{ status: "a" }]);
    expect(r.rest).toBe('{"sta');
  });

  it("nối được phần dư với khối sau", () => {
    const first = takeLines('{"status":"a"}\n{"sta');
    const second = takeLines(first.rest + 'tus":"b"}\n');
    expect(second.chunks).toEqual([{ status: "b" }]);
  });

  it("bỏ qua dòng hỏng, không làm chết cả lượt tải", () => {
    const r = takeLines('{"status":"a"}\nrác rưởi\n{"status":"b"}\n');
    expect(r.chunks).toEqual([{ status: "a" }, { status: "b" }]);
  });

  it("bỏ qua dòng trống", () => {
    expect(takeLines('\n\n{"status":"a"}\n\n').chunks).toEqual([{ status: "a" }]);
  });
});

describe("reducePull", () => {
  const start = () => ({ p: newPullProgress("qwen3:14b"), layers: new Map<string, { completed: number; total: number }>() });

  it("cộng tiến độ theo TỪNG LỚP, không nhảy lùi khi sang lớp mới", () => {
    // Ollama đếm `completed` lại từ 0 cho mỗi lớp. Cộng dồn thẳng là thanh tiến
    // độ tụt xuống mỗi lần sang lớp mới — nhìn như đang tải hỏng.
    const { p, layers } = start();
    let s = reducePull(p, { status: "downloading", digest: "L1", total: 100, completed: 100 }, layers);
    expect(s.completedBytes).toBe(100);

    s = reducePull(s, { status: "downloading", digest: "L2", total: 200, completed: 10 }, layers);
    expect(s.completedBytes).toBe(110); // KHÔNG phải 10
    expect(s.totalBytes).toBe(300);
  });

  it("cập nhật lại cùng một lớp thì ĐÈ, không cộng thêm", () => {
    const { p, layers } = start();
    let s = reducePull(p, { digest: "L1", total: 100, completed: 30 }, layers);
    s = reducePull(s, { digest: "L1", total: 100, completed: 60 }, layers);
    expect(s.completedBytes).toBe(60);
    expect(s.totalBytes).toBe(100);
  });

  it('dòng "success" đánh dấu xong', () => {
    const { p, layers } = start();
    const s = reducePull(p, { status: "success" }, layers);
    expect(s.done).toBe(true);
    expect(s.finishedAt).not.toBeNull();
  });

  it("lỗi thì dừng và giữ nguyên văn thông báo", () => {
    const { p, layers } = start();
    const s = reducePull(p, { error: "model not found" }, layers);
    expect(s).toMatchObject({ done: true, error: "model not found" });
  });

  it("dòng không có digest chỉ đổi trạng thái, không đụng số byte", () => {
    const { p, layers } = start();
    let s = reducePull(p, { digest: "L1", total: 100, completed: 50 }, layers);
    s = reducePull(s, { status: "verifying sha256 digest" }, layers);
    expect(s.status).toBe("verifying sha256 digest");
    expect(s.completedBytes).toBe(50);
  });

  it("chuỗi tiến độ thật chạy từ 0 tới xong", () => {
    const { p, layers } = start();
    const stream: PullChunk[] = [
      { status: "pulling manifest" },
      { status: "downloading", digest: "sha256:a", total: 1000, completed: 0 },
      { status: "downloading", digest: "sha256:a", total: 1000, completed: 1000 },
      { status: "downloading", digest: "sha256:b", total: 500, completed: 500 },
      { status: "verifying sha256 digest" },
      { status: "success" },
    ];
    let s = p;
    for (const c of stream) s = reducePull(s, c, layers);
    expect(s.completedBytes).toBe(1500);
    expect(s.totalBytes).toBe(1500);
    expect(s.done).toBe(true);
    expect(s.error).toBeNull();
  });
});

describe("isValidModelTag", () => {
  it.each(["qwen3", "qwen3:14b", "qwen3:14b-q4_K_M", "library/qwen3:8b", "bge-m3:latest"])(
    "nhận %s",
    (tag) => expect(isValidModelTag(tag)).toBe(true),
  );

  it.each([
    ["rỗng", ""],
    ["có khoảng trắng", "qwen3 14b"],
    ["thoát thư mục", "../../etc/passwd"],
    ["chèn lệnh", "qwen3;rm -rf /"],
    ["bắt đầu bằng dấu", "-qwen3"],
    ["quá dài", "a".repeat(129)],
  ])("từ chối %s", (_name, tag) => expect(isValidModelTag(tag)).toBe(false));
});
