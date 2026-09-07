import { playableUrl } from "@/lib/audio-url";

/**
 * A story's cover art.
 *
 * With no cover it draws an empty box of the SAME SIZE rather than nothing — a missing
 * image collapsing the layout makes the list jump around when some stories have art and
 * others do not.
 */
export function Cover({ src, size }: { src: string | null; size: number }) {
  const style = { width: size, height: size };

  if (!src) {
    return (
      <div
        style={style}
        aria-hidden
        className="shrink-0 rounded bg-neutral-900 ring-1 ring-neutral-800 ring-inset"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={playableUrl(src)}
      alt=""
      style={style}
      loading="lazy"
      className="shrink-0 rounded object-cover"
    />
  );
}
