import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded border border-dashed border-neutral-800 p-8 text-center">
      <p className="text-sm text-neutral-400">Không có truyện này, hoặc chưa tập nào được xuất bản.</p>
      <Link href="/" className="mt-2 inline-block text-xs text-neutral-500 underline">
        về trang chủ
      </Link>
    </div>
  );
}
