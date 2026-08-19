import { describe, expect, it } from "vitest";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "./password";

/**
 * Đường xác thực — sai ở đây là ai cũng vào được tài khoản người khác.
 *
 * Test chậm vì scrypt cố tình tốn bộ nhớ và thời gian; đó là điểm mạnh của nó.
 * Mỗi lần băm ~270 ms nên phải nới timeout, mặc định 5 giây của vitest không đủ
 * cho những test băm vài lần.
 */

describe("hashPassword", () => {
  it("mật khẩu đúng thì kiểm được", async () => {
    const h = await hashPassword("mat-khau-rat-dai");
    expect(await verifyPassword("mat-khau-rat-dai", h)).toBe(true);
  }, 30_000);

  it("mật khẩu sai thì không lọt", async () => {
    const h = await hashPassword("mat-khau-rat-dai");
    expect(await verifyPassword("mat-khau-rat-dax", h)).toBe(false);
    expect(await verifyPassword("", h)).toBe(false);
    expect(await verifyPassword("mat-khau-rat-dai ", h)).toBe(false);
  }, 30_000);

  it("CÙNG mật khẩu ra hai chuỗi băm KHÁC nhau", async () => {
    // Muối ngẫu nhiên. Không có nó thì nhìn bảng là biết ai dùng chung mật khẩu,
    // và một bảng tra sẵn phá được cả cơ sở dữ liệu.
    const a = await hashPassword("mat-khau-rat-dai");
    const b = await hashPassword("mat-khau-rat-dai");
    expect(a).not.toBe(b);
    expect(await verifyPassword("mat-khau-rat-dai", a)).toBe(true);
    expect(await verifyPassword("mat-khau-rat-dai", b)).toBe(true);
  }, 30_000);

  it("từ chối mật khẩu quá ngắn", async () => {
    await expect(hashPassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).rejects.toThrow(/8 ký tự/);
    await expect(hashPassword("a".repeat(MIN_PASSWORD_LENGTH))).resolves.toBeTypeOf("string");
  }, 30_000);

  it("ghi tham số vào chuỗi để sau này tăng độ khó mà mật khẩu cũ vẫn dùng được", async () => {
    const h = await hashPassword("mat-khau-rat-dai");
    expect(h.startsWith("scrypt$65536$8$1$")).toBe(true);
    expect(h.split("$")).toHaveLength(6);
  }, 30_000);

  it("mật khẩu cũ băm với tham số THẤP hơn vẫn kiểm được", async () => {
    // Đây là lý do phải nhúng tham số. Không có thì nâng N là mọi người mất
    // tài khoản cùng lúc.
    const { randomBytes, scryptSync } = await import("node:crypto");
    const salt = randomBytes(16);
    const n = 2 ** 14;
    const hash = scryptSync("mat-khau-cu-dai", salt, 64, { N: n, r: 8, p: 1, maxmem: 256 * n * 8 });
    const stored = `scrypt$${n}$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;

    expect(await verifyPassword("mat-khau-cu-dai", stored)).toBe(true);
    expect(await verifyPassword("sai-mat-khau-roi", stored)).toBe(false);
  }, 30_000);

  it("chữ Unicode chuẩn hoá về một dạng", async () => {
    // "ế" gõ được bằng một hay hai điểm mã. Không chuẩn hoá thì đổi bàn phím
    // là không đăng nhập được nữa.
    const composed = "cà phê sữa đá";
    const decomposed = composed.normalize("NFD");
    expect(composed).not.toBe(decomposed);
    const h = await hashPassword(composed);
    expect(await verifyPassword(decomposed, h)).toBe(true);
  }, 30_000);
});

describe("verifyPassword — dữ liệu hỏng thì trả false, không ném lỗi", () => {
  it.each([
    ["chuỗi rỗng", ""],
    ["không phải scrypt", "bcrypt$2a$10$abc"],
    ["thiếu phần", "scrypt$131072$8$1$abc"],
    ["thừa phần", "scrypt$131072$8$1$a$b$c"],
    ["tham số không phải số", "scrypt$abc$8$1$YWJj$YWJj"],
    ["hash rỗng", "scrypt$131072$8$1$YWJj$"],
    ["muối rỗng", "scrypt$131072$8$1$$YWJj"],
  ])("%s", async (_name, stored) => {
    await expect(verifyPassword("mat-khau-rat-dai", stored)).resolves.toBe(false);
  });

  it("chặn tham số vô lý — N khổng lồ sẽ treo tiến trình", async () => {
    // Dữ liệu hỏng hoặc bị sửa tay không được biến thành cách làm sập máy chủ.
    const huge = `scrypt$${2 ** 30}$8$1$YWJjZA==$YWJjZA==`;
    await expect(verifyPassword("mat-khau-rat-dai", huge)).resolves.toBe(false);
  });
});
