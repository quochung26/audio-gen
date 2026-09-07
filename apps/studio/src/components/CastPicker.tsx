import { useState } from "react";
import { useApi } from "@/lib/api";
import { Badge } from "@/components/ui";

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
}

/**
 * One person in the cast of the story ABOUT to be created.
 *
 * `cardId` null means a character typed for this story only, not in the library.
 * `key` is a throwaway React key, never sent — two unnamed characters still have
 * to be told apart while you type.
 */
interface Row {
  key: string;
  cardId: string | null;
  name: string;
  role: string;
  description: string;
  speech: string;
  outfit: string;
  appearance: string;
  voiceHint: string;
  isNarrator: boolean;
}

const blank = (over: Partial<Row> = {}): Row => ({
  key: crypto.randomUUID(),
  cardId: null,
  name: "",
  role: "",
  description: "",
  speech: "",
  outfit: "",
  appearance: "",
  voiceHint: "",
  isNarrator: false,
  ...over,
});

const input =
  "w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm placeholder:text-neutral-700";

/**
 * Pick the cast before building the outline.
 *
 * Three jobs in one place, because they are the same decision: take an existing
 * card, adjust it for this story, or type someone entirely new.
 *
 * Editing here does NOT touch the card. A card is the portable original; "the
 * Sam of this story" belongs to this story. To push an edit back to the library
 * there is a separate Save on the Characters page, once the story exists.
 *
 * Sends ONE `cast` field as JSON: the list varies in length, and a flat
 * `FormData` would need indexed field names that every reader has to reassemble.
 */
export function CastPicker() {
  const { data } = useApi<{ cards: Card[] }>("/api/character-cards");
  const cards = data?.cards ?? [];
  const [rows, setRows] = useState<Row[]>([]);

  const usedCardIds = new Set(rows.map((r) => r.cardId).filter(Boolean));

  function edit(key: string, patch: Partial<Row>) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return { ...r, ...(patch.isNarrator ? { isNarrator: false } : {}) };
        return { ...r, ...patch };
      }),
    );
  }

  function addCard(card: Card) {
    setRows((rs) => [
      ...rs,
      blank({
        cardId: card.id,
        name: card.name,
        role: card.role ?? "",
        description: card.description ?? "",
        speech: card.speech ?? "",
        outfit: card.outfit ?? "",
        appearance: card.appearance ?? "",
        voiceHint: card.voiceHint ?? "",
        // A card's narrator flag is only a default; a story still gets exactly
        // one, so a second card bringing it in is not accepted.
        isNarrator: card.isNarrator && !rs.some((r) => r.isNarrator),
      }),
    ]);
  }

  return (
    <div className="space-y-4">
      <input
        type="hidden"
        name="cast"
        value={JSON.stringify(
          rows
            .filter((r) => r.name.trim())
            .map(({ key: _key, ...r }) => r),
        )}
      />

      {cards.length > 0 && (
        <div>
          <span className="mb-1.5 block text-xs text-neutral-500">
            Cards in the library — click to add one
          </span>
          <div className="flex flex-wrap gap-2">
            {cards.map((card) => {
              const used = usedCardIds.has(card.id);
              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={used}
                  onClick={() => addCard(card)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    used
                      ? "border-neutral-800 bg-neutral-900 text-neutral-700"
                      : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500 hover:text-neutral-100"
                  }`}
                >
                  {card.name}
                  {card.isNarrator && <span className="ml-1 text-neutral-600">(narrates)</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.key} className="space-y-2 rounded border border-neutral-800 p-3">
              <div className="flex items-center gap-2">
                <input
                  value={r.name}
                  onChange={(e) => edit(r.key, { name: e.target.value })}
                  placeholder="Name"
                  className={input}
                />
                {r.cardId ? (
                  <Badge>from a card</Badge>
                ) : (
                  <Badge tone="blue">this story only</Badge>
                )}
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  className="shrink-0 text-xs text-neutral-500 underline hover:text-neutral-300"
                >
                  remove
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  value={r.role}
                  onChange={(e) => edit(r.key, { role: e.target.value })}
                  placeholder="Role in the story — e.g. coach driver, 45"
                  className={`${input} flex-1`}
                />
                <input
                  value={r.voiceHint}
                  onChange={(e) => edit(r.key, { voiceHint: e.target.value })}
                  placeholder="Voice — e.g. middle-aged man, hoarse"
                  className={`${input} flex-1`}
                />
              </div>

              <textarea
                value={r.description}
                onChange={(e) => edit(r.key, { description: e.target.value })}
                rows={2}
                placeholder="Personality — what drives their actions and choices."
                className={input}
              />

              <textarea
                value={r.speech}
                onChange={(e) => edit(r.key, { speech: e.target.value })}
                rows={2}
                placeholder="How they speak: rhythm, verbal habits, what they call people. This keeps their dialogue recognisable across dozens of episodes."
                className={input}
              />

              <textarea
                value={r.outfit}
                onChange={(e) => edit(r.key, { outfit: e.target.value })}
                rows={2}
                placeholder="What they usually wear — a default; chapter setup can override it."
                className={input}
              />

              <textarea
                value={r.appearance}
                onChange={(e) => edit(r.key, { appearance: e.target.value })}
                rows={2}
                placeholder="Looks that never change: build, apparent age, face, scars. Clothing goes in the chapter setup."
                className={input}
              />

              {/* Click again to clear: having nobody read the narration is normal,
                  and it then uses the story's default voice. A radio cannot
                  normally be cleared, so listen for click rather than change. */}
              <label className="flex items-center gap-2 text-xs text-neutral-400">
                <input
                  type="radio"
                  name="castNarrator"
                  checked={r.isNarrator}
                  onChange={() => {}}
                  onClick={() => edit(r.key, { isNarrator: !r.isNarrator })}
                />
                Reads the narration
                <span className="text-neutral-600">— optional, click again to clear</span>
              </label>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, blank()])}
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
        >
          + Character for this story only
        </button>
        {rows.length === 0 && (
          <span className="text-xs text-neutral-600">
            Leave empty and the AI invents the cast.
          </span>
        )}
      </div>

      {rows.length > 0 && (
        <p className="text-xs text-neutral-600">
          Editing here does <strong className="text-neutral-400">not</strong> touch the cards in
          the library. The AI must use these exact people, and may add more if the story needs
          them.
        </p>
      )}
    </div>
  );
}
