import { describe, expect, it } from "vitest";
import { playableUrl } from "./audio-url";

describe("playableUrl", () => {
  it("an external URL is used as is", () => {
    expect(playableUrl("https://cdn.example/a.mp3")).toBe("https://cdn.example/a.mp3");
  });

  it("a store key goes through the route", () => {
    expect(playableUrl("audio/ep1.mp3")).toBe("/api/audio?key=audio%2Fep1.mp3");
  });

  it("old file:// data goes through with a path", () => {
    expect(playableUrl("file:///srv/a.mp3")).toBe("/api/audio?path=%2Fsrv%2Fa.mp3");
  });

  it("is IDEMPOTENT — running it twice changes nothing", () => {
    // A cover is prepared on the server for the media-session artwork and then handed to
    // <Cover>, which prepares it again. Encoding the route into its own query string
    // produced a 404 that looked like missing artwork, not like a bug.
    const once = playableUrl("covers/x.jpg");
    expect(playableUrl(once)).toBe(once);
    expect(playableUrl(playableUrl("file:///srv/a.mp3"))).toBe(playableUrl("file:///srv/a.mp3"));
  });
});
