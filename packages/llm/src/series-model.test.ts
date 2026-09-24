import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Which story a queued job belongs to, and therefore which model writes it.
 *
 * The routes enqueue with whatever id the button sat next to — an episode, a
 * chapter, a scene, or for the outline the series itself. Get the walk wrong for one
 * of them and that one button keeps using the global default: the story carries on
 * in a different voice, mid-episode, with nothing raised anywhere.
 */
const SERIES = { s1: { model: "qwen3:32b" }, s2: { model: "   " } };

vi.mock("@audio/database", () => ({
  JobType: {
    OUTLINE: "OUTLINE",
    CHARACTER: "CHARACTER",
    NEXT_EPISODE: "NEXT_EPISODE",
    NEXT_CHAPTER: "NEXT_CHAPTER",
    NEXT_SCENE: "NEXT_SCENE",
    SCENE_BEAT: "SCENE_BEAT",
    WRITE_SCENE: "WRITE_SCENE",
    REVISE_PASSAGE: "REVISE_PASSAGE",
    TRANSLATE: "TRANSLATE",
    AUDIO_EDIT: "AUDIO_EDIT",
    SUMMARIZE: "SUMMARIZE",
    TTS: "TTS",
  },
  prisma: {
    series: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        SERIES[where.id as keyof typeof SERIES] ?? null,
    },
    // ep1 → s1, ch1 → ep1, sc1 → ch1. Deep enough to exercise every hop.
    episode: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "ep1" ? { series: SERIES.s1 } : null,
    },
    chapter: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "ch1" ? { episode: { series: SERIES.s1 } } : null,
    },
    scene: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "sc1" ? { chapter: { episode: { series: SERIES.s1 } } } : null,
    },
  },
}));

const { seriesModelFor, SERIES_MODEL_TYPES } = await import("./series-model");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const find = (type: string, episodeId: string | undefined, payload: Record<string, unknown>) =>
  seriesModelFor(type as any, episodeId, payload);

describe("finding the story behind a job", () => {
  beforeEach(() => {
    SERIES.s1.model = "qwen3:32b";
  });

  it("from the series itself — how the outline is queued", async () => {
    expect(await find("OUTLINE", undefined, { seriesId: "s1" })).toBe("qwen3:32b");
  });

  it("from the episode the job row carries", async () => {
    expect(await find("WRITE_SCENE", "ep1", {})).toBe("qwen3:32b");
  });

  it("from an episode id in the payload alone", async () => {
    expect(await find("NEXT_CHAPTER", undefined, { episodeId: "ep1" })).toBe("qwen3:32b");
  });

  it("from a chapter", async () => {
    expect(await find("SCENE_BEAT", undefined, { chapterId: "ch1" })).toBe("qwen3:32b");
  });

  it("from a scene, three hops up", async () => {
    expect(await find("WRITE_SCENE", undefined, { sceneId: "sc1" })).toBe("qwen3:32b");
  });

  it("covers revising a passage, which is prose the listener hears", async () => {
    // Left off this list when it was written, and nothing said so. A story on its own
    // model had its scenes written by that model and its passages revised by whatever
    // the Models page defaulted to — which on one machine could not write Vietnamese.
    expect(await find("REVISE_PASSAGE", undefined, { sceneId: "sc1" })).toBe("qwen3:32b");
  });

  it("covers planning a scene, as it already covered planning a chapter", async () => {
    expect(await find("NEXT_SCENE", "ep1", {})).toBe("qwen3:32b");
  });
});

describe("the list itself", () => {
  it("names only job types that exist", () => {
    // This mock is a hand-written subset of the real enum, so a name that is not in it
    // reads as `undefined` — which goes into the Set quietly and matches nothing. That
    // is how REVISE_PASSAGE could be added to the source and still fail every lookup,
    // and how a typo would look exactly like a deliberate omission.
    for (const type of SERIES_MODEL_TYPES) {
      expect(typeof type).toBe("string");
    }
  });
});

describe("when the story's model does not apply", () => {
  it("leaves the short utility steps on the default", async () => {
    // SUMMARIZE runs after every scene and nobody hears it. Handing it the story's
    // model pays story prices for a paragraph of bookkeeping.
    expect(await find("SUMMARIZE", "ep1", {})).toBeUndefined();
    expect(await find("TTS", "ep1", {})).toBeUndefined();
  });

  it("leaves translating on its own default, which was chosen for translating", async () => {
    // The one omission here that IS deliberate: the Models page has a translate model,
    // picked for that job, and a story's writing model would override it silently.
    expect(await find("TRANSLATE", "ep1", {})).toBeUndefined();
  });

  it("treats a blank model as no model, not as an empty name", async () => {
    // Sending "" to the provider is the one failure that reports something baffling
    // instead of pointing at the setting.
    expect(await find("WRITE_SCENE", undefined, { seriesId: "s2" })).toBeUndefined();
  });

  it("says nothing when the id leads nowhere", async () => {
    expect(await find("WRITE_SCENE", "gone", {})).toBeUndefined();
    expect(await find("WRITE_SCENE", undefined, {})).toBeUndefined();
  });
});
