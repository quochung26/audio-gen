"use client";

import { useLocale } from "@/components/LocaleProvider";

/** A broken player page still has to say something rather than showing a blank screen. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLocale();
  return (
    <div className="space-y-3 rounded border border-red-900 bg-red-950/30 p-6 text-center">
      <p className="text-sm text-neutral-300">{t.loadFailed}</p>
      {error.digest && <p className="text-xs text-neutral-600">{t.logReference(error.digest)}</p>}
      <button onClick={reset} className="rounded border border-neutral-700 px-3 py-1.5 text-sm">
        {t.tryAgain}
      </button>
    </div>
  );
}
