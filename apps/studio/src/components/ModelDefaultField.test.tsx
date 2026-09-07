import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ModelDefaultField } from "./ModelDefaultField";

const CHOICES = [
  { value: "qwen3:14b", label: "qwen3:14b · 14B · Q4_K_M" },
  { value: "qwen3:8b", label: "qwen3:8b · 8B · Q4_K_M" },
];

afterEach(cleanup);

describe("ModelDefaultField", () => {
  it("lists pulled models in a SELECT, not a text box", () => {
    // It used to be a text box with a datalist — the list only appeared once you
    // clicked in and typed, so the page looked as if it offered no choice.
    const { container } = render(
      <ModelDefaultField choices={CHOICES} value="qwen3:14b" auto />,
    );
    const select = container.querySelector<HTMLSelectElement>('select[name="model"]');
    expect(select).toBeTruthy();
    expect([...select!.options].map((o) => o.value)).toEqual(["", "qwen3:14b", "qwen3:8b"]);
  });

  it("with nothing set by hand, the select sits on 'let it choose'", () => {
    const { container } = render(<ModelDefaultField choices={CHOICES} value="qwen3:14b" auto />);
    expect(container.querySelector<HTMLSelectElement>("select")!.value).toBe("");
  });

  it("says WHICH model 'automatic' currently means", () => {
    // Without it the user has no idea what they are letting it choose.
    const { container } = render(<ModelDefaultField choices={CHOICES} value="qwen3:8b" auto />);
    expect(container.textContent).toContain("automatic: qwen3:8b");
  });

  it("with no models, does not pretend anything is selected", () => {
    const { container } = render(<ModelDefaultField choices={CHOICES} value="" auto />);
    expect(container.textContent).toContain("let it choose");
    expect(container.textContent).not.toContain("automatic:");
  });

  it("with a value set by hand, the select sits on it", () => {
    const { container } = render(
      <ModelDefaultField choices={CHOICES} value="qwen3:8b" auto={false} />,
    );
    expect(container.querySelector<HTMLSelectElement>("select")!.value).toBe("qwen3:8b");
  });

  it("a configured model that is NOT pulled still appears in the list", () => {
    // Without it, opening the page moves the select elsewhere and the first Save
    // overwrites the old choice, with nobody having touched it.
    const { container } = render(
      <ModelDefaultField choices={CHOICES} value="qwen3:32b" auto={false} />,
    );
    const select = container.querySelector<HTMLSelectElement>("select")!;
    expect(select.value).toBe("qwen3:32b");
    expect(container.textContent).toContain("qwen3:32b (not pulled)");
  });

  it("lets you type another name — set a model before pulling it", () => {
    const { container } = render(<ModelDefaultField choices={CHOICES} value="" auto />);
    fireEvent.click(screen.getByRole("button", { name: /type a different name/ }));
    expect(container.querySelector('input[name="model"]')).toBeTruthy();
    expect(container.querySelector("select")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /pick from the list/ }));
    expect(container.querySelector("select")).toBeTruthy();
  });

  it("with nothing listable, falls back to a text box and gives the REASON", () => {
    // Falling back silently just looks like "no model picker".
    const { container } = render(
      <ModelDefaultField choices={[]} value="" auto emptyReason="Ollama is not running." />,
    );
    expect(container.querySelector('input[name="model"]')).toBeTruthy();
    expect(container.querySelector("select")).toBeNull();
    expect(container.textContent).toContain("Ollama is not running.");
  });
});
