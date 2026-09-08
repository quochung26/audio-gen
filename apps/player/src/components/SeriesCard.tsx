import Link from "next/link";
import { Cover } from "./Cover";
import { dict, localeHref, type Locale } from "@/lib/i18n";

export interface SeriesCardData {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  genre: string;
  status: string;
  coverUrl: string | null;
  episodeCount: number;
}

export function SeriesCard({ s, locale }: { s: SeriesCardData; locale: Locale }) {
  const t = dict(locale);
  return (
    <Link
      href={localeHref(locale, `/story/${s.slug}`)}
      className="flex gap-3 rounded-xl bg-surface p-3 transition hover:bg-raised active:bg-raised"
    >
      <Cover src={s.coverUrl} size={72} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{s.title}</div>
        <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-400">
          {s.description}
        </div>
        <div className="mt-1.5 text-xs text-neutral-600">
          {t.episodeCount(s.episodeCount)} · {s.genre}
          {s.status === "ONGOING" ? t.ongoingSuffix : ""}
        </div>
      </div>
    </Link>
  );
}
