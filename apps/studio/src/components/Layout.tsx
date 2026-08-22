import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";

/** Việc hằng ngày: nội dung của bạn. */
const NAV = [
  ["/series", "Truyện"],
  ["/tracks", "Thư viện nhạc"],
  ["/thong-ke", "Thống kê"],
  ["/binh-luan", "Bình luận"],
] as const;

/**
 * Cấu hình máy chạy thế nào — đặt riêng ở cuối cột.
 *
 * Nhóm chứ không phải menu xổ xuống: xổ ra để lộ vài mục thì thêm một cú bấm mà
 * chẳng giấu được gì.
 *
 * Prompt nằm đây chứ không nằm ở menu chính vì nó là cách MÁY viết, không phải
 * nội dung của bạn — cùng loại với việc chọn model.
 */
const SETTINGS_NAV = [
  ["/prompts", "Prompt"],
  ["/model", "Model & ngôn ngữ"],
] as const;

function itemClass({ isActive }: { isActive: boolean }): string {
  return `block rounded px-3 py-1.5 text-sm transition ${
    isActive ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
  }`;
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    // Màn hẹp thì xếp dọc để cột không ăn mất nửa chiều ngang; từ md trở lên
    // mới thành hai cột.
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="shrink-0 border-b border-neutral-800 px-4 py-5 md:sticky md:top-0 md:h-screen md:w-56 md:border-b-0 md:border-r">
        <div className="flex h-full flex-col gap-6">
          <Link to="/" className="px-3 text-sm font-semibold leading-tight">
            Audio Truyện
            <span className="block text-xs font-normal text-neutral-500">Studio</span>
          </Link>

          <Link
            to="/series/new"
            className="rounded bg-neutral-100 px-3 py-1.5 text-center text-sm font-medium text-neutral-900 hover:bg-white"
          >
            Truyện mới
          </Link>

          <nav className="flex flex-wrap gap-1 md:flex-col">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} className={itemClass}>
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Đẩy xuống đáy cột khi còn chỗ — cấu hình không phải việc hằng ngày. */}
          <nav className="flex flex-wrap gap-1 md:mt-auto md:flex-col">
            <span className="px-3 pb-1 text-xs uppercase tracking-wide text-neutral-600">
              Cài đặt
            </span>
            {SETTINGS_NAV.map(([to, label]) => (
              <NavLink key={to} to={to} className={itemClass}>
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
