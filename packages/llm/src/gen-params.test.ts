import { describe, expect, it } from "vitest";
import {
  GEN_PARAMS,
  knownGenParams,
  parseGenParams,
  unknownGenParamKeys,
} from "./gen-params";

describe("the declaration table", () => {
  it("every parameter has a valid range and a default inside it", () => {
    for (const p of GEN_PARAMS) {
      expect(p.min).toBeLessThan(p.max);
      expect(p.fallback).toBeGreaterThanOrEqual(p.min);
      expect(p.fallback).toBeLessThanOrEqual(p.max);
      expect(p.hint.length).toBeGreaterThan(10);
    }
  });

  it("is TASTE only — capacity is not a preference", () => {
    // numCtx and maxTokens moved to GEN_LIMITS: one is what has to fit, the other how
    // long the answer may run, and both follow from constants. As editable fields they
    // were a knob nobody should turn and a second copy of a number in code.
    expect(GEN_PARAMS.map((p) => p.key).sort()).toEqual(
      ["repeatPenalty", "temperature", "topP"].sort(),
    );
  });
});

describe("parseGenParams", () => {
  it("reads ordinary numbers", () => {
    const r = parseGenParams({ temperature: "0.85", topP: "0.9" });
    expect(r.params).toEqual({ temperature: 0.85, topP: 0.9 });
    expect(r.errors).toEqual([]);
  });

  it("a BLANK field means unset, different from setting 0", () => {
    // Blank falls back to the provider's default; temperature 0 is a real choice.
    expect(parseGenParams({ temperature: "" }).params).toEqual({});
    expect(parseGenParams({ temperature: "   " }).params).toEqual({});
    expect(parseGenParams({}).params).toEqual({});
    expect(parseGenParams({ temperature: "0" }).params).toEqual({ temperature: 0 });
  });

  it("rejects out-of-range values, naming the range", () => {
    // At temperature 3 the model babbles; unblocked, you would be hunting down the
    // cause of a ruined episode.
    const r = parseGenParams({ temperature: "3" });
    expect(r.params).toEqual({});
    expect(r.errors[0]).toMatch(/between 0 and 1.5/);
    expect(r.errors[0]).toMatch(/got 3/);
  });

  it("rejects a topP outside its range", () => {
    expect(parseGenParams({ topP: "2" }).errors).toHaveLength(1);
  });

  it("rejects non-numbers", () => {
    const r = parseGenParams({ temperature: "high" });
    expect(r.errors[0]).toMatch(/is not a number/);
    expect(r.params).toEqual({});
  });

  it("leaves decimal parameters as they are", () => {
    // The rounding branch is for whole-number knobs; every one left here is decimal.
    expect(parseGenParams({ temperature: "0.85" }).params.temperature).toBe(0.85);
    expect(parseGenParams({ repeatPenalty: "1.07" }).params.repeatPenalty).toBe(1.07);
  });

  it("one bad field does not lose the good ones", () => {
    const r = parseGenParams({ temperature: "0.8", topP: "99" });
    expect(r.params).toEqual({ temperature: 0.8 });
    expect(r.errors).toHaveLength(1);
  });

  it("accepts the boundaries", () => {
    const r = parseGenParams({ temperature: "1.5", topP: "0.1" });
    expect(r.errors).toEqual([]);
    expect(r.params).toEqual({ temperature: 1.5, topP: 0.1 });
  });
});

describe("knownGenParams", () => {
  it("keeps the keys providers read", () => {
    expect(knownGenParams({ temperature: 0.9, repeatPenalty: 1.1 })).toEqual({
      temperature: 0.9,
      repeatPenalty: 1.1,
    });
  });

  it("drops unknown keys — which have always been ignored silently", () => {
    expect(knownGenParams({ temperature: 0.9, top_k: 40, nonsense: 1 })).toEqual({
      temperature: 0.9,
    });
  });

  it("and names them so the user knows what they typed for nothing", () => {
    expect(unknownGenParamKeys({ temperature: 0.9, top_k: 40 })).toEqual(["top_k"]);
    expect(unknownGenParamKeys({ temperature: 0.9 })).toEqual([]);
  });

  it("junk data does not kill it", () => {
    expect(knownGenParams(null)).toEqual({});
    expect(knownGenParams("a string")).toEqual({});
    expect(knownGenParams({ temperature: "not a number" })).toEqual({});
    expect(unknownGenParamKeys(null)).toEqual([]);
  });
});
