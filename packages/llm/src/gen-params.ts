/**
 * Generation parameters — the knobs that decide what the model writes.
 *
 * These used to be edited by hand-typing JSON on the Prompt page: a mistyped key
 * said nothing, the parameter was quietly ignored, and prose still came out — just
 * at the default value. Declared centrally here so the UI can build the inputs, and
 * so out-of-range values are caught at save time.
 *
 * TASTE ONLY. `numCtx` and `maxTokens` were here too and have moved to `GEN_LIMITS`
 * in prompt.ts, because they are not preferences: one is what has to fit, the other
 * is how long the answer may run, and both follow from numbers that live in code.
 * Kept as fields they were a knob nobody should turn, and a second copy of a constant
 * that drifted from it every time the scene size was retuned.
 */
export interface GenParamSpec {
  key: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  /** The input's step size. Use 1 for integers. */
  step: number;
  /** What the provider uses when nobody sets it — shown as a hint in the empty box. */
  fallback: number;
}

export const GEN_PARAMS: GenParamSpec[] = [
  {
    key: "temperature",
    label: "temperature",
    hint: "Higher is more varied prose but wanders more easily. Editing and summarising should stay low.",
    min: 0,
    // Above 1.5 most models start babbling; capped here to save anyone hunting down
    // the cause of a ruined episode.
    max: 1.5,
    step: 0.05,
    fallback: 0.9,
  },
  {
    key: "topP",
    label: "topP",
    hint: "Only sample from the tokens covering this much probability. Lower is safer prose, and flatter.",
    min: 0.1,
    max: 1,
    step: 0.01,
    fallback: 0.92,
  },
  {
    key: "repeatPenalty",
    label: "repeatPenalty",
    hint: "Penalise repeated phrases — the chronic illness of small models. Too high and sentences turn clipped and awkward.",
    min: 1,
    max: 1.5,
    step: 0.01,
    fallback: 1.1,
  },
];

const BY_KEY = new Map(GEN_PARAMS.map((p) => [p.key, p]));

export interface ParsedGenParams {
  params: Record<string, number>;
  /** Which field is wrong and how — returned rather than thrown, so the form shows it inline. */
  errors: string[];
}

/**
 * Read parameters out of a form.
 *
 * A blank field means NOT SET, which is quite different from setting 0: blank falls
 * back to the provider's default, while `temperature: 0` is a real choice (repetitive
 * prose, but deterministic).
 */
export function parseGenParams(input: Record<string, unknown>): ParsedGenParams {
  const params: Record<string, number> = {};
  const errors: string[] = [];

  for (const spec of GEN_PARAMS) {
    const raw = input[spec.key];
    if (raw === undefined || raw === null || String(raw).trim() === "") continue;

    const n = Number(String(raw).trim());
    if (!Number.isFinite(n)) {
      errors.push(`${spec.label}: "${String(raw)}" is not a number`);
      continue;
    }
    if (n < spec.min || n > spec.max) {
      errors.push(`${spec.label}: must be between ${spec.min} and ${spec.max}, got ${n}`);
      continue;
    }
    params[spec.key] = spec.step >= 1 ? Math.round(n) : n;
  }
  return { params, errors };
}

/**
 * Filter parameters stored in the DB down to the keys that ACTUALLY do something.
 *
 * Providers only read the keys they know, so a stray key in `Prompt.params` has
 * always been ignored silently. Filtered here so the UI shows what really applies.
 */
export function knownGenParams(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;

  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const spec = BY_KEY.get(k);
    if (!spec) continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/** Keys present in old data that no provider reads. */
export function unknownGenParamKeys(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  return Object.keys(raw as Record<string, unknown>).filter((k) => !BY_KEY.has(k));
}
