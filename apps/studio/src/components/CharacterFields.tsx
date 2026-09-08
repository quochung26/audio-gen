/**
 * The fields that describe a character — ONE set, used everywhere one is edited.
 *
 * There used to be two: labelled fields with hints on the Characters page, and
 * placeholder-only boxes in the cast picker. Same seven things, described in two
 * different sets of words, and the picker's hints vanished the moment you typed —
 * exactly when a writer is deciding what belongs in "how they speak".
 *
 * Two modes, because the two callers hold their values differently:
 *
 *   controlled (`onChange`) — the cast picker keeps a list of characters in React
 *   state. No `name` attributes then: the picker sits inside the New story form and
 *   posts its list as one JSON field, so a stray `name` input would add a second,
 *   half-filled character to what that form sends.
 *
 *   uncontrolled (`defaults`) — the Characters page posts a plain form, so the
 *   inputs carry `name` and the browser collects them.
 */
export interface CharacterValues {
  name: string;
  role: string;
  description: string;
  speech: string;
  outfit: string;
  appearance: string;
  voiceHint: string;
}

export const EMPTY_CHARACTER: CharacterValues = {
  name: "",
  role: "",
  description: "",
  speech: "",
  outfit: "",
  appearance: "",
  voiceHint: "",
};

export function CharacterFields({
  value,
  defaults,
  onChange,
}: {
  value?: CharacterValues;
  defaults?: Partial<CharacterValues>;
  onChange?: (patch: Partial<CharacterValues>) => void;
}) {
  function bind(k: keyof CharacterValues) {
    if (onChange) {
      return {
        value: value?.[k] ?? "",
        onChange: (e: { target: { value: string } }) => onChange({ [k]: e.target.value }),
      };
    }
    return { name: k, defaultValue: defaults?.[k] ?? "" };
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Name" placeholder="Sam" {...bind("name")} />
        <Input label="Role in the story" placeholder="coach driver, 45" {...bind("role")} />
      </div>

      <Textarea
        label="Personality"
        hint="Who this person is — what drives their ACTIONS and choices."
        placeholder="Stubborn, never complains. Believes in omens but will not say so. Most afraid of owing anyone."
        rows={3}
        {...bind("description")}
      />

      <Textarea
        label="How they speak"
        hint="Rhythm, verbal habits, what they call people, what happens under stress. This keeps their DIALOGUE the same across dozens of episodes."
        placeholder="Says little, trails off mid-sentence. Calls passengers 'sir' and 'ma'am'. When frightened, speaks fast and repeats himself."
        rows={2}
        {...bind("speech")}
      />

      <Textarea
        label="Usually wears"
        hint="A DEFAULT — chapter and scene setup can both override it, so put down the outfit you see most often."
        placeholder="Faded shirt with the sleeves rolled, dark trousers, plastic sandals."
        rows={2}
        {...bind("outfit")}
      />

      <Textarea
        label="Appearance"
        hint="What never changes across the story: build, apparent age, face, scars. Clothing does not go here — it belongs in the chapter setup, because it differs per chapter."
        placeholder="Thin, weathered, salt-and-pepper hair cut short. A long scar on the left wrist."
        rows={2}
        {...bind("appearance")}
      />

      <Input
        label="Voice hint"
        placeholder="middle-aged man, hoarse"
        {...bind("voiceHint")}
      />
    </>
  );
}

export function Input({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="mb-1 block text-xs text-neutral-400">{label}</label>
      <input
        {...rest}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm outline-none placeholder:text-neutral-700 focus:border-neutral-500"
      />
    </div>
  );
}

export function Textarea({
  label,
  hint,
  ...rest
}: { label: string; hint?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label className="block text-xs text-neutral-400">{label}</label>
      {hint && <p className="mt-0.5 mb-1 text-xs text-neutral-600">{hint}</p>}
      <textarea
        {...rest}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2.5 text-sm leading-relaxed outline-none placeholder:text-neutral-700 focus:border-neutral-500"
      />
    </div>
  );
}
