import { Link, useParams } from "react-router";
import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { ActionButton, Loading } from "@/components/Form";

const KIND_LABEL: Record<string, string> = {
  EVENT: "event",
  REVELATION: "revelation",
  PROMISE: "promise",
  RELATION: "relation",
  OBJECT: "object",
  PLACE: "place",
  OPEN_THREAD: "open thread",
};
const KIND_TONE: Record<string, string> = {
  OPEN_THREAD: "amber",
  PROMISE: "blue",
  REVELATION: "blue",
};

interface Fact {
  id: string;
  kind: string;
  text: string;
  episodeNumber: number;
  pinned: boolean;
  resolved: boolean;
  resolvedInEpisode: number | null;
}

export function Facts() {
  const { id } = useParams();
  const { data, isLoading } = useApi<{ facts: Fact[]; missingVector: number; title: string }>(
    `/api/series/${id}/facts`,
  );
  if (isLoading || !data) return <Loading />;

  const { facts } = data;
  const open = facts.filter((f) => f.kind === "OPEN_THREAD" && !f.resolved);
  const pinned = facts.filter((f) => f.pinned);

  const byEpisode = new Map<number, Fact[]>();
  for (const f of facts) {
    const list = byEpisode.get(f.episodeNumber) ?? [];
    list.push(f);
    byEpisode.set(f.episodeNumber, list);
  }

  return (
    <div className="space-y-8">
      <div>
        <Link to={`/series/${id}`} className="text-xs text-neutral-500 underline">
          ← {data.title}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Story facts</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Each fact is one sentence with its own vector. When writing a scene, only the facts
          related to that beat are pulled in — instead of stuffing every old summary into the
          prompt. Facts live independently of summary compression, so compressing loses no detail.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Total facts" value={String(facts.length)} />
        <Stat label="Still open" value={String(open.length)} hint="always loaded" />
        <Stat label="Pinned" value={String(pinned.length)} hint="always loaded" />
        <Stat
          label="No vector yet"
          value={String(data.missingVector)}
          hint={data.missingVector > 0 ? "cannot be retrieved" : "all set"}
        />
      </div>

      {open.length > 0 && (
        <Section title={`Open threads (${open.length})`}>
          <p className="text-xs text-neutral-500">
            Debts the story has to pay. Always loaded regardless of similarity — an open thread
            from episode 3 still needs raising in episode 40 even if the subject is unrelated.
          </p>
          <div className="divide-y divide-neutral-900 rounded border border-amber-900/50">
            {open.map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="text-sm">
                  <span className="text-xs text-neutral-500">ep {f.episodeNumber} · </span>
                  {f.text}
                </div>
                <ActionButton
                  path={`/api/series/${id}/facts/${f.id}/resolve`}
                  method="PUT"
                  body={{ episodeNumber: String(f.episodeNumber) }}
                >
                  resolved
                </ActionButton>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="By episode">
        <div className="space-y-3">
          {[...byEpisode.entries()].map(([num, list]) => (
            <details key={num} className="rounded border border-neutral-800">
              <summary className="cursor-pointer px-4 py-2.5 text-sm">
                <span className="text-neutral-500">Episode {num}</span>
                <span className="ml-2 text-xs text-neutral-600">{list.length} facts</span>
              </summary>
              <div className="divide-y divide-neutral-900 border-t border-neutral-800">
                {list.map((f) => (
                  <div key={f.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0 text-sm">
                      <span className="mr-2 align-middle">
                        <Badge tone={KIND_TONE[f.kind] ?? "neutral"}>
                          {KIND_LABEL[f.kind] ?? f.kind}
                        </Badge>
                      </span>
                      <span className={f.resolved ? "text-neutral-600 line-through" : ""}>
                        {f.text}
                      </span>
                      {f.resolved && f.resolvedInEpisode && (
                        <span className="ml-2 text-xs text-neutral-600">
                          resolved in ep {f.resolvedInEpisode}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <ActionButton path={`/api/series/${id}/facts/${f.id}/pin`} method="PUT">
                        {f.pinned ? "unpin" : "pin"}
                      </ActionButton>
                      <ActionButton
                        path={`/api/series/${id}/facts/${f.id}`}
                        method="DELETE"
                        confirmText={`Delete the fact "${f.text.slice(0, 40)}…"?`}
                      >
                        delete
                      </ActionButton>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-neutral-800 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-neutral-600">{hint}</div>}
    </div>
  );
}
