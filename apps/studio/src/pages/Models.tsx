import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";
import { modelChoices } from "@/lib/model-choices";
import { GenParamsSettings } from "@/components/GenParamsSettings";
import { ModelDownload } from "@/components/ModelDownload";
import { ModelDefaultField } from "@/components/ModelDefaultField";
import { OpenRouterPanel, type Status as OrStatus } from "@/components/OpenRouterPanel";
import { ProviderSwitch } from "@/components/ProviderSwitch";

interface Model {
  name: string;
  sizeBytes: number;
  parameterSize: string | null;
  quantization: string | null;
  modifiedAt: string | null;
}
interface Pull {
  model: string;
  status: string;
  completedBytes: number;
  totalBytes: number;
  done: boolean;
  error: string | null;
  /** How long it has been running — computed server-side; see the API note. */
  elapsedMs: number;
}
interface Data {
  reachable: boolean;
  reason: string | null;
  version: string | null;
  url: string;
  /** The provider in use — one of the two. */
  provider: string;
  /** The value in .env, so it is clear what the UI choice is overriding. */
  embedProvider: string;
  installed: Model[];
  /** Recently used models, already filtered to the provider in use. */
  recent: string[];
  /** Default language for NEW stories — existing ones are untouched. */
  language: { value: string; fromEnv: boolean };
  configured: Array<{
    label: string;
    kind: string;
    value: string;
    /** "setting" = you chose it · "installed" = follows what is pulled · "none" = nothing */
    source: "setting" | "installed" | "none";
    model: string;
    installed: boolean;
  }>;
  promptOverrides: Array<{ label: string; model: string; installed: boolean }>;
  pull: Pull | null;
}

/**
 * DECIMAL units (1 GB = 1000³), not binary.
 *
 * So the numbers match what you see on ollama.com and in `ollama list`. With GiB
 * the same model reads 2.8 here and 3.0 there, and people think the download
 * came up short.
 */
