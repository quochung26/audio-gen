import { describe, expect, it } from "vitest";
import { allows, assertNotifyEvents, NOTIFY_KINDS } from "./notify";

describe("allows", () => {
  it("lets everything through when nothing is named", () => {
    for (const kind of NOTIFY_KINDS) expect(allows("", kind)).toBe(true);
  });

  it("lets only the named events through", () => {
    expect(allows("run_failed", "run_failed")).toBe(true);
    expect(allows("run_failed", "run_done")).toBe(false);
  });

  it("ignores the spacing people actually type", () => {
    expect(allows(" run_done , run_failed ", "run_done")).toBe(true);
    expect(allows("run_done,,", "run_done")).toBe(true);
  });
});

describe("assertNotifyEvents", () => {
  it("accepts blank and every known name", () => {
    expect(() => assertNotifyEvents("")).not.toThrow();
    expect(() => assertNotifyEvents(NOTIFY_KINDS.join(","))).not.toThrow();
  });

  // Silently filtering everything out looks exactly like a dead endpoint.
  it("rejects a typo rather than quietly matching nothing", () => {
    expect(() => assertNotifyEvents("run_faild")).toThrow(/"run_faild"/);
    expect(() => assertNotifyEvents("run_faild")).toThrow(/Known events/);
  });
});
