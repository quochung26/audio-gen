import { Link } from "react-router";

export function NotFound() {
  return (
    <div className="rounded border border-dashed border-neutral-800 p-8 text-center">
      <p className="text-sm text-neutral-400">Không tìm thấy trang này.</p>
      <Link to="/series" className="mt-2 inline-block text-xs text-neutral-500 underline">
        về danh sách truyện
      </Link>
    </div>
  );
}
