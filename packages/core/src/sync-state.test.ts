import { describe, expect, it } from "vitest";
import { syncState, type SyncInput } from "./sync-state";

const T = (ms: number) => new Date(1_700_000_000_000 + ms);

const base: SyncInput = {
  status: "PUBLISHED",
  syncedAt: T(10_000),
  episodeUpdatedAt: T(0),
  blocksUpdatedAt: T(0),
  exportsUpdatedAt: T(0),
};

describe("syncState", () => {
  it("unpublished is never checked for drift", () => {
    expect(syncState({ ...base, status: "READY", syncedAt: null })).toBe("not published");
  });

  it("published but never synced", () => {
    expect(syncState({ ...base, syncedAt: null })).toBe("never synced");
  });

  it("nothing edited after a sync is clean", () => {
    expect(syncState(base)).toBe("in sync");
  });

  it("editing the TITLE after a sync → out of date", () => {
    expect(syncState({ ...base, episodeUpdatedAt: T(60_000) })).toBe("out of date");
  });

  it("rebuilding the SCRIPT after a sync → out of date", () => {
    // Looking only at Episode.updatedAt misses this kind.
    expect(syncState({ ...base, blocksUpdatedAt: T(60_000) })).toBe("out of date");
  });

  it("re-exporting the MP3 after a sync → out of date", () => {
    expect(syncState({ ...base, exportsUpdatedAt: T(60_000) })).toBe("out of date");
  });

  it("just synced — the two stamps EQUAL — is clean", () => {
    // The job sets updatedAt to exactly syncedAt when it stamps, so this is the
    // situation immediately after every sync.
    expect(syncState({ ...base, episodeUpdatedAt: base.syncedAt! })).toBe("in sync");
  });

  it("an edit IMMEDIATELY after a sync still has to be caught", () => {
    // There used to be a 5-second tolerance here and it hid exactly this — editing
    // the title a second after a sync still reported "in sync".
    expect(syncState({ ...base, episodeUpdatedAt: T(10_001) })).toBe("out of date");
  });

  it("an episode with no blocks or exports still evaluates", () => {
    expect(syncState({ ...base, blocksUpdatedAt: null, exportsUpdatedAt: null })).toBe(
      "in sync",
    );
  });

  it("takes the NEWEST of the three sources", () => {
    expect(
      syncState({ ...base, episodeUpdatedAt: T(0), blocksUpdatedAt: T(0), exportsUpdatedAt: T(99_000) }),
    ).toBe("out of date");
  });
});
