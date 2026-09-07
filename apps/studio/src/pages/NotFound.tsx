import { Link } from "react-router";

export function NotFound() {
  return (
    <div className="rounded border border-dashed border-neutral-800 p-8 text-center">
      <p className="text-sm text-neutral-400">Page not found.</p>
      <Link to="/series" className="mt-2 inline-block text-xs text-neutral-500 underline">
        back to stories
      </Link>
    </div>
  );
}
