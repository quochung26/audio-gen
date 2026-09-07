import { describe, expect, it } from "vitest";
import {
  DANGLING_FK_COLUMNS,
  forPublish,
  LOCAL_ONLY_TABLES,
  PRIVATE_COLUMNS,
  PUBLIC_TABLES,
  stripPrivate,
} from "./publish-scope";

/**
 * This is the privacy boundary: what is allowed to leave the production machine.
 * Get it wrong and drafts, the Story Bible and the prompts go onto the internet.
 */

describe("stripPrivate", () => {
  it("drops the Story Bible from Series", () => {
    const out = stripPrivate("Series", { id: "s1", title: "Đường về", storyBible: { world: {} } });
    expect(out).toEqual({ id: "s1", title: "Đường về" });
    expect("storyBible" in out).toBe(false);
  });

  it("drops the draft and the approver's trail from Episode", () => {
    const out = stripPrivate("Episode", {
      id: "e1",
      title: "Tập 1",
      draftText: "the entire draft",
      outline: { chapters: [] },
      reviewedBy: "hung",
      reviewedAt: new Date(),
      summary: "the public summary",
    });
    expect(out).toEqual({ id: "e1", title: "Tập 1", summary: "the public summary" });
  });

  it("drops the personality description from Character", () => {
    const out = stripPrivate("Character", { id: "c1", name: "Tài", description: "cách nói" });
    expect(out).toEqual({ id: "c1", name: "Tài" });
  });

  it("Export has nothing to drop", () => {
    const row = { id: "x1", url: "series/a/b.mp3", sizeBytes: 1 };
    expect(stripPrivate("Export", row)).toEqual(row);
  });
});

describe("forPublish", () => {
  it("nulls foreign keys pointing at local-only tables", () => {
    // Left in, the hosted DB fails on a constraint because it has no Voice table —
    // and only for characters that HAVE a voice, which is very easy to miss in testing.
    expect(forPublish("Character", { id: "c1", name: "Tài", voiceId: "v1" })).toEqual({
      id: "c1",
      name: "Tài",
      voiceId: null,
    });
  });

  it("nulls the background music on Episode", () => {
    expect(forPublish("Episode", { id: "e1", bgmTrackId: "t1", introTrackId: "t2" })).toMatchObject({
      bgmTrackId: null,
      introTrackId: null,
    });
  });

  it("nulls the default voice on Series", () => {
    expect(forPublish("Series", { id: "s1", defaultVoiceId: "v1" })).toEqual({
      id: "s1",
      defaultVoiceId: null,
    });
  });

  it("does BOTH: drops private columns AND nulls foreign keys", () => {
    const out = forPublish("Character", {
      id: "c1",
      name: "Tài",
      description: "private",
      voiceId: "v1",
    });
    expect(out).toEqual({ id: "c1", name: "Tài", voiceId: null });
  });

  it("never adds a column the record did not have", () => {
    // A record missing a column stays missing it, with no null inserted — inserting
    // one would overwrite the hosted value on upsert.
    expect(forPublish("Character", { id: "c1", name: "Tài" })).toEqual({ id: "c1", name: "Tài" });
  });
});

describe("the scope declaration", () => {
  it("every public table has an entry in both config tables", () => {
    for (const t of PUBLIC_TABLES) {
      expect(PRIVATE_COLUMNS[t], `PRIVATE_COLUMNS is missing ${t}`).toBeDefined();
      expect(DANGLING_FK_COLUMNS[t], `DANGLING_FK_COLUMNS is missing ${t}`).toBeDefined();
    }
  });

  it("a local-only table must not appear in the public list", () => {
    for (const t of LOCAL_ONLY_TABLES) {
      expect(PUBLIC_TABLES).not.toContain(t as never);
    }
  });

  it("the draft and the Story Bible are on the forbidden list — locked so nobody removes them", () => {
    expect(PRIVATE_COLUMNS.Episode).toContain("draftText");
    expect(PRIVATE_COLUMNS.Series).toContain("storyBible");
  });

  it("Prompt and LlmRun are local-only", () => {
    expect(LOCAL_ONLY_TABLES).toContain("Prompt");
    expect(LOCAL_ONLY_TABLES).toContain("LlmRun");
  });
});

