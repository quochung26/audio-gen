import { Link, useParams } from "react-router";
import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";

interface Voice {
  id: string;
  name: string;
  engine: string;
  tier: string;
  commercialOk: boolean;
}
interface Character {
  id: string;
  name: string;
  role: string | null;
  description: string | null;
  speech: string | null;
  outfit: string | null;
  appearance: string | null;
  state: string | null;
  stateThroughEpisode: number | null;
  voiceHint: string | null;
  isNarrator: boolean;
  voiceId: string | null;
  voice: Voice | null;
  /** The card this character came from. Provenance only, not a live link. */
  cardId: string | null;
  _count: { blocks: number };
}

interface Card {
  id: string;
  name: string;
}

export function Characters() {
  const { id } = useParams();
  const { data, isLoading } = useApi<{
    characters: Character[];
    voices: Voice[];
    defaultVoiceId: string | null;
    title: string;
  }>(`/api/series/${id}/characters`);
  const { data: library } = useApi<{ cards: Card[] }>("/api/character-cards");
  if (isLoading || !data) return <Loading />;

  const { characters, voices } = data;
  const narrators = characters.filter((c) => c.isNarrator);

  return (
    <div className="space-y-8">
      <div>
        <Link to={`/series/${id}`} className="text-xs text-neutral-500 underline">
          ← {data.title}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Characters</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          This list goes into the system prompt for every scene, and is what the audio edit uses
          to assign a speaker to each block. The{" "}
          <strong className="text-neutral-200">description</strong> is what keeps a character's
          dialogue sounding the same across dozens of episodes.
        </p>
      </div>

      {narrators.length === 0 && characters.length > 0 && (
        <p className="rounded border border-neutral-800 p-3 text-sm text-neutral-400">
          Nobody is set to read the narration — it will use the{" "}
          <strong className="text-neutral-200">story's default voice</strong>. This is an audio-stage
          choice and not required: mark a character only if you want the narration to carry that
          person's voice.
        </p>
      )}

      <Section title="Default voice">
        <Form
          path={`/api/series/${id}/default-voice`}
          method="PUT"
          submit="Save"
          className="rounded border border-neutral-800 p-4"
        >
          <p className="mb-2 text-xs text-neutral-500">
            Currently <strong className="text-neutral-300">one voice for the whole story</strong>.
            Per-character casting below only takes effect once multi-voice is on.
          </p>
          <select
            name="defaultVoiceId"
            defaultValue={data.defaultVoiceId ?? ""}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
          >
            <option value="">— pick the first voice of the configured engine —</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.engine}
                {v.commercialOk ? "" : " · ⚠ non-commercial"}
              </option>
            ))}
          </select>
        </Form>
      </Section>

      <div className="space-y-3">
        {characters.map((c) => (
          <details key={c.id} className="rounded border border-neutral-800">
            <summary className="cursor-pointer px-4 py-3">
              <span className="font-medium">{c.name}</span>
              {c.isNarrator && (
                <span className="ml-2">
                  <Badge tone="blue">narrator</Badge>
                </span>
              )}
              <span className="ml-2 text-xs text-neutral-500">{c.role}</span>
              <span className="ml-2 text-xs text-neutral-600">
                {c._count.blocks > 0 ? `${c._count.blocks} block` : ""}
                {c.voice ? ` · voice: ${c.voice.name}` : " · not cast"}
                {c.description ? "" : " · no description"}
                {c.stateThroughEpisode ? ` · state through ep ${c.stateThroughEpisode}` : ""}
              </span>
            </summary>

            <div className="border-t border-neutral-800 p-4">
              <Form
                path={`/api/series/${id}/characters/${c.id}`}
                method="PUT"
                submit="Save"
                className="space-y-3"
              >
                <CharacterFields c={c} />
              </Form>

              <Form
                path={`/api/series/${id}/characters/${c.id}/voice`}
                method="PUT"
                submit="Assign"
                className="mt-4 border-t border-neutral-900 pt-3"
              >
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-400">Voice (casting)</span>
                  <select
                    name="voiceId"
                    defaultValue={c.voiceId ?? ""}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
                  >
                    <option value="">— unassigned —</option>
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} · {v.engine} · {v.tier === "FAST" ? "CPU" : "GPU"}
                        {v.commercialOk ? "" : " · ⚠ non-commercial"}
                      </option>
                    ))}
                  </select>
                </label>
              </Form>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-900 pt-3">
                {/* Push the edit BACK to the library. A button, never automatic:
                    "Sam now knows he was lied to" is true of the story being
                    written and false of every other one. */}
                <ActionButton path={`/api/series/${id}/characters/${c.id}/save-card`}>
                  {c.cardId ? "update card" : "save to library"}
                </ActionButton>
                {c.cardId && (
                  <ActionButton path={`/api/series/${id}/characters/${c.id}/save-card?asNew=1`}>
                    fork into a new card
                  </ActionButton>
                )}
                <ActionButton
                  path={`/api/series/${id}/characters/${c.id}`}
                  method="DELETE"
                  confirmText={`Delete the character "${c.name}"?`}
                >
                  Delete character
                </ActionButton>
                {c._count.blocks > 0 && (
                  <span className="ml-2 text-xs text-neutral-600">
                    {c._count.blocks} blocks lose the link but keep the speaker name.
                  </span>
                )}
              </div>
            </div>
          </details>
        ))}
      </div>

      {(library?.cards ?? []).length > 0 && (
        <Section title="Add from the card library">
          <div className="flex flex-wrap gap-2">
            {(library?.cards ?? [])
              // Drop cards already in the story: clicking one only returns a
              // duplicate-name error.
              .filter((card) => !characters.some((c) => c.name === card.name))
              .map((card) => (
                <Form
                  key={card.id}
                  path={`/api/series/${id}/characters/from-card`}
                  submit={card.name}
                >
                  <input type="hidden" name="cardId" value={card.id} />
                </Form>
              ))}
          </div>
          <p className="mt-2 text-xs text-neutral-600">
            Copies the card's contents into this story. Later edits do not touch the card.
          </p>
        </Section>
      )}

      <details className="rounded border border-dashed border-neutral-700">
        <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-300">
          + Add a character
        </summary>
        <div className="border-t border-neutral-800 p-4">
          <Form
            path={`/api/series/${id}/characters`}
            submit="Add"
            className="space-y-3"
            resetOnSuccess
          >
            <CharacterFields />
          </Form>
        </div>
      </details>
    </div>
  );
}

