import { useRef, useState } from "react";
import { useApi } from "@/lib/api";
import { ErrorNote } from "@/components/Form";
import {
  CharacterFields,
  EMPTY_CHARACTER,
  type CharacterValues,
} from "@/components/CharacterFields";
import { Badge } from "@/components/ui";
import { useAutoCharacter, type AutoCharacter } from "@/lib/auto-character";

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
interface Row extends CharacterValues {
  key: string;
  cardId: string | null;
  isNarrator: boolean;
}

const blank = (over: Partial<Row> = {}): Row => ({
  ...EMPTY_CHARACTER,
  key: crypto.randomUUID(),
  cardId: null,
  isNarrator: false,
  ...over,
});

/**
 * The `cast` field, as the API reads it.
 *
 * Unnamed rows are dropped rather than sent: a row exists the moment you press add,
 * and a half-typed form should not create a character with no name.
 */
function castJson(rows: readonly Row[]): string {
  return JSON.stringify(
    rows.filter((r) => r.name.trim()).map(({ key: _key, ...r }) => r),
  );
}

/** A generated character as a row. Blanks stay blank rather than becoming "null". */
function fromAuto(c: AutoCharacter): Partial<Row> {
  return {
    name: c.name,
    role: c.role ?? "",
    description: c.description ?? "",
    speech: c.speech ?? "",
    outfit: c.outfit ?? "",
    appearance: c.appearance ?? "",
    voiceHint: c.voiceHint ?? "",
  };
}

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
  const auto = useAutoCharacter();
  const root = useRef<HTMLDivElement>(null);

  const usedCardIds = new Set(rows.map((r) => r.cardId).filter(Boolean));

  /**
   * The New story form as it stands, so the model reads the idea, genre and world
   * setup being typed rather than inventing someone for a story it cannot see.
   *
   * `except` drops one row from the cast that goes down: auto-filling a row must not
   * also tell the model that row's name is taken, or it renames the person the writer
   * just named.
   */
  function formData(except?: string): FormData | null {
    const form = root.current?.closest("form");
    if (!form) return null;
    const fd = new FormData(form);
    if (except !== undefined) fd.set("cast", castJson(rows.filter((r) => r.key !== except)));
    return fd;
  }

  /** Invent a whole new person and add them to the list. */
  async function addAuto() {
    const fd = formData();
    if (!fd) return;
    const c = await auto.run(fd);
    if (c) setRows((rs) => [...rs, blank(fromAuto(c))]);
  }

  /** Finish a row the writer started. What they typed goes down and comes back untouched. */
  async function fillRow(r: Row) {
    const fd = formData(r.key);
    if (!fd) return;
    for (const k of ["name", "role", "description", "speech", "outfit", "appearance", "voiceHint"] as const) {
      fd.set(k, r[k]);
    }
    const c = await auto.run(fd);
    if (c) edit(r.key, fromAuto(c));
  }

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
    <div ref={root} className="space-y-4">
      <input type="hidden" name="cast" value={castJson(rows)} />

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
            <div key={r.key} className="space-y-3 rounded border border-neutral-800 p-3">
              <div className="flex items-center gap-2">
                {r.cardId ? <Badge>from a card</Badge> : <Badge tone="blue">this story only</Badge>}
                <span className="flex-1" />
                {/* Fills only what is still blank — see fillBlanks in @audio/core. */}
                <button
                  type="button"
                  disabled={auto.pending}
                  onClick={() => void fillRow(r)}
                  className="shrink-0 text-xs text-neutral-500 underline hover:text-neutral-300 disabled:opacity-40"
                >
                  {auto.pending ? "…" : "auto-fill"}
                </button>
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  className="shrink-0 text-xs text-neutral-500 underline hover:text-neutral-300"
                >
                  remove
                </button>
              </div>

              <CharacterFields value={r} onChange={(patch) => edit(r.key, patch)} />

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
        {/* The outline no longer invents anybody once a cast is picked, so asking for
            one has to be a button. It reads the idea and world setup above. */}
        <button
          type="button"
          disabled={auto.pending}
          onClick={() => void addAuto()}
          className="rounded border border-dashed border-neutral-700 px-3 py-1.5 text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 disabled:opacity-40"
        >
          {auto.pending ? "Writing…" : "✦ Let the AI write one"}
        </button>
        {rows.length === 0 && (
          <span className="text-xs text-neutral-600">
            Leave empty and the AI invents the cast.
          </span>
        )}
      </div>

      <ErrorNote error={auto.error} />

      {rows.length > 0 && (
        <p className="text-xs text-neutral-600">
          Editing here does <strong className="text-neutral-400">not</strong> touch the cards in
          the library. The AI uses these exact people and{" "}
          <strong className="text-neutral-400">adds nobody</strong> — press “Let the AI write one”
          for anyone else you want.
        </p>
      )}
    </div>
  );
}
