import { describe, expect, it } from "vitest";
import { describeConnectError } from "./connect-error";

/** Dựng lại đúng hình dạng lỗi mà `fetch` của Node ném ra. */
function fetchError(cause: { code?: string; message?: string }): Error {
  const e = new Error("fetch failed") as Error & { cause?: unknown };
  e.cause = cause;
  return e;
}

describe("describeConnectError", () => {
  it("dịch ECONNREFUSED", () => {
    expect(describeConnectError(fetchError({ code: "ECONNREFUSED" }), 5000)).toMatch(/đã chạy chưa/);
  });

  it("dịch ENOTFOUND", () => {
    expect(describeConnectError(fetchError({ code: "ENOTFOUND" }), 5000)).toMatch(/tên miền/);
  });

  it("dịch ECONNRESET", () => {
    expect(describeConnectError(fetchError({ code: "ECONNRESET" }), 5000)).toMatch(/ngắt giữa chừng/);
  });

  it("timeout nói rõ số giây", () => {
    const e = new Error("timed out");
    e.name = "TimeoutError";
    expect(describeConnectError(e, 5000)).toBe("Không kết nối được trong 5 giây");
  });

  it("mã lạ thì vẫn kèm mã vào", () => {
    expect(describeConnectError(fetchError({ code: "EPIPE" }), 5000)).toContain("EPIPE");
  });

  it("không có mã thì lấy lời của cause chứ KHÔNG trả về mỗi 'fetch failed'", () => {
    // undici chặn vài cổng và chỉ nói "bad port" ở tầng cause. Trả về "fetch
    // failed" thì người dùng không có manh mối nào để sửa.
    const msg = describeConnectError(fetchError({ message: "bad port" }), 5000);
    expect(msg).toContain("bad port");
  });

  it("không có gì để nói thêm thì trả về lời gốc", () => {
    expect(describeConnectError(new Error("hỏng"), 5000)).toBe("hỏng");
    expect(describeConnectError(fetchError({}), 5000)).toBe("fetch failed");
  });
});
