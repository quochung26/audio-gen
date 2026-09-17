import { useState } from "react";

/**
 * Pick sub-genres by clicking, from the catalogue on the Genres page.
 *
 * Sends one comma-separated `tags` string — exactly what the API already
 * accepts, so nothing changes on the backend.
 */
export function TagPicker({
  genres,
  initial = [],
  exclude,
}: {
  genres: string[];
  initial?: string[];
  /** The story's main genre, which is not a sub-genre of itself. */
  exclude?: string;
}) {
  const [picked, setPicked] = useState<string[]>(initial);

  // A genre this story carries that the catalogue does not have — typed by hand
  // earlier, or just hidden — must still show and stay ticked. Drop them and a
  // single Save wipes them, with nothing to say so.
  const choices = [...new Set([...initial, ...genres])].filter(
    // The main genre is already on the story, so offering it again only ever
    // produces the same word twice — in the Bible, and in the RSS keywords.
    // It does stay on screen while it is ticked: old stories have it in `tags`,
    // and a tag that is saved but not shown is one nobody can take off again.
    (name) => name !== exclude || picked.includes(name),
  );

  return (
    <div>
      <input type="hidden" name="tags" value={picked.join(", ")} />
      {choices.length === 0 ? (
        // Two different nothings, and the wrong line sends the writer to a page
        // that already has what they need: an empty catalogue is a job to do,
        // while a catalogue holding only the main genre is not.
        <p className="text-xs text-amber-500">
          {genres.length === 0
            ? "The genre catalogue is empty — add one on the Genres page."
            : "The catalogue has nothing else to offer — every genre in it is the main one."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {choices.map((name) => {
            const on = picked.includes(name);
            return (
              <label
                key={name}
                className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                  on
                    ? "border-neutral-500 bg-neutral-800 text-neutral-100"
                    : "border-neutral-700 bg-neutral-900 text-neutral-500 hover:text-neutral-300"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={() =>
                    setPicked((p) => (on ? p.filter((x) => x !== name) : [...p, name]))
                  }
                />
                {name}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
