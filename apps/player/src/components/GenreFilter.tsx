"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * Lọc theo thể loại.
 *
 * Dùng query string chứ không phải state trong React: lọc xong gửi link cho
 * người khác thì họ mở ra thấy đúng thứ mình đang xem, và nút Back của trình
 * duyệt hoạt động như người ta mong đợi.
 */
export function GenreFilter({ genres }: { genres: string[] }) {
  const current = useSearchParams().get("the-loai");
  if (genres.length < 2) return null;

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <Chip href="/" label="Tất cả" active={!current} />
      {genres.map((g) => (
        <Chip key={g} href={`/?the-loai=${encodeURIComponent(g)}`} label={g} active={current === g} />
      ))}
    </div>
  );
}

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs whitespace-nowrap ${
        active ? "bg-neutral-100 text-neutral-900" : "bg-neutral-900 text-neutral-400"
      }`}
    >
      {label}
    </Link>
  );
}