function CharacterFields({ c }: { c?: Character }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="name" label="Name" defaultValue={c?.name ?? ""} placeholder="Sam" />
        <Input
          name="role"
          label="Role in the story"
          defaultValue={c?.role ?? ""}
          placeholder="coach driver, 45"
        />
      </div>

      <Textarea
        name="description"
        label="Personality"
        hint="Who this person is — what drives their ACTIONS and choices."
        defaultValue={c?.description ?? ""}
        placeholder="Stubborn, never complains. Believes in omens but will not say so. Most afraid of owing anyone."
        rows={3}
      />

      <Textarea
        name="speech"
        label="How they speak"
        hint="Rhythm, verbal habits, what they call people, what happens under stress. This keeps their DIALOGUE the same across dozens of episodes."
        defaultValue={c?.speech ?? ""}
        placeholder="Says little, trails off mid-sentence. Calls passengers 'sir' and 'ma'am'. When frightened, speaks fast and repeats himself."
        rows={2}
      />

      <Textarea
        name="outfit"
        label="Usually wears"
        hint="A DEFAULT — chapter and scene setup can both override it, so put down the outfit you see most often."
        defaultValue={c?.outfit ?? ""}
        placeholder="Faded shirt with the sleeves rolled, dark trousers, plastic sandals."
        rows={2}
      />

      <Textarea
        name="appearance"
        label="Appearance"
        hint="What never changes across the story: build, apparent age, face, scars. Clothing does not go here — it belongs in the chapter setup, because it differs per chapter."
        defaultValue={c?.appearance ?? ""}
        placeholder="Thin, weathered, salt-and-pepper hair cut short. A long scar on the left wrist."
        rows={2}
      />

      <Textarea
        name="state"
        label={
          "Current state" +
          (c?.stateThroughEpisode ? ` — updated through episode ${c.stateThroughEpisode}` : "")
        }
        hint="Where they are, what they know, how relationships changed. The summary job updates this after each episode; edit by hand when the AI got it wrong."
        defaultValue={c?.state ?? ""}
        placeholder="Staying at the widow's place out past the old bridge. Now knows the bus was never his."
        rows={3}
      />

      <Input
        name="voiceHint"
        label="Voice hint"
        defaultValue={c?.voiceHint ?? ""}
        placeholder="middle-aged man, hoarse"
      />

      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          name="isNarrator"
          defaultChecked={c?.isNarrator ?? false}
          className="accent-neutral-300"
        />
        Reads the narration
        <span className="text-xs text-neutral-600">(one per story)</span>
      </label>
    </>
  );
}

function Input({
  name,
  label,
  ...rest
}: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="mb-1 block text-xs text-neutral-400">{label}</label>
      <input
        name={name}
        {...rest}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm outline-none placeholder:text-neutral-700 focus:border-neutral-500"
      />
    </div>
  );
}

function Textarea({
  name,
  label,
  hint,
  ...rest
}: { name: string; label: string; hint?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label className="block text-xs text-neutral-400">{label}</label>
      {hint && <p className="mt-0.5 mb-1 text-xs text-neutral-600">{hint}</p>}
      <textarea
        name={name}
        {...rest}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2.5 text-sm leading-relaxed outline-none placeholder:text-neutral-700 focus:border-neutral-500"
      />
    </div>
  );
}
