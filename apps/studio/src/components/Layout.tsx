import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";

const NAV = [
  ["/series", "Truyện"],
  ["/prompts", "Prompt"],
  ["/tracks", "Thư viện nhạc"],
  ["/thong-ke", "Thống kê"],
  ["/binh-luan", "Bình luận"],
  ["/model", "Model"],
] as const;

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-neutral-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="font-semibold">
              Audio Truyện · Studio
            </Link>
            {NAV.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `text-sm ${isActive ? "text-neutral-100" : "text-neutral-400 hover:text-neutral-100"}`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
          <Link
            to="/series/new"
            className="rounded bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white"
          >
            Truyện mới
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </>
  );
}
