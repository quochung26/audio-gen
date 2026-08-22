import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { Layout } from "./Layout";

function mount(at = "/") {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Layout>
        <p>nội dung trang</p>
      </Layout>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("Layout", () => {
  it("có đủ các mục việc hằng ngày", () => {
    mount();
    for (const label of ["Truyện", "Thư viện nhạc", "Thống kê", "Bình luận"]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }
  });

  it("Model và Prompt nằm TRONG nhóm Cài đặt, không nằm ở menu chính", () => {
    const { container } = mount();
    const navs = container.querySelectorAll("nav");
    const settings = [...navs].find((n) => n.textContent?.includes("Cài đặt")) as HTMLElement;
    const main = [...navs].find((n) => !n.textContent?.includes("Cài đặt")) as HTMLElement;
    expect(settings).toBeTruthy();

    for (const name of [/Model/, /^Prompt$/]) {
      expect(within(settings).getByRole("link", { name })).toBeTruthy();
      // Menu chính không được còn — đây chính là thứ vừa chuyển đi.
      expect(within(main).queryByRole("link", { name })).toBeNull();
    }
  });

  it("giữ nguyên đường dẫn cũ, không làm hỏng link đã lưu", () => {
    mount();
    expect(screen.getByRole("link", { name: /Model/ }).getAttribute("href")).toBe("/model");
    expect(screen.getByRole("link", { name: /^Prompt$/ }).getAttribute("href")).toBe("/prompts");
  });

  it("đánh dấu mục đang mở", () => {
    mount("/model");
    const link = screen.getByRole("link", { name: /Model/ });
    expect(link.className).toContain("bg-neutral-800");
    expect(screen.getByRole("link", { name: "Truyện" }).className).not.toContain("bg-neutral-800");
  });

  it("cột menu nằm BÊN TRÁI nội dung", () => {
    // Thứ tự trong DOM quyết định bên nào trước ở flex-row; đảo lại là menu
    // nhảy sang phải mà không có lỗi nào báo.
    const { container } = mount();
    const shell = container.querySelector("div.flex")!;
    const kids = [...shell.children];
    expect(kids[0]?.tagName).toBe("ASIDE");
    expect(kids[1]?.tagName).toBe("MAIN");
    // Đường kẻ ngăn cách nằm ở mép PHẢI của cột, tức cột ở bên trái.
    expect(kids[0]?.classList.contains("md:border-r")).toBe(true);
    // So khớp cả TOKEN chứ không phải chuỗi con: "md:flex-row" là chuỗi con của
    // "md:flex-row-reverse", nên toContain sẽ xanh trong khi cột đã nhảy sang
    // phải.
    expect(shell.classList.contains("md:flex-row")).toBe(true);
    expect(shell.classList.contains("md:flex-row-reverse")).toBe(false);
  });

  it("giữ nút Truyện mới và hiện nội dung trang", () => {
    const { container } = mount();
    expect(screen.getByRole("link", { name: "Truyện mới" })).toBeTruthy();
    expect(container.textContent).toContain("nội dung trang");
  });
});
