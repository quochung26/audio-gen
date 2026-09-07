import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, TransitionError } from "./episode-state";

const reviewed = { humanReviewed: true };
const unreviewed = { humanReviewed: false };

describe("gate: the draft has to be approved", () => {
  it("blocks DRAFTED → SCRIPTED while unapproved", () => {
    expect(() => assertTransition("DRAFTED", "SCRIPTED", unreviewed)).toThrow(TransitionError);
  });

  it("allows it once approved", () => {
    expect(() => assertTransition("DRAFTED", "SCRIPTED", reviewed)).not.toThrow();
  });

  it("blocks only DRAFTED → SCRIPTED, not other transitions", () => {
    // Going back to edit the draft needs no approval — blocking here would trap the
    // writer: to edit you must approve, and you only see the need after approving.
    expect(() => assertTransition("DRAFTED", "DRAFTING", unreviewed)).not.toThrow();
  });
});

describe("gate: asset licences", () => {
  it("blocks publishing while an asset is UNKNOWN", () => {
    expect(() =>
      assertTransition("READY", "PUBLISHED", { ...reviewed, assetLicenses: ["CC0", "UNKNOWN"] }),
    ).toThrow(/unverified licences/);
  });

  it("reports the right number of assets missing a licence", () => {
    const r = canTransition("READY", "PUBLISHED", {
      ...reviewed,
      assetLicenses: ["UNKNOWN", "CC0", "UNKNOWN"],
    });
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.reason).toContain("2");
  });

  it("allows it once every asset's licence is clear", () => {
    expect(() =>
      assertTransition("READY", "PUBLISHED", {
        ...reviewed,
        assetLicenses: ["CC0", "PURCHASED", "SELF_MADE"],
      }),
    ).not.toThrow();
  });

  it("allows it when the episode uses no assets", () => {
    expect(() => assertTransition("READY", "PUBLISHED", reviewed)).not.toThrow();
    expect(() =>
      assertTransition("READY", "PUBLISHED", { ...reviewed, assetLicenses: [] }),
    ).not.toThrow();
  });
});

describe("valid transitions", () => {
  it("does not allow jumping from IDEA straight to PUBLISHED", () => {
    expect(() => assertTransition("IDEA", "PUBLISHED", reviewed)).toThrow(/Cannot move/);
  });

  it("unpublishing works: PUBLISHED → READY", () => {
    expect(() => assertTransition("PUBLISHED", "READY", reviewed)).not.toThrow();
  });

  it("PUBLISHED goes nowhere but READY", () => {
    for (const to of ["RENDERING", "FAILED", "DRAFTING"] as const) {
      expect(() => assertTransition("PUBLISHED", to, reviewed)).toThrow(TransitionError);
    }
  });

  it("a failed job can be rerun: FAILED goes back to earlier steps", () => {
    for (const to of ["IDEA", "OUTLINED", "DRAFTING", "SCRIPTED", "RENDERING"] as const) {
      expect(() => assertTransition("FAILED", to, reviewed)).not.toThrow();
    }
  });

  it("a running step can repeat itself (job retry): DRAFTING → DRAFTING", () => {
    expect(() => assertTransition("DRAFTING", "DRAFTING", reviewed)).not.toThrow();
    expect(() => assertTransition("RENDERING", "RENDERING", reviewed)).not.toThrow();
  });
});

describe("canTransition", () => {
  it("returns a result rather than throwing", () => {
    expect(canTransition("DRAFTED", "SCRIPTED", reviewed)).toEqual({ ok: true });
    const bad = canTransition("DRAFTED", "SCRIPTED", unreviewed);
    expect(bad.ok).toBe(false);
    expect(bad.ok === false && bad.reason).toMatch(/not approved/);
  });
});

describe("the approval gate applies at publish time too", () => {
  it("blocks READY → PUBLISHED when the draft has been unapproved", () => {
    // The real path: approve → build audio → unapprove (it needs work) → publish.
    // The DRAFTED → SCRIPTED gate cannot catch it; the episode passed that long ago.
    expect(() => assertTransition("READY", "PUBLISHED", unreviewed)).toThrow(/not approved/);
  });

  it("allows it once approved", () => {
    expect(() => assertTransition("READY", "PUBLISHED", reviewed)).not.toThrow();
  });

  it("blocks even when every asset licence is clean", () => {
    expect(() =>
      assertTransition("READY", "PUBLISHED", { ...unreviewed, assetLicenses: ["CC0"] }),
    ).toThrow(/not approved/);
  });
});
