import { useState } from "react";

/**
 * Pick sub-genres by clicking, from the catalogue on the Genres page.
 *
 * Sends one comma-separated `tags` string — exactly what the API already
 * accepts, so nothing changes on the backend.
 */
export function TagPicker({ genres, initial = [] }: { genres: string[]; initial?: string[] }) {
  const [picked, setPicked] = useState<string[]>(initial);

  // A genre this story carries that the catalogue does not have — typed by hand
  // earlier, or just hidden — must still show and stay ticked. Drop them and a
  // single Save wipes them, with nothing to say so.
  const choices = [...new Set([...initial, ...genres])];

  return (
    <div>
      <input type="hidden" name="tags" value={picked.join(", ")} />
      {choices.length === 0 ? (
        <p className="text-xs text-amber-500">
          The genre catalogue is empty — add one on the Genres page.
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
