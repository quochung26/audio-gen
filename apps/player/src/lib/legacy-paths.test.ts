import { describe, expect, it } from "vitest";
import { renamedPath, renamedQuery } from "./legacy-paths";

/**
 * These redirects are the only thing keeping already-published podcast feed URLs and
 * listeners' bookmarks alive. Breaking one is silent: the feed simply stops updating in
 * someone's app, and nobody reports it.
 */
describe("renamedPath", () => {
  it("moves each old path to its new name", () => {
    expect(renamedPath("/truyen/chuyen-xe")).toBe("/story/chuyen-xe");
    expect(renamedPath("/nghe/abc123")).toBe("/listen/abc123");
    expect(renamedPath("/yeu-thich")).toBe("/favourites");
    expect(renamedPath("/dang-nhap")).toBe("/sign-in");
    expect(renamedPath("/dang-ky")).toBe("/sign-up");
  });

  it("keeps everything after the renamed segment", () => {
    // The feed URL is the one that matters most — podcast apps re-fetch it for years.
    expect(renamedPath("/truyen/duong-ve/rss.xml")).toBe("/story/duong-ve/rss.xml");
  });

  it("does NOT touch a slug that merely starts with an old name", () => {
    // A story slugged `truyen-ma` is an ordinary thing to publish. A prefix match would
    // redirect it to `/story-ma`, which exists nowhere.
    expect(renamedPath("/truyen-ma")).toBeNull();
    expect(renamedPath("/nghenhac")).toBeNull();
  });

  it("does not touch a path that is already new", () => {
    expect(renamedPath("/story/chuyen-xe")).toBeNull();
    expect(renamedPath("/listen/abc")).toBeNull();
    expect(renamedPath("/")).toBeNull();
  });

  it("does not eat an old name appearing deeper in the path", () => {
    // Only the leading segment is the route; `truyen` further in is a slug.
    expect(renamedPath("/story/nghe")).toBeNull();
  });

  it("matches the longer name first", () => {
    // `/dang-ky` and `/dang-nhap` share a prefix; ordering decides which wins.
    expect(renamedPath("/dang-nhap")).toBe("/sign-in");
    expect(renamedPath("/dang-ky")).toBe("/sign-up");
  });
});

describe("renamedQuery", () => {
  it("renames the old parameters", () => {
    expect(renamedQuery("?the-loai=kinh+d%E1%BB%8B")).toBe("genre=kinh+d%E1%BB%8B");
    expect(renamedQuery("?tieng=en")).toBe("lang=en");
  });

  it("keeps parameters it does not know about", () => {
    expect(renamedQuery("?the-loai=x&autoplay=1")).toContain("autoplay=1");
  });

  it("returns null when there is nothing to rename", () => {
    // null rather than "" so the caller can tell "no change" from "now empty".
    expect(renamedQuery("?genre=x")).toBeNull();
    expect(renamedQuery("")).toBeNull();
  });

  it("renames both at once", () => {
    const out = renamedQuery("?the-loai=x&tieng=en");
    expect(out).toContain("genre=x");
    expect(out).toContain("lang=en");
    expect(out).not.toContain("the-loai");
    expect(out).not.toContain("tieng");
  });
});
