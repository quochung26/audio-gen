import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Băm mật khẩu bằng scrypt có sẵn trong Node.
 *
 * Vì sao scrypt chứ không phải một thư viện: nó nằm sẵn trong Node, chạy native
 * nên nhanh, và là hàm dẫn xuất khoá **tốn bộ nhớ** — nghĩa là kẻ dò mật khẩu
 * bằng GPU không có lợi thế lớn như với hàm băm thường. Thêm một dependency vào
 * đường xác thực là thêm một chỗ phải theo dõi lỗ hổng.
 *
 * Tham số: N=2^16, r=8, p=1. Đo trên máy dựng (Apple M1):
 *
 *   N=2^17  534 ms  ~128 MB      N=2^15  138 ms  ~32 MB
 *   N=2^16  273 ms   ~64 MB      N=2^14   63 ms  ~16 MB
 *
 * Chọn 2^16 vì bộ nhớ mới là ràng buộc thật, không phải thời gian: scrypt tốn
 * ~128·N·r byte cho MỖI lần băm đang chạy, nên ở 2^17 chỉ cần 10 người đăng
 * nhập cùng lúc là ngốn 1,3 GB — đó là đường làm sập máy chủ, không chỉ là chậm.
 *
 * 273 ms vẫn đủ đắt để dò mật khẩu hàng loạt không kinh tế. Nhưng chống dò
 * KHÔNG phải việc của hàm này — phải giới hạn số lần thử ở tầng đăng nhập.
 *
 * Định dạng lưu: `scrypt$N$r$p$<salt base64>$<hash base64>`. Có tham số trong
 * chuỗi để sau này tăng N mà mật khẩu cũ vẫn kiểm được — không có thì đổi tham
 * số là mọi người mất tài khoản cùng lúc.
 */
const N = 2 ** 16;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;
// scrypt cần ~128 * N * r byte; cho dư để không bị lỗi "memory limit exceeded".
const MAXMEM = 256 * N * R;

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Mật khẩu phải từ ${MIN_PASSWORD_LENGTH} ký tự trở lên`);
  }
  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(password.normalize("NFKC"), salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/**
 * Kiểm mật khẩu. Trả false thay vì ném lỗi với mọi dạng hỏng — chuỗi băm sai
 * định dạng cũng chỉ là "không khớp", không phải sự cố cần báo ra ngoài.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, rawN, rawR, rawP, saltB64, hashB64] = parts;
  const n = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // Chặn tham số vô lý từ dữ liệu hỏng — N quá lớn làm treo tiến trình.
  if (n < 2 ** 12 || n > 2 ** 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;

  let expected: Buffer;
  let salt: Buffer;
  try {
    expected = Buffer.from(hashB64!, "base64");
    salt = Buffer.from(saltB64!, "base64");
  } catch {
    return false;
  }
  if (expected.length === 0 || salt.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: 256 * n * r,
    });
  } catch {
    return false;
  }

  // So sánh thời gian hằng định: so bằng `===` để lộ độ dài tiền tố khớp, đủ
  // để dò dần từng byte.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
