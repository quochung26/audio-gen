import { createHash } from "node:crypto";

/**
 * The material one scene was written from.
 *
 * Every field here is something a PERSON edits: the Bible on the Bible page, the beat
 * and the setups on the episode page, the prompt on the Prompts page — plus the prose
 * immediately before the scene, which moves when an earlier scene is rewritten.
 *
 * `Character.state` is deliberately NOT in it. State advances as the story is written,
 * which is the whole point of the column; hashing it would mark every earlier scene
 * stale each time a later episode moved somebody on. That is noise, not signal.
 *
 * Neither are the retrieved facts or the open threads. They are derived from what is
 * already here plus earlier episodes, and retrieval is not bit-stable — re-embedding
 * the story would report every scene stale without a word of it having changed.
 */
export interface SceneInputs {
  /** The Story Bible as stored on the series. */
  bible: unknown;
  /** The cast. Descriptive fields only — see above about `state`. */
  cast: Array<{
    name: string;
    role?: string | null;
    description?: string | null;
    speech?: string | null;
    outfit?: string | null;
    appearance?: string | null;
  }>;
  beat: string;
  /** The beat's contract — as much part of the assignment as the beat itself. */
  forbidden: string[];
  continuity: string[];
  chapterSetup: unknown;
  sceneSetup: unknown;
  /** The scene immediately before this one in reading order, in full. */
  previousText: string | null;
  /** The running paragraph this scene was written on top of — see Scene.storySoFar. */
  previousSummary: string | null;
  /** The WRITE_SCENE prompt this story's genre uses. */
  prompt: string;
}

/**
 * A short hash of everything a scene was written from.
 *
 * Stored on the scene when it is written; recomputed from the current rows when the
 * episode page is loaded. The two disagreeing means the scene says something the story
 * no longer does — the Bible moved, the beat was retyped, the scene before it was
 * rewritten — and nothing else in the system notices that on its own.
 *
 * Sixteen hex characters: this is a changed/unchanged flag, not a content address, and
 * a full 64 makes the column unreadable in psql for nothing.
 */
export function sceneInputDigest(inputs: SceneInputs): string {
  // Sorted HERE rather than trusted from the caller: the worker orders the cast
  // narrator-first for the Bible and the API orders it by name, and a digest that
  // depended on that would report every scene stale forever.
  //
  // Compared by code unit, NOT `localeCompare`: that reads the machine's locale, and
  // Vietnamese names sort differently under vi and under en. The digest has to be the
  // same number on the worker's machine and on the API's.
  const cast = inputs.cast
    .map((c) => ({
      name: c.name,
      role: c.role ?? "",
      description: c.description ?? "",
      speech: c.speech ?? "",
      outfit: c.outfit ?? "",
      appearance: c.appearance ?? "",
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const material = stableStringify({
    bible: inputs.bible ?? null,
    cast,
    beat: inputs.beat.trim(),
    forbidden: inputs.forbidden.map((f) => f.trim()).filter(Boolean),
    continuity: inputs.continuity.map((f) => f.trim()).filter(Boolean),
    chapterSetup: inputs.chapterSetup ?? null,
    sceneSetup: inputs.sceneSetup ?? null,
    previousText: (inputs.previousText ?? "").trim(),
    previousSummary: (inputs.previousSummary ?? "").trim(),
    prompt: inputs.prompt.trim(),
  });

  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

/**
 * JSON with object keys in a fixed order.
 *
 * `JSON.stringify` keeps insertion order, and the setups arrive as `jsonb` — Postgres
 * returns those keys in its own order, which is not the order they were written in.
 * Hashing the raw output would make the digest depend on how the row came back.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
