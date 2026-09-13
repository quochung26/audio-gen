import { describe, expect, it } from "vitest";
import { beatProblems, BEAT_MAX_WORDS } from "./beat";

const kinds = (beat: string) => beatProblems(beat).map((p) => p.kind);

describe("beatProblems", () => {
  it("passes a beat that reads like a beat", () => {
    expect(kinds("Thiện lao tới khống chế Vũ, nhưng khí đen đẩy anh văng ra.")).toEqual([]);
  });

  it("catches spoken dialogue", () => {
    // The real one this was written for: two rerolls of SCENE_BEAT turned an instruction
    // into a scene with stage directions.
    expect(
      kinds(`Chloe storms in and slams a file down. 'I just lost the Nakamura deal,' she seethes.`),
    ).toContain("dialogue");
  });

  it("catches curly quotes and guillemets too", () => {
    expect(kinds('She turns at the door. “You knew all along.”')).toContain("dialogue");
    expect(kinds("Anh dừng lại. «Đừng đi.»")).toContain("dialogue");
  });

  it("does NOT flag an apostrophe inside a word", () => {
    // "Adame's office" is the common English case, and rejecting it would reject most
    // correct beats that name a possessive.
    expect(kinds("Chloe storms into Adame's office and drops the team's file on his desk.")).toEqual(
      [],
    );
  });

  it("does not flag a quote mid-word or a lowercase one", () => {
    expect(kinds("He calls it the 'depot' out of habit, and nobody corrects him.")).toEqual([]);
  });

  it("catches a beat that has become a scene", () => {
    const long = Array.from({ length: BEAT_MAX_WORDS + 1 }, (_, i) => `word${i}`).join(" ");
    expect(kinds(long)).toEqual(["too-long"]);
  });

  it("accepts a beat exactly at the ceiling", () => {
    const atLimit = Array.from({ length: BEAT_MAX_WORDS }, (_, i) => `word${i}`).join(" ");
    expect(kinds(atLimit)).toEqual([]);
  });

  it("reports both problems when both apply", () => {
    const long = Array.from({ length: BEAT_MAX_WORDS }, (_, i) => `word${i}`).join(" ");
    expect(kinds(`She stops. “Don't.” ${long}`).sort()).toEqual(["dialogue", "too-long"]);
  });

  it("ignores surrounding whitespace", () => {
    expect(kinds("   Vũ biến mất trong chớp sáng.   ")).toEqual([]);
  });
});
