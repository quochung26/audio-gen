import { useRef, useState } from "react";
import { ActionButton } from "@/components/Form";

/**
 * Select a passage of the scene and say what is wrong with it.
 *
 * The middle ground between the two things that existed: "rewrite" discards 900 words
 * to fix one paragraph and rolls the dice on the rest, and the edit box keeps them but
 * means writing the paragraph yourself.
 *
 * The prose is rendered HERE rather than beside this, so the selection and the form
 * cannot disagree about which text is on screen.
 */
export function PassageReviser({
  path,
  text,
  actions,
  children,
}: {
  /** POST target — `/api/episodes/:id/scenes/:sceneId/revise`. */
  path: string;
  /** The scene as stored. The selection is measured against exactly this string. */
  text: string;
  /**
   * Put beside the hint below the prose — anything that acts on the whole scene rather
   * than on a selection. A slot rather than a second row, because two footers under one
   * block of prose is one more line to read past on a page of six scenes.
   */
  actions?: React.ReactNode;
  /** The rendered prose, so the reader's view is unchanged when nothing is selected. */
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<{ passage: string; at: number } | null>(null);
  const [note, setNote] = useState("");

  /**
   * What the reader highlighted, and where it starts in `text`.
   *
   * The offset comes from the RENDERED string rather than DOM ranges: the prose is one
   * text node inside a `whitespace-pre-wrap` div, so its content is the stored text
   * character for character, and `indexOf` from the range's start beats walking nodes.
   * It is only a hint anyway — the job matches on the text and uses the offset to tell
   * two identical passages apart.
   */
  function onSelect() {
    const sel = window.getSelection();
    const passage = sel?.toString() ?? "";
    // One word is not a passage, and an accidental click-drag should not open a form.
    if (!sel || passage.trim().length < 15 || !box.current?.contains(sel.anchorNode)) return;

    const before = sel.anchorNode?.textContent?.slice(0, sel.anchorOffset) ?? "";
    const at = text.indexOf(passage, Math.max(0, text.indexOf(before.slice(-40))));
    setPicked({ passage, at: at >= 0 ? at : text.indexOf(passage) });
  }

  return (
    <div>
      <div ref={box} onMouseUp={onSelect}>
        {children}
      </div>

      {picked ? (
        <div className="mx-4 mb-3 rounded border border-blue-900/60 bg-blue-950/20 p-3">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-xs text-blue-200">
              {picked.passage.trim().split(/\s+/).length} words selected
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="text-xs text-neutral-500 underline hover:text-neutral-300"
            >
              cancel
            </button>
          </div>

          <p className="mb-2 max-h-20 overflow-auto rounded bg-neutral-900/60 p-2 text-xs leading-relaxed text-neutral-400 italic">
            {picked.passage}
          </p>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Slower here — let the silence last. Or: she would not say this out loud."
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm outline-none focus:border-neutral-500"
          />
          <p className="mt-1 text-xs text-neutral-600">
            Only this passage changes; everything around it is left exactly as it is.
          </p>

          <div className="mt-2">
            <ActionButton
              path={path}
              body={{ passage: picked.passage, at: String(picked.at), note }}
              variant="primary"
              onDone={() => {
                setPicked(null);
                setNote("");
              }}
            >
              Rewrite this passage
            </ActionButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
          {actions}
          <p className="flex-1 text-xs text-neutral-700">
            Select any part of the text above to have just that part rewritten.
          </p>
        </div>
      )}
    </div>
  );
}