function gb(bytes: number): string {
  if (bytes <= 0) return "—";
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

export function Models() {
  // Poll faster during a pull so the progress bar moves smoothly.
  const { data, isLoading } = useApi<Data>("/api/models", { refetchMs: 1500 });
  // Same key as OpenRouterPanel, so TanStack Query shares one request.
  const or = useApi<OrStatus>("/api/models/openrouter");
  if (isLoading || !data) return <Loading />;

  // Embeddings ALWAYS run locally, even when OpenRouter is in use.
  const localChoices = modelChoices({ ...data, provider: "ollama" });
  const choicesFor = modelChoices(data);
  const pick = (kind: string) => (kind === "embed" ? localChoices : choicesFor);

  /** What this model is currently set as — saves scrolling down to check. */
  const usedAs = (name: string) =>
    data.configured.filter((c) => c.value === name).map((c) => c.label.split(" — ")[0]!);

  const p = data.pull;
  const pct = p && p.totalBytes > 0 ? (p.completedBytes / p.totalBytes) * 100 : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Model</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Choose where models run, pull models into Ollama, set the defaults. Precedence at run
          time: <strong className="text-neutral-200">the model picked for that run</strong> → the
          prompt's model → the default here.
        </p>
      </div>

      <Section title="Default language">
        <Form
          path="/api/models/language"
          method="PUT"
          submit="Save"
          className="rounded border border-neutral-800 p-4"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm text-neutral-300">New stories are written in</span>
            {data.language.fromEnv && <Badge>from .env</Badge>}
          </div>
          <select
            name="language"
            key={data.language.value}
            defaultValue={data.language.value}
            className="w-48 rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
          >
            <option value="vi">Vietnamese</option>
            <option value="en">English</option>
          </select>
          <p className="mt-2 text-xs text-neutral-600">
            Only the value prefilled on the new-story screen — changing it here does{" "}
            <strong className="text-neutral-400">not</strong> touch existing stories. Each story
            keeps its own language, fixed at creation.
          </p>
        </Form>
      </Section>

      <Section title="Where models run">
        <ProviderSwitch
          provider={data.provider}
          openRouterReady={or.data?.reachable === true}
        />
      </Section>

      <Section title="Ollama — local models">
        <div
          className={`rounded border p-4 ${
            data.reachable ? "border-emerald-900/60 bg-emerald-950/20" : "border-red-900 bg-red-950/30"
          }`}
        >
          {data.reachable ? (
            <p className="text-sm text-emerald-200">
              Ollama {data.version} · {data.url}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-red-200">Cannot reach Ollama at {data.url}</p>
              {data.reason && <p className="text-xs text-red-300/80">{data.reason}</p>}
              <p className="text-xs text-neutral-400">
                Install from <code>ollama.com/download</code>, then run <code>ollama serve</code>.
                Change the address with <code>OLLAMA_URL</code> in <code>.env</code>.
              </p>
            </div>
          )}

          <p className="mt-3 text-xs text-neutral-500">
            Embeddings:{" "}
            <Badge tone={data.embedProvider === "mock" ? "amber" : "green"}>
              {data.embedProvider}
            </Badge>{" "}
            — always local, unaffected by the choice above.
          </p>
        </div>
      </Section>

      <OpenRouterPanel />

      {p && (
        <Section title="Downloading">
          <div className="space-y-3 rounded border border-neutral-800 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm">{p.model}</span>
              <span className="text-xs text-neutral-500">
                {gb(p.completedBytes)} / {gb(p.totalBytes)}
                {p.totalBytes > 0 && ` · ${pct.toFixed(0)}%`}
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded bg-neutral-800">
              <div
                className={`h-full transition-all ${p.error ? "bg-red-500" : p.done ? "bg-emerald-500" : "bg-neutral-300"}`}
                style={{ width: `${p.done && !p.error ? 100 : pct}%` }}
              />
            </div>

            <p className="text-xs text-neutral-500">
              {p.error ? (
                <span className="text-red-300">{p.error}</span>
              ) : p.done ? (
                <span className="text-emerald-300">
                  Done in {Math.round(p.elapsedMs / 1000)}s.
                </span>
              ) : (
                <>
                  {p.status} · {Math.round(p.elapsedMs / 1000)}s so far
                </>
              )}
            </p>

            {!p.done && (
              <ActionButton path="/api/models/pull" method="DELETE">
                stop
              </ActionButton>
            )}
          </div>
        </Section>
      )}

      <ModelDownload busy={Boolean(p && !p.done)} />

      <Section title={`Models available (${data.installed.length})`}>
        {data.installed.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">
            {data.reachable ? "No models pulled yet." : "Cannot reach Ollama."}
          </p>
        ) : (
          <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
            {data.installed.map((m) => (
              <div key={m.name} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-mono text-sm">{m.name}</div>
                  <div className="mt-0.5 text-xs text-neutral-600">
                    {usedAs(m.name).length > 0 && (
                      <span className="mr-1 text-emerald-400">
                        in use as: {usedAs(m.name).join(", ")} ·{" "}
                      </span>
                    )}
                    {gb(m.sizeBytes)}
                    {m.parameterSize ? ` · ${m.parameterSize}` : ""}
                    {m.quantization ? ` · ${m.quantization}` : ""}
                  </div>
                </div>
                <span className="flex flex-wrap items-center gap-1">
                  {/*
                    Assign right here. This list used to have only a delete button:
                    you could see the model you had just pulled with no way to use
                    it, and had to scroll to another section and start over.

                    Hidden while OpenRouter is in use, because the API writes the
                    default against the provider in use — clicking then would put an
                    Ollama model name into OpenRouter's slot and be rejected.
                  */}
                  {data.provider !== "openrouter" && (
                    <>
                      <ActionButton
                        path="/api/models/default/write"
                        method="PUT"
                        body={{ model: m.name }}
                      >
                        use for writing
                      </ActionButton>
                      <ActionButton
                        path="/api/models/default/utility"
                        method="PUT"
                        body={{ model: m.name }}
                      >
                        utility
                      </ActionButton>
                      <ActionButton
                        path="/api/models/default/embed"
                        method="PUT"
                        body={{ model: m.name }}
                      >
                        embeddings
                      </ActionButton>
                    </>
                  )}
                  <ActionButton
                    path={`/api/models/${encodeURIComponent(m.name)}`}
                    method="DELETE"
                    confirmText={`Remove ${m.name} from Ollama? Pulling it again costs ${gb(m.sizeBytes)} of bandwidth.`}
                  >
                    remove
                  </ActionButton>
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Default models">
        <p className="-mt-1 text-xs text-neutral-500">
          Used when a run picks no model of its own and the prompt sets none either. Leave a box
          empty and it follows whatever is pulled. If nothing suitable is pulled it picks{" "}
          <strong className="text-neutral-300">nothing</strong> — and a job reaching that step stops
          with a message, instead of dying on a model name that does not exist. Each provider
          remembers its own — these are the models for{" "}
          <strong className="text-neutral-300">{data.provider}</strong>.
        </p>
        <div className="space-y-3">
          {data.configured.map((cfg) => (
            <Form
              key={cfg.kind}
              path={`/api/models/default/${cfg.kind}`}
              method="PUT"
              submit="Save"
              className="rounded border border-neutral-800 p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm text-neutral-300">{cfg.label}</span>
                {/* Automatic: say so, or the user thinks they set it by hand. */}
                {cfg.source === "installed" && <Badge tone="blue">follows what is pulled</Badge>}
                {cfg.source === "none" && <Badge tone="red">no model</Badge>}
                {/* "not pulled" only means anything on Ollama — cloud models are never pulled. */}
                {data.reachable && data.provider === "ollama" &&
                  (cfg.installed ? <Badge tone="green">ready</Badge> : <Badge tone="red">not pulled</Badge>)}
              </div>
              <ModelDefaultField
                choices={pick(cfg.kind).choices}
                emptyReason={pick(cfg.kind).reason}
                value={cfg.value}
                auto={cfg.source !== "setting"}
              />
            </Form>
          ))}
        </div>
        {data.configured.some((c) => c.source === "none") && (
          <p className="text-xs text-red-400">
            Any step marked “no model” stops the job that reaches it. Pull a model, or pick one.
          </p>
        )}
      </Section>

      <GenParamsSettings />

      {data.promptOverrides.length > 0 && (
        <Section title="Prompts with their own model">
          <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
            {data.promptOverrides.map((o, i) => (
              <div key={`${o.label}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm text-neutral-400">{o.label}</span>
                <span className="flex items-center gap-2">
                  <code className="text-xs text-neutral-300">{o.model}</code>
                  {data.reachable && data.provider === "ollama" &&
                    (o.installed ? <Badge tone="green">ready</Badge> : <Badge tone="red">not pulled</Badge>)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-600">
            These steps ignore the defaults. Edit them on the prompt page.
          </p>
        </Section>
      )}
    </div>
  );
}
