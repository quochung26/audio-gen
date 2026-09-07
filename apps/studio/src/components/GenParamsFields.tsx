export interface GenParamSpec {
  key: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
}

/**
 * Inputs for the generation parameters.
 *
 * Replaces a hand-typed JSON box: mistyping a key used to say nothing at all —
 * the parameter was quietly dropped and prose still came out, just with the
 * default value, so there was no way to tell you had changed nothing.
 *
 * Valid ranges come from the API rather than being copied here: copy them and
 * sooner or later the UI accepts something the API rejects.
 *
 * Empty means unset and falls back to the provider default — and the greyed
 * placeholder in an empty box is that default.
 */
export function GenParamsFields({
  specs,
  params,
  unknownParams = [],
  compact = false,
}: {
  specs: GenParamSpec[];
  params: Record<string, number>;
  unknownParams?: string[];
  /** Compact form for multi-row tables — drops the long explanations. */
  compact?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className={compact ? "flex flex-wrap gap-2" : "grid gap-3 sm:grid-cols-2"}>
        {specs.map((spec) => (
          <label key={spec.key} className={compact ? "w-28" : "block"}>
            <span className="mb-1 block text-xs text-neutral-500">{spec.label}</span>
            <input
              name={spec.key}
              type="number"
              min={spec.min}
              max={spec.max}
              step={spec.step}
              defaultValue={params[spec.key] ?? ""}
              placeholder={String(spec.fallback)}
              title={spec.hint}
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 font-mono text-sm"
            />
            {!compact && <span className="mt-1 block text-xs text-neutral-600">{spec.hint}</span>}
          </label>
        ))}
      </div>

      {/*
        A stray key in old data never did anything — the provider only reads keys it
        knows. Say so, or you think you tuned something when you did not.
      */}
      {unknownParams.length > 0 && (
        <p className="text-xs text-amber-500">
          Ignoring unused keys: <code>{unknownParams.join(", ")}</code> — the provider never
          reads them, and saving drops them.
        </p>
      )}
    </div>
  );
}
