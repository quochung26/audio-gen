import { describe, expect, it } from "vitest";
import { parseOverrideLines } from "./chapter-setup";

describe("parseOverrideLines", () => {
  it("reads name, outfit and note", () => {
    expect(parseOverrideLines("Chloe: red silk blouse | heels off").overrides).toEqual([
      { name: "Chloe", outfit: "red silk blouse", note: "heels off" },
    ]);
  });

  it("the note is optional", () => {
    expect(parseOverrideLines("Adame: shirtsleeves").overrides).toEqual([
      { name: "Adame", outfit: "shirtsleeves", note: "" },
    ]);
  });

  it("REPORTS a line with no colon instead of swallowing it", () => {
    // The bug: this was dropped silently, the form said "Saved", and the scene came
    // back in the Story Bible's outfit with nothing to explain it.
    const r = parseOverrideLines("Chloe wears a black dress");
    expect(r.overrides).toEqual([]);
    expect(r.ignored).toEqual(["Chloe wears a black dress"]);
  });

  it("keeps the good lines and reports only the bad ones", () => {
    const r = parseOverrideLines("Chloe: red blouse\nAdame wears a grey suit\nElena: cardigan");
    expect(r.overrides.map((o) => o.name)).toEqual(["Chloe", "Elena"]);
    expect(r.ignored).toEqual(["Adame wears a grey suit"]);
  });

  it("a line that is only a colon has no name, so it is reported", () => {
    expect(parseOverrideLines(": red blouse").ignored).toEqual([": red blouse"]);
  });

  it("blank lines are not complained about", () => {
    const r = parseOverrideLines("Chloe: red blouse\n\n   \n");
    expect(r.overrides).toHaveLength(1);
    expect(r.ignored).toEqual([]);
  });

  it("Vietnamese names and prose survive intact", () => {
    expect(parseOverrideLines("Sư phụ Tòng: áo nâu bạc màu | tay trái băng bó").overrides).toEqual([
      { name: "Sư phụ Tòng", outfit: "áo nâu bạc màu", note: "tay trái băng bó" },
    ]);
  });
});
