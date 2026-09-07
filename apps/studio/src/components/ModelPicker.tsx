import { useApi } from "@/lib/api";
import { modelChoices } from "@/lib/model-choices";

interface ModelsData {
  reachable: boolean;
  provider: string;
  /** Ollama address — so the explanation points straight at what to fix. */
  url: string;
  installed: Array<{ name: string; parameterSize: string | null; quantization: string | null }>;
  recent: string[];
  configured: Array<{ label: string; kind: string; value: string }>;
}

/**
 * Pick a model for ONE run.
 *
 * Leaving it blank uses the default — and that is the first option, because
 * most runs need no change.
 *
 * Only lists models of the provider CURRENTLY IN USE:
 * - Ollama: models already pulled. Picking one that is not there kills the job
 *   midway, and by then you are halfway through an episode.
 * - OpenRouter: models used recently. You cannot pour 300+ models into a select;
 *   to try a new one, use the Models page, which has search and pricing.
 */
export function ModelPicker({ kind = "write" }: { kind?: "write" | "utility" }) {
  const { data } = useApi<ModelsData>("/api/models");
  if (!data) return null;

  const { choices, reason } = modelChoices(data);
  const def = data.configured.find((c) => c.kind === kind);

  // This block used to disappear when there was nothing to pick — the form then
  // looked as if Studio simply did not let you choose, rather than Ollama being
  // down.
  if (choices.length === 0) {
    return (
      <div>
        <span className="mb-1 block text-xs text-neutral-500">Model for this run</span>
        <p className="rounded border border-neutral-800 bg-neutral-900/60 p-2.5 text-xs text-neutral-400">
          Nothing to pick — this run uses the default
          {def ? ` (${def.value})` : ""}. {reason}
        </p>
      </div>
    );
  }

  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-500">Model for this run</span>
      <select
        name="model"
        defaultValue=""
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
      >
        <option value="">— default{def ? `: ${def.value}` : ""} —</option>
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-neutral-600">
        Applies to this run only. Change the default on the Models page.
      </span>
    </label>
  );
}
