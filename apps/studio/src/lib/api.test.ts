import { describe, expect, it } from "vitest";
import { mediaUrl } from "./api";

describe("mediaUrl", () => {
  it("a storage key goes through the route as the key param", () => {
    expect(mediaUrl("series/abc/blocks/x.wav")).toBe(
      "/api/audio?key=series%2Fabc%2Fblocks%2Fx.wav",
    );
  });

  it("an http URL is used as-is, not routed", () => {
    expect(mediaUrl("https://cdn.example.com/a.mp3")).toBe("https://cdn.example.com/a.mp3");
    expect(mediaUrl("http://cdn.example.com/a.mp3")).toBe("http://cdn.example.com/a.mp3");
  });

  it("old file:// data still plays, via the path param", () => {
    expect(mediaUrl("file:///Users/ai-do/x.wav")).toBe(
      "/api/audio?path=%2FUsers%2Fai-do%2Fx.wav",
    );
  });

  it("encodes special characters in the key", () => {
    // A filename with a space or & breaks the query string unless encoded.
    expect(mediaUrl("library/bgm/a b&c.mp3")).toBe("/api/audio?key=library%2Fbgm%2Fa%20b%26c.mp3");
  });
});
