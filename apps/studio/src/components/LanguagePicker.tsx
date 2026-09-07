import { useApi } from "@/lib/api";

interface ModelsData {
  language: { value: string; fromEnv: boolean };
}

const LABELS: Record<string, string> = { vi: "Vietnamese", en: "English" };

/**
 * Display label for a language code.
 *
 * The table is duplicated here because Studio does not depend on `@audio/core` —
 * it is an SPA and everything touching the DB goes through the API. Adding a
 * language means editing both places.
 */
export function languageLabel(code: string): string {
  return LABELS[code] ?? code;
}

/**
 * Pick the language for a NEW story.
 *
 * Fixed when the story is created and not changeable afterwards — said plainly
 * right under the picker. Changing the language of a story in progress is not a
 * config tweak: the arc summary, character names and the voices of earlier
 * episodes all drift out of line.
 */
export function LanguagePicker() {
  const { data } = useApi<ModelsData>("/api/models");
  const fallback = data?.language?.value ?? "vi";

  return (
    <label className="w-40">
      <span className="mb-1 block text-sm text-neutral-400">Language</span>
      <select
        name="language"
        // `key` makes the select take the default once data arrives after the
        // first render — without it the box sits on "vi" even when the default
        // is "en".
        key={fallback}
        defaultValue={fallback}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
      >
        {Object.entries(LABELS).map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-neutral-600">
        Fixed for the whole story; cannot be changed later.
      </span>
    </label>
  );
}

/**
 * Pick the DRAFT language — write in this, then rewrite into the output language.
 *
 * There so you can use the model that writes best even when it cannot write the
 * output language: a creative finetune built on Mistral Small writes very decent
 * English and near-unusable Vietnamese.
 *
 * Unlike the picker above, this one can change mid-story — it only decides the
 * next run; scenes already written stay put.
 */
export function DraftLanguagePicker() {
  return (
    <label className="w-52">
      <span className="mb-1 block text-sm text-neutral-400">Draft in</span>
      <select
        name="draftLanguage"
        defaultValue=""
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
      >
        <option value="">— write directly, no rewrite —</option>
        {Object.entries(LABELS).map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-neutral-600">
        Use when the model that writes best cannot write the output language. Costs
        one extra model call per scene.
      </span>
    </label>
  );
}
