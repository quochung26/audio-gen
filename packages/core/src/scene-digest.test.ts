import { describe, expect, it } from "vitest";
import { sceneInputDigest, type SceneInputs } from "./scene-digest";

const base: SceneInputs = {
  bible: { world: { setting: "Bến Cũ, một đêm mưa" }, bible: "..." },
  cast: [
    { name: "Tài", role: "tài xế", description: "lì lợm" },
    { name: "Ánh", role: "hành khách", description: "đã chết ba năm" },
  ],
  beat: "Tài đón một hành khách ở bến vắng.",
  forbidden: ["Tài chưa được biết ai đặt vé"],
  continuity: ["Tay trái Ánh vẫn băng bó"],
  chapterSetup: { focus: "gặp gỡ", mustHappen: ["Ánh lên xe"] },
  sceneSetup: { note: "mưa suốt cảnh" },
  previousText: "Chiếc xe dừng lại.",
  previousSummary: "Tài lái chuyến cuối trong đêm.",
  prompt: "Write one scene of about {{targetWords}} words.",
};

describe("sceneInputDigest", () => {
  it("gives the same digest for the same material", () => {
    expect(sceneInputDigest(base)).toBe(sceneInputDigest({ ...base }));
  });

  it("ignores the order the cast arrives in", () => {
    const reversed = { ...base, cast: [...base.cast].reverse() };
    expect(sceneInputDigest(reversed)).toBe(sceneInputDigest(base));
  });

  it("ignores the key order of a setup, which jsonb does not preserve", () => {
    const reordered = {
      ...base,
      chapterSetup: { mustHappen: ["Ánh lên xe"], focus: "gặp gỡ" },
    };
    expect(sceneInputDigest(reordered)).toBe(sceneInputDigest(base));
  });

  it("treats null and an empty string as the same absence", () => {
    const empty = { ...base, previousText: null };
    const blank = { ...base, previousText: "   " };
    expect(sceneInputDigest(empty)).toBe(sceneInputDigest(blank));
  });

  // Every one of these is a thing a person edits and then wants to find the scenes that
  // predate the edit. A field that stopped moving the digest would fail silently.
  it.each([
    ["the Bible", { bible: { world: { setting: "somewhere else" } } }],
    ["a character's description", { cast: [{ name: "Tài", description: "mềm yếu" }] }],
    ["the beat", { beat: "Tài bỏ chuyến cuối." }],
    ["what the scene must not do", { forbidden: ["Không được kết chương ở đây"] }],
    ["what it has to stay consistent with", { continuity: [] }],
    ["the chapter setup", { chapterSetup: { focus: "chia tay" } }],
    ["the scene setup", { sceneSetup: { note: "trời khô" } }],
    ["the scene before it", { previousText: "Chiếc xe lao đi." }],
    ["the running summary", { previousSummary: "Tài đã về nhà." }],
    ["the prompt", { prompt: "Write two scenes." }],
  ])("changes when %s changes", (_what, patch) => {
    expect(sceneInputDigest({ ...base, ...(patch as Partial<SceneInputs>) })).not.toBe(
      sceneInputDigest(base),
    );
  });

  it("is short enough to read in a terminal", () => {
    expect(sceneInputDigest(base)).toMatch(/^[0-9a-f]{16}$/);
  });
});
