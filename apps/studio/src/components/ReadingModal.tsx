import { useEffect, useRef, useState } from "react";

const SIZES = [
  { id: "m", label: "A", text: "text-lg", lead: "leading-8" },
  { id: "l", label: "A", text: "text-xl", lead: "leading-9" },
  { id: "xl", label: "A", text: "text-2xl", lead: "leading-10" },
] as const;

/**
 * Read one scene full-screen, at a size meant for reading rather than for scanning.
 *
 * The episode page is a work surface: everything on it is small because a dozen scenes
 * have to fit. That is the wrong shape for actually reading a translation — especially
 * a Vietnamese one, where the diacritics sit above and below the line and 14px with
 * tight leading turns them into noise.
 *
 * A native `<dialog>`, not a div with a high z-index. Escape to close, the backdrop,
 * focus trapping and inertness behind it all come with the element; hand-rolling them
 * is how a modal ends up letting you tab into the page underneath.
 */
export function ReadingModal({
  title,
  subtitle,
  text,
}: {
  title: string;
  subtitle?: string;
  text: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [size, setSize] = useState<(typeof SIZES)[number]["id"]>("l");

  // Closed on unmount. The episode page re-renders on a 3-second poll and a scene can
  // vanish under it — a chapter deleted in another tab — and a `<dialog>` left open by
  // a removed subtree keeps the whole page inert behind a backdrop nobody can dismiss.
  useEffect(() => {
    const d = ref.current;
    return () => d?.close();
  }, []);

  const s = SIZES.find((x) => x.id === size)!;

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="rounded border border-neutral-700 px-3 py-1.5 text-sm whitespace-nowrap text-neutral-300 transition hover:border-neutral-500"
      >
        Open to read
      </button>

      <dialog
        ref={ref}
        // Clicking the backdrop closes it. The check is on the target being the dialog
        // itself: clicks inside land on a child, so selecting text does not close it.
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
        className="m-auto max-h-[88vh] w-[min(92vw,58rem)] rounded-lg border border-neutral-700 bg-neutral-950 p-0 text-neutral-100 backdrop:bg-black/70"
      >
        <div className="sticky top-0 flex flex-wrap items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-6 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-medium text-neutral-200">{title}</h2>
            {subtitle && <p className="truncate text-xs text-neutral-500">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-1">
            {SIZES.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSize(o.id)}
                className={`rounded px-2 py-1 leading-none ${
                  o.id === size
                    ? "bg-neutral-800 text-neutral-100"
                    : "text-neutral-500 hover:text-neutral-200"
                } ${o.id === "m" ? "text-xs" : o.id === "l" ? "text-sm" : "text-base"}`}
                aria-label={`Text size ${o.id}`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded border border-neutral-700 px-2.5 py-1 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-100"
          >
            Close
          </button>
        </div>

        {/* `max-w-[42rem]` is roughly 70 characters, the measure prose is comfortable at.
            Left to the dialog's own width the lines run half a screen and the eye loses
            its place between them. */}
        <div className="overflow-y-auto px-6 py-6">
          <p
            className={`mx-auto max-w-[42rem] whitespace-pre-wrap text-neutral-200 ${s.text} ${s.lead}`}
          >
            {text}
          </p>
        </div>
      </dialog>
    </>
  );
}
