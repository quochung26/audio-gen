import { useApi } from "@/lib/api";
import { modelChoices } from "@/lib/model-choices";

interface ModelsData {
  provider: string;
  /** Ollama address — so the explanation points straight at what to fix. */
  url: string;
  recent: string[];
  configured: Array<{ label: string; kind: string; value: string }>;
}

/**
 * The Ollama probe, its own request since the Models page stopped waiting on it.
 *
 * Fetched here too, and NOT optional: `reachable` and `installed` moved out of
 * `/api/models` with that split, so this component went on reading two fields the
 * route no longer sends. Under OpenRouter nothing showed, because that branch only
 * uses `recent`; under Ollama the list was permanently empty with "cannot reach
 * Ollama" as the reason, whatever Ollama was doing.
 */
interface OllamaData {
  reachable: boolean;
  installed: Array<{ name: string; parameterSize: string | null; quantization: string | null }>;
}

/**
 * Pick a model.
 *
 * Two jobs, one select. On a form that starts a run it picks the model for THAT run;
 * given `current` it is a story setting instead, and the blank option hands the story
 * back to the Models page default. The wording changes with it, because "applies to
 * this run only" on a box that in fact persists is worse than no wording at all.
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
export function ModelPicker({
  kind = "write",
  current,
  seriesModel,
}: {
  kind?: "write" | "utility" | "translate";
  /** The story's saved model — present only when this select IS that setting. */
  current?: string;
  /**
   * The story's saved model, on a picker that runs one job rather than setting it.
   *
   * Only for the wording. Leaving a run blank already uses it — the fallback is
   * applied when the job is queued, not here — but the box said "default:
   * <whatever the Models page says>", which is not what was about to run.
   */
  seriesModel?: string;
}) {
  const sticky = current !== undefined;
  const inherited = !sticky ? seriesModel?.trim() : undefined;
  const { data } = useApi<ModelsData>("/api/models");
  // Same keys as the Models page, so TanStack Query shares both requests.
  const { data: ollama } = useApi<OllamaData>("/api/models/ollama");
  if (!data) return null;

  const { choices, reason } = modelChoices({
    ...data,
    reachable: ollama?.reachable ?? false,
    installed: ollama?.installed ?? [],
  });
  const def = data.configured.find((c) => c.kind === kind);

  // This block used to disappear when there was nothing to pick — the form then
  // looked as if Studio simply did not let you choose, rather than Ollama being
  // down.
  if (choices.length === 0) {
    return (
      <div>
        <span className="mb-1 block text-xs text-neutral-500">
          {sticky ? "Model for this story" : "Model for this run"}
        </span>
        <p className="rounded border border-neutral-800 bg-neutral-900/60 p-2.5 text-xs text-neutral-400">
          Nothing to pick — {sticky ? "this story uses" : "this run uses"}{" "}
          {inherited ? `this story's model (${inherited})` : `the default${def ? ` (${def.value})` : ""}`}.{" "}
          {reason}
        </p>
      </div>
    );
  }

  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-500">
        {sticky ? "Model for this story" : "Model for this run"}
      </span>
      <select
        name="model"
        // Keyed so the saved value takes once it arrives: the catalogue and the story
        // load separately, and a plain defaultValue would have settled on "" first.
        key={current ?? ""}
        defaultValue={current ?? ""}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
      >
        <option value="">
          {inherited ? `— this story: ${inherited} —` : `— default${def ? `: ${def.value}` : ""} —`}
        </option>
        {/* A story's saved model that the provider no longer lists — Ollama has not
            pulled it back, or it has dropped off the recent list. Without this the
            select falls silently to "default" and one Save moves the story onto
            another model. */}
        {sticky && current && !choices.some((c) => c.value === current) && (
          <option value={current}>{current} (not listed)</option>
        )}
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-neutral-600">
        {sticky
          ? "Every writing run for this story uses it, until you change it here. Summaries and the other short steps keep the default."
          : inherited
            ? "Applies to this run only. Leave it alone and the story's own model writes it — change that on the story page."
            : "Applies to this run only. Change the default on the Models page."}
      </span>
    </label>
  );
}
