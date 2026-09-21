import { describe, expect, it } from "vitest";
import { storyEnding, wouldBlock, type EndingFacts } from "./ending";

const facts = (over: Partial<EndingFacts> = {}): EndingFacts => ({
  episodes: 10,
  unapproved: 0,
  unwritten: 0,
  openThreads: 0,
  finaleFrom: null,
  ...over,
});

describe("storyEnding", () => {
  it("a story with nothing in it is empty, not open", () => {
    expect(storyEnding(facts({ episodes: 0 }))).toEqual({ kind: "empty" });
  });

  // The whole reason `COMPLETED` was never set: the next episode is always one button
  // away, so "no more are coming" is not a fact any code can read off the data.
  it("stays open until somebody says it is closing, however finished it looks", () => {
    expect(storyEnding(facts({ unapproved: 0, openThreads: 0 }))).toEqual({ kind: "open" });
  });

  it("is finished once it is closing and every episode is approved", () => {
    expect(storyEnding(facts({ finaleFrom: 9 }))).toEqual({ kind: "finished", warnings: [] });
  });

  describe("what stands in the way", () => {
    it("an unwritten episode", () => {
      const v = storyEnding(facts({ finaleFrom: 9, unwritten: 2 }));
      expect(v).toMatchObject({ kind: "closing" });
      expect(v.kind === "closing" && v.blocking[0]).toContain("2 episodes still have no draft");
    });

    it("a draft nobody has read", () => {
      const v = storyEnding(facts({ finaleFrom: 9, unapproved: 1 }));
      expect(v.kind === "closing" && v.blocking[0]).toContain("1 draft nobody has approved");
    });

    // A story is a writing artefact; the MP3 is production. Neither is in EndingFacts.
    it("does not wait for audio", () => {
      expect(storyEnding(facts({ finaleFrom: 9 })).kind).toBe("finished");
    });
  });

  describe("debts the story never paid", () => {
    // ainovel-cli learned this the expensive way: a declared finale that missed one
    // foreshadow was locked out of its terminal state and burned 140 chapters failing to
    // reach a gate it could no longer satisfy.
    it("warns about them but does not block a declared ending", () => {
      const v = storyEnding(facts({ finaleFrom: 9, openThreads: 3 }));
      expect(v.kind).toBe("finished");
      expect(v.kind === "finished" && v.warnings[0]).toContain("3 open threads");
    });

    it("says nothing when the story paid them all", () => {
      expect(storyEnding(facts({ finaleFrom: 9 }))).toEqual({ kind: "finished", warnings: [] });
    });
  });

  // Clear the declaration and the story is open again — there is no separate reopen,
  // because the state is always derivable from the declaration plus the episodes.
  it("comes undone by withdrawing the declaration", () => {
    expect(storyEnding(facts({ finaleFrom: null, openThreads: 3 })).kind).toBe("open");
  });
});

describe("wouldBlock", () => {
  it("says what would be in the way before anyone commits to it", () => {
    expect(wouldBlock(facts({ unapproved: 2 }))[0]).toContain("2 drafts");
  });

  it("says nothing when the story could close today", () => {
    expect(wouldBlock(facts())).toEqual([]);
  });
});
