import { describe, expect, it } from "vitest";
import { describeConnectError } from "./connect-error";

/** Rebuild the exact error shape Node's `fetch` throws. */
function fetchError(cause: { code?: string; message?: string }): Error {
  const e = new Error("fetch failed") as Error & { cause?: unknown };
  e.cause = cause;
  return e;
}

describe("describeConnectError", () => {
  it("translates ECONNREFUSED", () => {
    expect(describeConnectError(fetchError({ code: "ECONNREFUSED" }), 5000)).toMatch(/is the service running/);
  });

  it("translates ENOTFOUND", () => {
    expect(describeConnectError(fetchError({ code: "ENOTFOUND" }), 5000)).toMatch(/resolve the host/);
  });

  it("translates ECONNRESET", () => {
    expect(describeConnectError(fetchError({ code: "ECONNRESET" }), 5000)).toMatch(/dropped mid-request/);
  });

  it("a timeout says how many seconds", () => {
    const e = new Error("timed out");
    e.name = "TimeoutError";
    expect(describeConnectError(e, 5000)).toBe("No answer within 5s");
  });

  it("an unknown code is still included", () => {
    expect(describeConnectError(fetchError({ code: "EPIPE" }), 5000)).toContain("EPIPE");
  });

  it("with no code, uses the cause's words rather than just 'fetch failed'", () => {
    // undici blocks some ports and only says "bad port" at the cause level.
    // Returning "fetch failed" leaves the user no clue what to fix.
    const msg = describeConnectError(fetchError({ message: "bad port" }), 5000);
    expect(msg).toContain("bad port");
  });

  it("with nothing to add, returns the original words", () => {
    expect(describeConnectError(new Error("broken"), 5000)).toBe("broken");
    expect(describeConnectError(fetchError({}), 5000)).toBe("fetch failed");
  });
});
