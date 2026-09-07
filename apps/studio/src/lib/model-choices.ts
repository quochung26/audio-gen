export interface InstalledModel {
  name: string;
  parameterSize: string | null;
  quantization: string | null;
}

export interface ModelChoice {
  value: string;
  label: string;
}

export interface ModelChoices {
  choices: ModelChoice[];
  /**
   * Why there is nothing to pick. `null` when there is.
   *
   * Always say it: an empty list used to make the UI quietly fall back to a
   * free-text box, and all you saw was "no model picker" — no way to tell
   * whether Ollama was down, no model was pulled, or OpenRouter was in use.
   */
  reason: string | null;
}

/**
 * Which models are offered, and if none, why.
 *
 * Only OpenRouter changes where the list comes from. The `mock` provider still
 * uses Ollama-style model names — it used to fall into the "recently used"
 * branch and the picker filled up with stale names from history.
 *
 * If Ollama is unreachable, return nothing rather than guess: picking a model
 * that is not there kills the job midway through an episode.
 */
export function modelChoices(input: {
  provider: string;
  reachable: boolean;
  installed: InstalledModel[];
  recent: string[];
  /** Ollama address — put in the explanation so nobody has to go read `.env`. */
  url?: string;
}): ModelChoices {
  if (input.provider === "openrouter") {
    const choices = input.recent.map((m) => ({ value: m, label: m }));
    return {
      choices,
      reason: choices.length
        ? null
        : "No OpenRouter model used yet. Pick one under OpenRouter, or type a model name.",
    };
  }

  if (!input.reachable) {
    return {
      choices: [],
      reason: `Cannot reach Ollama${input.url ? ` at ${input.url}` : ""}, so the model list is unavailable. Run \`ollama serve\` and reload.`,
    };
  }

  if (input.installed.length === 0) {
    return {
      choices: [],
      reason: "Ollama is running but no model is pulled. Pull one under “Download a model” below.",
    };
  }

  return {
    choices: input.installed.map((m) => ({
      value: m.name,
      label:
        m.name +
        (m.parameterSize ? ` · ${m.parameterSize}` : "") +
        (m.quantization ? ` · ${m.quantization}` : ""),
    })),
    reason: null,
  };
}
