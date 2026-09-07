import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { Layout } from "./Layout";

function mount(at = "/") {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Layout>
        <p>page content</p>
      </Layout>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("Layout", () => {
  it("has every day-to-day item", () => {
    mount();
    for (const label of ["Stories", "Music library", "Stats", "Comments"]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }
  });

  it("keeps Models and Prompts INSIDE Settings, out of the main nav", () => {
    const { container } = mount();
    const navs = container.querySelectorAll("nav");
    const settings = [...navs].find((n) => n.textContent?.includes("Settings")) as HTMLElement;
    const main = [...navs].find((n) => !n.textContent?.includes("Settings")) as HTMLElement;
    expect(settings).toBeTruthy();

    for (const name of [/Model/, /^Prompt$/]) {
      expect(within(settings).getByRole("link", { name })).toBeTruthy();
      // The main nav must not still have it — that is exactly what moved.
      expect(within(main).queryByRole("link", { name })).toBeNull();
    }
  });

  it("keeps the same paths, so saved links still work", () => {
    mount();
    expect(screen.getByRole("link", { name: /Model/ }).getAttribute("href")).toBe("/model");
    expect(screen.getByRole("link", { name: /^Prompt$/ }).getAttribute("href")).toBe("/prompts");
  });

  it("marks the active item", () => {
    mount("/model");
    const link = screen.getByRole("link", { name: /Model/ });
    expect(link.className).toContain("bg-neutral-800");
    expect(screen.getByRole("link", { name: "Stories" }).className).not.toContain("bg-neutral-800");
  });

  it("puts the nav column LEFT of the content", () => {
    // DOM order decides which side comes first in flex-row; swap them and the nav
    // jumps to the right with nothing reporting it.
    const { container } = mount();
    const shell = container.querySelector("div.flex")!;
    const kids = [...shell.children];
    expect(kids[0]?.tagName).toBe("ASIDE");
    expect(kids[1]?.tagName).toBe("MAIN");
    // The divider sits on the column's RIGHT edge, i.e. the column is on the left.
    expect(kids[0]?.classList.contains("md:border-r")).toBe(true);
    // Match the whole TOKEN, not a substring: "md:flex-row" is a substring of
    // "md:flex-row-reverse", so toContain stays green while the column has
    // jumped to the right.
    expect(shell.classList.contains("md:flex-row")).toBe(true);
    expect(shell.classList.contains("md:flex-row-reverse")).toBe(false);
  });

  it("keeps the New story button and renders the page content", () => {
    const { container } = mount();
    expect(screen.getByRole("link", { name: "New story" })).toBeTruthy();
    expect(container.textContent).toContain("page content");
  });
});
