import { describe, expect, it } from "vitest";
import {
  MAX_ITEMS,
  MIN_PROGRESS_MS,
  NEAR_END_MS,
  pickResumable,
  remaining,
  type ResumableEpisode,
} from "./resumable";

const ep = (id: string, durationMs: number | null = 1_200_000): ResumableEpisode => ({
  id,
  title: `Episode ${id}`,
  number: 1,
  durationMs,
  seriesTitle: "The Way Back",
  coverUrl: null,
});

describe("pickResumable", () => {
  it("nothing listened to shows nothing", () => {
    expect(pickResumable([ep("a"), ep("b")], {})).toEqual([]);
  });

  it("tapping in and leaving immediately does NOT count as partway through", () => {
    expect(pickResumable([ep("a")], { a: MIN_PROGRESS_MS - 1 })).toEqual([]);
    expect(pickResumable([ep("a")], { a: MIN_PROGRESS_MS })).toHaveLength(1);
  });

  it("listened almost to the end stops showing", () => {
    const d = 1_200_000;
    expect(pickResumable([ep("a", d)], { a: d - NEAR_END_MS + 1 })).toEqual([]);
    expect(pickResumable([ep("a", d)], { a: d - NEAR_END_MS - 1 })).toHaveLength(1);
  });

  it("an episode of unknown length still shows", () => {
    // A null durationMs means the mix is unfinished; there is no basis to call it finished.
    expect(pickResumable([ep("a", null)], { a: 60_000 })).toHaveLength(1);
  });

  it("the further in, the higher it ranks", () => {
    const r = pickResumable([ep("a"), ep("b"), ep("c")], { a: 100_000, b: 500_000, c: 300_000 });
    expect(r.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it(`caps at ${MAX_ITEMS} items`, () => {
    const eps = Array.from({ length: 20 }, (_, i) => ep(String(i)));
    const pos = Object.fromEntries(eps.map((e, i) => [e.id, 100_000 + i]));
    expect(pickResumable(eps, pos)).toHaveLength(MAX_ITEMS);
  });

  it("skips a position for an episode no longer in the list", () => {
    // An unpublished episode still has its old position in localStorage — that must not
    // produce an entry pointing at a 404.
    expect(pickResumable([ep("a")], { a: 100_000, "da-go": 500_000 })).toHaveLength(1);
  });

  it("keeps the episode data intact, only adding positionMs", () => {
    const [r] = pickResumable([ep("a")], { a: 100_000 });
    expect(r).toMatchObject({ id: "a", title: "Episode a", seriesTitle: "The Way Back", positionMs: 100_000 });
  });
});

describe("remaining", () => {
  it("rounds to whole minutes", () => {
    expect(remaining(1_200_000, 0)).toBe("20 min");
    expect(remaining(1_200_000, 600_000)).toBe("10 min");
  });

  it("under a minute is stated in words", () => {
    expect(remaining(1_200_000, 1_180_000)).toBe("under 1 minute");
  });

  it("an unknown length is not invented", () => {
    expect(remaining(null, 100_000)).toBe("—");
  });

  it("a position past the end never gives a negative", () => {
    expect(remaining(100_000, 200_000)).toBe("under 1 minute");
  });
});
