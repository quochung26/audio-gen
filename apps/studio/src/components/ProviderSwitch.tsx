import { Badge } from "@/components/ui";
import { ActionButton } from "@/components/Form";

/**
 * Choose where models run — ONE of the two.
 *
 * Ollama locally: free, nothing leaves the machine, but limited by the GPU you
 * have at home. OpenRouter: far stronger models, paid per token, and your
 * content is sent out.
 *
 * The switch takes effect on the very next model call, even mid-run: the choice
 * lives in the `Setting` table and is read every time.
 */
export function ProviderSwitch({
  provider,
  envProvider,
  openRouterReady,
}: {
  provider: string;
  envProvider: string;
  /** Has an API key and answers — switching before that kills the job. */
  openRouterReady: boolean;
}) {
  const options = [
    {
      id: "ollama",
      title: "Ollama — local",
      desc: "Free. Nothing leaves this machine. Limited by the GPU you have at home.",
      blocked: null as string | null,
    },
    {
      id: "openrouter",
      title: "OpenRouter — cloud",
      desc: "Far stronger models, paid per token. Your content leaves this machine.",
      blocked: openRouterReady ? null : "Not connected — see the OpenRouter panel below.",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => {
          const on = provider === o.id;
          return (
            <div
              key={o.id}
              className={`rounded border p-4 ${
                on ? "border-neutral-500 bg-neutral-900" : "border-neutral-800"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-neutral-200">{o.title}</span>
                {on && <Badge tone="green">in use</Badge>}
              </div>
              <p className="mt-1 text-xs text-neutral-500">{o.desc}</p>

              {!on && (
                <div className="mt-3">
                  {o.blocked ? (
                    <p className="text-xs text-amber-500">{o.blocked}</p>
                  ) : (
                    <ActionButton
                      path="/api/models/provider"
                      method="PUT"
                      body={{ provider: o.id }}
                      confirmText={
                        o.id === "openrouter"
                          ? "Switch to OpenRouter? Your Story Bible, drafts and dialogue will be sent to a cloud service, and every generation costs money."
                          : undefined
                      }
                    >
                      switch to {o.id === "ollama" ? "Ollama" : "OpenRouter"}
                    </ActionButton>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {provider === "mock" && (
        <p className="rounded border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-200">
          Running the <strong>mock</strong> provider — no model is actually writing. Pick one of
          the two above to run for real.
        </p>
      )}

      <p className="text-xs text-neutral-600">
        Default models are remembered per provider, so switching back and forth loses nothing.{" "}
        {provider !== envProvider && (
          <>
            <code>.env</code> says <code>{envProvider}</code>; the choice here overrides it.
          </>
        )}
      </p>
    </div>
  );
}
