import { describe, expect, it } from "vitest";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "./password";

/**
 * The auth path — get this wrong and anyone can get into anyone's account.
 *
 * The tests are slow because scrypt deliberately costs memory and time; that is
 * its strength. Each hash is ~270 ms, so the timeout has to be raised — vitest's
 * default 5 seconds is not enough for tests that hash several times.
 */

describe("hashPassword", () => {
  it("the right password verifies", async () => {
    const h = await hashPassword("mat-khau-rat-dai");
    expect(await verifyPassword("mat-khau-rat-dai", h)).toBe(true);
  }, 30_000);

  it("the wrong password does not", async () => {
    const h = await hashPassword("mat-khau-rat-dai");
    expect(await verifyPassword("mat-khau-rat-dax", h)).toBe(false);
    expect(await verifyPassword("", h)).toBe(false);
    expect(await verifyPassword("mat-khau-rat-dai ", h)).toBe(false);
  }, 30_000);

  it("the SAME password produces two DIFFERENT hashes", async () => {
    // A random salt. Without it the table shows who shares a password, and one
    // precomputed lookup table breaks the whole database.
    const a = await hashPassword("mat-khau-rat-dai");
    const b = await hashPassword("mat-khau-rat-dai");
    expect(a).not.toBe(b);
    expect(await verifyPassword("mat-khau-rat-dai", a)).toBe(true);
    expect(await verifyPassword("mat-khau-rat-dai", b)).toBe(true);
  }, 30_000);

  it("rejects a password that is too short", async () => {
    await expect(hashPassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).rejects.toThrow(/8 characters/);
    await expect(hashPassword("a".repeat(MIN_PASSWORD_LENGTH))).resolves.toBeTypeOf("string");
  }, 30_000);

  it("writes the parameters into the string so the cost can be raised later without breaking old passwords", async () => {
    const h = await hashPassword("mat-khau-rat-dai");
    expect(h.startsWith("scrypt$65536$8$1$")).toBe(true);
    expect(h.split("$")).toHaveLength(6);
  }, 30_000);

  it("an old password hashed with LOWER parameters still verifies", async () => {
    // This is why the parameters are embedded. Without them, raising N locks
    // everyone out at once.
    const { randomBytes, scryptSync } = await import("node:crypto");
    const salt = randomBytes(16);
    const n = 2 ** 14;
    const hash = scryptSync("mat-khau-cu-dai", salt, 64, { N: n, r: 8, p: 1, maxmem: 256 * n * 8 });
    const stored = `scrypt$${n}$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;

    expect(await verifyPassword("mat-khau-cu-dai", stored)).toBe(true);
    expect(await verifyPassword("sai-mat-khau-roi", stored)).toBe(false);
  }, 30_000);

  it("normalises Unicode to one form", async () => {
    // "ế" can be typed as one code point or two. Without normalisation, changing
    // keyboard means you can no longer log in.
    const composed = "cà phê sữa đá";
    const decomposed = composed.normalize("NFD");
    expect(composed).not.toBe(decomposed);
    const h = await hashPassword(composed);
    expect(await verifyPassword(decomposed, h)).toBe(true);
  }, 30_000);
});

describe("verifyPassword — corrupt data returns false rather than throwing", () => {
  it.each([
    ["empty string", ""],
    ["not scrypt", "bcrypt$2a$10$abc"],
    ["missing a part", "scrypt$131072$8$1$abc"],
    ["an extra part", "scrypt$131072$8$1$a$b$c"],
    ["a non-numeric parameter", "scrypt$abc$8$1$YWJj$YWJj"],
    ["empty hash", "scrypt$131072$8$1$YWJj$"],
    ["empty salt", "scrypt$131072$8$1$$YWJj"],
  ])("%s", async (_name, stored) => {
    await expect(verifyPassword("mat-khau-rat-dai", stored)).resolves.toBe(false);
  });

  it("rejects absurd parameters — a giant N would hang the process", async () => {
    // Corrupt or hand-edited data must not become a way to bring the server down.
    const huge = `scrypt$${2 ** 30}$8$1$YWJjZA==$YWJjZA==`;
    await expect(verifyPassword("mat-khau-rat-dai", huge)).resolves.toBe(false);
  });
});
