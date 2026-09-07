import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Hash passwords with the scrypt built into Node.
 *
 * Why scrypt and not a library: it ships with Node, runs native so it is fast, and
 * it is a **memory-hard** key derivation function — meaning a GPU cracker does not
 * get the big advantage it gets against ordinary hashes. Adding a dependency to
 * the auth path adds one more thing to watch for vulnerabilities.
 *
 * Parameters: N=2^16, r=8, p=1. Measured on the build machine (Apple M1):
 *
 *   N=2^17  534 ms  ~128 MB      N=2^15  138 ms  ~32 MB
 *   N=2^16  273 ms   ~64 MB      N=2^14   63 ms  ~16 MB
 *
 * 2^16 because memory, not time, is the real constraint: scrypt costs ~128·N·r
 * bytes for EACH hash in flight, so at 2^17 ten simultaneous logins eat 1.3 GB —
 * that is a way to bring the server down, not merely to be slow.
 *
 * 273 ms is still expensive enough to make bulk cracking uneconomic. But resisting
 * cracking is NOT this function's job — the login layer has to rate-limit attempts.
 *
 * Stored format: `scrypt$N$r$p$<salt base64>$<hash base64>`. The parameters live in
 * the string so N can be raised later while old passwords still verify — without
 * that, changing a parameter locks everyone out at once.
 */
const N = 2 ** 16;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;
// scrypt needs ~128 * N * r bytes; leave headroom to avoid "memory limit exceeded".
const MAXMEM = 256 * N * R;

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
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
 * Verify a password. Returns false rather than throwing on any malformed input — a
 * badly shaped hash string is just "no match", not an incident to report outward.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, rawN, rawR, rawP, saltB64, hashB64] = parts;
  const n = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // Reject absurd parameters from corrupt data — an oversized N hangs the process.
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

  // Constant-time comparison: `===` would leak the length of the matching prefix,
  // which is enough to recover it byte by byte.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
