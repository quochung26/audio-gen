import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ModelDefaultField } from "./ModelDefaultField";

const CHOICES = [
  { value: "qwen3:14b", label: "qwen3:14b · 14B · Q4_K_M" },
  { value: "qwen3:8b", label: "qwen3:8b · 8B · Q4_K_M" },
];

afterEach(cleanup);

describe("ModelDefaultField", () => {
  it("liệt kê model đã tải trong một ô CHỌN, không bắt gõ tay", () => {
    // Trước đây là ô gõ tay kèm datalist — danh sách chỉ hiện khi bấm vào rồi
    // gõ, nên nhìn vào trang thì tưởng không có chỗ chọn.
    const { container } = render(
      <ModelDefaultField choices={CHOICES} value="qwen3:14b" auto envValue="qwen3:14b" />,
    );
    const select = container.querySelector<HTMLSelectElement>('select[name="model"]');
    expect(select).toBeTruthy();
    expect([...select!.options].map((o) => o.value)).toEqual(["", "qwen3:14b", "qwen3:8b"]);
  });

  it("nói rõ bỏ trống thì rơi về giá trị nào trong .env", () => {
    const { container } = render(
      <ModelDefaultField choices={CHOICES} value="qwen3:32b" auto={false} envValue="qwen3:14b" />,
    );
    expect(container.textContent).toContain("theo .env: qwen3:14b");
  });

  it("chưa đặt tay thì ô chọn đứng ở '— theo .env —'", () => {
    const { container } = render(
      <ModelDefaultField choices={CHOICES} value="qwen3:14b" auto envValue="qwen3:14b" />,
    );
    expect(container.querySelector<HTMLSelectElement>("select")!.value).toBe("");
  });

  it("model đang đặt mà CHƯA tải vẫn hiện trong danh sách", () => {
    // Không hiện thì mở trang lên ô chọn nhảy sang giá trị khác, bấm Lưu là ghi
    // đè mất lựa chọn cũ mà không ai bấm gì vào nó.
    const { container } = render(
      <ModelDefaultField choices={CHOICES} value="qwen3:32b" auto={false} envValue="qwen3:14b" />,
    );
    const select = container.querySelector<HTMLSelectElement>("select")!;
    expect(select.value).toBe("qwen3:32b");
    expect(container.textContent).toContain("qwen3:32b (chưa tải)");
  });

  it("gõ tên khác được — đặt sẵn model chưa kéo về", () => {
    const { container } = render(
      <ModelDefaultField choices={CHOICES} value="" auto envValue="qwen3:14b" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /gõ tên khác/ }));
    expect(container.querySelector('input[name="model"]')).toBeTruthy();
    expect(container.querySelector("select")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /chọn từ danh sách/ }));
    expect(container.querySelector("select")).toBeTruthy();
  });

  it("không liệt kê được thì về thẳng ô gõ tay, không hiện ô chọn rỗng", () => {
    // Ollama chưa chạy, hoặc chưa tải model nào.
    const { container } = render(
      <ModelDefaultField choices={[]} value="qwen3:14b" auto envValue="qwen3:14b" />,
    );
    expect(container.querySelector('input[name="model"]')).toBeTruthy();
    expect(container.querySelector("select")).toBeNull();
    expect(screen.queryByRole("button", { name: /chọn từ danh sách/ })).toBeNull();
  });
});
