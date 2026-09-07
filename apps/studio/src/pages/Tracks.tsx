import { mediaUrl, useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";
import { TextInput } from "@/components/Field";

/** UNKNOWN blocks publishing, so it has to stand out rather than blend into the grey. */
const LICENSE_TONE: Record<string, string> = {
  ROYALTY_FREE: "green",
  CC0: "green",
  CC_BY: "green",
  PURCHASED: "green",
  SELF_MADE: "green",
  UNKNOWN: "red",
};
const LICENSE_LABEL: Record<string, string> = {
  ROYALTY_FREE: "royalty free",
  CC0: "CC0",
  CC_BY: "CC BY — attribution required",
  PURCHASED: "purchased",
  SELF_MADE: "self made",
  UNKNOWN: "unknown",
};
const KIND_LABEL: Record<string, string> = {
  BGM: "background",
  SFX: "effect",
  INTRO: "intro",
  OUTRO: "outro",
};

interface Track {
  id: string;
  title: string;
  kind: string;
  url: string;
  durationMs: number;
  mood: string | null;
  tags: string[];
  licenseType: string;
  licenseNote: string | null;
  attribution: string | null;
  _count: { episodesAsBgm: number };
}

function formatDuration(ms: number): string {
  const t = Math.round(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function Tracks() {
  const { data, isLoading } = useApi<{ tracks: Track[]; storageDriver: string }>("/api/tracks");
  if (isLoading || !data) return <Loading />;

  const isLocal = data.storageDriver === "local";
  const unknown = data.tracks.filter((t) => t.licenseType === "UNKNOWN");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Music library</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Background music is mixed under the narration with{" "}
          <strong className="text-neutral-200">ducking</strong> — it drops when someone speaks and
          comes back up in the gaps. Pick music per episode on that episode's Audio page.
        </p>
      </div>

      {unknown.length > 0 && (
        <p className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
          {unknown.length} tracks have no verified licence. Any episode using them is blocked at
          publish — fill in the licence before putting them in an episode.
        </p>
      )}

      <Section title={`Track (${data.tracks.length})`}>
        {data.tracks.length === 0 ? (
          <p className="rounded border border-neutral-800 p-4 text-sm text-neutral-500">
            No tracks yet. Add one using the form below.
          </p>
        ) : (
          <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
            {data.tracks.map((t) => (
              <div key={t.id} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{t.title}</span>
                      <Badge>{KIND_LABEL[t.kind] ?? t.kind}</Badge>
                      <Badge tone={LICENSE_TONE[t.licenseType]}>
                        {LICENSE_LABEL[t.licenseType] ?? t.licenseType}
                      </Badge>
                      {t._count.episodesAsBgm > 0 && (
                        <Badge tone="blue">used by {t._count.episodesAsBgm}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      {t.durationMs > 0 ? formatDuration(t.durationMs) : "length unknown"}
                      {t.mood ? ` · ${t.mood}` : ""}
                      {t.tags.length > 0 ? ` · ${t.tags.join(", ")}` : ""}
                    </p>
                    {(t.attribution || t.licenseNote) && (
                      <p className="mt-1 text-xs text-neutral-600">
                        {t.attribution}
                        {t.attribution && t.licenseNote ? " — " : ""}
                        {t.licenseNote}
                      </p>
                    )}
                  </div>
                  <ActionButton
                    path={`/api/tracks/${t.id}`}
                    method="DELETE"
                    confirmText={`Remove "${t.title}" from the library? The file on disk stays.`}
                  >
                    remove
                  </ActionButton>
                </div>
                <audio controls preload="none" className="h-8 w-full max-w-md" src={mediaUrl(t.url)} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Add a track">
        <Form
          path="/api/tracks"
          submit="Add to library"
          className="space-y-3 rounded border border-neutral-800 p-4"
          resetOnSuccess
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput name="title" label="Title" placeholder="Đêm mưa — piano trầm" />
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">Kind</span>
              <select
                name="kind"
                defaultValue="BGM"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              >
                {Object.entries(KIND_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isLocal ? (
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">File</span>
              <input
                type="file"
                name="file"
                accept="audio/*"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-neutral-800 file:px-2 file:py-1 file:text-neutral-200"
              />
              <span className="mt-1 block text-xs text-neutral-600">
                Saved to the same store the worker reads. Length is measured automatically.
              </span>
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">Public URL</span>
              <input
                name="url"
                placeholder="https://..."
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              />
              <span className="mt-1 block text-xs text-neutral-600">
                STORAGE_DRIVER={data.storageDriver} — uploads are not possible from here.
              </span>
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">Licence</span>
              <select
                name="licenseType"
                defaultValue="UNKNOWN"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              >
                {Object.entries(LICENSE_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <TextInput name="mood" label="Mood (optional)" placeholder="u ám, căng thẳng" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              name="attribution"
              label="Attribution (required for CC BY)"
              placeholder="Nhạc: Tên tác giả"
            />
            <TextInput
              name="tags"
              label="Tags, comma separated"
              placeholder="piano, chậm, kinh dị"
            />
          </div>

          <TextInput
            name="licenseNote"
            label="Licence note"
            placeholder="Mua ở ... ngày ... / link điều khoản"
          />
        </Form>
      </Section>
    </div>
  );
}
