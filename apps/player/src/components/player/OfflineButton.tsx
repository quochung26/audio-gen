"use client";

import { useOffline } from "./useOffline";

const MB = 1024 * 1024;

export function OfflineButton({ src, sizeBytes }: { src: string; sizeBytes: number | null }) {
  const off = useOffline(src);
  if (off.state === "no-support" || off.state === "unknown") return null;

  const size = sizeBytes ? ` (${(sizeBytes / MB).toFixed(0)} MB)` : "";

  if (off.state === "ready") {
    return (
      <div className="flex items-center gap-3 text-xs">
        <span className="text-emerald-400">Đã tải về — nghe được khi mất mạng</span>
        <button onClick={off.remove} className="text-neutral-500 underline">
          xoá khỏi máy
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={off.download}
        disabled={off.state === "downloading"}
        className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 disabled:opacity-50"
      >
        {off.state === "downloading" ? "Đang tải…" : `Tải về nghe offline${size}`}
      </button>
      {off.state === "failed" && (
        <p className="text-xs text-red-300">Tải không xong: {off.error}</p>
      )}
    </div>
  );
}
