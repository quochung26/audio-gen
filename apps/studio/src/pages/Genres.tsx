import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";

interface G {
  id: string;
  name: string;
  promptName: string;
  description: string;
  enabled: boolean;
  /** How many stories use it, counting both main genre and sub-genres. */
  usedBy: number;
}

interface Data {
  genres: G[];
  /** Genres stories use that are not in the catalogue. */
  unlisted: Array<{ name: string; usedBy: number }>;
}

export function Genres() {
  const { data, isLoading } = useApi<Data>("/api/genres");
  if (isLoading || !data) return <Loading />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Genres</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          The description here is{" "}
          <strong className="text-neutral-200">not a note for human readers</strong> — it goes into
          the Story Bible, so the model reads “kinh dị” the way you mean it rather than the way it
          guesses. Editing a description changes how every story in that genre is written, from the
          next run on.
        </p>
      </div>

      <Section title="Add a genre">
        <Form path="/api/genres" submit="Add" resetOnSuccess className="space-y-3 rounded border border-neutral-800 p-4">
          <div className="flex flex-wrap gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-xs text-neutral-500">Name — what listeners see</span>
              <input
                name="name"
                placeholder="kiếm hiệp"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              />
              <span className="mt-1 block text-xs text-neutral-600">
                Shown on the player and in the RSS keywords — keep it in the listener's language.
              </span>
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-xs text-neutral-500">
                Name for the model <span className="text-neutral-600">— optional</span>
              </span>
              <input
                name="promptName"
                placeholder="wuxia"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              />
              <span className="mt-1 block text-xs text-neutral-600">
                Leave blank and the model reads the name on the left. An English name gives a
                7–14B model far richer associations.
              </span>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Description — the model reads this</span>
            <textarea
              name="description"
              rows={3}
              placeholder="Focus on martial arts and the code of the jianghu. Fights need specific, named moves — no vague choreography."
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
            />
            <span className="mt-1 block text-xs text-neutral-600">
              Write it <strong className="text-neutral-400">in English</strong>, the way you
              would brief a writer you hired: say what to do and what to avoid. This is an
              instruction to the model and sits in the English prompt block, next to the model name.
            </span>
          </label>
        </Form>
      </Section>

      {data.unlisted.length > 0 && (
        <Section title="In use but undescribed">
          <p className="-mt-1 text-xs text-neutral-500">
            Stories use these genres but they are not in the catalogue, so the model is told
            nothing about them. Add them above under the exact same name to give them a description.
          </p>
          <div className="flex flex-wrap gap-2">
            {data.unlisted.map((u) => (
              <Badge key={u.name} tone="amber">
                {u.name} · {u.usedBy} stories
              </Badge>
            ))}
          </div>
        </Section>
      )}

      <Section title={`Catalogue (${data.genres.length})`}>
        <div className="space-y-3">
          {data.genres.map((g) => (
            <Form
              key={g.id}
              path={`/api/genres/${g.id}`}
              method="PUT"
              submit="Save"
              className={`rounded border p-4 ${g.enabled ? "border-neutral-800" : "border-neutral-900 bg-neutral-950"}`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <input
                  name="name"
                  defaultValue={g.name}
                  title="The name listeners see"
                  className="rounded border border-neutral-700 bg-neutral-900 p-1.5 text-sm"
                />
                <input
                  name="promptName"
                  defaultValue={g.promptName}
                  placeholder="name for the model"
                  title="The name given to the model. Blank uses the name on the left."
                  className="rounded border border-neutral-800 bg-neutral-900 p-1.5 text-sm text-neutral-400"
                />
                {g.usedBy > 0 ? (
                  <Badge tone="green">used by {g.usedBy}</Badge>
                ) : (
                  <Badge>unused</Badge>
                )}
                {!g.enabled && <Badge tone="amber">hidden</Badge>}
              </div>
              <textarea
                name="description"
                rows={3}
                defaultValue={g.description}
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <ActionButton path={`/api/genres/${g.id}/toggle`} method="PUT">
                  {g.enabled ? "hide from pickers" : "unhide"}
                </ActionButton>
                {/* Delete only offered when nothing uses it — the API checks again. */}
                {g.usedBy === 0 && (
                  <ActionButton
                    path={`/api/genres/${g.id}`}
                    method="DELETE"
                    confirmText={`Delete the genre "${g.name}"?`}
                  >
                    delete
                  </ActionButton>
                )}
              </div>
            </Form>
          ))}
        </div>
      </Section>
    </div>
  );
}
