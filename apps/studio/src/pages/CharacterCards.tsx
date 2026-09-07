import { useState } from "react";
import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";
import { Field, TextInput } from "@/components/Field";

interface Voice {
  id: string;
  name: string;
  language: string;
}

interface Card {
  id: string;
  name: string;
  role: string | null;
  description: string | null;
  speech: string | null;
  outfit: string | null;
  appearance: string | null;
  voiceHint: string | null;
  isNarrator: boolean;
  voiceId: string | null;
  voice: Voice | null;
  _count: { characters: number };
}

/**
 * The character card library — characters reusable across stories.
 *
 * A card is NOT a live link: bringing one into a story copies its contents, and
 * from then on the two go their own way. Said plainly at the top of the page,
 * because this is exactly where people assume the opposite.
 */
export function CharacterCards() {
  const { data, isLoading } = useApi<{ cards: Card[]; voices: Voice[] }>("/api/character-cards");
  const [editing, setEditing] = useState<string | null>(null);

  if (isLoading || !data) return <Loading />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Character cards</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Characters you can reuse across stories. Bringing a card into a story{" "}
          <strong className="text-neutral-200">copies its contents</strong> — from then on that
          character has its own life inside that story. Editing the card here does not touch
          stories already using it, and editing the character there does not touch the card.
        </p>
      </div>

      <Section title="Add a card">
        <CardForm voices={data.voices} />
      </Section>

      <Section title={`Library (${data.cards.length})`}>
        {data.cards.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">
            No cards yet. Add one above, or build a story and use “save to library” on its
            Characters page.
          </p>
        ) : (
          <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
            {data.cards.map((card) => (
              <div key={card.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-neutral-200">{card.name}</span>
                  {card.isNarrator && <Badge tone="blue">narrator</Badge>}
                  {card.voice && <Badge>{card.voice.name}</Badge>}
                  {card._count.characters > 0 && (
                    <span className="text-xs text-neutral-600">
                      used by {card._count.characters}
                    </span>
                  )}
                  <span className="grow" />
                  <button
                    type="button"
                    onClick={() => setEditing(editing === card.id ? null : card.id)}
                    className="text-xs text-neutral-400 underline hover:text-neutral-200"
                  >
                    {editing === card.id ? "close" : "edit"}
                  </button>
                  <ActionButton path={`/api/character-cards/${card.id}`} method="DELETE">
                    delete
                  </ActionButton>
                </div>

                {card.role && <p className="mt-1 text-sm text-neutral-400">{card.role}</p>}
                {card.description && (
                  <p className="mt-1 text-sm text-neutral-500">{card.description}</p>
                )}
                {card.speech && <p className="mt-1 text-sm text-neutral-500">{card.speech}</p>}
                {card.outfit && <p className="mt-1 text-sm text-neutral-600">{card.outfit}</p>}
                {card.appearance && (
                  <p className="mt-1 text-sm text-neutral-600">{card.appearance}</p>
                )}

                {editing === card.id && (
                  <div className="mt-3 border-t border-neutral-900 pt-3">
                    <CardForm voices={data.voices} card={card} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function CardForm({ voices, card }: { voices: Voice[]; card?: Card }) {
  return (
    <Form
      path={card ? `/api/character-cards/${card.id}` : "/api/character-cards"}
      method={card ? "PUT" : "POST"}
      submit={card ? "Save card" : "Add"}
      resetOnSuccess={!card}
      className="space-y-3 rounded border border-neutral-800 p-4"
    >
      <div className="flex flex-wrap gap-3">
        <div className="flex-1">
          <TextInput name="name" label="Name" placeholder="Tài" defaultValue={card?.name ?? ""} />
        </div>
        <div className="flex-1">
          <TextInput
            name="role"
            label="Role in the story"
            placeholder="coach driver, 45"
            defaultValue={card?.role ?? ""}
          />
        </div>
      </div>

      <Field
        name="description"
        label="Personality"
        hint="Who this person is — what drives their actions and choices."
        placeholder="Stubborn, never complains. Believes in omens but will not say so."
        rows={2}
        defaultValue={card?.description ?? ""}
      />

      <Field
        name="speech"
        label="How they speak"
        hint="Rhythm, verbal habits, what they call people. This keeps their dialogue recognisable across dozens of episodes."
        placeholder="Answers in clipped sentences. Only talks at length about his daughter."
        rows={2}
        defaultValue={card?.speech ?? ""}
      />

      <Field
        name="outfit"
        label="Usually wears"
        hint="A DEFAULT — chapter and scene setup can both override it, so put down the outfit you see most often."
        placeholder="Faded shirt with the sleeves rolled, dark trousers, plastic sandals."
        rows={2}
        defaultValue={card?.outfit ?? ""}
      />

      <Field
        name="appearance"
        label="Appearance"
        hint="What never changes across the story: build, apparent age, face, scars. Clothing goes in the chapter setup, not here."
        placeholder="Thin, weathered, salt-and-pepper hair cut short. A long scar on the left wrist."
        rows={2}
        defaultValue={card?.appearance ?? ""}
      />

      <div className="flex flex-wrap gap-3">
        <div className="flex-1">
          <TextInput
            name="voiceHint"
            label="Voice — for casting"
            placeholder="middle-aged man, hoarse"
            defaultValue={card?.voiceHint ?? ""}
          />
        </div>
        <label className="flex-1">
          <span className="mb-1 block text-xs text-neutral-500">Preferred voice</span>
          <select
            name="voiceId"
            defaultValue={card?.voiceId ?? ""}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
          >
            <option value="">— none —</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.language})
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-400">
        <input type="checkbox" name="isNarrator" defaultChecked={card?.isNarrator} />
        Usually the narrator
        <span className="text-xs text-neutral-600">
          — only a default; each story still has exactly one narrator
        </span>
      </label>
    </Form>
  );
}
