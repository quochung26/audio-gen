import { playableUrl } from "@/lib/audio-url";
import { BookIcon } from "./Icon";

/**
 * A story's cover art.
 *
 * With no cover it draws a box of the SAME SIZE rather than nothing — a missing image
 * collapsing the layout makes the list jump around when some stories have art and others
 * do not.
 *
 * The empty box now carries a mark instead of being a flat grey square. Half the
 * catalogue has no art while a story is being made, and a column of identical blank
 * squares reads as a broken page rather than as work in progress.
 */
export function Cover({ src, size, rounded = "md" }: { src: string | null; size: number; rounded?: "md" | "lg" }) {
  const style = { width: size, height: size };
  const radius = rounded === "lg" ? "rounded-xl" : "rounded-lg";

  if (!src) {
    return (
      <div
        style={style}
        aria-hidden
        className={`grid shrink-0 place-items-center bg-raised text-neutral-700 ring-1 ring-line ring-inset ${radius}`}
      >
        <BookIcon size={Math.max(14, Math.round(size * 0.34))} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={playableUrl(src)}
      alt=""
      style={style}
      loading="lazy"
      // The ring sits INSIDE: cover art is usually dark at the edges, and without it a
      // cover melts into the card behind it.
      className={`shrink-0 object-cover ring-1 ring-white/10 ring-inset ${radius}`}
    />
  );
}
