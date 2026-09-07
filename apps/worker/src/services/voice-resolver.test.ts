import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Choosing a voice — and above all NOT choosing one in the wrong language.
 *
 * A Vietnamese voice reading English prose is unlistenable, and that kind of failure
 * raises no error: it only shows up when listening back to a whole episode.
 */
interface Row {
  id: string;
  engine: string;
  externalVoiceId: string;
  name: string;
  language: string;
  enabled: boolean;
  commercialOk: boolean;
  createdAt: Date;
}

let rows: Row[] = [];

vi.mock("@audio/database", () => ({
  prisma: {
    voice: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.find((r) => r.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { engine: string; language: string } }) =>
        rows.find(
          (r) => r.engine === where.engine && r.enabled && r.language === where.language,
        ) ?? null,
      count: async ({ where }: { where: { engine: string } }) =>
        rows.filter((r) => r.engine === where.engine && r.enabled).length,
    },
  },
}));

vi.mock("@audio/config", () => ({ loadEnv: () => ({ TTS_PROVIDER: "mock" }) }));

const { resolveVoice } = await import("./voice-resolver");

function voice(over: Partial<Row> & { id: string }): Row {
  return {
    engine: "MOCK",
    externalVoiceId: `ext-${over.id}`,
    name: over.id,
    language: "vi",
    enabled: true,
    commercialOk: true,
    createdAt: new Date("2026-01-01"),
    ...over,
  };
}

beforeEach(() => {
  rows = [voice({ id: "vi-1" }), voice({ id: "vi-2" }), voice({ id: "en-1", language: "en" })];
});

describe("resolveVoice", () => {
  it("the character's casting beats the story's default voice", async () => {
    const r = await resolveVoice({
      characterVoiceId: "vi-2",
      seriesDefaultVoiceId: "vi-1",
      language: "vi",
    });
    expect(r.externalVoiceId).toBe("ext-vi-2");
  });

  it("with no casting of their own it takes the story's default", async () => {
    const r = await resolveVoice({ seriesDefaultVoiceId: "vi-1", language: "vi" });
    expect(r.externalVoiceId).toBe("ext-vi-1");
  });

  it("with no casting at all it takes the first voice in the RIGHT LANGUAGE", async () => {
    expect((await resolveVoice({ language: "en" })).externalVoiceId).toBe("ext-en-1");
    expect((await resolveVoice({ language: "vi" })).externalVoiceId).toBe("ext-vi-1");
  });

  it("SKIPS wrong-language casting, even one the writer set by hand", async () => {
    // A Vietnamese voice reading English prose fails silently — better to skip the
    // writer's choice than to ship an unlistenable episode.
    const r = await resolveVoice({ characterVoiceId: "vi-1", language: "en" });
    expect(r.externalVoiceId).toBe("ext-en-1");
  });

  it("a disabled voice is not used", async () => {
    rows = [voice({ id: "vi-1", enabled: false }), voice({ id: "vi-2" })];
    expect((await resolveVoice({ characterVoiceId: "vi-1", language: "vi" })).externalVoiceId).toBe(
      "ext-vi-2",
    );
  });

  it("with no voice in the right language it STOPS, naming the missing language", async () => {
    rows = [voice({ id: "vi-1" })];
    await expect(resolveVoice({ language: "en" })).rejects.toThrow(/"en"/);
  });

  it("also says there are voices in other languages, so the Voice table does not look empty", async () => {
    rows = [voice({ id: "vi-1" }), voice({ id: "vi-2" })];
    await expect(resolveVoice({ language: "en" })).rejects.toThrow(/2 voices in other languages/);
  });

  it("an empty Voice table only suggests running the seed, with nothing superfluous", async () => {
    rows = [];
    await expect(resolveVoice({ language: "vi" })).rejects.toThrow(/db:seed/);
    await expect(resolveVoice({ language: "vi" })).rejects.not.toThrow(/voices in other languages/);
  });

  it("the engine comes from the Voice record, never hardcoded", async () => {

    rows = [voice({ id: "k-1", engine: "KOKORO", language: "en" })];
    // voice from another engine.
    await expect(resolveVoice({ language: "en" })).rejects.toThrow();
  });
});
