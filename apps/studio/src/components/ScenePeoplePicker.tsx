import { useState } from "react";

/**
 * Pick who is in a scene.
 *
 * Picking nobody means **not known yet**, not "nobody": the Story Bible then
 * carries the full description of every character, which is the old behaviour.
 * Once you pick, everyone outside the list is reduced to a name and a role — so
 * context does not grow with the size of the cast.
 *
 * The default leans toward carrying too much on purpose: guessing one person
 * short only loses the filtering, whereas the other way round the model writes
 * a scene without the description of someone actually in it.
 */
export function ScenePeoplePicker({
  characters,
  initial,
}: {
  characters: Array<{ id: string; name: string; isNarrator: boolean }>;
  initial: string[];
}) {
  const [picked, setPicked] = useState<string[]>(initial);

  if (characters.length === 0) return null;

  return (
    <div>
      <input type="hidden" name="characterIds" value={picked.join(",")} />
      <span className="mb-1.5 block text-xs text-neutral-500">Who is in this scene</span>
      <div className="flex flex-wrap gap-2">
        {characters.map((c) => {
          const on = picked.includes(c.id);
          return (
            <label
              key={c.id}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
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
                  setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))
                }
              />
              {c.name}
              {c.isNarrator && <span className="ml-1 text-neutral-600">(narrates)</span>}
            </label>
          );
        })}
      </div>
      <span className="mt-1 block text-xs text-neutral-600">
        {picked.length === 0
          ? "Nobody picked — the Story Bible carries everyone in full, as before."
          : `Only these ${picked.length} are described in full; the rest keep just a name and a role.`}
      </span>
    </div>
  );
}
