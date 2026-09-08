"use client";

import { useOffline } from "./useOffline";
import { useLocale } from "../LocaleProvider";

const MB = 1024 * 1024;

export function OfflineButton({ src, sizeBytes }: { src: string; sizeBytes: number | null }) {
  const { t } = useLocale();
  const off = useOffline(src);
  if (off.state === "no-support" || off.state === "unknown") return null;

  const size = sizeBytes ? ` (${(sizeBytes / MB).toFixed(0)} MB)` : "";

  if (off.state === "ready") {
    return (
      <div className="flex items-center gap-3 text-xs">
        <span className="text-emerald-400">{t.downloaded}</span>
        <button onClick={off.remove} className="text-neutral-500 underline">
          {t.removeFromDevice}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={off.download}
        disabled={off.state === "downloading"}
        className="rounded-full bg-surface px-4 py-2.5 text-xs text-neutral-300 transition hover:bg-raised disabled:opacity-50"
      >
        {off.state === "downloading" ? t.downloading : t.downloadForOffline(size)}
      </button>
      {off.state === "failed" && (
        <p className="text-xs text-red-300">{t.downloadFailed(off.error ?? t.unknownError)}</p>
      )}
    </div>
  );
}
