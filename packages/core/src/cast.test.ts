import { describe, expect, it } from "vitest";
import { mergeCast, namesMentionedIn, normalizeCast, renderCastForOutline } from "./cast";

const tai = { name: "Tài", role: "tài xế xe khách", isNarrator: true };

describe("normalizeCast", () => {
  it("drops entries with no name", () => {
    expect(normalizeCast([tai, { name: "  " }, { name: "" }])).toHaveLength(1);
  });

  it("de-duplicates names CASE-INSENSITIVELY", () => {
    // `(seriesId, name)` is the unique constraint — two rows with one name is a job
    // dying at story creation, after the model call has already been paid for.
    const out = normalizeCast([{ name: "Tài" }, { name: "tài" }, { name: "TÀI " }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("Tài");
  });

  it("collapses extra whitespace in a name", () => {
    expect(normalizeCast([{ name: "ông   Bảy" }])[0]!.name).toBe("ông Bảy");
  });

  it("keeps EXACTLY ONE narrator, first one wins", () => {
    // With two, the audio edit step can assign narration blocks to either, and the
    // voice changes mid-story with nothing to say so.
    const out = normalizeCast([tai, { name: "Hạnh", isNarrator: true }]);
    expect(out.map((c) => c.isNarrator)).toEqual([true, false]);
  });

  it("empty fields become null, not an empty string", () => {
    expect(normalizeCast([{ name: "Tài", role: "  ", description: "" }])[0]).toMatchObject({
      role: null,
      description: null,
      voiceHint: null,
    });
  });
});

describe("renderCastForOutline", () => {
  it("nobody chosen returns empty — the prompt stays valid", () => {
    // Exactly like `renderWorldForOutline`: left blank, the model invents the
    // characters, which is the old behaviour.
    expect(renderCastForOutline([])).toBe("");
    expect(renderCastForOutline([{ name: " " }])).toBe("");
  });

  it("names name, role, personality, speech, appearance and voice", () => {
    const out = renderCastForOutline([
      {
        name: "Tài",
        role: "tài xế",
        description: "lì",
        speech: "cộc lốc",
        appearance: "gầy, da sạm",
        outfit: "áo sơ mi bạc",
        voiceHint: "nam trung niên",
      },
    ]);
    expect(out).toContain("Tài");
    expect(out).toContain("tài xế");
    expect(out).toContain("lì");
    expect(out).toContain("cộc lốc");
    expect(out).toContain("gầy, da sạm");
    expect(out).toContain("áo sơ mi bạc");
    expect(out).toContain("nam trung niên");
  });

  it("says outright NOT to rename — where models take the most liberties", () => {
    expect(renderCastForOutline([tai])).toMatch(/Do not rename/i);
  });

  it("says NOTHING about a narrator", () => {
    // Who reads the narration is the audio step's business, and that step may never
    // run. Telling the model a character is "the narrator" also pushes it toward
    // them telling the story, while write-scene asks for third person.
    expect(renderCastForOutline([tai])).not.toMatch(/narrator/i);
  });

  it("forbids inventing anyone else — a chosen cast is the whole cast", () => {
    // Having configured the cast, the writer has said who is in the story. Every
    // extra is one more Character row to delete, and it lands in the Story Bible.
    expect(renderCastForOutline([tai])).toMatch(/NOBODY ELSE/);
    expect(renderCastForOutline([tai])).not.toMatch(/may add more/i);
  });
});

describe("mergeCast", () => {
  const generated = [
    { name: "Tài", role: "tài xế đường dài", voiceHint: "nam trung niên", isNarrator: true },
    { name: "Cô gái áo trắng", role: "hành khách bí ẩn", voiceHint: "nữ trẻ" },
  ];

  it("DROPS characters the model added on top of a chosen cast", () => {
    // The model is told not to add anyone and adds someone anyway. What the writer
    // configured is the cast; dropping here is what makes the instruction stick.
    expect(mergeCast([{ name: "Tài" }], generated).map((c) => c.name)).toEqual(["Tài"]);
  });

  it("a cast of nothing but blank names counts as nobody chosen", () => {
    // Otherwise the writer gets a story with no characters at all: the model's cast
    // dropped against a "chosen" list that normalizes away to nothing.
    expect(mergeCast([{ name: "  " }], generated).map((c) => c.name)).toEqual([
      "Tài",
      "Cô gái áo trắng",
    ]);
  });

  it("whatever the writer typed wins", () => {
    const out = mergeCast([{ name: "Tài", role: "thợ điện" }], generated);
    expect(out[0]!.role).toBe("thợ điện");
  });

  it("fields the writer LEFT BLANK take the model's suggestion", () => {
    // Picking a card that only has a name still has to yield a usable character.
    const out = mergeCast([{ name: "Tài" }], generated);
    expect(out[0]).toMatchObject({ role: "tài xế đường dài", voiceHint: "nam trung niên" });
  });

  it("preserves the cardId of the chosen card", () => {
    expect(mergeCast([{ name: "Tài", cardId: "card_1" }], generated)[0]!.cardId).toBe("card_1");
  });

  it("a narrator flag from the model is NOT accepted", () => {
    // Outlining no longer decides who reads the narration. Old data or a stubborn
    // model can still return that flag, and it has to be ignored.
    expect(mergeCast([{ name: "Tài" }], generated)[0]!.isNarrator).toBe(false);
  });

  it("a narrator the writer named is NOT changed by the model", () => {
    // The model flags Tài; the writer picked Cô gái áo trắng. Unsettled, the winner
    // depends on de-duplication order — silent, and different between runs.
    const out = mergeCast(
      [{ name: "Tài" }, { name: "Cô gái áo trắng", isNarrator: true }],
      generated,
    );
    expect(out.find((c) => c.isNarrator)?.name).toBe("Cô gái áo trắng");
    expect(out.filter((c) => c.isNarrator)).toHaveLength(1);
  });

  it("does NOT assign a narrator when nobody was chosen", () => {
    // The narrator is the audio step's casting slot. Grabbing the first one means a
    // whole story could be narrated by a young woman's voice with nobody deciding
    // that — the order depends on what the model happened to return first.
    const out = mergeCast([], [{ name: "Tài" }, { name: "Hạnh" }]);
    expect(out.some((c) => c.isNarrator)).toBe(false);
  });

  it("with the writer's choice, exactly one is still kept", () => {
    const out = mergeCast([{ name: "Tài", isNarrator: true }], [{ name: "Hạnh" }]);
    expect(out.filter((c) => c.isNarrator).map((c) => c.name)).toEqual(["Tài"]);
  });

  it("a completely empty cast returns empty rather than throwing", () => {
    expect(mergeCast([], [])).toEqual([]);
  });

  it("nobody chosen behaves as before: only the model's cast", () => {
    expect(mergeCast([], generated).map((c) => c.name)).toEqual(["Tài", "Cô gái áo trắng"]);
  });
});

describe("namesMentionedIn — guessing who is present in a beat", () => {
  const names = ["Tài", "ông Bảy", "Cô gái áo trắng"];

  it("catches a name appearing in the beat", () => {
    const out = namesMentionedIn("Tài quay lại Bến Cũ và gặp ông Bảy.", names);
    expect(out).toContain("Tài");
    expect(out).toContain("ông Bảy");
  });

  it("is case-insensitive", () => {
    expect(namesMentionedIn("TÀI dừng xe.", names)).toContain("Tài");
  });

  it("a beat naming nobody returns empty — the scene stays 'not known'", () => {
    // Empty means the Bible loads in full as before. Guessing short only loses the
    // filtering; it never leaves the model writing a scene missing its people.
    expect(namesMentionedIn("Mưa suốt đêm ngoài quốc lộ.", names)).toEqual([]);
  });

  it("tests LONGER names first", () => {
    // With "ông Bảy" in the cast, a beat mentioning "ông Bảy" has to resolve to them.
    const out = namesMentionedIn("ông Bảy gác bến.", ["Bảy", "ông Bảy"]);
    expect(out[0]).toBe("ông Bảy");
  });

  it("an empty character list does not throw", () => {
    expect(namesMentionedIn("Tài dừng xe.", [])).toEqual([]);
  });
});
