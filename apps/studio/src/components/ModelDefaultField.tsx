import { useState } from "react";

export interface ModelChoice {
  value: string;
  label: string;
}

/**
 * Field for setting a default model.
 *
 * This used to be a free-text box with a `datalist`: the pulled models only
 * appeared once you clicked in and typed, so the page looked as if it offered no
 * choice at all. Now it is a real select listing the usable models.
 *
 * The typing path is still there: sometimes you want to set a model you have NOT
 * pulled yet and fetch it after, and OpenRouter cannot list 300+ models.
 */
export function ModelDefaultField({
  choices,
  emptyReason,
  value,
  auto,
}: {
  choices: ModelChoice[];
  /** Why there is nothing to pick — shown under the field, never silently. */
  emptyReason?: string | null;
  /** The value currently in effect. Empty means no model at all. */
  value: string;
  /** The value is an AUTOMATIC default, not a deliberate choice. */
  auto: boolean;
}) {
  const [manual, setManual] = useState(false);

  // A configured model that is not in the list still has to appear, otherwise
  // opening the page moves the select to something else and the first Save
  // overwrites it. An automatic default leaves the box empty — preselecting it
  // would turn a derived value into a fixed choice on the first Save.
  const current = auto ? "" : value;
  const known = choices.some((c) => c.value === current);
  const options = known || !current ? choices : [{ value: current, label: `${current} (not pulled)` }, ...choices];

  if (manual || choices.length === 0) {
    return (
      <div className="space-y-1">
        <input
          name="model"
          defaultValue={current}
          placeholder="type a model name"
          className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 font-mono text-sm"
        />
        {choices.length > 0 ? (
          <button
            type="button"
            onClick={() => setManual(false)}
            className="text-xs text-neutral-500 hover:text-neutral-300"
          >
            ← pick from the list
          </button>
        ) : (
          // Quietly falling back to a text box just looks like "no model picker"
          // with no reason given.
          <p className="text-xs text-amber-500">
            Nothing to pick. {emptyReason}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <select
        name="model"
        key={current}
        defaultValue={current}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 font-mono text-sm"
      >
        {/*
          Blank = follow whatever is pulled. Say which one that currently is, or the
          user has no idea what they are choosing.
        */}
        <option value="">
          {auto && value ? `— automatic: ${value} —` : "— let it choose —"}
        </option>
        {options.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setManual(true)}
        className="text-xs text-neutral-500 hover:text-neutral-300"
      >
        type a different name →
      </button>
    </div>
  );
}