describe("Block — the story's lines", () => {
  const row = {
    id: "b1",
    episodeId: "e1",
    order: 1,
    text: "Trời tối, xe chạy chậm lại.",
    speakerLabel: "narrator",
    characterId: "c1",
    pauseAfter: 400,
    ttsEngine: "KOKORO",
    voiceId: "vn-male-1",
    speed: 1.05,
    pitch: null,
    approved: true,
    sfxHint: "brakes",
    sfxTrackId: "t1",
    audioAssetId: "a1",
  };

  it("the LINE DOES go — it is what the MP3 says", () => {
    // Unlike `Episode.draftText`, the raw draft. An approved line published alongside
    // the audio is normal, and the player uses it for "Read the transcript".
    const out = forPublish("Block", row);
    expect(out.text).toBe("Trời tối, xe chạy chậm lại.");
    expect(out.speakerLabel).toBe("narrator");
    expect(out.order).toBe(1);
  });

  it("drops the production detail that can be dropped", () => {
    const out = forPublish("Block", row);
    for (const col of ["speed", "pitch", "approved", "sfxHint"]) {
      expect(out, `${col} does not need to leave the machine`).not.toHaveProperty(col);
    }
  });

  it("KEEPS ttsEngine and voiceId because they are NOT NULL on the hosted side", () => {
    // Not because they deserve publishing, but because the two DBs share one schema:
    // dropping a required column makes the hosted `create` fail with "Argument is missing".
    const out = forPublish("Block", row);
    expect(out.ttsEngine).toBe("KOKORO");
    expect(out.voiceId).toBe("vn-male-1");
  });

  it("nulls foreign keys pointing at unsynced tables", () => {
    const out = forPublish("Block", row);
    expect(out.sfxTrackId).toBeNull();
    expect(out.audioAssetId).toBeNull();
    // characterId STAYS: Character is on the sync list.
    expect(out.characterId).toBe("c1");
  });
});

describe("every public table is touched by the PUBLISH job", () => {
  it("no table falls through the gap", async () => {
    // A bug that happened: Block was in neither PUBLIC_TABLES nor LOCAL_ONLY_TABLES so
    // nothing synced it, and the transcript feature quietly disappeared.
    const { readFile } = await import("node:fs/promises");
    const job = await readFile(
      new URL("../../../apps/worker/src/jobs/publish.job.ts", import.meta.url),
      "utf8",
    );
    for (const t of PUBLIC_TABLES) {
      const model = t[0]!.toLowerCase() + t.slice(1);
      expect(job, `publish.job does not write table ${t}`).toContain(`prismaPlayer.${model}.upsert`);
    }
  });
});

describe("only columns the hosted DB tolerates missing may be dropped", () => {
  it("every column in PRIVATE_COLUMNS is nullable or has @default", async () => {
    // A bug that happened: dropping `Block.ttsEngine` (NOT NULL) killed the sync job
    // with "Argument `ttsEngine` is missing" — and only at run time, not at build
    // time. The two DBs share one schema, so a required column has to travel.
    const { readFile } = await import("node:fs/promises");
    const schema = await readFile(
      new URL("../prisma/schema.prisma", import.meta.url),
      "utf8",
    );

    for (const table of PUBLIC_TABLES) {
      const model = new RegExp(`^model ${table} \\{([\\s\\S]*?)^\\}`, "m").exec(schema)?.[1];
      expect(model, `model ${table} not found`).toBeDefined();

      for (const col of PRIVATE_COLUMNS[table]) {
        const line = model!
          .split("\n")
          .find((l) => new RegExp(`^\\s+${col}\\s`).test(l));
        expect(line, `${table}.${col} is not in the schema`).toBeDefined();

        const optional = /\?\s*($|\/\/)/.test(line!) || /\?\s/.test(line!);
        const hasDefault = line!.includes("@default");
        expect(
          optional || hasDefault,
          `${table}.${col} is NOT NULL with no @default — dropping it kills the sync job`,
        ).toBe(true);
      }
    }
  });
});
