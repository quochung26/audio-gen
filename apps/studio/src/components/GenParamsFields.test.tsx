import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GenParamsFields, type GenParamSpec } from "./GenParamsFields";

const SPECS: GenParamSpec[] = [
  { key: "temperature", label: "temperature", hint: "High values wander off topic.", min: 0, max: 1.5, step: 0.05, fallback: 0.9 },
  { key: "numCtx", label: "numCtx", hint: "Context ceiling.", min: 2048, max: 131072, step: 1024, fallback: 16384 },
];

afterEach(cleanup);

describe("GenParamsFields", () => {
  it("builds an input per parameter, field name matching the key", () => {
    const { container } = render(<GenParamsFields specs={SPECS} params={{}} />);
    for (const s of SPECS) {
      expect(container.querySelector(`input[name="${s.key}"]`)).toBeTruthy();
    }
  });

  it("takes valid ranges from the API rather than inventing them", () => {
    // Copy the ranges into the UI and sooner or later it accepts what the API rejects.
    const { container } = render(<GenParamsFields specs={SPECS} params={{}} />);
    const t = container.querySelector<HTMLInputElement>('input[name="temperature"]')!;
    expect(t.min).toBe("0");
    expect(t.max).toBe("1.5");
    expect(t.step).toBe("0.05");
    expect(t.type).toBe("number");
  });

  it("an empty box hints the provider default", () => {
    // So the user knows what leaving it blank means, instead of guessing.
    const { container } = render(<GenParamsFields specs={SPECS} params={{}} />);
    const t = container.querySelector<HTMLInputElement>('input[name="temperature"]')!;
    expect(t.value).toBe("");
    expect(t.placeholder).toBe("0.9");
  });

  it("prefills the stored values", () => {
    const { container } = render(<GenParamsFields specs={SPECS} params={{ temperature: 0.95 }} />);
    expect(container.querySelector<HTMLInputElement>('input[name="temperature"]')!.value).toBe("0.95");
    // An unset parameter stays empty; the default is never written in.
    expect(container.querySelector<HTMLInputElement>('input[name="numCtx"]')!.value).toBe("");
  });

  it("says a stray key in old data never did anything", () => {
    const { container } = render(
      <GenParamsFields specs={SPECS} params={{}} unknownParams={["top_k", "seed"]} />,
    );
    expect(container.textContent).toContain("top_k, seed");
    expect(container.textContent).toMatch(/never\s+reads them/);
  });

  it("shows no warning when there are no stray keys", () => {
    const { container } = render(<GenParamsFields specs={SPECS} params={{}} />);
    expect(container.textContent).not.toMatch(/Ignoring unused keys/);
  });

  it("the compact form drops long explanations but keeps them in the tooltip", () => {
    const { container } = render(<GenParamsFields specs={SPECS} params={{}} compact />);
    expect(container.textContent).not.toContain("High values wander off topic.");
    expect(container.querySelector('input[name="temperature"]')!.getAttribute("title")).toBe(
      "High values wander off topic.",
    );
  });
});
