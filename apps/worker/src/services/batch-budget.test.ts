import { describe, expect, it } from "vitest";
import { BLIND_CALL_COUNT, judgeSpend, type Spend } from "./batch-budget";

const spend = (over: Partial<Spend> = {}): Spend => ({
  usd: 0,
  priced: 0,
  unpricedStreak: 0,
  ...over,
});

describe("judgeSpend", () => {
  it("says nothing when the run has no ceiling", () => {
    const seen = judgeSpend({
      budgetUsd: null,
      spend: spend({ usd: 999, priced: 100 }),
      blindWarned: false,
    });
    expect(seen).toEqual({ stop: null, warn: null });
  });

  it("lets a run under the ceiling carry on", () => {
    const seen = judgeSpend({
      budgetUsd: 5,
      spend: spend({ usd: 4.99, priced: 40 }),
      blindWarned: false,
    });
    expect(seen.stop).toBeNull();
  });

  it("stops the run once the ceiling is reached", () => {
    const seen = judgeSpend({
      budgetUsd: 5,
      spend: spend({ usd: 5, priced: 40 }),
      blindWarned: false,
    });
    expect(seen.stop).toContain("$5.00 ceiling");
    expect(seen.stop).toContain("$5.00 spent");
  });

  describe("the blind spot", () => {
    // A ceiling nothing can reach is worse than no ceiling: it reads as protection.
    it("warns when a ceiling is set and no call reports a cost", () => {
      const seen = judgeSpend({
        budgetUsd: 5,
        spend: spend({ unpricedStreak: BLIND_CALL_COUNT }),
        blindWarned: false,
      });
      expect(seen.warn).toContain("stopped counting");
      expect(seen.stop).toBeNull();
    });

    it("waits for a few calls before deciding nothing is being counted", () => {
      const seen = judgeSpend({
        budgetUsd: 5,
        spend: spend({ unpricedStreak: BLIND_CALL_COUNT - 1 }),
        blindWarned: false,
      });
      expect(seen.warn).toBeNull();
    });

    it("says it once per run, not at every boundary", () => {
      const seen = judgeSpend({
        budgetUsd: 5,
        spend: spend({ unpricedStreak: 50 }),
        blindWarned: true,
      });
      expect(seen.warn).toBeNull();
    });

    // A free model reports 0 and is watched correctly. Silence is the defect.
    it("stays quiet when calls report a cost of zero", () => {
      const seen = judgeSpend({
        budgetUsd: 5,
        spend: spend({ usd: 0, priced: 20 }),
        blindWarned: false,
      });
      expect(seen.warn).toBeNull();
    });

    // The case a total would miss: money was counted, then the run moved onto a model
    // nobody prices. The total sits where it was and reads exactly like a cheap run.
    it("catches a run switched onto an unpriced model part-way", () => {
      const seen = judgeSpend({
        budgetUsd: 5,
        spend: spend({ usd: 1.2, priced: 12, unpricedStreak: BLIND_CALL_COUNT }),
        blindWarned: false,
      });
      expect(seen.warn).toContain("stopped counting");
      expect(seen.warn).toContain("$1.20 counted so far");
    });
  });
});
