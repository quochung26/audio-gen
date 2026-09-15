import { Badge } from "@/components/ui";
import { ActionButton } from "@/components/Form";

/**
 * Choose who turns text into vectors — a SEPARATE decision from who writes the prose.
 *
 * Separate because the two do not move together: a machine can write in the cloud and
 * embed locally, or the reverse. It sat inside the Ollama panel while it was an Ollama
 * setting; once OpenRouter became an option that placement said the wrong thing.
 *
 * Same shape as ProviderSwitch deliberately. Both answer "which of these is running",
 * and two switches on one page that answer it differently make the reader work out
 * twice which card is the live one. The previous version rendered all three as
 * buttons, so the one in use was a DISABLED button — which reads as broken rather
 * than as chosen.
 */
export function EmbeddingSwitch({ provider }: { provider: string }) {
  const options = [
    {
      id: "ollama",
      title: "Ollama — local",
      desc: "Free, and nothing leaves the machine. Needs an embedding model pulled and Ollama reachable.",
    },
    {
      id: "openrouter",
      title: "OpenRouter — cloud",
      desc: "text-embedding-3-large at 1024 dimensions, about $0.13 per million tokens. A few thousand tokens an episode.",
    },
    {
      id: "mock",
      title: "Off",
      desc: "Hashes words into a vector. Retrieval still returns facts — just not the relevant ones. For checking the plumbing, not for writing.",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((o) => {
          const on = provider === o.id;
          return (
            <div
              key={o.id}
              className={`flex flex-col rounded border p-4 ${
                on ? "border-neutral-500 bg-neutral-900" : "border-neutral-800"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-neutral-200">{o.title}</span>
                {on && <Badge tone={o.id === "mock" ? "amber" : "green"}>in use</Badge>}
              </div>
              {/* `flex-1` so the buttons line up across cards whose descriptions wrap
                  to different heights. */}
              <p className="mt-1 flex-1 text-xs text-neutral-500">{o.desc}</p>

              {!on && (
                <div className="mt-3">
                  <ActionButton
                    path="/api/models/embed-provider"
                    method="PUT"
                    body={{ provider: o.id }}
                    confirmText={
                      o.id === "mock"
                        ? "Turn embeddings off? Retrieval keeps returning facts, but they will be unrelated to the scene — and nothing will say so."
                        : undefined
                    }
                  >
                    use this
                  </ActionButton>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-neutral-600">
        Switching rebuilds nothing. Vectors made by the old model cannot be compared against
        the new one, so retrieval skips them — the{" "}
        <strong className="text-neutral-400">Story facts</strong> page of each story counts
        those and has the button that re-embeds them.
      </p>
    </div>
  );
}
