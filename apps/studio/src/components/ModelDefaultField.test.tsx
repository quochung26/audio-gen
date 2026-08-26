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
      <ModelDefaultField choices={CHOICES} value="qwen3:14b" auto />,
    );
    const select = container.querySelector<HTMLSelectElement>('select[name="model"]');
    expect(select).toBeTruthy();
    expect([...select!.options].map((o) => o.value)).toEqual(["", "qwen3:14b", "qwen3:8b"]);
  });

  it("chưa đặt tay thì ô chọn đứng ở mục 'để máy tự chọn'", () => {
    const { container } = render(<ModelDefaultField choices={CHOICES} value="qwen3:14b" auto />);
    expect(container.querySelector<HTMLSelectElement>("select")!.value).toBe("");
  });

  it("nói rõ 'tự chọn' đang là model NÀO", () => {
    // Không nói thì người dùng không biết mình đang để máy chọn cái gì.
    const { container } = render(<ModelDefaultField choices={CHOICES} value="qwen3:8b" auto />);
    expect(container.textContent).toContain("tự chọn: qwen3:8b");
  });

  it("chưa có model nào thì không vờ như đang chọn được gì", () => {
    const { container } = render(<ModelDefaultField choices={CHOICES} value="" auto />);
    expect(container.textContent).toContain("để máy tự chọn");
    expect(container.textContent).not.toContain("tự chọn:");
  });

  it("đặt tay thì ô chọn đứng đúng giá trị đó", () => {
    const { container } = render(
      <ModelDefaultField choices={CHOICES} value="qwen3:8b" auto={false} />,
    );
    expect(container.querySelector<HTMLSelectElement>("select")!.value).toBe("qwen3:8b");
  });

  it("model đặt tay mà CHƯA tải vẫn hiện trong danh sách", () => {
    // Không hiện thì mở trang lên ô chọn nhảy sang giá trị khác, bấm Lưu là ghi
    // đè mất lựa chọn cũ mà không ai bấm gì vào nó.
    const { container } = render(
      <ModelDefaultField choices={CHOICES} value="qwen3:32b" auto={false} />,
    );
    const select = container.querySelector<HTMLSelectElement>("select")!;
    expect(select.value).toBe("qwen3:32b");
    expect(container.textContent).toContain("qwen3:32b (chưa tải)");
  });

  it("gõ tên khác được — đặt sẵn model chưa kéo về", () => {
    const { container } = render(<ModelDefaultField choices={CHOICES} value="" auto />);
    fireEvent.click(screen.getByRole("button", { name: /gõ tên khác/ }));
    expect(container.querySelector('input[name="model"]')).toBeTruthy();
    expect(container.querySelector("select")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /chọn từ danh sách/ }));
    expect(container.querySelector("select")).toBeTruthy();
  });

  it("không liệt kê được thì về thẳng ô gõ tay, kèm LÝ DO", () => {
    // Im lặng đổi sang ô gõ tay thì nhìn vào chỉ thấy "không có chỗ chọn model".
    const { container } = render(
      <ModelDefaultField choices={[]} value="" auto emptyReason="Ollama chưa chạy." />,
    );
    expect(container.querySelector('input[name="model"]')).toBeTruthy();
    expect(container.querySelector("select")).toBeNull();
    expect(container.textContent).toContain("Ollama chưa chạy.");
  });
});
