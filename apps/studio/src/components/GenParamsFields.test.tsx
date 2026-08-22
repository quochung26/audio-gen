import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GenParamsFields, type GenParamSpec } from "./GenParamsFields";

const SPECS: GenParamSpec[] = [
  { key: "temperature", label: "temperature", hint: "Cao thì dễ lạc đề.", min: 0, max: 1.5, step: 0.05, fallback: 0.9 },
  { key: "numCtx", label: "numCtx", hint: "Trần ngữ cảnh.", min: 2048, max: 131072, step: 1024, fallback: 16384 },
];

afterEach(cleanup);

describe("GenParamsFields", () => {
  it("dựng ô nhập cho từng tham số, tên trường khớp khoá", () => {
    const { container } = render(<GenParamsFields specs={SPECS} params={{}} />);
    for (const s of SPECS) {
      expect(container.querySelector(`input[name="${s.key}"]`)).toBeTruthy();
    }
  });

  it("lấy khoảng hợp lệ từ API chứ không tự đặt", () => {
    // Chép lại khoảng ở giao diện là sớm muộn cho nhập thứ mà API từ chối.
    const { container } = render(<GenParamsFields specs={SPECS} params={{}} />);
    const t = container.querySelector<HTMLInputElement>('input[name="temperature"]')!;
    expect(t.min).toBe("0");
    expect(t.max).toBe("1.5");
    expect(t.step).toBe("0.05");
    expect(t.type).toBe("number");
  });

  it("ô trống gợi ý giá trị mặc định của provider", () => {
    // Để người dùng biết bỏ trống thì thành cái gì, thay vì phải đoán.
    const { container } = render(<GenParamsFields specs={SPECS} params={{}} />);
    const t = container.querySelector<HTMLInputElement>('input[name="temperature"]')!;
    expect(t.value).toBe("");
    expect(t.placeholder).toBe("0.9");
  });

  it("điền sẵn giá trị đang lưu", () => {
    const { container } = render(<GenParamsFields specs={SPECS} params={{ temperature: 0.95 }} />);
    expect(container.querySelector<HTMLInputElement>('input[name="temperature"]')!.value).toBe("0.95");
    // Tham số không đặt vẫn để trống, không tự điền mặc định vào.
    expect(container.querySelector<HTMLInputElement>('input[name="numCtx"]')!.value).toBe("");
  });

  it("nói rõ khoá lạ trong dữ liệu cũ chưa bao giờ có tác dụng", () => {
    const { container } = render(
      <GenParamsFields specs={SPECS} params={{}} unknownParams={["top_k", "seed"]} />,
    );
    expect(container.textContent).toContain("top_k, seed");
    expect(container.textContent).toMatch(/provider không đọc/);
  });

  it("không có khoá lạ thì không hiện cảnh báo", () => {
    const { container } = render(<GenParamsFields specs={SPECS} params={{}} />);
    expect(container.textContent).not.toMatch(/Bỏ qua khoá/);
  });

  it("bản gọn bỏ phần giải thích dài nhưng giữ trong tooltip", () => {
    const { container } = render(<GenParamsFields specs={SPECS} params={{}} compact />);
    expect(container.textContent).not.toContain("Cao thì dễ lạc đề.");
    expect(container.querySelector('input[name="temperature"]')!.getAttribute("title")).toBe(
      "Cao thì dễ lạc đề.",
    );
  });
});
