import { useState } from "react";
import { useApi } from "@/lib/api";
import { Badge, Button, Section } from "@/components/ui";
import { ActionButton, ErrorNote, Loading } from "@/components/Form";

interface KeyStatus {
  usage: number;
  limit: number | null;
  remaining: number | null;
  freeTier: boolean;
}
interface Usage {
  episodes: number;
  inputTokens: number;
  outputTokens: number;
}
export interface Status {
  hasKey: boolean;
  reachable: boolean;
  reason: string | null;
  key: KeyStatus | null;
  url: string;
  active: boolean;
  usage: Usage | null;
}
interface ORModel {
  id: string;
  name: string;
  contextLength: number;
  promptPerMTok: number | null;
  completionPerMTok: number | null;
  free: boolean;
}

function usd(n: number): string {
  if (n === 0) return "free";
  // Cheap models cost $0.02 per million tokens — rounding to 2 places shows "$0.00".
  return n < 0.1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
}

/** Cost of one episode, from the average token use measured on episodes already run. */
function costPerEpisode(m: ORModel, u: Usage): number | null {
  if (m.promptPerMTok === null || m.completionPerMTok === null) return null;
  return (
    (u.inputTokens / 1e6) * m.promptPerMTok + (u.outputTokens / 1e6) * m.completionPerMTok
  );
}

/**
 * The OpenRouter connection — models running in the cloud.
 *
 * Kept apart from the Ollama section because the two are different in kind:
 * Ollama pulls a model onto the machine, OpenRouter calls over the network and
 * bills per token. Merge them into one list and "delete model" and "not pulled"
 * become meaningless for half the rows.
 */
export function OpenRouterPanel() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);

  const { data, isLoading } = useApi<Status>("/api/models/openrouter");
  // Only fetch the list when opened: 300+ models, a few hundred KB.
  const list = useApi<{ models: ORModel[] }>(open ? "/api/models/openrouter/models" : null);

  if (isLoading || !data) return <Loading />;

  const models = (list.data?.models ?? []).filter((m) => {
    if (freeOnly && !m.free) return false;
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return m.id.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle);
  });

  return (
    <Section title="OpenRouter — cloud models">
      <div
        className={`rounded border p-4 ${
          data.reachable
            ? "border-emerald-900/60 bg-emerald-950/20"
            : data.hasKey
              ? "border-red-900 bg-red-950/30"
              : "border-neutral-800"
        }`}
      >
        {data.reachable && data.key ? (
          <div className="space-y-1">
            <p className="text-sm text-emerald-200">
              Connected · {data.url}
              {data.key.freeTier && " · free tier"}
            </p>
            <p className="text-xs text-emerald-300/80">
              Spent {usd(data.key.usage)}
              {data.key.remaining !== null
                ? ` · ${usd(data.key.remaining)} left`
                : " · no limit set"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className={`text-sm ${data.hasKey ? "text-red-200" : "text-neutral-400"}`}>
              {data.hasKey ? "Cannot reach OpenRouter" : "OpenRouter is off"}
            </p>
            {data.reason && <p className="text-xs text-neutral-500">{data.reason}</p>}
            <p className="text-xs text-neutral-500">
              Get a key at <code>openrouter.ai/keys</code>, set{" "}
              <code>OPENROUTER_API_KEY</code> in <code>.env</code>, and restart the API.
            </p>
          </div>
        )}

        {/*
          This warning CANNOT be dismissed, and sits right under the status on
          purpose. The whole two-database design exists to keep drafts on this
          machine; turning this on opens an exception by hand, so it has to be
          visible every time the page loads.
        */}
        {data.hasKey && (
          <p className="mt-3 rounded border border-amber-900/60 bg-amber-950/30 p-2.5 text-xs text-amber-200">
            A cloud model reads what you send it: the Story Bible, drafts and character dialogue
            all leave this machine. For unapproved drafts, consider letting the local model handle
            it.
          </p>
        )}

        <p className="mt-3 text-xs text-neutral-500">
          {data.active ? (
            <>
              <Badge tone="green">in use</Badge> — every generation goes through OpenRouter.
            </>
          ) : (
            <>
              <strong className="text-neutral-400">Not</strong> in use right now. Switch in the
              “where models run” block above before setting a default model.
            </>
          )}
        </p>
      </div>

      {!open ? (
        <Button onClick={() => setOpen(true)}>Browse available models</Button>
      ) : list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorNote error={list.error} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search models…"
              aria-label="Search models"
              className="flex-1 rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
            />
            <label className="flex items-center gap-2 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={freeOnly}
                onChange={(e) => setFreeOnly(e.target.checked)}
              />
              free models only
            </label>
            <span className="text-xs text-neutral-600">{models.length} model</span>
          </div>

          {data.usage ? (
            <p className="text-xs text-neutral-600">
              The “per episode” figure uses consumption measured over {data.usage.episodes}{" "}
              episodes: {data.usage.inputTokens.toLocaleString("en-GB")} input tokens +{" "}
              {data.usage.outputTokens.toLocaleString("en-GB")} output.
            </p>
          ) : (
            <p className="text-xs text-neutral-600">
              No episodes run yet, so there is no per-episode estimate.
            </p>
          )}

          <div className="max-h-[28rem] divide-y divide-neutral-900 overflow-y-auto rounded border border-neutral-800">
            {models.length === 0 ? (
              <p className="p-4 text-sm text-neutral-500">No models match.</p>
            ) : (
              models.map((m) => {
                const cost = data.usage ? costPerEpisode(m, data.usage) : null;
                return (
                  <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="font-mono text-sm text-neutral-200">{m.id}</div>
                      <div className="mt-0.5 text-xs text-neutral-600">
                        {m.contextLength > 0 &&
                          `${Math.round(m.contextLength / 1000)}k context · `}
                        {m.promptPerMTok === null || m.completionPerMTok === null
                          ? "price unknown"
                          : `in ${usd(m.promptPerMTok)} · out ${usd(m.completionPerMTok)} /1M tokens`}
                        {cost !== null && cost > 0 && ` · ~${usd(cost)} per episode`}
                      </div>
                    </div>
                    <span className="flex shrink-0 items-center gap-1">
                      {m.free && <Badge tone="green">free</Badge>}
                      {/*
                        Default models are stored per provider, and the API writes
                        against the provider CURRENTLY IN USE. Clicking this while
                        on Ollama writes a cloud model name into Ollama's slot.
                      */}
                      {data.active ? (
                        <>
                          <ActionButton
                            path="/api/models/default/write"
                            method="PUT"
                            body={{ model: m.id }}
                          >
                            use for writing
                          </ActionButton>
                          <ActionButton
                            path="/api/models/default/utility"
                            method="PUT"
                            body={{ model: m.id }}
                          >
                            utility
                          </ActionButton>
                        </>
                      ) : null}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
