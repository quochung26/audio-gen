import Link from "next/link";
import { dict, localeHref } from "@/lib/i18n";
import { currentLocale } from "@/lib/request-locale";

/**
 * `notFound()` renders this with NO route params, so the locale comes from the header the
 * middleware set — see lib/request-locale.ts.
 */
export default async function NotFound() {
  const locale = await currentLocale();
  const t = dict(locale);
  return (
    <div className="rounded border border-dashed border-neutral-800 p-8 text-center">
      <p className="text-sm text-neutral-400">{t.notFound}</p>
      <Link href={localeHref(locale, "/")} className="mt-2 inline-block text-xs text-neutral-500 underline">
        {t.backHome}
      </Link>
    </div>
  );
}
